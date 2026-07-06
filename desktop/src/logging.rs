use chrono::{Local, NaiveDate, Duration};
use log::{LevelFilter, Log, Metadata, Record};
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::PathBuf;
use std::sync::{Mutex, OnceLock};

/// Runtime logger that supports updating level and file handle at runtime.
struct RuntimeLogger {
    level: Mutex<LevelFilter>,
    file: Mutex<File>,
}

impl Log for RuntimeLogger {
    fn enabled(&self, metadata: &Metadata<'_>) -> bool {
        metadata.level() <= *self.level.lock().unwrap()
    }

    fn log(&self, record: &Record<'_>) {
        if self.enabled(record.metadata()) {
            if let Ok(mut file) = self.file.lock() {
                let ts = Local::now().format("%Y-%m-%d %H:%M:%S%.3f");
                let _ = writeln!(file, "{} [{}] {}", ts, record.level(), record.args());
            }
        }
    }

    fn flush(&self) {
        if let Ok(mut file) = self.file.lock() {
            let _ = file.flush();
        }
    }
}

/// Global logger instance, registered exactly once with the `log` crate.
static LOGGER: OnceLock<RuntimeLogger> = OnceLock::new();

/// Get the log directory path: ~/.config/notifyhub-client/logs/
fn log_dir() -> PathBuf {
    dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("notifyhub-client")
        .join("logs")
}

/// Get today's log file path
pub fn today_log_path() -> PathBuf {
    let today = Local::now().format("%Y-%m-%d").to_string();
    log_dir().join(format!("notifyhub-{}.log", today))
}

/// Parse date from log filename like "notifyhub-2026-07-06.log"
fn parse_date_from_filename(name: &str) -> Option<NaiveDate> {
    let name = name.strip_prefix("notifyhub-")?;
    let name = name.strip_suffix(".log")?;
    NaiveDate::parse_from_str(name, "%Y-%m-%d").ok()
}

/// Delete log files older than `retention_days` days
pub fn cleanup_old_logs(retention_days: u32) {
    let dir = log_dir();
    if !dir.exists() {
        return;
    }
    let cutoff = Local::now().date_naive() - Duration::days(retention_days as i64);
    let entries = match fs::read_dir(&dir) {
        Ok(e) => e,
        Err(_) => return,
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name_str = name.to_string_lossy();
        if let Some(date) = parse_date_from_filename(&name_str) {
            if date < cutoff {
                if let Err(e) = fs::remove_file(entry.path()) {
                    eprintln!("[log] Failed to remove old log {}: {}", name_str, e);
                }
            }
        }
    }
}

/// Map string log level to LevelFilter
fn parse_level(level: &str) -> LevelFilter {
    match level.to_lowercase().as_str() {
        "error" => LevelFilter::Error,
        "warn" => LevelFilter::Warn,
        "info" => LevelFilter::Info,
        "debug" => LevelFilter::Debug,
        "trace" => LevelFilter::Trace,
        _ => LevelFilter::Info,
    }
}

/// Initialize file logging with daily rotation.
///
/// On first call: creates the logger, registers it with the `log` crate, and sets the level.
/// On subsequent calls (re-init): updates the level and reopens the log file for the new day.
pub fn init_log(level: &str, retention_days: u32) {
    let dir = log_dir();
    if let Err(e) = fs::create_dir_all(&dir) {
        eprintln!("[log] Failed to create log directory {:?}: {}", dir, e);
        return;
    }

    // Clean up old logs
    cleanup_old_logs(retention_days);

    // Open today's log file in append mode
    let log_path = today_log_path();
    let file = match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&log_path)
    {
        Ok(f) => f,
        Err(e) => {
            eprintln!("[log] Failed to open log file {:?}: {}", log_path, e);
            return;
        }
    };

    let level_filter = parse_level(level);

    match LOGGER.get() {
        None => {
            // First initialization: create logger and register with log crate
            let logger = RuntimeLogger {
                level: Mutex::new(level_filter),
                file: Mutex::new(file),
            };
            let logger_ref = LOGGER.get_or_init(|| logger);
            if let Err(e) = log::set_logger(logger_ref) {
                eprintln!("[log] Failed to register logger: {}", e);
                return;
            }
            log::set_max_level(level_filter);
        }
        Some(logger) => {
            // Re-initialization: update level and file handle
            {
                let mut lvl = logger.level.lock().unwrap();
                *lvl = level_filter;
            }
            {
                let mut f = logger.file.lock().unwrap();
                *f = file;
            }
            log::set_max_level(level_filter);
        }
    }

    log::info!(
        "Logging initialized: level={}, retention={}d, file={}",
        level,
        retention_days,
        log_path.display()
    );
}
