#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod config;
mod messages;
mod notify;
mod poll;

use config::AppConfig;
use messages::{LocalMessage, MessageStore};
use poll::PollState;
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem},
    tray::TrayIconBuilder,
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
    let s = state.lock().unwrap();
    PollStateSnapshot {
        running: s.running,
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
            dir.join("messages.json").to_string_lossy().to_string()
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
fn delete_message(id: String, store: tauri::State<'_, Arc<MessageStore>>) {
    store.delete(&id);
}

#[tauri::command]
fn clear_messages(store: tauri::State<'_, Arc<MessageStore>>) {
    store.clear();
}

#[tauri::command]
fn open_url(url: String) -> Result<(), String> {
    open::that(&url).map_err(|e| e.to_string())
}

#[tauri::command]
async fn download_file(url: String, filename: String, app: tauri::AppHandle) -> Result<(), String> {
    use tauri_plugin_dialog::DialogExt;

    // Show save dialog
    let save_path = app.dialog()
        .file()
        .set_file_name(&filename)
        .blocking_save_file();

    let save_path = match save_path {
        Some(p) => p,
        None => return Ok(()), // User cancelled
    };

    let dest = save_path.as_path()
        .ok_or_else(|| "Invalid save path".to_string())?
        .to_path_buf();

    // Download file
    let resp = reqwest::get(&url).await.map_err(|e| format!("Download failed: {}", e))?;
    let bytes = resp.bytes().await.map_err(|e| format!("Download failed: {}", e))?;

    // Write to chosen path
    std::fs::write(&dest, &bytes).map_err(|e| format!("Write failed: {}", e))?;

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
fn logout(state: tauri::State<'_, Arc<Mutex<PollState>>>) -> Result<(), String> {
    // Stop polling
    {
        let mut s = state.lock().unwrap();
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
) -> Result<(), String> {
    let mut cfg = AppConfig::load().ok_or("No config found")?;

    if cfg.server.username.is_empty() || cfg.server.password.is_empty() {
        return Err("Username and password are required".to_string());
    }

    // Login to get JWT
    let jwt = api::ApiClient::login(&cfg.server.url, &cfg.server.username, &cfg.server.password)
        .await
        .map_err(|e| {
            let mut s = state.lock().unwrap();
            s.error = Some(e.clone());
            e
        })?;

    // Save JWT to config
    cfg.server.jwt = jwt.clone();
    cfg.save().map_err(|e| {
        let mut s = state.lock().unwrap();
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
        let mut s = state.lock().unwrap();
        s.error = Some(e.clone());
        e
    })?;

    {
        let mut s = state.lock().unwrap();
        s.last_poll = None;
        s.error = None;
    }
    poll::start_polling(cfg.clone(), state.inner().clone(), msg_store.inner().clone());

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
fn window_start_drag(window: tauri::Window) -> Result<(), String> {
    window.start_dragging().map_err(|e| e.to_string())
}

// ── Types ──

#[derive(serde::Serialize)]
struct PollStateSnapshot {
    running: bool,
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

// ── Single Instance Lock (flock) ──

fn lock_path() -> std::path::PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| std::path::PathBuf::from("."))
        .join("notifyhub-client");
    std::fs::create_dir_all(&dir).ok();
    dir.join("lock")
}

/// Try to acquire an exclusive flock. Returns Ok(guard) on success.
/// The lock is held until the guard is dropped (process exit).
fn acquire_lock() -> Result<LockGuard, ()> {
    use std::os::unix::io::AsRawFd;
    let path = lock_path();
    let file = std::fs::OpenOptions::new()
        .create(true)
        .write(true)
        .truncate(false)
        .open(&path)
        .map_err(|_| ())?;

    let fd = file.as_raw_fd();
    let ret = unsafe { libc::flock(fd, libc::LOCK_EX | libc::LOCK_NB) };
    if ret != 0 {
        return Err(());
    }

    // Write PID for debugging purposes
    use std::io::Write;
    let _ = (&file).write_all(std::process::id().to_string().as_bytes());

    Ok(LockGuard { _file: file })
}

struct LockGuard {
    _file: std::fs::File,
}

// ── Main ──

fn main() {
    // Single instance check (flock)
    let _lock = match acquire_lock() {
        Ok(lock) => lock,
        Err(()) => {
            eprintln!("Another instance is already running. Exiting.");
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
                Some(c) => c,
                None => {
                    let default = AppConfig::default_with_uuid();
                    default.save().ok();
                    default
                }
            };

            // Apply autostart setting from config
            if cfg.autostart {
                let auto_launch = app.state::<AutoLaunchManager>();
                let _ = auto_launch.enable();
            }

            let msg_store = Arc::new(MessageStore::new());
            app.manage(msg_store.clone());

            let poll_state = Arc::new(Mutex::new(PollState {
                running: true,
                last_poll: None,
                error: None,
                was_connected: false,
            }));
            app.manage(poll_state.clone());

            if !cfg.server.jwt.is_empty() {
                // JWT exists — register and start polling
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
                        let _ = api.register(&uuid, &name, os, arch, &desktop, version).await;
                    });
                });

                poll::start_polling(cfg.clone(), poll_state.clone(), msg_store.clone());
            } else if !cfg.server.username.is_empty() && !cfg.server.password.is_empty() {
                // No JWT but credentials exist — login first, then register and poll
                let url = cfg.server.url.clone();
                let username = cfg.server.username.clone();
                let password = cfg.server.password.clone();
                let uuid = cfg.client.uuid.clone();
                let name = cfg.client.name.clone();
                let _cfg_clone = cfg.clone();
                let state_clone = poll_state.clone();
                let store_clone = msg_store.clone();

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        match api::ApiClient::login(&url, &username, &password).await {
                            Ok(jwt) => {
                                // Save JWT
                                if let Some(mut c) = AppConfig::load() {
                                    c.server.jwt = jwt.clone();
                                    let _ = c.save();
                                }
                                // Register
                                let api = api::ApiClient::new(&url, &jwt);
                                let os = std::env::consts::OS;
                                let arch = std::env::consts::ARCH;
                                let desktop = detect_desktop_env();
                                let version = env!("CARGO_PKG_VERSION");
                                let _ = api.register(&uuid, &name, os, arch, &desktop, version).await;
                                // Start polling with updated config
                                if let Some(c) = AppConfig::load() {
                                    poll::start_polling(c, state_clone, store_clone);
                                }
                            }
                            Err(e) => {
                                eprintln!("[startup] Login failed: {}", e);
                                let mut s = state_clone.lock().unwrap();
                                s.error = Some(format!("Login failed: {}", e));
                            }
                        }
                    });
                });
            }

            // System tray
            let show_item = MenuItem::with_id(app, "show", "Show", true, None::<&str>)?;
            let quit_item = MenuItem::with_id(app, "quit", "Quit", true, None::<&str>)?;
            let menu = Menu::with_items(app, &[&show_item, &quit_item])?;

            let icon = app
                .default_window_icon()
                .map(|i| i.clone())
                .expect("app icon not found");

            let _tray = TrayIconBuilder::new()
                .icon(icon)
                .menu(&menu)
                .tooltip("NotifyHub Client")
                .on_menu_event(|app, event| match event.id.as_ref() {
                    "show" => {
                        if let Some(win) = app.get_webview_window("main") {
                            win.show().ok();
                            win.set_focus().ok();
                        }
                    }
                    "quit" => {
                        app.exit(0);
                    }
                    _ => {}
                })
                .build(app)?;

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
            get_messages,
            mark_as_read,
            toggle_flag,
            delete_message_undo,
            insert_message,
            get_unread_count,
            delete_message,
            clear_messages,
            open_url,
            download_file,
            read_image_data_url,
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
            window_start_drag
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
