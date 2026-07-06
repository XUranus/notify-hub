use clap::Args;

use crate::client::NotifyClient;
use crate::config::load_config;

#[derive(Args)]
pub struct StatusArgs {
    /// Message ID
    id: String,

    /// Server URL override
    #[arg(long)]
    server: Option<String>,

    /// API token override
    #[arg(long)]
    token: Option<String>,
}

pub async fn run(args: StatusArgs) -> anyhow::Result<()> {
    let config = load_config()?;
    let server = args.server.as_deref().unwrap_or(&config.server);
    let token = args.token.as_deref().unwrap_or(&config.token);

    if token.is_empty() {
        eprintln!("Error: no API token configured. Run 'notifyhub config init' first.");
        std::process::exit(1);
    }

    let client = NotifyClient::new(server, token);
    let resp = client.get_message(&args.id).await?;

    if resp.success {
        if let Some(data) = &resp.data {
            println!("ID:         {}", data.get("id").and_then(|v| v.as_str()).unwrap_or("-"));
            println!("Channel:    {}", data.get("channelType").and_then(|v| v.as_str()).unwrap_or("-"));
            println!("To:         {}", data.get("toAddress").and_then(|v| v.as_str()).unwrap_or("-"));
            println!("Subject:    {}", data.get("subject").and_then(|v| v.as_str()).unwrap_or("-"));
            println!("Status:     {}", data.get("status").and_then(|v| v.as_str()).unwrap_or("-"));
            println!("Retries:    {}/{}",
                data.get("retryCount").and_then(|v| v.as_i64()).unwrap_or(0),
                data.get("maxRetries").and_then(|v| v.as_i64()).unwrap_or(5));
            if let Some(err) = data.get("errorMessage").and_then(|v| v.as_str()) {
                if !err.is_empty() {
                    println!("Error:      {err}");
                }
            }
            if let Some(sent) = data.get("sentAt").and_then(|v| v.as_i64()) {
                println!("Sent at:    {}", format_timestamp(sent));
            }
            println!("Created at: {}", format_timestamp(
                data.get("createdAt").and_then(|v| v.as_i64()).unwrap_or(0)
            ));
        }
    } else {
        let err = resp.error.unwrap_or_else(|| "unknown error".to_string());
        eprintln!("Error: {err}");
        std::process::exit(1);
    }

    Ok(())
}

fn format_timestamp(ts: i64) -> String {
    chrono::DateTime::from_timestamp(ts, 0)
        .map(|dt| dt.format("%Y-%m-%d %H:%M:%S UTC").to_string())
        .unwrap_or_else(|| ts.to_string())
}
