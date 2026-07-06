use crate::api::ApiClient;
use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::notify::{show_notification, show_notification_with_icon, decode_topic_icon};
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

const MAX_AUTO_DOWNLOAD_SIZE: u64 = 5 * 1024 * 1024; // 5MB

/// Try to download an image attachment to local cache. Returns the local path if successful.
pub async fn try_download_image(attachment_json: &str, server_url: &str) -> Option<String> {
    let att: serde_json::Value = serde_json::from_str(attachment_json).ok()?;
    let url = att.get("url")?.as_str()?;
    let name = att.get("name").and_then(|v| v.as_str()).unwrap_or("image");
    let mime = att.get("mime").and_then(|v| v.as_str()).unwrap_or("");

    // Only download images
    let is_image = mime.starts_with("image/")
        || name.ends_with(".png") || name.ends_with(".jpg") || name.ends_with(".jpeg")
        || name.ends_with(".gif") || name.ends_with(".webp") || name.ends_with(".svg")
        || name.ends_with(".bmp");
    if !is_image {
        return None;
    }

    // Check size if available
    if let Some(size) = att.get("size").and_then(|v| v.as_u64()) {
        if size > MAX_AUTO_DOWNLOAD_SIZE {
            return None;
        }
    }

    // Build full URL
    let full_url = if url.starts_with("http") {
        url.to_string()
    } else {
        format!("{}{}", server_url.trim_end_matches('/'), url)
    };

    // Download
    let resp = reqwest::get(&full_url).await.ok()?;
    if !resp.status().is_success() {
        return None;
    }
    let bytes = resp.bytes().await.ok()?;
    if bytes.len() as u64 > MAX_AUTO_DOWNLOAD_SIZE {
        return None;
    }

    // Save to cache dir
    let cache_dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("notifyhub-client")
        .join("images");
    std::fs::create_dir_all(&cache_dir).ok();

    // Use message id or hash of url as filename
    let ext = name.rsplit('.').next().unwrap_or("jpg");
    let safe_name = url.replace(|c: char| !c.is_alphanumeric() && c != '-' && c != '_', "_");
    let filename = format!("{}.{}", &safe_name[..safe_name.len().min(64)], ext);
    let path = cache_dir.join(&filename);
    std::fs::write(&path, &bytes).ok()?;

    Some(path.to_string_lossy().to_string())
}

pub struct PollState {
    pub running: bool,
    pub mode: String,  // Current connection mode: "poll", "sse", "ws"
    pub last_poll: Option<String>,
    pub error: Option<String>,
    pub was_connected: bool,
}

pub fn start_polling(config: AppConfig, state: Arc<Mutex<PollState>>, msg_store: Arc<MessageStore>) {
    let jwt = config.server.jwt.clone();
    let uuid = config.client.uuid.clone();
    let name = config.client.name.clone();
    let auto_download = config.auto_download_images;
    let server_url = config.server.url.clone();
    let username = config.server.username.clone();
    let password = config.server.password.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        let mut current_jwt = jwt;

        loop {
            // Check if polling should stop or mode changed
            {
                let s = state.lock().unwrap();
                if !s.running || s.mode != "poll" {
                    break;
                }
            }

            let api = ApiClient::new(&server_url, &current_jwt);

            rt.block_on(async {
                match api.poll_with_status(&uuid).await {
                    Ok((code, messages)) => {
                        // Re-login on 401 (JWT expired)
                        if code == 401 {
                            eprintln!("[poll] JWT expired (401), re-logging in...");
                            match ApiClient::login(&server_url, &username, &password).await {
                                Ok(new_jwt) => {
                                    current_jwt = new_jwt.clone();
                                    // Save new JWT to config
                                    if let Some(mut cfg) = AppConfig::load() {
                                        cfg.server.jwt = new_jwt;
                                        let _ = cfg.save();
                                    }
                                    // Re-register
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

                        {
                            let mut s = state.lock().unwrap();
                            // Connection restored - notify if was previously disconnected
                            if s.error.is_some() {
                                show_notification("NotifyHub", "Connection restored");
                            }
                            s.last_poll = Some(chrono::Local::now().format("%H:%M:%S").to_string());
                            s.error = None;
                            s.was_connected = true;
                        }
                        eprintln!("[poll] Received {} message(s) via Poll", messages.len());
                        for msg in messages {
                            // Auto-download image if enabled
                            let local_image_path = if auto_download {
                                if let Some(ref att) = msg.attachment {
                                    try_download_image(att, &server_url).await
                                } else {
                                    None
                                }
                            } else {
                                None
                            };

                            // Store locally
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
                            // Show desktop notification with topic icon if available
                            let icon_path = msg.topic_icon.as_deref()
                                .and_then(decode_topic_icon);
                            if let Some(ref path) = icon_path {
                                show_notification_with_icon(&msg.title, &msg.body, Some(&path.to_string_lossy()));
                            } else {
                                show_notification(&msg.title, &msg.body);
                            }
                        }
                    }
                    Err(e) => {
                        let mut s = state.lock().unwrap();
                        // Connection lost - notify if was previously connected
                        if s.was_connected {
                            show_notification("NotifyHub", "Connection lost");
                            s.was_connected = false;
                        }
                        s.error = Some(e);
                    }
                }
            });

            // Interruptible sleep: check running flag every 500ms
            for _ in 0..10 {
                {
                    let s = state.lock().unwrap();
                    if !s.running || s.mode != "poll" {
                        break;
                    }
                }
                std::thread::sleep(Duration::from_millis(500));
            }
        }
    });
}
