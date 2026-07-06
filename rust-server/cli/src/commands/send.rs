use clap::Args;

use crate::client::NotifyClient;
use crate::config::load_config;

#[derive(Args)]
pub struct SendArgs {
    /// Channel type (email, sms, push)
    #[arg(short, long)]
    channel: String,

    /// Recipient address
    #[arg(short, long)]
    to: String,

    /// Message subject (for email)
    #[arg(short, long)]
    subject: Option<String>,

    /// Message body
    #[arg(short, long)]
    body: Option<String>,

    /// Template name to use
    #[arg(long)]
    template: Option<String>,

    /// Template variables (key=value, repeatable)
    #[arg(long = "var", value_parser = parse_var)]
    variables: Vec<(String, String)>,

    /// Idempotency key
    #[arg(long)]
    idempotency_key: Option<String>,

    /// Tags (space-separated)
    #[arg(long, value_delimiter = ' ')]
    tags: Vec<String>,

    /// Priority 0-99 (higher = more urgent)
    #[arg(long)]
    priority: Option<u32>,

    /// URL for click-through
    #[arg(long)]
    url: Option<String>,

    /// Delay: relative (30m, 1h, 1d, 1w) or absolute (yyyy-mm-dd hh:mm:ss)
    #[arg(long)]
    delay: Option<String>,

    /// Body format: text, markdown, html, json
    #[arg(long, default_value = "text")]
    format: String,

    /// Server URL override
    #[arg(long)]
    server: Option<String>,

    /// API token override
    #[arg(long)]
    token: Option<String>,
}

fn parse_var(s: &str) -> Result<(String, String), String> {
    let (key, value) = s.split_once('=')
        .ok_or_else(|| format!("invalid format, expected key=value: {s}"))?;
    Ok((key.to_string(), value.to_string()))
}

pub async fn run(args: SendArgs) -> anyhow::Result<()> {
    if args.body.is_none() && args.template.is_none() {
        eprintln!("Error: either --body or --template is required");
        std::process::exit(1);
    }

    let config = load_config()?;
    let server = args.server.as_deref().unwrap_or(&config.server);
    let token = args.token.as_deref().unwrap_or(&config.token);

    if token.is_empty() {
        eprintln!("Error: no API token configured. Run 'notifyhub config init' first.");
        std::process::exit(1);
    }

    let client = NotifyClient::new(server, token);

    let mut msg = serde_json::json!({
        "channel": args.channel,
        "to": args.to,
        "format": args.format,
        "tags": args.tags,
    });

    if let Some(subject) = &args.subject {
        msg["subject"] = serde_json::Value::String(subject.clone());
    }
    if let Some(body) = &args.body {
        msg["body"] = serde_json::Value::String(body.clone());
    }
    if let Some(template) = &args.template {
        msg["template"] = serde_json::Value::String(template.clone());
    }
    if !args.variables.is_empty() {
        let vars: serde_json::Map<String, serde_json::Value> = args.variables.iter()
            .map(|(k, v)| (k.clone(), serde_json::Value::String(v.clone())))
            .collect();
        msg["variables"] = serde_json::Value::Object(vars);
    }
    if let Some(key) = &args.idempotency_key {
        msg["idempotencyKey"] = serde_json::Value::String(key.clone());
    }
    if let Some(priority) = args.priority {
        msg["priority"] = serde_json::Value::Number(priority.into());
    }
    if let Some(url) = &args.url {
        msg["url"] = serde_json::Value::String(url.clone());
    }
    if let Some(delay) = &args.delay {
        msg["delay"] = serde_json::Value::String(delay.clone());
    }

    let resp = client.send(&msg).await?;

    if resp.success {
        if let Some(data) = &resp.data {
            let msg_id = data.get("messageId").and_then(|v| v.as_str()).unwrap_or("unknown");
            let status = data.get("status").and_then(|v| v.as_str()).unwrap_or("unknown");
            println!("Message sent: {msg_id} (status: {status})");
        }
    } else {
        let err = resp.error.unwrap_or_else(|| "unknown error".to_string());
        eprintln!("Error: {err}");
        std::process::exit(1);
    }

    Ok(())
}
