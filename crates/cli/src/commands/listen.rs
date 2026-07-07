use clap::Args;
use std::fs::OpenOptions;
use std::io::Write;
use std::path::PathBuf;
use std::time::Duration;

use crate::client::{NotifyClient, PushMessage};
use crate::config::{load_config, save_config, CliConfig};

const RECONNECT_BASE_MS: u64 = 5000;
const RECONNECT_MAX_MS: u64 = 120000;
const POLL_INTERVAL_MS: u64 = 5000;
const SSE_TIMEOUT_SECS: u64 = 90;

#[derive(Args)]
pub struct ListenArgs {
    /// Use poll mode (HTTP polling)
    #[arg(long)]
    poll: bool,

    /// Use SSE mode (Server-Sent Events)
    #[arg(long)]
    sse: bool,

    /// Use WebSocket mode
    #[arg(long, alias = "websocket")]
    ws: bool,

    /// Output JSONL file path (default: ~/.notifyhub/listen.jsonl)
    #[arg(short, long)]
    output: Option<String>,

    /// Server URL override
    #[arg(long)]
    server: Option<String>,

    /// JWT token override
    #[arg(long)]
    token: Option<String>,

    /// Username override (triggers password login)
    #[arg(long)]
    username: Option<String>,

    /// Password override
    #[arg(long)]
    password: Option<String>,

    /// Client UUID override
    #[arg(long)]
    uuid: Option<String>,
}

pub async fn run(args: ListenArgs) -> anyhow::Result<()> {
    let mut config = load_config()?;

    // Apply overrides
    if let Some(s) = &args.server { config.server = s.clone(); }
    if let Some(t) = &args.token { config.token = t.clone(); }
    if let Some(u) = &args.username { config.username = u.clone(); }
    if let Some(p) = &args.password { config.password = p.clone(); }

    // Resolve UUID
    let uuid = args.uuid.clone().unwrap_or_else(|| {
        if config.uuid.is_empty() {
            let new_uuid = uuid::Uuid::new_v4().to_string();
            eprintln!("No UUID configured, generated: {new_uuid}");
            config.uuid = new_uuid.clone();
            let _ = save_config(&config);
            new_uuid
        } else {
            config.uuid.clone()
        }
    });

    // Resolve auth: login if needed
    let token = resolve_auth(&mut config).await?;

    // Determine mode
    let mode = if args.poll {
        "poll"
    } else if args.sse {
        "sse"
    } else if args.ws {
        "ws"
    } else {
        &config.mode
    };

    // Open JSONL output file
    let output_path = match &args.output {
        Some(p) => PathBuf::from(p),
        None => {
            let dir = dirs::home_dir()
                .unwrap_or_else(|| PathBuf::from("."))
                .join(".notifyhub");
            std::fs::create_dir_all(&dir)?;
            dir.join("listen.jsonl")
        }
    };
    let output_file = OpenOptions::new()
        .create(true)
        .append(true)
        .open(&output_path)?;

    eprintln!("NotifyHub CLI Listener");
    eprintln!("  Server:   {}", config.server);
    eprintln!("  UUID:     {uuid}");
    eprintln!("  Mode:     {mode}");
    eprintln!("  Output:   {}", output_path.display());
    eprintln!("  Ctrl+C to stop");
    eprintln!();

    let client = NotifyClient::new(&config.server, &token);

    // Register client
    let os = std::env::consts::OS;
    let arch = std::env::consts::ARCH;
    if let Err(e) = client.register_client(&uuid, &format!("cli-{}", &uuid[..8]), os, arch).await {
        eprintln!("Warning: register failed: {e}");
    }

    match mode {
        "poll" => run_poll(&client, &uuid, output_file).await,
        "sse" => run_sse(&client, &uuid, &token, output_file).await,
        "ws" => run_ws(&client, &uuid, &token, output_file).await,
        _ => {
            eprintln!("Unknown mode: {mode}. Use --poll, --sse, or --ws.");
            std::process::exit(1);
        }
    }
}

/// Resolve authentication: if token is empty but username/password exist, login first
async fn resolve_auth(config: &mut CliConfig) -> anyhow::Result<String> {
    if !config.token.is_empty() {
        return Ok(config.token.clone());
    }
    if config.username.is_empty() || config.password.is_empty() {
        anyhow::bail!(
            "No authentication configured. Run 'notifyhub config init' or provide --token/--username."
        );
    }

    eprintln!("Logging in as {}...", config.username);
    match NotifyClient::login(&config.server, &config.username, &config.password).await {
        Ok(token) => {
            eprintln!("Login successful.");
            config.token = token.clone();
            let _ = save_config(config);
            Ok(token)
        }
        Err(e) => {
            anyhow::bail!("Login failed: {e}");
        }
    }
}

// ---------------------------------------------------------------------------
// Poll mode
// ---------------------------------------------------------------------------

