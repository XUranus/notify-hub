use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

/// Generate a deterministic UUID v5 from device hardware info.
/// Uses hostname + machine-id (Linux/macOS) or hostname + username (fallback)
/// so the UUID stays the same across reinstalls on the same device.
fn device_stable_uuid() -> String {
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
            if let Ok(id) = fs::read_to_string(path) {
                let id = id.trim();
                if !id.is_empty() {
                    parts.push(id.to_string());
                    break;
                }
            }
        }
    }
    #[cfg(target_os = "macos")]
    {
        if let Ok(output) = std::process::Command::new("ioreg")
            .args(["-rd1", "-c", "IOPlatformExpertDevice"])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("IOPlatformUUID") {
                    if let Some(uuid) = line.split('"').nth(3) {
                        parts.push(uuid.to_string());
                    }
                }
            }
        }
    }
    #[cfg(target_os = "windows")]
    {
        // Windows: read MachineGuid from registry
        if let Ok(output) = std::process::Command::new("reg")
            .args([
                "query",
                r"HKLM\SOFTWARE\Microsoft\Cryptography",
                "/v",
                "MachineGuid",
            ])
            .output()
        {
            let stdout = String::from_utf8_lossy(&output.stdout);
            for line in stdout.lines() {
                if line.contains("MachineGuid") {
                    if let Some(guid) = line.split_whitespace().last() {
                        parts.push(guid.to_string());
                    }
                }
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
}

fn default_connection_mode() -> String {
    "sse".to_string()
}

impl AppConfig {
    pub fn config_path() -> PathBuf {
        let dir = dirs::config_dir()
            .unwrap_or_else(|| PathBuf::from("."))
            .join("notifyhub-client");
        fs::create_dir_all(&dir).ok();
        dir.join("config.toml")
    }

    pub fn load() -> Option<Self> {
        let path = Self::config_path();
        if path.exists() {
            let content = fs::read_to_string(&path).ok()?;
            toml::from_str(&content).ok()
        } else {
            None
        }
    }

    pub fn save(&self) -> Result<(), String> {
        let path = Self::config_path();
        let content = toml::to_string_pretty(self).map_err(|e| e.to_string())?;
        fs::write(&path, content).map_err(|e| e.to_string())
    }

    pub fn default_with_uuid() -> Self {
        Self {
            server: ServerConfig {
                url: "http://localhost:4321".to_string(),
                username: String::new(),
                password: String::new(),
                jwt: String::new(),
            },
            client: ClientConfig {
                uuid: device_stable_uuid(),
                name: whoami::fallible::hostname().unwrap_or_else(|_| "desktop".to_string()),
            },
            autostart: false,
            auto_download_images: false,
            connection_mode: "sse".to_string(),
        }
    }
}
