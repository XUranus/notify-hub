pub mod migrations;

use sqlx::sqlite::{SqliteConnectOptions, SqlitePoolOptions};
use sqlx::SqlitePool;
use std::fs;
use std::str::FromStr;

use crate::config::Config;

/// Initialize the database: create directories, run migrations, return pool.
pub async fn init(config: &Config) -> anyhow::Result<SqlitePool> {
    // Ensure parent directory exists
    if let Some(parent) = config.database_url.parent() {
        fs::create_dir_all(parent)?;
    }

    let db_path = config.database_url.to_string_lossy();
    let options = SqliteConnectOptions::from_str(&db_path)?
        .journal_mode(sqlx::sqlite::SqliteJournalMode::Wal)
        .busy_timeout(std::time::Duration::from_secs(5))
        .synchronous(sqlx::sqlite::SqliteSynchronous::Normal)
        .create_if_missing(true);

    let pool = SqlitePoolOptions::new()
        .max_connections(10)
        .connect_with(options)
        .await?;

    // Reduce per-connection page cache from default 2MB to 500KB
    // Saves ~15MB with 10 connections
    sqlx::raw_sql("PRAGMA cache_size = -500")
        .execute(&pool)
        .await?;

    // Run consolidated migrations
    tracing::info!("[db] Running migrations...");
    sqlx::raw_sql(migrations::INITIAL_SCHEMA)
        .execute(&pool)
        .await?;
    tracing::info!("[db] Migrations completed.");

    Ok(pool)
}