async fn run_poll(
    client: &NotifyClient,
    uuid: &str,
    mut output_file: std::fs::File,
) -> anyhow::Result<()> {
    let mut backoff_ms = RECONNECT_BASE_MS;

    loop {
        match client.poll(uuid, 50).await {
            Ok((401, _)) => {
                eprintln!("[poll] 401 Unauthorized, token may have expired");
                return Ok(());
            }
            Ok((_, messages)) if !messages.is_empty() => {
                backoff_ms = RECONNECT_BASE_MS;
                let ids: Vec<String> = messages.iter().filter_map(|m| m.id.clone()).collect();
                for msg in &messages {
                    emit_message(msg, &mut output_file);
                }
                // ACK
                if !ids.is_empty() {
                    if let Err(e) = client.ack(uuid, &ids).await {
                        eprintln!("[poll] ACK failed: {e}");
                    }
                }
            }
            Ok((_, _)) => {
                backoff_ms = RECONNECT_BASE_MS;
            }
            Err(e) => {
                eprintln!("[poll] Error: {e}");
                let sleep_ms = backoff_ms;
                backoff_ms = (backoff_ms * 2).min(RECONNECT_MAX_MS);
                tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
                continue;
            }
        }
        tokio::time::sleep(Duration::from_millis(POLL_INTERVAL_MS)).await;
    }
}

// ---------------------------------------------------------------------------
// SSE mode
// ---------------------------------------------------------------------------

async fn run_sse(
    client: &NotifyClient,
    uuid: &str,
    token: &str,
    mut output_file: std::fs::File,
) -> anyhow::Result<()> {
    let mut backoff_ms = RECONNECT_BASE_MS;

    loop {
        eprintln!("[sse] Connecting...");
        let url = format!(
            "{}/api/user/push/stream?uuid={}&token={}",
            client.server_url(),
            uuid,
            token
        );

        match client.http.get(&url).send().await {
            Ok(mut resp) => {
                if resp.status() == 401 {
                    eprintln!("[sse] 401 Unauthorized, token may have expired");
                    return Ok(());
                }
                if !resp.status().is_success() {
                    eprintln!("[sse] HTTP {}", resp.status());
                    let sleep_ms = backoff_ms;
                    backoff_ms = (backoff_ms * 2).min(RECONNECT_MAX_MS);
                    tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
                    continue;
                }

                eprintln!("[sse] Connected");
                backoff_ms = RECONNECT_BASE_MS;
                let mut buffer = String::new();

                loop {
                    let chunk = tokio::time::timeout(
                        Duration::from_secs(SSE_TIMEOUT_SECS),
                        resp.chunk(),
                    )
                    .await;

                    match chunk {
                        Ok(Ok(Some(bytes))) => {
                            buffer.push_str(&String::from_utf8_lossy(&bytes));

                            while let Some(newline_pos) = buffer.find('\n') {
                                let line = buffer[..newline_pos].trim().to_string();
                                buffer = buffer[newline_pos + 1..].to_string();

                                if line.is_empty() || line.starts_with(':') {
                                    continue;
                                }

                                if let Some(data) = line.strip_prefix("data: ") {
                                    handle_sse_data(data, client, uuid, &mut output_file).await;
                                }
                            }
                        }
                        Ok(Ok(None)) => {
                            eprintln!("[sse] Stream ended");
                            break;
                        }
                        Ok(Err(e)) => {
                            eprintln!("[sse] Stream error: {e}");
                            break;
                        }
                        Err(_) => {
                            eprintln!("[sse] Timeout ({SSE_TIMEOUT_SECS}s), reconnecting...");
                            break;
                        }
                    }
                }
            }
            Err(e) => {
                eprintln!("[sse] Connection failed: {e}");
            }
        }

        let sleep_ms = backoff_ms;
        backoff_ms = (backoff_ms * 2).min(RECONNECT_MAX_MS);
        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
    }
}

async fn handle_sse_data(
    data: &str,
    client: &NotifyClient,
    uuid: &str,
    output_file: &mut std::fs::File,
) {
    // Try to parse as {"data": [...]} wrapper
    if let Ok(wrapper) = serde_json::from_str::<serde_json::Value>(data) {
        if let Some(arr) = wrapper.get("data").and_then(|d| d.as_array()) {
            let messages: Vec<PushMessage> = arr
                .iter()
                .filter_map(|v| serde_json::from_value(v.clone()).ok())
                .collect();
            if !messages.is_empty() {
                let ids: Vec<String> = messages.iter().filter_map(|m| m.id.clone()).collect();
                for msg in &messages {
                    emit_message(msg, output_file);
                }
                ack_with_retry(client, uuid, &ids).await;
            }
            return;
        }
        // Try as single message
        if wrapper.get("body").is_some() || wrapper.get("title").is_some() {
            if let Ok(msg) = serde_json::from_value::<PushMessage>(wrapper.clone()) {
                let ids: Vec<String> = msg.id.iter().cloned().collect();
                emit_message(&msg, output_file);
                ack_with_retry(client, uuid, &ids).await;
            }
        }
    }
}

