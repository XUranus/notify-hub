use log::{debug, error, warn};
use notify_rust::{Image as NotifImage, Notification};
use std::path::PathBuf;

/// Cache dir for decoded topic icons.
fn icon_cache_dir() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("notifyhub-client")
        .join("icons");
    std::fs::create_dir_all(&dir).ok();
    dir
}

/// Find the app icon in standard Linux locations or relative to the executable.
fn find_app_icon() -> Option<PathBuf> {
    debug!("[notify] Looking for app icon");
    let candidates = [
        "/usr/share/icons/hicolor/128x128/apps/com.notifyhub.client.png",
        "/usr/share/pixmaps/notifyhub-client.png",
    ];
    for path in &candidates {
        if std::path::Path::new(path).exists() {
            debug!("[notify] Found app icon at {}", path);
            return Some(PathBuf::from(path));
        }
    }
    // Fallback: look for icons/128x128.png relative to the executable
    if let Ok(exe) = std::env::current_exe() {
        if let Some(exe_dir) = exe.parent() {
            // Try multiple relative paths to cover different layouts:
            //   exe_dir/../icons/     → installed: bin/../icons/
            //   exe_dir/../../icons/  → cargo run: target/debug/../../icons/ = desktop/icons/
            for rel in ["../icons/128x128.png", "../../icons/128x128.png"] {
                let candidate = exe_dir.join(rel);
                if candidate.exists() {
                    debug!("[notify] Found app icon at {}", candidate.display());
                    return Some(candidate);
                }
            }
        }
    }
    debug!("[notify] App icon not found");
    None
}

/// Decode a base64 topic icon (with optional data URI prefix) and save to cache.
/// Returns the file path if successful.
pub fn decode_topic_icon(icon_b64: &str) -> Option<PathBuf> {
    debug!("[notify] Decoding topic icon");
    use base64::Engine;
    let engine = base64::engine::general_purpose::STANDARD;
    // Strip data URI prefix if present (e.g. "data:image/png;base64,...")
    let raw = if let Some(idx) = icon_b64.find(",") {
        let prefix = &icon_b64[..idx];
        if prefix.contains("base64") { &icon_b64[idx + 1..] } else { icon_b64 }
    } else {
        icon_b64
    };
    let bytes = match engine.decode(raw) {
        Ok(b) => b,
        Err(e) => {
            debug!("[notify] Base64 decode failed: {}", e);
            return None;
        }
    };
    if bytes.is_empty() {
        return None;
    }
    let hash = {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};
        let mut h = DefaultHasher::new();
        icon_b64.hash(&mut h);
        h.finish()
    };
    let path = icon_cache_dir().join(format!("{:x}.png", hash));
    if !path.exists() {
        if let Err(e) = std::fs::write(&path, &bytes) {
            warn!("[notify] Failed to cache icon: {}", e);
            return None;
        }
    }
    Some(path)
}

/// Strip HTML tags for plain-text display in notifications.
fn strip_html(input: &str) -> String {
    let mut result = String::with_capacity(input.len());
    let mut inside_tag = false;
    for ch in input.chars() {
        match ch {
            '<' => inside_tag = true,
            '>' => inside_tag = false,
            _ if !inside_tag => result.push(ch),
            _ => {}
        }
    }
    result.trim().to_string()
}

pub fn show_notification(title: &str, body: &str) {
    debug!("[notify] Showing notification: {}", title);
    show_notification_with_icon(title, body, None);
}

pub fn show_notification_with_icon(title: &str, body: &str, content_icon_path: Option<&str>) {
    debug!("[notify] Showing notification with icon: {}", title);
    let plain_body = strip_html(body);
    let mut notif = Notification::new();
    notif
        .summary(title)
        .body(&plain_body)
        .appname("NotifyHub")
        .timeout(10000);

    // App icon (top-left corner) — always the product logo
    // D-Bus spec requires file:// URI or theme icon name
    if let Some(path) = find_app_icon() {
        notif.icon(&format!("file://{}", path.to_string_lossy()));
    } else {
        notif.icon("dialog-information");
    }

    // Content image — topic icon when available, otherwise app icon
    // KDE Plasma only renders the content image area; without it, the notification
    // appears to have no icon even when `icon` is set.
    if let Some(path) = content_icon_path {
        notif.image_path(&format!("file://{}", path));
    } else if let Some(app_icon_path) = find_app_icon() {
        match NotifImage::open(&app_icon_path) {
            Ok(img) => { notif.image_data(img); }
            Err(e) => debug!("[notify] Failed to open icon image: {}", e),
        }
    }

    if let Err(e) = notif.show() {
        error!("[notify] Failed to show notification: {}", e);
    }
}
