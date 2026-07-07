use crate::api::{ApiClient, PushMessage};
use crate::config::AppConfig;
use crate::messages::MessageStore;
use crate::notify::show_notification;
use crate::poll::{PollState, NotificationDebounce, ReconnectState, process_message};
use std::sync::{Arc, Mutex};
use std::time::Duration;
use tokio::time::timeout;

const SSE_TIMEOUT_SECS: u64 = 90;

/// Start SSE connection for real-time message delivery.
/// Falls back to poll on failure.
pub fn start_sse(
    config: AppConfig,
    state: Arc<Mutex<PollState>>,
    msg_store: Arc<MessageStore>,
    debounce: Arc<NotificationDebounce>,
) {
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

            let sse_ok = rt.block_on(async {
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
                        return false;
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
                    return false;
                }

                if !resp.status().is_success() {
                    let status = resp.status().as_u16();
                    log::error!("[sse] HTTP error: status={}", status);
                    let mut s = state.lock().unwrap();
                    s.error = Some(format!("SSE HTTP {}", status));
                    return false;
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
                let mut had_data = false;

                loop {
                    // Check if should stop or mode changed
                    {
                        let s = state.lock().unwrap();
                        if !s.running || s.mode != "sse" {
                            break;
                        }
                    }

                    // Timeout: if no data in SSE_TIMEOUT_SECS, consider connection stale
                    let chunk = match timeout(
                        Duration::from_secs(SSE_TIMEOUT_SECS),
                        stream.next(),
                    ).await {
                        Ok(Some(chunk)) => chunk,
                        Ok(None) => {
                            log::warn!("[sse] Stream ended, will reconnect...");
                            break;
                        }
                        Err(_) => {
                            log::warn!("[sse] No data in {}s, reconnecting...", SSE_TIMEOUT_SECS);
                            break;
                        }
                    };

                    let bytes = match chunk {
                        Ok(b) => b,
                        Err(e) => {
                            log::error!("[sse] Stream error: {}", e);
                            break;
                        }
                    };

                    had_data = true;
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
                                process_message(&msg, &msg_store, &debounce, auto_download, &server_url, "sse").await;
                            }
                            // Or as API response with messages array
                            else if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(messages) = parsed.get("data").and_then(|d| d.as_array()) {
                                    log::info!("[sse] Received {} message(s) via SSE", messages.len());
                                    for msg_val in messages {
                                        if let Ok(msg) = serde_json::from_value::<PushMessage>(msg_val.clone()) {
                                            ack_ids.push(msg.id.clone());
                                            process_message(&msg, &msg_store, &debounce, auto_download, &server_url, "sse").await;
                                        }
                                    }
                                }
                            }

                            // Ack messages on server with retry
                            if !ack_ids.is_empty() {
                                let api = ApiClient::new(&server_url, &current_jwt);
                                let mut ack_success = false;
                                for attempt in 0..3 {
                                    match api.ack(&uuid, &ack_ids).await {
                                        Ok(_) => { ack_success = true; break; }
                                        Err(e) => {
                                            log::warn!("[sse] ACK attempt {}/3 failed: {}", attempt + 1, e);
                                            if attempt < 2 {
                                                tokio::time::sleep(Duration::from_secs(1)).await;
                                            }
                                        }
                                    }
                                }
                                if !ack_success {
                                    log::error!("[sse] ACK failed after 3 attempts for {} messages", ack_ids.len());
                                }
                            }
                        }
                    }
                }

                had_data
            });

            if sse_ok {
                reconnect_state.reset();
            } else {
                reconnect_state.backoff();
            }

            // Interruptible sleep with exponential backoff
            let iterations = reconnect_state.delay_ms() / 500;
            for _ in 0..iterations.max(1) {
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
