use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

use crate::config::Config;

/// Start the cleanup scheduler (runs every hour)
pub async fn start(pool: SqlitePool, _config: Arc<Config>) {
    tracing::info!("[cleanup] Starting cleanup scheduler");

    // Run immediately on startup
    if let Err(e) = run_cleanup(&pool).await {
        tracing::error!("[cleanup] Initial cleanup error: {e}");
    }

    loop {
        // Run cleanup every hour
        sleep(Duration::from_secs(3600)).await;

        if let Err(e) = run_cleanup(&pool).await {
            tracing::error!("[cleanup] Error: {e}");
        }
    }
}

async fn run_cleanup(pool: &SqlitePool) -> anyhow::Result<()> {
    let now = chrono::Utc::now().timestamp();
    let started_at = now;

    tracing::info!("[cleanup] Starting cleanup run");

    // 1. Clean up expired attachments
    let expired_files: Vec<(String,)> = sqlx::query_as(
        "SELECT filename FROM attachments WHERE expires_at IS NOT NULL AND expires_at <= ?"
    )
    .bind(now)
    .fetch_all(pool)
    .await?;

    let expired_attachments = expired_files.len() as i64;

    for (filename,) in &expired_files {
        let path = std::path::Path::new("data/uploads").join(filename);
        if path.exists() {
            if let Err(e) = tokio::fs::remove_file(&path).await {
                tracing::warn!("[cleanup] Failed to delete file {filename}: {e}");
            }
        }
    }

    if expired_attachments > 0 {
        sqlx::query("DELETE FROM attachments WHERE expires_at IS NOT NULL AND expires_at <= ?")
            .bind(now)
            .execute(pool)
            .await?;
    }

    // 2. Clean up expired messages (per user settings)
    let expired_messages = cleanup_expired_messages(pool, now).await?;

    // 3. Trim old messages per user limits
    let trimmed_messages = trim_user_messages(pool).await?;

    // 4. Clean up old delivered push messages (older than 7 days)
    let old_push = now - 604800;
    sqlx::query("DELETE FROM push_messages WHERE delivered = 1 AND created_at < ?")
        .bind(old_push)
        .execute(pool)
        .await?;

    // 5. Clean up old app logs (older than 30 days)
    let old_logs = now - 2592000;
    sqlx::query("DELETE FROM app_logs WHERE created_at < ?")
        .bind(old_logs)
        .execute(pool)
        .await?;

    let finished_at = chrono::Utc::now().timestamp();
    let duration_ms = (finished_at - started_at) * 1000;

    // Log cleanup run
    sqlx::query(
        r#"INSERT INTO cleanup_logs (started_at, finished_at, duration_ms, status, expired_attachments, expired_messages, trimmed_messages)
           VALUES (?, ?, ?, 'success', ?, ?, ?)"#
    )
    .bind(started_at)
    .bind(finished_at)
    .bind(duration_ms)
    .bind(expired_attachments)
    .bind(expired_messages)
    .bind(trimmed_messages)
    .execute(pool)
    .await?;

    tracing::info!(
        "[cleanup] Done: {expired_attachments} expired attachments, {expired_messages} expired messages, {trimmed_messages} trimmed messages ({duration_ms}ms)"
    );

    Ok(())
}

async fn cleanup_expired_messages(pool: &SqlitePool, now: i64) -> anyhow::Result<i64> {
    // Get users with message expiration settings
    let users: Vec<(i64, i64)> = sqlx::query_as(
        "SELECT user_id, message_expiration FROM user_settings WHERE message_expiration > 0"
    )
    .fetch_all(pool)
    .await?;

    let mut total = 0i64;

    for (user_id, expiry_days) in users {
        let cutoff = now - (expiry_days * 86400);
        let result = sqlx::query("DELETE FROM messages WHERE user_id = ? AND created_at < ?")
            .bind(user_id)
            .bind(cutoff)
            .execute(pool)
            .await?;
        total += result.rows_affected() as i64;
    }

    Ok(total)
}

async fn trim_user_messages(pool: &SqlitePool) -> anyhow::Result<i64> {
    let max_messages: i64 = sqlx::query_scalar(
        "SELECT CAST(value AS INTEGER) FROM system_settings WHERE key = 'max_messages_per_user'"
    )
    .fetch_optional(pool)
    .await?
    .unwrap_or(1000);

    let users: Vec<(i64,)> = sqlx::query_as("SELECT DISTINCT user_id FROM messages WHERE user_id IS NOT NULL")
        .fetch_all(pool)
        .await?;

    let mut total = 0i64;

    for (user_id,) in users {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE user_id = ?")
            .bind(user_id)
            .fetch_one(pool)
            .await?;

        if count.0 > max_messages {
            let excess = count.0 - max_messages;
            sqlx::query(
                "DELETE FROM messages WHERE id IN (SELECT id FROM messages WHERE user_id = ? ORDER BY created_at ASC LIMIT ?)"
            )
            .bind(user_id)
            .bind(excess)
            .execute(pool)
            .await?;
            total += excess;
        }
    }

    Ok(total)
}
