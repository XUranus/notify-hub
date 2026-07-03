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
fn reconnect(
    state: tauri::State<'_, Arc<Mutex<PollState>>>,
    msg_store: tauri::State<'_, Arc<MessageStore>>,
) -> Result<(), String> {
    let cfg = AppConfig::load().ok_or("No config found")?;

    if cfg.server.api_key.is_empty() {
        return Err("API Key is required".to_string());
    }

    let api = api::ApiClient::new(&cfg.server.url, &cfg.server.api_key);
    let uuid = cfg.client.uuid.clone();
    let name = cfg.client.name.clone();
    let rt = tokio::runtime::Runtime::new().map_err(|e| e.to_string())?;
    rt.block_on(async {
        let os = std::env::consts::OS;
        let arch = std::env::consts::ARCH;
        let desktop = detect_desktop_env();
        let version = env!("CARGO_PKG_VERSION");
        api.register(&uuid, &name, os, arch, &desktop, version).await
    }).map_err(|e| {
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

fn detect_desktop_env() -> String {
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

// ── Main ──

fn main() {
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
            }));
            app.manage(poll_state.clone());

            if !cfg.server.api_key.is_empty() {
                let api = api::ApiClient::new(&cfg.server.url, &cfg.server.api_key);
                let uuid = cfg.client.uuid.clone();
                let name = cfg.client.name.clone();
                let api_clone = api;

                std::thread::spawn(move || {
                    let rt = tokio::runtime::Runtime::new().unwrap();
                    rt.block_on(async {
                        let os = std::env::consts::OS;
                        let arch = std::env::consts::ARCH;
                        let desktop = detect_desktop_env();
                        let version = env!("CARGO_PKG_VERSION");
                        let _ = api_clone.register(&uuid, &name, os, arch, &desktop, version).await;
                    });
                });

                poll::start_polling(cfg.clone(), poll_state.clone(), msg_store.clone());
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
            reconnect,
            backup_messages_json,
            restore_messages_json,
            export_messages_csv,
            export_messages_xml,
            export_messages_json
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
