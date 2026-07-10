use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::poll::{PollState, NotificationDebounce};
use log::{info, error, debug};
use std::sync::{Arc, Mutex};
use tauri::State;

// ── Snapshot types for Tauri serialization ──

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

// ── Config Commands ──

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

// ── Poll State Commands ──

#[tauri::command]
pub fn get_poll_state(state: State<'_, Arc<Mutex<PollState>>>) -> PollStateSnapshot {
    let s = crate::poll::lock_mutex(&state);
    PollStateSnapshot {
        running: s.running,
        mode: s.mode.clone(),
        last_poll: s.last_poll.clone(),
        error: s.error.clone(),
    }
}

// ── System Commands ──

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

// ── Autostart Commands ──

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

// ── Message Commands ──

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

// ── URL/File Commands ──

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

// ── Connection Commands ──

#[tauri::command]
pub async fn reconnect(
    state: State<'_, Arc<Mutex<PollState>>>,
    msg_store: State<'_, Arc<MessageStore>>,
    debounce: State<'_, Arc<NotificationDebounce>>,
) -> Result<(), String> {
    log::info!("[cmd] Reconnect");
    let cfg = AppConfig::load().ok_or("No config")?;

    // Stop old transport
    let old_handle = {
        let mut s = crate::poll::lock_mutex(&state);
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

    // Start new transport
    let mode = cfg.connection_mode.clone();
    let handle = match mode.as_str() {
        "sse" => Some(crate::sse::start_sse(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        "ws" => Some(crate::ws::start_ws(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        _ => Some(crate::poll::start_polling(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
    };

    {
        let mut s = crate::poll::lock_mutex(&state);
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
        let mut s = crate::poll::lock_mutex(&state);
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
        let mut s = crate::poll::lock_mutex(&state);
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
    debounce: State<'_, Arc<NotificationDebounce>>,
) -> Result<(), String> {
    log::info!("[cmd] Set connection mode: {}", mode);
    let mut cfg = AppConfig::load().ok_or("No config")?;
    cfg.connection_mode = mode.clone();
    cfg.save()?;

    // Stop old transport
    let old_handle = {
        let mut s = crate::poll::lock_mutex(&state);
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

    // Start new transport
    let cfg = AppConfig::load().ok_or("No config")?;
    let handle = match mode.as_str() {
        "sse" => Some(crate::sse::start_sse(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        "ws" => Some(crate::ws::start_ws(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
        _ => Some(crate::poll::start_polling(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone())),
    };

    {
        let mut s = crate::poll::lock_mutex(&state);
        s.running = true;
        s.mode = mode;
        s.error = None;
        s.was_connected = false;
        s.transport_handle = handle;
    }

    Ok(())
}

// ── Client Info Commands ──

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
pub fn export_messages_csv(store: State<'_, Arc<MessageStore>>) -> Result<String, String> {
    let messages = store.get_all();
    let mut wtr = csv::Writer::from_writer(vec![]);
    for msg in &messages {
        wtr.serialize((&msg.id, &msg.title, &msg.body, &msg.level, &msg.received_at))
            .map_err(|e| e.to_string())?;
    }
    String::from_utf8(wtr.into_inner().map_err(|e| e.to_string())?).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn export_messages_json(store: State<'_, Arc<MessageStore>>) -> String {
    let messages = store.get_all();
    serde_json::to_string_pretty(&messages).unwrap_or_else(|_| "[]".to_string())
}
