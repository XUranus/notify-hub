use clap::Subcommand;
use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CliConfig {
    pub server: String,
    pub token: String,
    #[serde(default = "default_format")]
    pub format: String,
}

fn default_format() -> String {
    "text".to_string()
}

impl Default for CliConfig {
    fn default() -> Self {
        Self {
            server: "http://localhost:3000".to_string(),
            token: String::new(),
            format: "text".to_string(),
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
                _ => {
                    eprintln!("Unknown key: {key}. Valid keys: server, token, format");
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
                Some(k) => eprintln!("Unknown key: {k}. Valid keys: server, token, format"),
                None => {
                    println!("server: {}", config.server);
                    println!("token:  {}", if config.token.is_empty() { "(not set)" } else { "***" });
                    println!("format: {}", config.format);
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

            print!("API Token: ");
            std::io::Write::flush(&mut std::io::stdout())?;
            let mut token = String::new();
            std::io::stdin().read_line(&mut token)?;
            let token = token.trim().to_string();

            let new_config = CliConfig {
                server: server.to_string(),
                token,
                format: config.format,
            };
            save_config(&new_config)?;
            println!("Config saved to {}", config_path().display());
        }
    }
    Ok(())
}
