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

    // Run incremental migrations for existing databases
    tracing::info!("[db] Running incremental migrations...");
    run_incremental_migrations(&pool).await?;

    tracing::info!("[db] Migrations completed.");

    Ok(pool)
}

/// Run incremental migrations for existing databases
async fn run_incremental_migrations(pool: &SqlitePool) -> anyhow::Result<()> {
    // Add preset column to topics table if it doesn't exist
    let has_preset_column: bool = sqlx::query_scalar::<_, i64>(
        "SELECT COUNT(*) FROM pragma_table_info('topics') WHERE name = 'preset'"
    )
    .fetch_one(pool)
    .await? > 0;

    if !has_preset_column {
        tracing::info!("[db] Adding preset column to topics table...");
        sqlx::raw_sql("ALTER TABLE topics ADD COLUMN preset INTEGER NOT NULL DEFAULT 0")
            .execute(pool)
            .await?;
    }

    Ok(())
}
