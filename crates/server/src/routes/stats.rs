use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, StatsOverview};
use notifyhub_common::schemas::{DailyStats, ChannelStats};

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/stats/overview", get(stats_overview))
        .route("/api/admin/stats/daily", get(stats_daily))
        .route("/api/admin/stats/channels", get(stats_channels))
        .route("/api/admin/stats/recent", get(stats_recent))
}

async fn stats_overview(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<StatsOverview>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let (total, sent, failed, queued, last_24h, last_7d) = if is_admin {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages")
            .fetch_one(&state.pool).await?;
        let sent: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status IN ('sent','delivered')")
            .fetch_one(&state.pool).await?;
        let failed: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status = 'failed'")
            .fetch_one(&state.pool).await?;
        let queued: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status = 'queued'")
            .fetch_one(&state.pool).await?;
        let now = chrono::Utc::now().timestamp();
        let day_ago = now - 86400;
        let week_ago = now - 604800;
        let last_24h: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE created_at >= ?")
            .bind(day_ago).fetch_one(&state.pool).await?;
        let last_7d: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE created_at >= ?")
            .bind(week_ago).fetch_one(&state.pool).await?;
        (total.0, sent.0, failed.0, queued.0, last_24h.0, last_7d.0)
    } else {
        let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        let sent: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status IN ('sent','delivered') AND user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        let failed: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status = 'failed' AND user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        let queued: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE status = 'queued' AND user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        let now = chrono::Utc::now().timestamp();
        let day_ago = now - 86400;
        let week_ago = now - 604800;
        let last_24h: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE created_at >= ? AND user_id = ?")
            .bind(day_ago).bind(user_id).fetch_one(&state.pool).await?;
        let last_7d: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM messages WHERE created_at >= ? AND user_id = ?")
            .bind(week_ago).bind(user_id).fetch_one(&state.pool).await?;
        (total.0, sent.0, failed.0, queued.0, last_24h.0, last_7d.0)
    };

    let success_rate = if total > 0 {
        (sent as f64) / (total as f64) * 100.0
    } else {
        0.0
    };

    Ok(Json(ApiResponse::ok(StatsOverview {
        total_messages: total,
        sent_messages: sent,
        failed_messages: failed,
        queued_messages: queued,
        success_rate,
        messages_last_24h: last_24h,
        messages_last_7d: last_7d,
    })))
}

async fn stats_daily(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<DailyStats>>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let now = chrono::Utc::now().timestamp();
    let week_ago = now - 604800;

    #[derive(sqlx::FromRow)]
    struct DailyRow {
        day: String,
        total: i64,
        sent: i64,
        failed: i64,
    }

    let rows: Vec<DailyRow> = if is_admin {
        sqlx::query_as(
            "SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') as day, \
                    COUNT(*) as total, \
                    SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END) as sent, \
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed \
             FROM messages WHERE created_at >= ? GROUP BY day ORDER BY day"
        )
        .bind(week_ago)
        .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as(
            "SELECT strftime('%Y-%m-%d', created_at, 'unixepoch') as day, \
                    COUNT(*) as total, \
                    SUM(CASE WHEN status IN ('sent', 'delivered') THEN 1 ELSE 0 END) as sent, \
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed \
             FROM messages WHERE created_at >= ? AND user_id = ? GROUP BY day ORDER BY day"
        )
        .bind(week_ago)
        .bind(user_id)
        .fetch_all(&state.pool).await?
    };

    let stats = rows.into_iter().map(|r| DailyStats {
        date: r.day,
        total: r.total,
        sent: r.sent,
        failed: r.failed,
    }).collect();
    Ok(Json(ApiResponse::ok(stats)))
}

async fn stats_channels(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<ChannelStats>>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let rows: Vec<(String, i64)> = if is_admin {
        sqlx::query_as(
            "SELECT channel_type, COUNT(*) as cnt FROM messages GROUP BY channel_type"
        )
        .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as(
            "SELECT channel_type, COUNT(*) as cnt FROM messages WHERE user_id = ? GROUP BY channel_type"
        )
        .bind(user_id)
        .fetch_all(&state.pool).await?
    };

    let stats = rows.into_iter().map(|(ct, count)| {
        let channel_type: notifyhub_common::constants::ChannelType = ct.parse().unwrap_or(notifyhub_common::constants::ChannelType::Push);
        ChannelStats { channel_type, count }
    }).collect();

    Ok(Json(ApiResponse::ok(stats)))
}

async fn stats_recent(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let rows: Vec<(String, String, Option<String>, String, String, Option<String>, Option<String>, i64)> = if is_admin {
        sqlx::query_as(
            "SELECT m.id, m.channel_type, c.name, m.to_address, m.status, m.subject, m.body, m.created_at FROM messages m LEFT JOIN channels c ON m.channel_id = c.id ORDER BY m.created_at DESC LIMIT 10"
        )
        .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as(
            "SELECT m.id, m.channel_type, c.name, m.to_address, m.status, m.subject, m.body, m.created_at FROM messages m LEFT JOIN channels c ON m.channel_id = c.id WHERE m.user_id = ? ORDER BY m.created_at DESC LIMIT 10"
        )
        .bind(user_id)
        .fetch_all(&state.pool).await?
    };

    let items = rows.into_iter().map(|r| {
        serde_json::json!({
            "id": r.0, "channelType": r.1, "channelName": r.2, "toAddress": r.3,
            "status": r.4, "subject": r.5, "body": r.6, "createdAt": r.7,
        })
    }).collect();

    Ok(Json(ApiResponse::ok(items)))
}
