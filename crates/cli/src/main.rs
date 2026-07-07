use clap::{Parser, Subcommand};

mod client;
mod config;
mod commands;

#[derive(Parser)]
#[command(name = "notifyhub", version, about = "NotifyHub - Self-hosted notification push service")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Send a notification message
    Send(commands::send::SendArgs),
    /// Check the status of a message
    Status(commands::status::StatusArgs),
    /// Listen for push notifications (as a client)
    Listen(commands::listen::ListenArgs),
    /// Manage CLI configuration
    Config {
        #[command(subcommand)]
        action: config::ConfigAction,
    },
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    let cli = Cli::parse();

    match cli.command {
        Commands::Send(args) => commands::send::run(args).await,
        Commands::Status(args) => commands::status::run(args).await,
        Commands::Listen(args) => commands::listen::run(args).await,
        Commands::Config { action } => config::run(action),
    }
}
