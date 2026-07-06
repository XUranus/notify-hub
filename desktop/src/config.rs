use log::{debug, error, info, warn};
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Generate a deterministic UUID v5 from device hardware info.
/// Uses hostname + machine-id (Linux/macOS) or hostname + username (fallback)
/// so the UUID stays the same across reinstalls on the same device.
fn device_stable_uuid() -> String {
    debug!("[config] Generating device UUID");
    let mut parts: Vec<String> = Vec::new();

    // Hostname
    if let Ok(h) = hostname::get() {
        parts.push(h.to_string_lossy().to_string());
    }

    // OS username
    parts.push(whoami::username());

    // machine-id (Linux: /etc/machine-id or /var/lib/dbus/machine-id, macOS: IOPlatformUUID via ioreg)
    #[cfg(target_os = "linux")]
    {
        for path in &["/etc/machine-id", "/var/lib/dbus/machine-id"] {
            match fs::read_to_string(path) {
                Ok(id) => {
                    let id = id.trim();
                    if !id.is_empty() {
                        parts.push(id.to_string());
                        break;
                    }
                }
                Err(e) => {
                    debug!("[config] Failed to read {}: {}", path, e);
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        match std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IOPlatformUUID") {
                    if let Some(uuid) = line.split('"').nth(3) {
                        parts.push(uuid.to_string());
                    }
                }
            }
        }
        Err(e) => {
            debug!("[config] Failed to run ioreg: {}", e);
        }
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows: read MachineGuid from registry
        match std::process::Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
        {
        Ok(output) => {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("MachineGuid") {
                    if let Some(guid) = line.split_whitespace().last() {
                        parts.push(guid.to_string());
                    }
                }
            }
        }
        Err(e) => {
            debug!("[config] Failed to run reg command: {}", e);
        }
        }
    }

    // Fallback: if we only got hostname, add home dir path as entropy
    if parts.len() < 2 {
        if let Some(home) = dirs::home_dir() {
            parts.push(home.to_string_lossy().to_string());
        }
    }

    let seed = parts.join("|");

    // Generate UUID v5 from the seed (deterministic)
    let ns = uuid::Uuid::NAMESPACE_DNS;
    uuid::Uuid::new_v5(&ns, seed.as_bytes()).to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ServerConfig {
    pub url: String,
    #[serde(default)]
    pub username: String,
    #[serde(default)]
    pub password: String,
    #[serde(default)]
    pub jwt: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ClientConfig {
    pub uuid: String,
    pub name: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct AppConfig {
    pub server: ServerConfig,
    pub client: ClientConfig,
    #[serde(default)]
    pub autostart: bool,
    #[serde(default)]
    pub auto_download_images: bool,
    /// Connection mode: "sse", "ws", or "poll" (default: "sse")
    #[serde(default = "default_connection_mode")]
    pub connection_mode: String,
    /// Log level: "error", "info", "debug"
    #[serde(default = "default_log_level")]
    pub log_level: String,
    /// Log retention in days: 7, 30, 365
    #[serde(default = "default_log_retention_days")]
    pub log_retention_days: u32,
}

fn default_connection_mode() -> String {
    "sse".to_string()
}

fn default_log_level() -> String {
    "info".to_string()
}

fn default_log_retention_days() -> u32 {
    30
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("notifyhub-client");
        if let Err(e) = fs::create_dir_all(&dir) {
            warn!("[config] Failed to create config dir: {}", e);
        }
        let path = dir.join("config.toml");
        debug!("[config] Config path: {:?}", path);
        path
    }

    pub fn load() -> Option<Self> {
        let path = Self::config_path();
        info!("[config] Loading config from {:?}", path);
        if path.exists() {
            let content = match fs::read_to_string(&path) {
                Ok(c) => c,
                Err(e) => {
                    warn!("[config] Failed to read config: {}", e);
                    return None;
                }
            };
            match toml::from_str(&content) {
                Ok(config) => {
                    info!("[config] Config loaded successfully");
                    Some(config)
                }
                Err(e) => {
                    error!("[config] Failed to parse config: {}", e);
                    None
                }
            }
        } else {
            None
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        info!("[config] Saving config to {:?}", path);
        let content = toml::to_string_pretty(self).map_err(|e| e.to_string())?;
        match fs::write(&path, content) {
            Ok(()) => {
                info!("[config] Config saved");
                Ok(())
            }
            Err(e) => {
                error!("[config] Failed to save config: {}", e);
                Err(e.to_string())
            }
        }
    }

    pub fn default_with_uuid() -> Self {
        let uuid = device_stable_uuid();
        info!("[config] Creating default config with uuid={}", uuid);
        Self {
            server: ServerConfig {
                url: "http://localhost:4321".to_string(),
                username: String::new(),
                password: String::new(),
                jwt: String::new(),
            },
            client: ClientConfig {
                uuid: uuid,
                name: whoami::fallible::hostname().unwrap_or_else(|_| "desktop".to_string()),
            },
            autostart: false,
            auto_download_images: false,
            connection_mode: "sse".to_string(),
            log_level: default_log_level(),
            log_retention_days: default_log_retention_days(),
        }
    }
}
