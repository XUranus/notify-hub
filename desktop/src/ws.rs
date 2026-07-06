use crate::api::{ApiClient, PushMessage};
use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::notify::{decode_topic_icon, show_notification, show_notification_with_icon};
use crate::poll::PollState;
use crate::poll::try_download_image;
use futures_util::StreamExt;
use std::sync::{Arc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::protocol::Message;

/// Start WebSocket connection for real-time message delivery.
/// Falls back to poll on failure.
pub fn start_ws(
    config: AppConfig,
    state: Arc<Mutex<PollState>>,
    msg_store: Arc<MessageStore>,
) {
    let jwt = config.server.jwt.clone();
    let uuid = config.client.uuid.clone();
    let name = config.client.name.clone();
    let auto_download = config.auto_download_images;
    let server_url = config.server.url.clone();
    let username = config.server.username.clone();
    let password = config.server.password.clone();

    std::thread::spawn(move || {
        let rt = crate::shared_runtime();
        let mut current_jwt = jwt;

        loop {
            // Check if should stop
            {
                let s = state.lock().unwrap();
                if !s.running || s.mode != "ws" {
                    break;
                }
            }

            let ws_url = format!(
                "{}/api/v1/push/ws?uuid={}&token={}",
                server_url.trim_end_matches('/').replace("http://", "ws://").replace("https://", "wss://"),
                uuid,
                current_jwt
            );

            let result = rt.block_on(async {
                match connect_async(&ws_url).await {
                    Ok((ws_stream, _response)) => {
                        // Mark connected
                        {
                            let mut s = state.lock().unwrap();
                            if s.error.is_some() {
                                show_notification("NotifyHub", "Connection restored");
                            }
                            s.last_poll = Some(chrono::Local::now().format("%H:%M:%S").to_string());
                            s.error = None;
                            s.was_connected = true;
                        }

                        let (mut _write, mut read) = ws_stream.split();

                        while let Some(msg) = read.next().await {
                            // Check if should stop or mode changed
                            {
                                let s = state.lock().unwrap();
                                if !s.running || s.mode != "ws" {
                                    break;
                                }
                            }

                            match msg {
                                Ok(Message::Text(text)) => {
                                    handle_ws_message(
                                        &text,
                                        &msg_store,
                                        auto_download,
                                        &server_url,
                                        &uuid,
                                        &current_jwt,
                                    ).await;
                                }
                                Ok(Message::Close(_)) => {
                                    eprintln!("[ws] Server closed connection");
                                    break;
                                }
                                Err(e) => {
                                    eprintln!("[ws] Error: {}", e);
                                    break;
                                }
                                _ => {} // Ping/Pong/Binary handled by tungstenite
                            }
                        }
                        Ok::<(), String>(())
                    }
                    Err(e) => {
                        let err_msg = e.to_string();
                        // Check if it's a 401
                        if err_msg.contains("401") {
                            eprintln!("[ws] JWT expired, re-logging in...");
                            match ApiClient::login(&server_url, &username, &password).await {
                                Ok(new_jwt) => {
                                    current_jwt = new_jwt.clone();
                                    if let Some(mut cfg) = AppConfig::load() {
                                        cfg.server.jwt = new_jwt;
                                        let _ = cfg.save();
                                    }
                                    let new_api = ApiClient::new(&server_url, &current_jwt);
                                    let os = std::env::consts::OS;
                                    let arch = std::env::consts::ARCH;
                                    let desktop = crate::detect_desktop_env();
                                    let version = env!("CARGO_PKG_VERSION");
                                    let _ = new_api.register(&uuid, &name, os, arch, &desktop, version).await;
                                }
                                Err(e) => {
                                    let mut s = state.lock().unwrap();
                                    s.error = Some(format!("Re-login failed: {}", e));
                                }
                            }
                        } else {
                            eprintln!("[ws] Connection failed: {}", err_msg);
                            let mut s = state.lock().unwrap();
                            if s.was_connected {
                                show_notification("NotifyHub", "Connection lost");
                                s.was_connected = false;
                            }
                            s.error = Some(format!("WS: {}", err_msg));
                        }
                        Err(err_msg)
                    }
                }
            });

            if result.is_err() {
                // Error already handled above
            }

            eprintln!("[ws] Disconnected, will reconnect in 5s...");
            // Interruptible sleep: check running flag and mode every 500ms
            for _ in 0..10 {
                {
                    let s = state.lock().unwrap();
                    if !s.running || s.mode != "ws" {
                        break;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
    });
}

async fn handle_ws_message(
    text: &str,
    msg_store: &Arc<MessageStore>,
    auto_download: bool,
    server_url: &str,
    uuid: &str,
    jwt: &str,
) {
    // Try to parse the full JSON
    let parsed: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Handle initial connected event
    if parsed.get("event").and_then(|e| e.as_str()) == Some("connected") {
        eprintln!("[ws] Handshake confirmed");
        return;
    }

    // Extract messages array
    let messages = match parsed.get("data").and_then(|d| d.as_array()) {
        Some(arr) => arr.clone(),
        None => return,
    };

    eprintln!("[ws] Received {} message(s) via WebSocket", messages.len());

    let mut ack_ids: Vec<String> = Vec::new();

    for msg_val in messages {
        if let Ok(msg) = serde_json::from_value::<PushMessage>(msg_val) {
            ack_ids.push(msg.id.clone());

            let local_image_path = if auto_download {
                if let Some(ref att) = msg.attachment {
                    try_download_image(att, server_url).await
                } else {
                    None
                }
            } else {
                None
            };

            let local = LocalMessage {
                id: msg.id.clone(),
                title: msg.title.clone(),
                body: msg.body.clone(),
                level: msg.level.clone(),
                received_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                read: false,
                flagged: false,
                tags: msg.tags.clone(),
                priority: msg.priority,
                url: msg.url.clone(),
                attachment: msg.attachment.clone(),
                format: msg.format.clone(),
                local_image_path,
                topic_id: msg.topic_id.clone(),
                topic_name: msg.topic_name.clone(),
                topic_display_name: msg.topic_display_name.clone(),
                topic_icon: msg.topic_icon.clone(),
            };
            msg_store.add(local);

            let icon_path = msg.topic_icon.as_deref().and_then(decode_topic_icon);
            if let Some(ref path) = icon_path {
                show_notification_with_icon(&msg.title, &msg.body, Some(&path.to_string_lossy()));
            } else {
                show_notification(&msg.title, &msg.body);
            }
        }
    }

    // Ack messages on server so they won't be re-delivered via poll
    if !ack_ids.is_empty() {
        let api = ApiClient::new(server_url, jwt);
        let _ = api.ack(uuid, &ack_ids).await;
    }
}
