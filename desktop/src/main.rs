#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod api;
mod commands;
mod config;
mod logging;
mod messages;
mod notify;
mod poll;
mod sse;
mod ws;

use commands::*;
use config::AppConfig;
use log::{info, error};
use messages::MessageStore;
use poll::{PollState, NotificationDebounce};
use std::sync::{Arc, Mutex};
use tauri::{
    menu::{Menu, MenuItem, PredefinedMenuItem},
    tray::{TrayIconBuilder, MouseButton, MouseButtonState, TrayIconEvent},
    Emitter, Manager,
};
use tauri_plugin_autostart::MacosLauncher;
use tauri_plugin_global_shortcut::GlobalShortcutExt;

// ── Helpers ──

pub fn create_runtime() -> tokio::runtime::Runtime {
    tokio::runtime::Runtime::new().expect("failed to create tokio runtime")
}

fn detect_system_locale() -> String {
    for var in &["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"] {
        if let Ok(val) = std::env::var(var) {
            let lang = val.split('.').next().unwrap_or(&val).to_lowercase();
            if lang.starts_with("zh") { return "zh".to_string(); }
            if lang.starts_with("ja") { return "ja".to_string(); }
            if lang.starts_with("ko") { return "ko".to_string(); }
            return "en".to_string();
        }
    }
    "en".to_string()
}

#[derive(Clone)]
struct TrayTranslations {
    connecting: String,
    no_unread: String,
    toggle_window: String,
    reconnect: String,
    quit: String,
}

fn get_tray_translations(locale: &str) -> TrayTranslations {
    match locale {
        "zh" => TrayTranslations {
            connecting: "● 连接中...".to_string(),
            no_unread: "没有未读".to_string(),
            toggle_window: "切换窗口".to_string(),
            reconnect: "重新连接".to_string(),
            quit: "退出".to_string(),
        },
        "ja" => TrayTranslations {
            connecting: "● 接続中...".to_string(),
            no_unread: "未読なし".to_string(),
            toggle_window: "ウィンドウ切替".to_string(),
            reconnect: "再接続".to_string(),
            quit: "終了".to_string(),
        },
        "ko" => TrayTranslations {
            connecting: "● 연결 중...".to_string(),
            no_unread: "읽지 않음 없음".to_string(),
            toggle_window: "창 전환".to_string(),
            reconnect: "재연결".to_string(),
            quit: "종료".to_string(),
        },
        _ => TrayTranslations {
            connecting: "● Connecting...".to_string(),
            no_unread: "No unread".to_string(),
            toggle_window: "Toggle Window".to_string(),
            reconnect: "Reconnect".to_string(),
            quit: "Quit".to_string(),
        },
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
    { unsafe { libc::kill(pid as i32, 0) == 0 } }
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

fn acquire_lock() -> Result<LockGuard, u32> {
    let path = lock_path();
    if path.exists() {
        if let Ok(content) = std::fs::read_to_string(&path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if pid != std::process::id() && is_process_alive(pid) {
                    return Err(pid);
                }
            }
        }
    }
    std::fs::write(&path, std::process::id().to_string()).ok();
    if let Ok(content) = std::fs::read_to_string(&path) {
        if let Ok(pid) = content.trim().parse::<u32>() {
            if pid != std::process::id() && is_process_alive(pid) {
                return Err(pid);
            }
        }
    }
    Ok(LockGuard { path })
}

struct LockGuard { path: std::path::PathBuf }

impl Drop for LockGuard {
    fn drop(&mut self) {
        if let Ok(content) = std::fs::read_to_string(&self.path) {
            if let Ok(pid) = content.trim().parse::<u32>() {
                if pid == std::process::id() {
                    std::fs::remove_file(&self.path).ok();
                }
            }
        }
    }
}

// ── Tray Commands ──

struct TrayMenuItems {
    status: MenuItem<tauri::Wry>,
    unread: MenuItem<tauri::Wry>,
    translations: TrayTranslations,
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
        tray_items.translations.connecting.clone()
    };
    let _ = tray_items.status.set_text(&text);
}

