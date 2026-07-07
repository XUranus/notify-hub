use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    pub server: String,
    #[serde(default)]
    pub token: String,
    #[serde(default = "default_format")]
    pub format: String,
    /// Client UUID for push subscriptions
    #[serde(default)]
    pub uuid: String,
    /// Username for password-based login (alternative to token)
    #[serde(default)]
    pub username: String,
    /// Password for password-based login
    #[serde(default)]
    pub password: String,
    /// Default connection mode: poll, sse, ws
    #[serde(default = "default_mode")]
    pub mode: String,
}

fn default_format() -> String {
    "text".to_string()
}

fn default_mode() -> String {
    "sse".to_string()
}

impl Default for CliConfig {
    fn default() -> Self {
        Self {
            server: "http://localhost:3000".to_string(),
            token: String::new(),
            format: "text".to_string(),
            uuid: String::new(),
            username: String::new(),
            password: String::new(),
            mode: "sse".to_string(),
        }
    }
}

pub fn config_path() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".notifyhub.yaml")
}

pub fn load_config() -> anyhow::Result<CliConfig> {
    let path = config_path();
    if !path.exists() {
        return Ok(CliConfig::default());
    }
    let content = fs::read_to_string(&path)?;
    let config: CliConfig = serde_yaml::from_str(&content)?;
    Ok(config)
}

pub fn save_config(config: &CliConfig) -> anyhow::Result<()> {
    let path = config_path();
    let content = serde_yaml::to_string(config)?;
    fs::write(&path, content)?;
    Ok(())
}

#[derive(Subcommand)]
pub enum ConfigAction {
    /// Set a config value
    Set { key: String, value: String },
    /// Get a config value (omit key to show all)
    Get { key: Option<String> },
    /// Initialize config interactively
    Init,
}

pub fn run(action: ConfigAction) -> anyhow::Result<()> {
    match action {
        ConfigAction::Set { key, value } => {
            let mut config = load_config()?;
            match key.as_str() {
                "server" => config.server = value,
                "token" => config.token = value,
                "format" => config.format = value,
                "uuid" => config.uuid = value,
                "username" => config.username = value,
                "password" => config.password = value,
                "mode" => config.mode = value,
                _ => {
                    eprintln!("Unknown key: {key}. Valid keys: server, token, format, uuid, username, password, mode");
                    return Ok(());
                }
            }
            save_config(&config)?;
            println!("Set {key} successfully.");
        }
        ConfigAction::Get { key } => {
            let config = load_config()?;
            match key.as_deref() {
                Some("server") => println!("{}", config.server),
                Some("token") => println!("{}", config.token),
                Some("format") => println!("{}", config.format),
                Some("uuid") => println!("{}", config.uuid),
                Some("username") => println!("{}", config.username),
                Some("password") => println!("{}", if config.password.is_empty() { "(not set)" } else { "***" }),
                Some("mode") => println!("{}", config.mode),
                Some(k) => eprintln!("Unknown key: {k}. Valid keys: server, token, format, uuid, username, password, mode"),
                None => {
                    println!("server:   {}", config.server);
                    println!("token:    {}", if config.token.is_empty() { "(not set)" } else { "***" });
                    println!("uuid:     {}", if config.uuid.is_empty() { "(not set)" } else { &config.uuid });
                    println!("username: {}", if config.username.is_empty() { "(not set)" } else { &config.username });
                    println!("password: {}", if config.password.is_empty() { "(not set)" } else { "***" });
                    println!("mode:     {}", config.mode);
                    println!("format:   {}", config.format);
                }
            }
        }
        ConfigAction::Init => {
            let config = load_config().unwrap_or_default();
            print!("Server URL [{}]: ", config.server);
            std::io::Write::flush(&mut std::io::stdout())?;
            let mut input = String::new();
            std::io::stdin().read_line(&mut input)?;
            let server = input.trim();
            let server = if server.is_empty() { &config.server } else { server };

            println!("Authentication mode:");
            println!("  1) JWT token (for API key / admin)");
            println!("  2) Username + password");
            print!("Select [{}]: ", if config.username.is_empty() { "1" } else { "2" });
            std::io::Write::flush(&mut std::io::stdout())?;
            let mut auth_choice = String::new();
            std::io::stdin().read_line(&mut auth_choice)?;
            let auth_choice = auth_choice.trim();

            let (token, username, password) = if auth_choice == "2" {
                print!("Username [{}]: ", config.username);
                std::io::Write::flush(&mut std::io::stdout())?;
                let mut username = String::new();
                std::io::stdin().read_line(&mut username)?;
                let username = username.trim();
                let username = if username.is_empty() { config.username.clone() } else { username.to_string() };

                print!("Password: ");
                std::io::Write::flush(&mut std::io::stdout())?;
                let mut password = String::new();
                std::io::stdin().read_line(&mut password)?;
                let password = password.trim().to_string();

                (String::new(), username, password)
            } else {
                print!("API Token [{}]: ", if config.token.is_empty() { "" } else { "***" });
                std::io::Write::flush(&mut std::io::stdout())?;
                let mut token = String::new();
                std::io::stdin().read_line(&mut token)?;
                let token = token.trim();
                let token = if token.is_empty() { config.token.clone() } else { token.to_string() };
                (token, String::new(), String::new())
            };

            // Generate UUID if not set
            let uuid = if config.uuid.is_empty() {
                uuid::Uuid::new_v4().to_string()
            } else {
                config.uuid.clone()
            };

            println!("Client UUID: {uuid}");
            println!("Connection mode: poll / sse / ws");
            print!("Default mode [{}]: ", config.mode);
            std::io::Write::flush(&mut std::io::stdout())?;
            let mut mode = String::new();
            std::io::stdin().read_line(&mut mode)?;
            let mode = mode.trim();
            let mode = if mode.is_empty() { config.mode.clone() } else { mode.to_string() };

            let new_config = CliConfig {
                server: server.to_string(),
                token,
                format: config.format,
                uuid,
                username,
                password,
                mode,
            };
            save_config(&new_config)?;
            println!("Config saved to {}", config_path().display());
        }
    }
    Ok(())
}
