use crate::api::{ApiClient, PushMessage};
use crate::config::AppConfig;
use crate::messages::MessageStore;
use crate::notify::show_notification;
use crate::poll::{PollState, process_message};
use std::sync::{Arc, Mutex};

/// Start SSE connection for real-time message delivery.
/// Falls back to poll on failure.
pub fn start_sse(
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
                if !s.running || s.mode != "sse" {
                    break;
                }
            }

            let url = format!(
                "{}/api/v1/push/stream?uuid={}",
                server_url.trim_end_matches('/'),
                uuid
            );

            let client = reqwest::Client::new();

            rt.block_on(async {
                let resp = match client
                    .get(&url)
                    .header("Authorization", format!("Bearer {}", current_jwt))
                    .send()
                    .await
                {
                    Ok(r) => r,
                    Err(e) => {
                        log::error!("[sse] Connection failed: {}", e);
                        let mut s = state.lock().unwrap();
                        if s.was_connected {
                            show_notification("NotifyHub", "Connection lost");
                            s.was_connected = false;
                        }
                        s.error = Some(format!("SSE: {}", e));
                        return;
                    }
                };

                if resp.status().as_u16() == 401 {
                    log::warn!("[sse] JWT expired, re-logging in...");
                    match ApiClient::login(&server_url, &username, &password).await {
                        Ok(new_jwt) => {
                            current_jwt = new_jwt.clone();
                            if let Some(mut cfg) = AppConfig::load() {
                                cfg.server.jwt = new_jwt;
                                if let Err(e) = cfg.save() {
                                    log::warn!("[sse] Failed to save new JWT: {}", e);
                                }
                            }
                            let new_api = ApiClient::new(&server_url, &current_jwt);
                            let os = std::env::consts::OS;
                            let arch = std::env::consts::ARCH;
                            let desktop = crate::detect_desktop_env();
                            let version = env!("CARGO_PKG_VERSION");
                            if let Err(e) = new_api.register(&uuid, &name, os, arch, &desktop, version).await {
                                log::warn!("[sse] Re-register after JWT refresh failed: {}", e);
                            }
                        }
                        Err(e) => {
                            log::error!("[sse] Re-login failed: {}", e);
                            let mut s = state.lock().unwrap();
                            s.error = Some(format!("Re-login failed: {}", e));
                        }
                    }
                    return;
                }

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    log::error!("[sse] HTTP error: status={}", status);
                    let mut s = state.lock().unwrap();
                    s.error = Some(format!("SSE HTTP {}", status));
                    return;
                }

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

                // Read SSE stream line by line
                let mut stream = resp.bytes_stream();
                use futures_util::StreamExt;
                let mut buffer = String::new();

                while let Some(chunk) = stream.next().await {
                    // Check if should stop or mode changed
                    {
                        let s = state.lock().unwrap();
                        if !s.running || s.mode != "sse" {
                            break;
                        }
                    }

                    let bytes = match chunk {
                        Ok(b) => b,
                        Err(e) => {
                            log::error!("[sse] Stream error: {}", e);
                            break;
                        }
                    };

                    buffer.push_str(&String::from_utf8_lossy(&bytes));

                    // Process complete lines
                    while let Some(newline_pos) = buffer.find('\n') {
                        let line = buffer[..newline_pos].trim().to_string();
                        buffer = buffer[newline_pos + 1..].to_string();

                        if line.is_empty() || line.starts_with(':') {
                            continue; // skip empty lines and heartbeats
                        }

                        // SSE data lines start with "data: "
                        if let Some(data) = line.strip_prefix("data: ") {
                            if data.is_empty() {
                                continue;
                            }

                            let mut ack_ids: Vec<String> = Vec::new();

                            // Try to parse as a single message
                            if let Ok(msg) = serde_json::from_str::<PushMessage>(data) {
                                log::debug!("[sse] Received message via SSE: {}", msg.title);
                                ack_ids.push(msg.id.clone());
                                process_message(&msg, &msg_store, auto_download, &server_url, "sse").await;
                            }
                            // Or as API response with messages array
                            else if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(messages) = parsed.get("data").and_then(|d| d.as_array()) {
                                    log::info!("[sse] Received {} message(s) via SSE", messages.len());
                                    for msg_val in messages {
                                        if let Ok(msg) = serde_json::from_value::<PushMessage>(msg_val.clone()) {
                                            ack_ids.push(msg.id.clone());
                                            process_message(&msg, &msg_store, auto_download, &server_url, "sse").await;
                                        }
                                    }
                                }
                            }

                            // Ack messages on server so they won't be re-delivered via poll
                            if !ack_ids.is_empty() {
                                let api = ApiClient::new(&server_url, &current_jwt);
                                if let Err(e) = api.ack(&uuid, &ack_ids).await {
                                    log::error!("[sse] ACK failed for {} messages: {}", ack_ids.len(), e);
                                }
                            }
                        }
                    }
                }

                log::warn!("[sse] Stream ended, will reconnect...");
            });

            // Interruptible sleep: check running flag and mode every 500ms
            for _ in 0..10 {
                {
                    let s = state.lock().unwrap();
                    if !s.running || s.mode != "sse" {
                        break;
                    }
                }
                std::thread::sleep(std::time::Duration::from_millis(500));
            }
        }
    });
}
