use crate::api::{ApiClient, PushMessage};
use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::notify::{decode_topic_icon, show_notification, show_notification_with_icon};
use crate::poll::PollState;
use crate::poll::try_download_image;
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
                        eprintln!("[sse] Connection failed: {}", e);
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
                    eprintln!("[sse] JWT expired, re-logging in...");
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
                    return;
                }

                if !resp.status().is_success() {
                    let mut s = state.lock().unwrap();
                    s.error = Some(format!("SSE HTTP {}", resp.status().as_u16()));
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
                            eprintln!("[sse] Stream error: {}", e);
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
                                eprintln!("[sse] Received message via SSE: {}", msg.title);
                                ack_ids.push(msg.id.clone());
                                process_message(
                                    &msg,
                                    &msg_store,
                                    auto_download,
                                    &server_url,
                                ).await;
                            }
                            // Or as API response with messages array
                            else if let Ok(parsed) = serde_json::from_str::<serde_json::Value>(data) {
                                if let Some(messages) = parsed.get("data").and_then(|d| d.as_array()) {
                                    eprintln!("[sse] Received {} message(s) via SSE", messages.len());
                                    for msg_val in messages {
                                        if let Ok(msg) = serde_json::from_value::<PushMessage>(msg_val.clone()) {
                                            ack_ids.push(msg.id.clone());
                                            process_message(
                                                &msg,
                                                &msg_store,
                                                auto_download,
                                                &server_url,
                                            ).await;
                                        }
                                    }
                                }
                            }

                            // Ack messages on server so they won't be re-delivered via poll
                            if !ack_ids.is_empty() {
                                let api = ApiClient::new(&server_url, &current_jwt);
                                let _ = api.ack(&uuid, &ack_ids).await;
                            }
                        }
                    }
                }

                eprintln!("[sse] Stream ended, will reconnect...");
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

async fn process_message(
    msg: &PushMessage,
    msg_store: &Arc<MessageStore>,
    auto_download: bool,
    server_url: &str,
) {
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