#[tauri::command]
fn update_tray_unread(tray_items: tauri::State<'_, TrayMenuItems>, count: usize) {
    let text = if count == 0 {
        tray_items.translations.no_unread.clone()
    } else {
        format!("Unread: {}", count)
    };
    let _ = tray_items.unread.set_text(&text);
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

fn toggle_docked_window(win: &tauri::WebviewWindow) {
    if win.is_visible().unwrap_or(false) {
        let _ = win.hide();
    } else {
        dock_window_to_right(win, false);
    }
}

fn main() {
    // Try to acquire single-instance lock
    let _lock = match acquire_lock() {
        Ok(lock) => lock,
        Err(pid) => {
            eprintln!("Another instance is running (PID: {}). Exiting.", pid);
            std::process::exit(1);
        }
    };

    #[cfg(target_os = "linux")]
    prefer_x11_for_window_positioning();

    // Load config
    let config = AppConfig::load().unwrap_or_else(|| {
        info!("[main] No config found, creating default");
        AppConfig::default_with_uuid()
    });

    // Init logging
    let log_level = &config.log_level;
    let log_retention = config.log_retention_days;
    logging::init_log(log_level, log_retention);

    // Init message store
    let msg_store = Arc::new(MessageStore::new());

    // Shared poll state
    let initial_mode = config.connection_mode.clone();
    let poll_state = Arc::new(Mutex::new(PollState {
        running: true,
        mode: initial_mode.clone(),
        last_poll: None,
        error: None,
        was_connected: false,
        transport_handle: None,
    }));
    let notification_debounce = NotificationDebounce::new(msg_store.clone());

    // Clone for setup closure
    let poll_state_setup = poll_state.clone();
    let msg_store_setup = msg_store.clone();
    let debounce_setup = notification_debounce.clone();

    // Build Tauri app
    let mut builder = tauri::Builder::default()
        .plugin(tauri_plugin_autostart::init(MacosLauncher::LaunchAgent, None))
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_global_shortcut::Builder::new().build())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_shell::init())
        .manage(msg_store.clone())
        .manage(poll_state.clone())
        .manage(notification_debounce.clone());

    // Register autostart if enabled
    if config.autostart {
        builder = builder.setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                if let Some(manager) = handle.try_state::<tauri_plugin_autostart::AutoLaunchManager>() {
                    if let Err(e) = manager.enable() {
                        error!("[main] Failed to enable autostart: {}", e);
                    }
                }
            });
            Ok(())
        });
    }

    // Handle --autostart-minimized flag
    let args: Vec<String> = std::env::args().collect();
    let start_minimized = args.contains(&"--autostart-minimized".to_string());

    builder
        .setup(move |app| {
            // Register global shortcut
            let handle = app.handle().clone();
            let shortcut = app.global_shortcut();
            shortcut.on_shortcut("CommandOrControl+Shift+N", move |_app, _shortcut, _event| {
                if let Some(window) = _app.get_webview_window("main") {
                    if window.is_visible().unwrap_or(false) {
                        let _ = window.hide();
                    } else {
                        let _ = window.show();
                        let _ = window.set_focus();
                    }
                }
            })?;

            // ── Tray setup ──
            let locale = detect_system_locale();
            let t = get_tray_translations(&locale);

            let status = MenuItem::with_id(app, "tray-status", &t.connecting, true, None::<&str>)?;
            let unread = MenuItem::with_id(app, "tray-unread", &t.no_unread, true, None::<&str>)?;
            let toggle = MenuItem::with_id(app, "tray-toggle", &t.toggle_window, true, None::<&str>)?;
            let reconnect = MenuItem::with_id(app, "tray-reconnect", &t.reconnect, true, None::<&str>)?;
            let quit = MenuItem::with_id(app, "tray-quit", &t.quit, true, None::<&str>)?;
            let sep = PredefinedMenuItem::separator(app)?;
            let menu = Menu::with_items(app, &[&status, &unread, &sep, &toggle, &reconnect, &sep, &quit])?;

            // Manage tray menu items for dynamic updates
            app.manage(TrayMenuItems {
                status: status.clone(),
                unread: unread.clone(),
                translations: t.clone(),
            });

            let _tray = TrayIconBuilder::with_id("main")
                .icon(app.default_window_icon().cloned().unwrap_or_else(|| {
                    // This shouldn't happen, but provide a fallback
                    panic!("No default icon found")
                }))
            .menu(&menu)
            .on_menu_event(move |app, event| {
                match event.id.as_ref() {
                    "tray-toggle" => {
                        if let Some(window) = app.get_webview_window("main") {
                            toggle_docked_window(&window);
                        }
                    }
                    "tray-reconnect" => {
                        info!("[tray] Reconnect requested");
                        if let Some(window) = app.get_webview_window("main") {
                            let _ = window.emit("tray-reconnect", ());
                        }
                    }
                    "tray-quit" => {
                        info!("[tray] Quit requested");
                        app.exit(0);
                    }
                    _ => {}
                }
            })
            .on_tray_icon_event(|tray, event| {
                if let TrayIconEvent::Click {
                    button: MouseButton::Left,
                    button_state: MouseButtonState::Up,
                    ..
                } = event
                {
                    let app = tray.app_handle();
                    if let Some(window) = app.get_webview_window("main") {
                        toggle_docked_window(&window);
                    }
                }
            })
            .build(app)?;

            // Position window on the right side of the screen with slide-in animation
            if let Some(win) = app.get_webview_window("main") {
                dock_window_to_right(&win, true);
            }

            // ── Start polling ──
            info!("[main] Starting initial poll");
            let cfg = config.clone();
            let handle = match cfg.connection_mode.as_str() {
                "sse" => Some(sse::start_sse(cfg, poll_state_setup.clone(), msg_store_setup.clone(), debounce_setup.clone())),
                "ws" => Some(ws::start_ws(cfg, poll_state_setup.clone(), msg_store_setup.clone(), debounce_setup.clone())),
                _ => Some(poll::start_polling(cfg, poll_state_setup.clone(), msg_store_setup.clone(), debounce_setup.clone())),
            };
            {
                let mut s = poll_state_setup.lock().unwrap();
                s.running = true;
                s.mode = config.connection_mode.clone();
                s.transport_handle = handle;
            }

            // ── Window setup ──
            let window = app.get_webview_window("main").unwrap();
            if start_minimized {
                let _ = window.hide();
            }

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Window
            window_minimize,
            window_toggle_maximize,
            window_close,
            // Config
            get_config,
            save_config,
            set_language,
            // Poll state
            get_poll_state,
            // System
            get_system_info,
            get_app_info,
            get_system_fonts,
            // Autostart
            get_autostart,
            set_autostart,
            // Messages
            get_messages,
            mark_as_read,
            toggle_flag,
            delete_message_undo,
            insert_message,
            get_unread_count,
            drain_has_new,
            delete_message,
            clear_messages,
            // Files
            open_url,
            download_file,
            read_image_data_url,
            fetch_image_data_url,
            // Tray
            update_tray_status,
            update_tray_unread,
            // Connection
            reconnect,
            stop_polling,
            logout,
            set_connection_mode,
            // Client
            get_client_uuid,
            update_client_name,
            export_messages_csv,
            export_messages_json,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