// ---------------------------------------------------------------------------
// WebSocket mode
// ---------------------------------------------------------------------------

async fn run_ws(
    client: &NotifyClient,
    uuid: &str,
    token: &str,
    mut output_file: std::fs::File,
) -> anyhow::Result<()> {
    use futures_util::{SinkExt, StreamExt};
    use tokio_tungstenite::connect_async;
    use tokio_tungstenite::tungstenite::Message;

    let mut backoff_ms = RECONNECT_BASE_MS;

    loop {
        let ws_url = {
            let http_url = &client.server;
            let ws_base = if http_url.starts_with("https") {
                http_url.replacen("https", "wss", 1)
            } else {
                http_url.replacen("http", "ws", 1)
            };
            format!("{ws_base}/api/user/push/ws?uuid={uuid}&token={token}")
        };

        eprintln!("[ws] Connecting...");
        match connect_async(&ws_url).await {
            Ok((ws_stream, _)) => {
                eprintln!("[ws] Connected");
                backoff_ms = RECONNECT_BASE_MS;
                let (mut write, mut read) = ws_stream.split();

                loop {
                    let msg = tokio::time::timeout(
                        Duration::from_secs(SSE_TIMEOUT_SECS),
                        read.next(),
                    )
                    .await;

                    match msg {
                        Ok(Some(Ok(Message::Text(text)))) => {
                            handle_ws_text(&text, client, uuid, &mut output_file).await;
                        }
                        Ok(Some(Ok(Message::Ping(data)))) => {
                            let _ = write.send(Message::Pong(data)).await;
                        }
                        Ok(Some(Ok(Message::Close(_)))) => {
                            eprintln!("[ws] Server closed connection");
                            break;
                        }
                        Ok(Some(Err(e))) => {
                            eprintln!("[ws] Error: {e}");
                            break;
                        }
                        Ok(None) => {
                            eprintln!("[ws] Stream ended");
                            break;
                        }
                        Err(_) => {
                            eprintln!("[ws] Timeout ({SSE_TIMEOUT_SECS}s), reconnecting...");
                            break;
                        }
                        _ => {}
                    }
                }
            }
            Err(e) => {
                let err_msg = e.to_string();
                if err_msg.contains("401") || err_msg.contains("403") {
                    eprintln!("[ws] Auth error: {err_msg}");
                    return Ok(());
                }
                eprintln!("[ws] Connection failed: {e}");
            }
        }

        let sleep_ms = backoff_ms;
        backoff_ms = (backoff_ms * 2).min(RECONNECT_MAX_MS);
        tokio::time::sleep(Duration::from_millis(sleep_ms)).await;
    }
}

async fn handle_ws_text(
    text: &str,
    client: &NotifyClient,
    uuid: &str,
    output_file: &mut std::fs::File,
) {
    let wrapper: serde_json::Value = match serde_json::from_str(text) {
        Ok(v) => v,
        Err(_) => return,
    };

    // Skip {"event":"connected",...}
    if wrapper.get("event").and_then(|e| e.as_str()) == Some("connected") {
        eprintln!("[ws] Handshake received");
        return;
    }

    // Parse {"data": [...]}
    if let Some(arr) = wrapper.get("data").and_then(|d| d.as_array()) {
        let messages: Vec<PushMessage> = arr
            .iter()
            .filter_map(|v| serde_json::from_value(v.clone()).ok())
            .collect();
        if !messages.is_empty() {
            let ids: Vec<String> = messages.iter().filter_map(|m| m.id.clone()).collect();
            for msg in &messages {
                emit_message(msg, output_file);
            }
            ack_with_retry(client, uuid, &ids).await;
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

fn emit_message(msg: &PushMessage, file: &mut std::fs::File) {
    let title = msg.title.as_deref().unwrap_or("");
    let body = msg.body.as_deref().unwrap_or("");
    let level = msg.level.as_deref().unwrap_or("info");
    let topic = msg.topic_display_name.as_deref()
        .or(msg.topic_name.as_deref())
        .unwrap_or("");

    // Print to stdout
    if topic.is_empty() {
        println!("[{level}] {title}: {body}");
    } else {
        println!("[{level}] [{topic}] {title}: {body}");
    }

    // Write to JSONL
    let json_line = serde_json::to_string(msg).unwrap_or_default();
    let _ = writeln!(file, "{json_line}");
}

async fn ack_with_retry(client: &NotifyClient, uuid: &str, ids: &[String]) {
    if ids.is_empty() {
        return;
    }
    for attempt in 0..3u32 {
        match client.ack(uuid, ids).await {
            Ok(_) => return,
            Err(e) => {
                if attempt < 2 {
                    eprintln!("[ack] Attempt {}/3 failed: {e}", attempt + 1);
                    tokio::time::sleep(Duration::from_secs(1)).await;
                } else {
                    eprintln!("[ack] Failed after 3 attempts: {e}");
                }
            }
        }
    }
}
