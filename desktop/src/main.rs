#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod config;
mod logging;
mod messages;
mod notify;
mod poll;
mod sse;
mod ws;

use config::AppConfig;
use log::{info, error, debug};
use messages::{LocalMessage, MessageStore};
use poll::{PollState, lock_mutex};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent},
    Manager,
};
use tauri_plugin_autostart::{AutoLaunchManager, MacosLauncher};

// ── Commands ──

#[tauri::command]
fn get_config() -> Option<AppConfig> {
    AppConfig::load()
}

#[tauri::command]
fn save_config(cfg: AppConfig) -> Result<(), String> {
    cfg.save()
}

#[tauri::command]
fn get_poll_state(state: tauri::State<'_, Arc<Mutex<PollState>>>) -> PollStateSnapshot {
    let s = lock_mutex(&state);
    PollStateSnapshot {
        running: s.running,
        mode: s.mode.clone(),
        last_poll: s.last_poll.clone(),
        error: s.error.clone(),
    }
}

#[tauri::command]
fn get_system_info() -> SystemInfo {
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let desktop_env = detect_desktop_env();
    SystemInfo {
        os: os.to_string(),
        arch: arch.to_string(),
        desktop_env,
    }
}

#[tauri::command]
fn get_app_info() -> AppInfo {
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
fn get_autostart() -> bool {
    AppConfig::load().map(|c| c.autostart).unwrap_or(false)
}

#[tauri::command]
fn set_autostart(enabled: bool, auto_launch: tauri::State<'_, AutoLaunchManager>) -> Result<(), String> {
    // Persist to config
    if let Some(mut cfg) = AppConfig::load() {
        cfg.autostart = enabled;
        cfg.save()?;
    }
    // Apply to system
    if enabled {
        auto_launch.enable().map_err(|e| e.to_string())?;
    } else {
        auto_launch.disable().map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
fn get_messages(store: tauri::State<'_, Arc<MessageStore>>) -> Vec<LocalMessage> {
    store.get_all()
}

#[tauri::command]
fn mark_as_read(id: String, store: tauri::State<'_, Arc<MessageStore>>) {
    store.mark_as_read(&id);
}

#[tauri::command]
fn toggle_flag(id: String, store: tauri::State<'_, Arc<MessageStore>>) {
    store.toggle_flag(&id);
}

#[tauri::command]
fn delete_message_undo(id: String, store: tauri::State<'_, Arc<MessageStore>>) -> Option<LocalMessage> {
    store.delete_and_return(&id)
}

#[tauri::command]
fn insert_message(msg: LocalMessage, index: usize, store: tauri::State<'_, Arc<MessageStore>>) {
    store.insert_at(msg, index);
}

#[tauri::command]
fn get_unread_count(store: tauri::State<'_, Arc<MessageStore>>) -> usize {
    store.unread_count()
}

#[tauri::command]
fn drain_has_new(store: tauri::State<'_, Arc<MessageStore>>) -> bool {
    store.drain_has_new()
}

#[tauri::command]
fn delete_message(id: String, store: tauri::State<'_, Arc<MessageStore>>) {
    store.delete(&id);
}

#[tauri::command]
fn clear_messages(store: tauri::State<'_, Arc<MessageStore>>) {
    store.clear();
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    log::info!("[cmd] Open URL: {}", url);
    open::that(&url).map_err(|e| {
        log::error!("[cmd] Failed to open URL: {}", e);
        e.to_string()
    })
}

#[tauri::command]
async fn download_file(url: String, filename: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;
    log::info!("[cmd] Download file: url={}, filename={}", url, filename);

    // Show save dialog
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

    // Download file (reject if > 10MB)
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

    // Write to chosen path
    std::fs::write(&dest, &bytes).map_err(|e| { log::error!("[cmd] Write to {:?} failed: {}", dest, e); format!("Write failed: {}", e) })?;
    log::info!("[cmd] File saved to {:?}", dest);

    Ok(())
}

#[tauri::command]
fn read_image_data_url(path: String) -> Result<String, String> {
    const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10MB
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
    // Manual base64 encoding
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

/// Fetch an image from a URL and return it as a data URL (base64-encoded).
/// Used for inline image preview in the message detail view.
#[tauri::command]
async fn fetch_image_data_url(url: String) -> Result<String, String> {
    use base64::Engine;
    const MAX_SIZE: u64 = 10 * 1024 * 1024; // 10MB

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

    // Detect MIME from URL extension
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

// ── Tray menu item handles for dynamic updates ──

struct TrayMenuItems {
    status: MenuItem<tauri::Wry>,
    unread: MenuItem<tauri::Wry>,
}

#[derive(serde::Deserialize)]
struct ComposeAttachment {
    name: String,
    url: Option<String>,
}

#[tauri::command]
async fn send_message(
    channel: String,
    to: String,
    subject: Option<String>,
    body: Option<String>,
    tags: Option<Vec<String>>,
    priority: Option<i32>,
    url: Option<String>,
    format: Option<String>,
    attachment: Option<ComposeAttachment>,
) -> Result<String, String> {
    let cfg = AppConfig::load().ok_or("No config found")?;
    if cfg.server.jwt.is_empty() {
        return Err("Not logged in".to_string());
    }
    let api = api::ApiClient::new(&cfg.server.url, &cfg.server.jwt);
    let att_json = attachment.map(|a| serde_json::json!({"name": a.name, "url": a.url}));
    api.send(&channel, &to, subject.as_deref(), body.as_deref(), tags, priority, url.as_deref(), format.as_deref(), att_json)
        .await
}

#[tauri::command]
async fn get_clients() -> Result<Vec<serde_json::Value>, String> {
    let cfg = AppConfig::load().ok_or("No config found")?;
    if cfg.server.jwt.is_empty() {
        return Err("Not logged in".to_string());
    }
    let api = api::ApiClient::new(&cfg.server.url, &cfg.server.jwt);
    api.list_clients().await
}

#[tauri::command]
async fn update_client_name(name: String) -> Result<(), String> {
    let cfg = AppConfig::load().ok_or("No config found")?;
    if cfg.server.jwt.is_empty() {
        return Err("Not logged in".to_string());
    }
    let api = api::ApiClient::new(&cfg.server.url, &cfg.server.jwt);
    api.update_client(&cfg.client.uuid, &name).await?;
    // Save locally
    let mut cfg = cfg;
    cfg.client.name = name;
    cfg.save()?;
    Ok(())
}

#[tauri::command]
fn get_connection_mode(state: tauri::State<'_, Arc<Mutex<PollState>>>) -> String {
    let s = lock_mutex(&state);
    s.mode.clone()
}

#[tauri::command]
fn set_connection_mode(
    mode: String,
    state: tauri::State<'_, Arc<Mutex<PollState>>>,
    msg_store: tauri::State<'_, Arc<MessageStore>>,
    debounce: tauri::State<'_, Arc<poll::NotificationDebounce>>,
) -> Result<(), String> {
    log::info!("[cmd] Set connection mode: {}", mode);
    // Save to config
    if let Some(mut cfg) = AppConfig::load() {
        cfg.connection_mode = mode.clone();
        cfg.save()?;
    }
    // Stop old transport: set running=false so existing loops exit
    let old_handle = {
        let mut s = lock_mutex(&state);
        s.running = false;
        s.mode = mode.clone();
        s.transport_handle.take()
    };
    // Join the old transport thread if it exists
    if let Some(handle) = old_handle {
        let _ = handle.join();
    }
    // Re-enable running for the new transport
    {
        let mut s = lock_mutex(&state);
        s.running = true;
    }
    // Start the appropriate mode and store the handle
    let cfg = AppConfig::load().ok_or("No config")?;
    let handle = match mode.as_str() {
        "sse" => sse::start_sse(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
        "ws" => ws::start_ws(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
        _ => poll::start_polling(cfg, state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
    };
    {
        let mut s = lock_mutex(&state);
        s.transport_handle = Some(handle);
    }
    Ok(())
}

#[tauri::command]
fn logout(state: tauri::State<'_, Arc<Mutex<PollState>>>) -> Result<(), String> {
    log::info!("[cmd] Logout");
    // Stop polling
    {
        let mut s = lock_mutex(&state);
        s.running = false;
        s.last_poll = None;
        s.error = None;
        s.was_connected = false;
    }
    // Clear JWT and credentials from config
    if let Some(mut cfg) = AppConfig::load() {
        cfg.server.jwt = String::new();
        cfg.server.username = String::new();
        cfg.server.password = String::new();
        cfg.save()?;
    }
    Ok(())
}

#[tauri::command]
fn backup_messages_json(store: tauri::State<'_, Arc<MessageStore>>) -> String {
    let msgs = store.get_all();
    serde_json::to_string_pretty(&msgs).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
fn restore_messages_json(json: String, store: tauri::State<'_, Arc<MessageStore>>) -> Result<usize, String> {
    let msgs: Vec<LocalMessage> = serde_json::from_str(&json)
        .map_err(|e| format!("Invalid JSON: {}", e))?;
    let count = msgs.len();
    store.restore(msgs);
    Ok(count)
}

#[tauri::command]
fn export_messages_csv(store: tauri::State<'_, Arc<MessageStore>>) -> String {
    let msgs = store.get_all();
    let mut wtr = csv::Writer::from_writer(vec![]);
    for m in &msgs {
        let tags_str = m.tags.as_deref().unwrap_or("");
        let att_str = m.attachment.as_deref().unwrap_or("");
        wtr.serialize((
            &m.id, &m.title, &m.body, &m.level, &m.received_at,
            m.read, m.flagged, tags_str, m.priority.unwrap_or(0),
            m.url.as_deref().unwrap_or(""), att_str,
            m.format.as_deref().unwrap_or("text"),
        )).ok();
    }
    String::from_utf8(wtr.into_inner().unwrap_or_default()).unwrap_or_default()
}

#[tauri::command]
fn export_messages_xml(store: tauri::State<'_, Arc<MessageStore>>) -> String {
    let msgs = store.get_all();
    let mut xml = String::from("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n<messages>\n");
    for m in &msgs {
        xml.push_str("  <message>\n");
        xml.push_str(&format!("    <id>{}</id>\n", escape_xml(&m.id)));
        xml.push_str(&format!("    <title>{}</title>\n", escape_xml(&m.title)));
        xml.push_str(&format!("    <body>{}</body>\n", escape_xml(&m.body)));
        xml.push_str(&format!("    <level>{}</level>\n", escape_xml(&m.level)));
        xml.push_str(&format!("    <received_at>{}</received_at>\n", escape_xml(&m.received_at)));
        xml.push_str(&format!("    <read>{}</read>\n", m.read));
        xml.push_str(&format!("    <flagged>{}</flagged>\n", m.flagged));
        if let Some(ref tags) = m.tags { xml.push_str(&format!("    <tags>{}</tags>\n", escape_xml(tags))); }
        if let Some(p) = m.priority { xml.push_str(&format!("    <priority>{}</priority>\n", p)); }
        if let Some(ref url) = m.url { xml.push_str(&format!("    <url>{}</url>\n", escape_xml(url))); }
        if let Some(ref att) = m.attachment { xml.push_str(&format!("    <attachment>{}</attachment>\n", escape_xml(att))); }
        if let Some(ref fmt) = m.format { xml.push_str(&format!("    <format>{}</format>\n", escape_xml(fmt))); }
        xml.push_str("  </message>\n");
    }
    xml.push_str("</messages>");
    xml
}

fn escape_xml(s: &str) -> String {
    s.replace('&', "&amp;").replace('<', "&lt;").replace('>', "&gt;").replace('"', "&quot;").replace('\'', "&apos;")
}

#[tauri::command]
fn export_messages_json(store: tauri::State<'_, Arc<MessageStore>>) -> String {
    let msgs = store.get_all();
    serde_json::to_string_pretty(&msgs).unwrap_or_else(|_| "[]".to_string())
}

#[tauri::command]
async fn reconnect(
    state: tauri::State<'_, Arc<Mutex<PollState>>>,
    msg_store: tauri::State<'_, Arc<MessageStore>>,
    debounce: tauri::State<'_, Arc<poll::NotificationDebounce>>,
) -> Result<(), String> {
    log::info!("[cmd] Reconnect");
    let mut cfg = AppConfig::load().ok_or("No config found")?;

    if cfg.server.username.is_empty() || cfg.server.password.is_empty() {
        log::error!("[cmd] Reconnect failed: no credentials");
        return Err("Username and password are required".to_string());
    }

    // Login to get JWT
    let jwt = api::ApiClient::login(&cfg.server.url, &cfg.server.username, &cfg.server.password)
        .await
        .map_err(|e| {
            log::error!("[cmd] Reconnect login failed: {}", e);
            let mut s = lock_mutex(&state);
            s.error = Some(e.clone());
            e
        })?;

    // Save JWT to config
    cfg.server.jwt = jwt.clone();
    cfg.save().map_err(|e| {
        log::error!("[cmd] Reconnect: failed to save JWT: {}", e);
        let mut s = lock_mutex(&state);
        s.error = Some(e.clone());
        e
    })?;

    // Register
    let api = api::ApiClient::new(&cfg.server.url, &jwt);
    let uuid = cfg.client.uuid.clone();
    let name = cfg.client.name.clone();
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    let desktop = detect_desktop_env();
    let version = env!("CARGO_PKG_VERSION");
    api.register(&uuid, &name, os, arch, &desktop, version).await.map_err(|e| {
        log::error!("[cmd] Reconnect register failed: {}", e);
        let mut s = lock_mutex(&state);
        s.error = Some(e.clone());
        e
    })?;
    log::info!("[cmd] Reconnect successful, starting {}", cfg.connection_mode);

    // Stop old transport
    let old_handle = {
        let mut s = lock_mutex(&state);
        s.running = false;
        s.last_poll = None;
        s.error = None;
        s.transport_handle.take()
    };
    if let Some(handle) = old_handle {
        let _ = handle.join();
    }
    {
        let mut s = lock_mutex(&state);
        s.running = true;
    }
    let mode = cfg.connection_mode.clone();
    let handle = match mode.as_str() {
        "sse" => sse::start_sse(cfg.clone(), state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
        "ws" => ws::start_ws(cfg.clone(), state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
        _ => poll::start_polling(cfg.clone(), state.inner().clone(), msg_store.inner().clone(), debounce.inner().clone()),
    };
    {
        let mut s = lock_mutex(&state);
        s.transport_handle = Some(handle);
    }

    Ok(())
}

// ── Window Controls ──

#[tauri::command]
fn window_minimize(window: tauri::Window) -> Result<(), String> {
    window.minimize().map_err(|e| e.to_string())
}

#[tauri::command]
fn window_toggle_maximize(window: tauri::Window) -> Result<(), String> {
    if window.is_maximized().unwrap_or(false) {
        window.unmaximize().map_err(|e| e.to_string())
    } else {
        window.maximize().map_err(|e| e.to_string())
    }
}

#[tauri::command]
fn window_close(window: tauri::Window) -> Result<(), String> {
    window.close().map_err(|e| e.to_string())
}

#[tauri::command]
fn update_tray_status(tray_items: tauri::State<'_, TrayMenuItems>, connected: bool, mode: Option<String>, error: Option<String>) {
    let text = if let Some(ref err) = error {
        format!("● Error: {}", if err.len() > 30 { &err[..30] } else { err })
    } else if connected {
        match mode.as_deref() {
            Some("sse") => "● Connected (SSE)".to_string(),
            Some("ws") => "● Connected (WS)".to_string(),
            _ => "● Connected (Poll)".to_string(),
        }
    } else {
        "● Connecting...".to_string()
    };
    let _ = tray_items.status.set_text(&text);
}

#[tauri::command]
fn update_tray_unread(tray_items: tauri::State<'_, TrayMenuItems>, count: usize) {
    let text = if count == 0 {
        "No unread".to_string()
    } else {
        format!("Unread: {}", count)
    };
    let _ = tray_items.unread.set_text(&text);
}

// ── Log Settings Commands ──

#[tauri::command]
fn get_log_settings(_store: tauri::State<'_, Arc<MessageStore>>) -> serde_json::Value {
    let cfg = AppConfig::load().unwrap_or_else(|| AppConfig::default_with_uuid());
    serde_json::json!({
        "level": cfg.log_level,
        "retentionDays": cfg.log_retention_days,
        "logPath": logging::today_log_path().to_string_lossy().to_string(),
    })
}

#[tauri::command]
fn set_log_level(level: String) -> Result<(), String> {
    let mut cfg = AppConfig::load().ok_or("No config found")?;
    cfg.log_level = level.clone();
    cfg.save()?;
    // Reinitialize the logger with new level
    logging::init_log(&level, cfg.log_retention_days);
    Ok(())
}

#[tauri::command]
fn set_log_retention(days: u32) -> Result<(), String> {
    let mut cfg = AppConfig::load().ok_or("No config found")?;
    cfg.log_retention_days = days;
    cfg.save()?;
    // Run cleanup with new retention
    logging::cleanup_old_logs(days);
    Ok(())
}

#[tauri::command]
fn get_log_file_path() -> String {
    logging::today_log_path().to_string_lossy().to_string()
}

// ── Types ──

#[derive(serde::Serialize)]
struct PollStateSnapshot {
    running: bool,
    mode: String,
    last_poll: Option<String>,
    error: Option<String>,
}

#[derive(serde::Serialize)]
struct SystemInfo {
    os: String,
    arch: String,
    desktop_env: String,
}

#[derive(serde::Serialize)]
struct AppInfo {
    version: String,
    config_path: String,
    messages_path: String,
}

// ── Helpers ──

/// Create a new tokio runtime for background threads
pub fn create_runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Runtime::new().expect("failed to create tokio runtime")
}

pub fn detect_desktop_env() -> String {
    if let Ok(de) = std::env::var("XDG_CURRENT_DESKTOP") {
        return de;
    }
    if let Ok(de) = std::env::var("DESKTOP_SESSION") {
        return de;
    }
    if let Ok(de) = std::env::var("XDG_SESSION_DESKTOP") {
        return de;
    }
    match std::env::consts::OS {
        "macos" => "macOS".to_string(),
        "windows" => "Windows".to_string(),
        _ => {
            if std::env::var("KDE_FULL_SESSION").is_ok()
                || std::env::var("KDE_SESSION_VERSION").is_ok()
            {
                "KDE".to_string()
            } else if std::env::var("GNOME_DESKTOP_SESSION_ID").is_ok()
                || std::env::var("GNOME_SESSION_ID").is_ok()
            {
                "GNOME".to_string()
            } else {
                "Unknown".to_string()
            }
        }
    }
}

// ── Single Instance Lock ──

fn lock_path() -> std::path::PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("notifyhub-client");
    std::fs::create_dir_all(&dir).ok();
    dir.join("lock")
}

fn is_process_alive(pid: u32) -> bool {
    #[cfg(unix)]
    {
        // Send signal 0 — doesn't kill, just checks existence
        unsafe { libc::kill(pid as i32, 0) == 0 }
    }
    #[cfg(windows)]
    {
        use std::process::Command;
        Command::new("tasklist")
            .args(["/FI", &format!("PID eq {}", pid), "/NH"])
            .output()
            .map(|o| {
                let out = String::from_utf8_lossy(&o.stdout);
                out.contains(&pid.to_string())
            })
            .unwrap_or(false)
    }
}

/// Try to acquire single-instance lock. Returns Ok(lock) on success, Err(existing_pid) if another instance is running.
fn acquire_lock() -> Result<LockGuard, u32> {
    let path = lock_path();

    // Check if lock file exists
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if pid != std::process::id() && is_process_alive(pid) {
                    return Err(pid);
                }
            }
        }
    }

    // Write our PID
    std::fs::write(&path, std::process::id().to_string()).ok();

    // Verify we won the race (double-check)
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if pid != std::process::id() && is_process_alive(pid) {
                return Err(pid);
            }
        }
    }

    Ok(LockGuard { path })
}

struct LockGuard {
    path: std::path::PathBuf,
}

impl Drop for LockGuard {
    fn drop(&mut self) {
        // Only remove if we own it
        if let Ok(content) = std::fs::read_to_string(&self.path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if pid == std::process::id() {
                    std::fs::remove_file(&self.path).ok();
                }
            }
        }
    }
}

// ── Main ──

const SIDEBAR_WIDTH: u32 = 450;

#[cfg(target_os = "linux")]
fn prefer_x11_for_window_positioning() {
    if std::env::var_os("WAYLAND_DISPLAY").is_some()
        && std::env::var_os("DISPLAY").is_some()
        && std::env::var_os("GDK_BACKEND").is_none()
    {
        // Wayland compositors do not allow normal apps to set absolute window positions.
        // XWayland is required for the docked sidebar behavior.
        std::env::set_var("GDK_BACKEND", "x11");
        std::env::set_var("WINIT_UNIX_BACKEND", "x11");
    }
}

#[cfg(not(target_os = "linux"))]
fn prefer_x11_for_window_positioning() {}

fn dock_window_to_right(win: &tauri::WebviewWindow, animate: bool) {
    // Some window managers ignore size/position changes while the window is hidden.
    let _ = win.show();

    let monitor = match win.current_monitor() {
        Ok(Some(monitor)) => Some(monitor),
        _ => win.primary_monitor().ok().flatten(),
    };

    let Some(monitor) = monitor else {
        let _ = win.show();
        let _ = win.set_focus();
        return;
    };

    let work_area = monitor.work_area();
    let width = SIDEBAR_WIDTH;
    let height = work_area.size.height;
    let pos_y = work_area.position.y;
    let target_x = work_area.position.x + work_area.size.width as i32 - width as i32;

    if let Err(e) = win.set_size(tauri::PhysicalSize::new(width, height)) {
        log::warn!("[window] Failed to set sidebar size: {}", e);
    }
    if let Err(e) = win.set_resizable(false) {
        log::warn!("[window] Failed to disable resize: {}", e);
    }
    let _ = win.set_decorations(false);
    let _ = win.set_always_on_top(true);
    let _ = win.set_shadow(false);
    let _ = win.set_skip_taskbar(true);

    if !animate {
        if let Err(e) = win.set_position(tauri::PhysicalPosition::new(target_x, pos_y)) {
            log::warn!("[window] Failed to set sidebar position: {}", e);
        }
        let _ = win.set_focus();
        return;
    }

    let start_x = work_area.position.x + work_area.size.width as i32;
    if let Err(e) = win.set_position(tauri::PhysicalPosition::new(start_x, pos_y)) {
        log::warn!("[window] Failed to set sidebar start position: {}", e);
    }
    let _ = win.set_focus();

    let win_clone = win.clone();
    std::thread::spawn(move || {
        let steps: i32 = 15;
        let delay = std::time::Duration::from_millis(16);
        for i in 0..=steps {
            let progress = i as f64 / steps as f64;
            let eased = 1.0 - (1.0 - progress).powi(3);
            let x = start_x + ((target_x - start_x) as f64 * eased) as i32;
            let _ = win_clone.set_position(tauri::PhysicalPosition::new(x, pos_y));
            std::thread::sleep(delay);
        }
    });
}

fn main() {
    prefer_x11_for_window_positioning();

    // Initialize logging from config (before anything else)
    let cfg_for_log = AppConfig::load().unwrap_or_else(|| AppConfig::default_with_uuid());
    logging::init_log(&cfg_for_log.log_level, cfg_for_log.log_retention_days);

    // Single instance check
    let _lock = match acquire_lock() {
        Ok(lock) => lock,
        Err(pid) => {
            error!("Another instance is already running (PID {}). Exiting.", pid);
            std::process::exit(0);
        }
    };

    tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(
            MacosLauncher::LaunchAgent,
            Some(vec!["--minimized"]),
        ))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                window.hide().ok();
                api.prevent_close();
            }
        })
        .setup(|app| {
            let cfg = match AppConfig::load() {
                Some(c) => {
                    info!("Config loaded from {:?}", AppConfig::config_path());
                    c
                }
                None => {
                    let default = AppConfig::default_with_uuid();
                    default.save().ok();
                    info!("No config found, created default config");
                    default
                }
            };

            info!("App starting: client={}, server={}, mode={}", cfg.client.name, cfg.server.url, cfg.connection_mode);
            debug!("Config: autostart={}, auto_download_images={}", cfg.autostart, cfg.auto_download_images);

            // Apply autostart setting from config
            if cfg.autostart {
                let auto_launch = app.state::<AutoLaunchManager>();
                if let Err(e) = auto_launch.enable() {
                    log::warn!("[startup] Failed to enable autostart: {}", e);
                }
            }

            let msg_store = Arc::new(MessageStore::new());
            app.manage(msg_store.clone());

            let debounce = poll::NotificationDebounce::new(msg_store.clone());
            app.manage(debounce.clone());

            let initial_mode = cfg.connection_mode.clone();
            let poll_state = Arc::new(Mutex::new(PollState {
                running: true,
                mode: initial_mode.clone(),
                last_poll: None,
                error: None,
                was_connected: false,
                transport_handle: None,
            }));
            app.manage(poll_state.clone());

            // Helper: start the appropriate connection mode and store the handle
            fn start_connection_mode(mode: &str, cfg: AppConfig, state: Arc<Mutex<PollState>>, store: Arc<MessageStore>, debounce: Arc<poll::NotificationDebounce>) {
                let handle = match mode {
                    "sse" => sse::start_sse(cfg, state.clone(), store, debounce),
                    "ws" => ws::start_ws(cfg, state.clone(), store, debounce),
                    _ => poll::start_polling(cfg, state.clone(), store, debounce),
                };
                let mut s = lock_mutex(&state);
                s.transport_handle = Some(handle);
            }

            if !cfg.server.jwt.is_empty() {
                // JWT exists — register and start connection
                info!("JWT found, starting {} connection", initial_mode);
                let api = api::ApiClient::new(&cfg.server.url, &cfg.server.jwt);
                let uuid = cfg.client.uuid.clone();
                let name = cfg.client.name.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        let os = std::env::consts::OS;
                        let arch = std::env::consts::ARCH;
                        let desktop = detect_desktop_env();
                        let version = env!("CARGO_PKG_VERSION");
                        if let Err(e) = api.register(&uuid, &name, os, arch, &desktop, version).await {
                            log::warn!("[startup] Register failed (JWT path): {}", e);
                        }
                    });
                });

                start_connection_mode(&initial_mode, cfg.clone(), poll_state.clone(), msg_store.clone(), debounce.clone());
            } else if !cfg.server.username.is_empty() && !cfg.server.password.is_empty() {
                // No JWT but credentials exist — login first, then register and poll
                info!("No JWT, logging in with credentials");
                let url = cfg.server.url.clone();
                let username = cfg.server.username.clone();
                let password = cfg.server.password.clone();
                let uuid = cfg.client.uuid.clone();
                let name = cfg.client.name.clone();
                let _cfg_clone = cfg.clone();
                let state_clone = poll_state.clone();
                let store_clone = msg_store.clone();
                let debounce_clone = debounce.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        match api::ApiClient::login(&url, &username, &password).await {
                            Ok(jwt) => {
                                // Save JWT
                                if let Some(mut c) = AppConfig::load() {
                                    c.server.jwt = jwt.clone();
                                    if let Err(e) = c.save() {
                                        log::error!("[startup] Failed to save JWT after login: {}", e);
                                    }
                                }
                                // Register
                                let api = api::ApiClient::new(&url, &jwt);
                                let os = std::env::consts::OS;
                                let arch = std::env::consts::ARCH;
                                let desktop = detect_desktop_env();
                                let version = env!("CARGO_PKG_VERSION");
                                if let Err(e) = api.register(&uuid, &name, os, arch, &desktop, version).await {
                                    log::warn!("[startup] Register failed (credentials path): {}", e);
                                }
                                // Start connection with updated config
                                if let Some(c) = AppConfig::load() {
                                    let mode = c.connection_mode.clone();
                                    start_connection_mode(&mode, c, state_clone, store_clone, debounce_clone);
                                } else {
                                    log::error!("[startup] Config disappeared after login, cannot start connection");
                                }
                            }
                            Err(e) => {
                                error!("[startup] Login failed: {}", e);
                                let mut s = lock_mutex(&state_clone);
                                s.error = Some(format!("Login failed: {}", e));
                            }
                        }
                    });
                });
            }

            // System tray
            let status_item = MenuItem::with_id(app, "status", "● Connecting...", false, None::<&str>)?;
            let unread_item = MenuItem::with_id(app, "unread", "No unread", false, None::<&str>)?;
            let separator1 = PredefinedMenuItem::separator(app)?;
            let show_item = MenuItem::with_id(app, "show", "Show Window", true, None::<&str>)?;
            let reconnect_item = MenuItem::with_id(app, "reconnect", "Reconnect", true, None::<&str>)?;
            let separator2 = PredefinedMenuItem::separator(app)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&status_item, &unread_item, &separator1, &show_item, &reconnect_item, &separator2, &quit_item])?;

            let icon = app
                .default_window_icon()
                .map(|i| i.clone())
                .expect("app icon not found");

            app.manage(TrayMenuItems { status: status_item, unread: unread_item });

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("NotifyHub Client")
                .on_menu_event(move |app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            dock_window_to_right(&win, false);
                        }
                    }
                    "reconnect" => {
                        if let Some(win) = app.get_webview_window("main") {
                            let _ = win.eval("window.__reconnect && window.__reconnect()");
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .on_tray_icon_event(|tray, event| {
                    if let TrayIconEvent::Click { button: MouseButton::Left, button_state: MouseButtonState::Up, .. } = event {
                        let app = tray.app_handle();
                        if let Some(win) = app.get_webview_window("main") {
                            dock_window_to_right(&win, false);
                        }
                    }
                })
                .build(app)?;

            // Position window on the right side of the screen with slide-in animation
            if let Some(win) = app.get_webview_window("main") {
                dock_window_to_right(&win, true);
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            get_config,
            save_config,
            get_poll_state,
            get_system_info,
            get_app_info,
            get_autostart,
            set_autostart,
            get_connection_mode,
            set_connection_mode,
            get_messages,
            mark_as_read,
            toggle_flag,
            delete_message_undo,
            insert_message,
            get_unread_count,
            drain_has_new,
            delete_message,
            clear_messages,
            open_url,
            download_file,
            read_image_data_url,
            fetch_image_data_url,
            reconnect,
            send_message,
            get_clients,
            update_client_name,
            logout,
            backup_messages_json,
            restore_messages_json,
            export_messages_csv,
            export_messages_xml,
            export_messages_json,
            window_minimize,
            window_toggle_maximize,
            window_close,
            update_tray_status,
            update_tray_unread,
            get_log_settings,
            set_log_level,
            set_log_retention,
            get_log_file_path
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
