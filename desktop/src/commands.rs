use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::poll::{PollState, lock_mutex};
use std::sync::{Arc, Mutex};
use tauri::State;

// ── Snapshot types ──

#[derive(Clone, serde::Serialize)]
pub struct PollStateSnapshot {
    pub running: bool,
    pub mode: String,
    pub last_poll: Option<String>,
    pub error: Option<String>,
}

#[derive(Clone, serde::Serialize)]
pub struct SystemInfo {
    pub os: String,
    pub arch: String,
    pub desktop_env: String,
}

#[derive(Clone, serde::Serialize)]
pub struct AppInfo {
    pub version: String,
    pub config_path: String,
    pub messages_path: String,
}

// ── Commands ──

#[tauri::command]
pub fn get_config() -> Option<AppConfig> {
    AppConfig::load()
}

#[tauri::command]
pub fn save_config(cfg: AppConfig) -> Result<(), String> {
    cfg.save()
}

#[tauri::command]
pub fn set_language(language: String) -> Result<(), String> {
    if let Some(mut cfg) = AppConfig::load() {
        cfg.language = language;
        cfg.save()?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_poll_state(state: State<'_, Arc<Mutex<PollState>>>) -> PollStateSnapshot {
    let s = lock_mutex(&state);
    PollStateSnapshot {
        running: s.running,
        mode: s.mode.clone(),
        last_poll: s.last_poll.clone(),
        error: s.error.clone(),
    }
}

#[tauri::command]
pub fn get_system_info() -> SystemInfo {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let desktop_env = crate::poll::detect_desktop_env();
    SystemInfo {
        os: os.to_string(),
        arch: arch.to_string(),
        desktop_env,
    }
}

#[tauri::command]
pub fn get_app_info() -> AppInfo {
    AppInfo {
        version: env!("CARGO_PKG_VERSION").to_string(),
        config_path: AppConfig::config_path().to_string_lossy().to_string(),
        messages_path: {
            let dir = dirs::config_dir()
                .unwrap_or_else(|| std::path::PathBuf::from("."))
                .join("notifyhub-client");
            dir.join("messages.db").to_string_lossy().to_string()
        },
    }
}

#[tauri::command]
pub fn get_system_fonts() -> Vec<String> {
    use std::process::Command;
    let output = Command::new("fc-list")
        .arg(":")
        .arg("family")
        .output()
        .unwrap_or_else(|_| {
            Command::new("echo").output().unwrap()
        });
    let stdout = String::from_utf8_lossy(&output.stdout);
    let mut fonts: Vec<String> = stdout
        .lines()
        .map(|l| l.trim().to_string())
        .filter(|l| !l.is_empty())
        .collect();
    fonts.sort();
    fonts.dedup();
    fonts
}

#[tauri::command]
pub fn get_autostart() -> bool {
    AppConfig::load().map(|c| c.autostart).unwrap_or(false)
}

#[tauri::command]
pub fn set_autostart(enabled: bool, auto_launch: State<'_, tauri_plugin_autostart::AutoLaunchManager>) -> Result<(), String> {
    if let Some(mut cfg) = AppConfig::load() {
        cfg.autostart = enabled;
        cfg.save()?;
    }
    if enabled {
        auto_launch.enable().map_err(|e| e.to_string())?;
    } else {
        auto_launch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_messages(store: State<'_, Arc<MessageStore>>) -> Vec<LocalMessage> {
    store.get_all()
}

#[tauri::command]
pub fn mark_as_read(id: String, store: State<'_, Arc<MessageStore>>) {
    store.mark_as_read(&id);
}

#[tauri::command]
pub fn toggle_flag(id: String, store: State<'_, Arc<MessageStore>>) {
    store.toggle_flag(&id);
}

#[tauri::command]
pub fn delete_message_undo(id: String, store: State<'_, Arc<MessageStore>>) -> Option<LocalMessage> {
    store.delete_and_return(&id)
}

#[tauri::command]
pub fn insert_message(msg: LocalMessage, index: usize, store: State<'_, Arc<MessageStore>>) {
    store.insert_at(msg, index);
}

#[tauri::command]
pub fn get_unread_count(store: State<'_, Arc<MessageStore>>) -> usize {
    store.unread_count()
}

#[tauri::command]
pub fn drain_has_new(store: State<'_, Arc<MessageStore>>) -> bool {
    store.drain_has_new()
}

#[tauri::command]
pub fn delete_message(id: String, store: State<'_, Arc<MessageStore>>) {
    store.delete(&id);
}

#[tauri::command]
pub fn clear_messages(store: State<'_, Arc<MessageStore>>) {
    store.clear();
}

#[tauri::command]
pub fn open_url(url: String) -> Result<(), String> {
    log::info!("[cmd] Open URL: {}", url);
    open::that(&url).map_err(|e| {
        log::error!("[cmd] Failed to open URL: {}", e);
        e.to_string()
    })
}

#[tauri::command]
pub async fn download_file(url: String, filename: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    log::info!("[cmd] Download file: url={}, filename={}", url, filename);

    let save_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();

    let save_path = match save_path {
        Some(p) => p,
        None => { log::debug!("[cmd] Download cancelled by user"); return Ok(()); }
    };

    let dest = save_path.as_path()
        .ok_or_else(|| { log::error!("[cmd] Invalid save path"); "Invalid save path".to_string() })?
        .to_path_buf();

    const MAX_DOWNLOAD_SIZE: u64 = 10 * 1024 * 1024;
    let resp = reqwest::get(&url).await.map_err(|e| { log::error!("[cmd] Download HTTP failed: {}", e); format!("Download failed: {}", e) })?;
    if let Some(content_length) = resp.content_length() {
        if content_length > MAX_DOWNLOAD_SIZE {
            return Err(format!("File too large ({:.1} MB, max 10 MB)", content_length as f64 / 1024.0 / 1024.0));
        }
    }
    let bytes = resp.bytes().await.map_err(|e| { log::error!("[cmd] Download read body failed: {}", e); format!("Download failed: {}", e) })?;
    if bytes.len() as u64 > MAX_DOWNLOAD_SIZE {
        return Err(format!("File too large ({:.1} MB, max 10 MB)", bytes.len() as f64 / 1024.0 / 1024.0));
    }
    log::debug!("[cmd] Downloaded {} bytes", bytes.len());

    std::fs::write(&dest, &bytes).map_err(|e| { log::error!("[cmd] Write to {:?} failed: {}", dest, e); format!("Write failed: {}", e) })?;
    log::info!("[cmd] File saved to {:?}", dest);

    Ok(())
}

#[tauri::command]
pub fn read_image_data_url(path: String) -> Result<String, String> {
    const MAX_SIZE: u64 = 10 * 1024 * 1024;
    let meta = std::fs::metadata(&path).map_err(|e| format!("Stat failed: {}", e))?;
    if meta.len() > MAX_SIZE {
        return Err(format!("File too large ({:.1} MB)", meta.len() as f64 / 1024.0 / 1024.0));
    }
    let bytes = std::fs::read(&path).map_err(|e| format!("Read failed: {}", e))?;
    let ext = std::path::Path::new(&path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("png");
    let mime = match ext {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        _ => "image/png",
    };
    const CHARS: &[u8] = b"ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
    let mut b64 = String::with_capacity((bytes.len() + 2) / 3 * 4);
    for chunk in bytes.chunks(3) {
        let b0 = chunk[0] as u32;
        let b1 = if chunk.len() > 1 { chunk[1] as u32 } else { 0 };
        let b2 = if chunk.len() > 2 { chunk[2] as u32 } else { 0 };
        let triple = (b0 << 16) | (b1 << 8) | b2;
        b64.push(CHARS[((triple >> 18) & 0x3F) as usize] as char);
        b64.push(CHARS[((triple >> 12) & 0x3F) as usize] as char);
        if chunk.len() > 1 { b64.push(CHARS[((triple >> 6) & 0x3F) as usize] as char) } else { b64.push('=') }
        if chunk.len() > 2 { b64.push(CHARS[(triple & 0x3F) as usize] as char) } else { b64.push('=') }
    }
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub async fn fetch_image_data_url(url: String) -> Result<String, String> {
    use base64::Engine;
    const MAX_SIZE: u64 = 10 * 1024 * 1024;

    let resp = reqwest::get(&url).await.map_err(|e| format!("Fetch failed: {}", e))?;
    if let Some(content_length) = resp.content_length() {
        if content_length > MAX_SIZE {
            return Err(format!("Image too large ({:.1} MB, max 10 MB)", content_length as f64 / 1024.0 / 1024.0));
        }
    }
    let bytes = resp.bytes().await.map_err(|e| format!("Read failed: {}", e))?;
    if bytes.len() as u64 > MAX_SIZE {
        return Err(format!("Image too large ({:.1} MB, max 10 MB)", bytes.len() as f64 / 1024.0 / 1024.0));
    }

    let url_path = url.split('?').next().unwrap_or("");
    let ext = std::path::Path::new(url_path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("");
    let mime = match ext.to_lowercase().as_str() {
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "svg" => "image/svg+xml",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        _ => "image/png",
    };

    let b64 = base64::engine::general_purpose::STANDARD.encode(&bytes);
    Ok(format!("data:{};base64,{}", mime, b64))
}

#[tauri::command]
pub fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
pub fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
pub fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn reconnect(
    state: State<'_, Arc<Mutex<PollState>>>,
    msg_store: State<'_, Arc<MessageStore>>,
    debounce: State<'_, crate::poll::NotificationDebounce>,
) -> Result<(), String> {
    log::info!("[cmd] Reconnect");
    let cfg = AppConfig::load().ok_or("No config")?;

    let old_handle = {
        let mut s = lock_mutex(&state);
        let handle = s.transport_handle.take();
        s.running = false;
        s.mode = "poll".to_string();
        handle
    };

    if let Some(handle) = old_handle {
        tokio::task::spawn_blocking(move || {
            let _ = handle.join();
        }).await.map_err(|e| format!("Join failed: {}", e))?;
    }

    let mode = cfg.connection_mode.clone();
    let handle = match mode.as_str() {
        "sse" => Some(crate::sse::start_sse(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        "ws" => Some(crate::ws::start_ws(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        _ => Some(crate::poll::start_polling(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
    };

    {
        let mut s = lock_mutex(&state);
        s.running = true;
        s.mode = mode;
        s.error = None;
        s.was_connected = false;
        s.transport_handle = handle;
    }

    Ok(())
}

#[tauri::command]
pub async fn stop_polling(state: State<'_, Arc<Mutex<PollState>>>) -> Result<(), String> {
    log::info!("[cmd] Stop polling");
    let old_handle = {
        let mut s = lock_mutex(&state);
        s.running = false;
        s.transport_handle.take()
    };
    if let Some(handle) = old_handle {
        tokio::task::spawn_blocking(move || {
            let _ = handle.join();
        }).await.map_err(|e| format!("Join failed: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn logout(state: State<'_, Arc<Mutex<PollState>>>) -> Result<(), String> {
    log::info!("[cmd] Logout");
    {
        let mut s = lock_mutex(&state);
        s.running = false;
        s.last_poll = None;
        s.error = None;
        s.was_connected = false;
    }
    if let Some(mut cfg) = AppConfig::load() {
        cfg.server.jwt = String::new();
        cfg.server.username = String::new();
        cfg.server.password = String::new();
        cfg.save()?;
    }
    Ok(())
}

#[tauri::command]
pub async fn set_connection_mode(
    mode: String,
    state: State<'_, Arc<Mutex<PollState>>>,
    msg_store: State<'_, Arc<MessageStore>>,
    debounce: State<'_, crate::poll::NotificationDebounce>,
) -> Result<(), String> {
    log::info!("[cmd] Set connection mode: {}", mode);
    let mut cfg = AppConfig::load().ok_or("No config")?;
    cfg.connection_mode = mode.clone();
    cfg.save()?;

    let old_handle = {
        let mut s = lock_mutex(&state);
        let handle = s.transport_handle.take();
        s.running = false;
        s.mode = "poll".to_string();
        handle
    };

    if let Some(handle) = old_handle {
        tokio::task::spawn_blocking(move || {
            let _ = handle.join();
        }).await.map_err(|e| format!("Join failed: {}", e))?;
    }

    let cfg = AppConfig::load().ok_or("No config")?;
    let handle = match mode.as_str() {
        "sse" => Some(crate::sse::start_sse(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        "ws" => Some(crate::ws::start_ws(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        _ => Some(crate::poll::start_polling(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
    };

    {
        let mut s = lock_mutex(&state);
        s.running = true;
        s.mode = mode;
        s.error = None;
        s.was_connected = false;
        s.transport_handle = handle;
    }

    Ok(())
}

#[tauri::command]
pub fn get_client_uuid() -> String {
    AppConfig::load()
        .map(|c| c.client.uuid)
        .unwrap_or_default()
}

#[tauri::command]
pub fn update_client_name(name: String) -> Result<(), String> {
    if let Some(mut cfg) = AppConfig::load() {
        cfg.client.name = name;
        cfg.save()?;
    }
    Ok(())
}

#[tauri::command]
pub fn backup_messages_json(store: State<'_, Arc<MessageStore>>) -> String {
    let messages = store.get_all();
    serde_json::to_string_pretty(&messages).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
pub fn update_tray_status(tray_items: State<'_, TrayMenuItems>, connected: bool, mode: Option<String>, error: Option<String>) {
    let text = if let Some(ref err) = error {
        format!("● Error: {}", if err.len() > 30 { &err[..30] } else { err })
    } else if connected {
        match mode.as_deref() {
            Some("sse") => "● Connected (SSE)".to_string(),
            Some("ws") => "● Connected (WS)".to_string(),
            _ => "● Connected (Poll)".to_string(),
        }
    } else {
        tray_items.translations.connecting.clone()
    };
    let _ = tray_items.status.set_text(&text);
}

#[tauri::command]
pub fn update_tray_unread(tray_items: State<'_, TrayMenuItems>, count: usize) {
    let text = if count == 0 {
        tray_items.translations.no_unread.clone()
    } else {
        format!("Unread: {}", count)
    };
    let _ = tray_items.unread.set_text(&text);
}

// ── Tray Menu Items (shared state for dynamic updates) ──

pub struct TrayMenuItems {
    pub status: tauri::menu::MenuItem<tauri::Wry>,
    pub unread: tauri::menu::MenuItem<tauri::Wry>,
    pub translations: TrayTranslations,
}

#[derive(Clone)]
pub struct TrayTranslations {
    pub connecting: String,
    pub no_unread: String,
    pub toggle_window: String,
    pub reconnect: String,
    pub quit: String,
}

// ── Log Settings Commands ──

#[tauri::command]
pub fn get_log_settings() -> serde_json::Value {
    let config = AppConfig::load().unwrap_or_default();
    serde_json::json!({
        "level": config.log_level,
        "retentionDays": config.log_retention_days,
    })
}

#[tauri::command]
pub fn set_log_level(level: String) -> Result<(), String> {
    let mut config = AppConfig::load().unwrap_or_default();
    config.log_level = level.clone();
    config.save()?;
    // Re-init logger with new level
    crate::logging::init_log(&level, config.log_retention_days);
    Ok(())
}

#[tauri::command]
pub fn set_log_retention(days: u32) -> Result<(), String> {
    let mut config = AppConfig::load().unwrap_or_default();
    config.log_retention_days = days;
    config.save()?;
    Ok(())
}

#[tauri::command]
pub fn get_log_file_path() -> String {
    crate::logging::today_log_path().to_string_lossy().to_string()
}
