use crate::api::{ApiClient, PushMessage};
use crate::config::AppConfig;
use crate::messages::MessageStore;
use crate::notify::show_notification;
use crate::poll::{PollState, NotificationDebounce, ReconnectState, process_message, lock_mutex};
use futures_util::{SinkExt, StreamExt};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite;
use tokio_tungstenite::tungstenite::protocol::{CloseFrame, Message};
use tokio_tungstenite::tungstenite::protocol::frame::coding::CloseCode;

/// Start WebSocket connection for real-time message delivery.
/// Falls back to poll on failure.
pub fn start_ws(
    config: AppConfig,
    state: Arc<Mutex<PollState>>,
    msg_store: Arc<MessageStore>,
    debounce: Arc<NotificationDebounce>,
) -> std::thread::JoinHandle<()> {
    let jwt = config.server.jwt.clone();
    let uuid = config.client.uuid.clone();
    let name = config.client.name.clone();
    let auto_download = config.auto_download_images;
    let server_url = config.server.url.clone();
    let username = config.server.username.clone();
    let password = config.server.password.clone();

    std::thread::spawn(move || {
        let rt = crate::create_runtime();
        let mut current_jwt = jwt;
        let mut reconnect_state = ReconnectState::new();

        loop {
            // Check if should stop
            {
                let s = lock_mutex(&state);
                if !s.running || s.mode != "ws" {
                    break;
                }
            }

            let ws_url = format!(
                "{}/api/user/push/ws?uuid={}&token={}",
                server_url.trim_end_matches('/').replace("http://", "ws://").replace("https://", "wss://"),
                uuid,
                current_jwt
            );

            let ws_ok = rt.block_on(async {
                match connect_async(&ws_url).await {
                    Ok((ws_stream, _response)) => {
                        // Mark connected
                        {
                            let mut s = lock_mutex(&state);
                            if s.error.is_some() {
                                show_notification("NotifyHub", "Connection restored");
                            }
                            s.last_poll = Some(chrono::Local::now().format("%H:%M:%S").to_string());
                            s.error = None;
                            s.was_connected = true;
                        }

                        let (mut write, mut read) = ws_stream.split();

                        while let Some(msg) = read.next().await {
                            // Check if should stop or mode changed
                            {
                                let s = lock_mutex(&state);
                                if !s.running || s.mode != "ws" {
                                    break;
                                }
                            }

                            match msg {
                                Ok(Message::Text(text)) => {
                                    handle_ws_message(
                                        &text,
                                        &msg_store,
                                        &debounce,
                                        auto_download,
                                        &server_url,
                                        &uuid,
                                        &current_jwt,
                                    ).await;
                                }
                                Ok(Message::Ping(data)) => {
                                    let _ = write.send(Message::Pong(data)).await;
                                }
                                Ok(Message::Close(_)) => {
                                    log::warn!("[ws] Server closed connection");
                                    break;
                                }
                                Err(e) => {
                                    log::error!("[ws] Error: {}", e);
                                    break;
                                }
                                _ => {} // Pong/Binary handled by tungstenite
                            }
                        }
                        // Send Close frame on exit
                        let _ = write.send(Message::Close(Some(CloseFrame {
                            code: CloseCode::Normal,
                            reason: "client disconnect".into(),
                        }))).await;
                        true
                    }
                    Err(tungstenite::Error::Http(resp)) => {
                        let status = resp.status();
                        if status == 401 || status == 403 {
                            match crate::poll::try_refresh_jwt(&server_url, &username, &password, &uuid, &name, "ws").await {
                                Ok((new_jwt, _)) => {
                                    current_jwt = new_jwt;
                                }
                                Err(e) => {
                                    let mut s = lock_mutex(&state);
                                    s.error = Some(e);
                                }
                            }
                        } else {
                            let mut s = lock_mutex(&state);
                            if s.was_connected {
                                show_notification("NotifyHub", "Connection lost");
                                s.was_connected = false;
                            }
                            s.error = Some(format!("WS HTTP {}", status));
                        }
                        false
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        // Fallback: string match for auth errors
                        if err_msg.contains("401") || err_msg.contains("403") {
                            match crate::poll::try_refresh_jwt(&server_url, &username, &password, &uuid, &name, "ws").await {
                                Ok((new_jwt, _)) => {
                                    current_jwt = new_jwt;
                                }
                                Err(e) => {
                                    let mut s = lock_mutex(&state);
                                    s.error = Some(e);
                                }
                            }
                        } else {
                            log::error!("[ws] Connection failed: {}", err_msg);
                            let mut s = lock_mutex(&state);
                            if s.was_connected {
                                show_notification("NotifyHub", "Connection lost");
                                s.was_connected = false;
                            }
                            s.error = Some(format!("WS: {}", err_msg));
                        }
                        false
                    }
                }
            });

            if ws_ok {
                reconnect_state.reset();
            } else {
                reconnect_state.backoff();
            }

            // Interruptible sleep with exponential backoff
            let iterations = reconnect_state.delay_ms() / 500;
            for _ in 0..iterations.max(1) {
                {
                    let s = lock_mutex(&state);
                    if !s.running || s.mode != "ws" {
                        break;
                    }
                }
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    })
}

async fn handle_ws_message(
    text: &str,
    msg_store: &Arc<MessageStore>,
    debounce: &Arc<NotificationDebounce>,
    auto_download: bool,
    server_url: &str,
    uuid: &str,
    jwt: &str,
) {
    // Try to parse the full JSON
    let parsed: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(e) => {
            log::debug!("[ws] Failed to parse message JSON: {}", e);
            return;
        }
    };

    // Handle initial connected event
    if parsed.get("event").and_then(|e| e.as_str()) == Some("connected") {
        log::info!("[ws] Handshake confirmed");
        return;
    }

    // Extract messages array
    let messages = match parsed.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr.clone(),
        None => return,
    };

    log::info!("[ws] Received {} message(s) via WebSocket", messages.len());

    let mut ack_ids: Vec<String> = Vec::new();

    for msg_val in messages {
        if let Ok(msg) = serde_json::from_value::<PushMessage>(msg_val) {
            ack_ids.push(msg.id.clone());
            process_message(&msg, msg_store, debounce, auto_download, server_url, "ws").await;
        }
    }

    // Ack messages on server with retry
    if !ack_ids.is_empty() {
        let api = ApiClient::new(server_url, jwt);
        let mut ack_success = false;
        for attempt in 0..3 {
            match api.ack(uuid, &ack_ids).await {
                Ok(_) => { ack_success = true; break; }
                Err(e) => {
                    log::warn!("[ws] ACK attempt {}/3 failed: {}", attempt + 1, e);
                    if attempt < 2 {
                        tokio::time::sleep(Duration::from_secs(1)).await;
                    }
                }
            }
        }
        if !ack_success {
            log::error!("[ws] ACK failed after 3 attempts for {} messages", ack_ids.len());
        }
    }
}
