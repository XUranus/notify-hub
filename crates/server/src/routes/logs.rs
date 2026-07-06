use axum::extract::{Query, State};
use axum::response::sse::{Event, Sse};
use axum::routing::get;
use axum::{Json, Router};
use futures_util::stream::Stream;
use serde::Deserialize;
use std::convert::Infallible;

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, AppLog, PaginatedResponse};

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/logs", get(list_logs))
        .route("/api/admin/logs/settings", get(get_log_settings).put(update_log_settings))
        .route("/api/admin/logs/stream", get(log_stream))
}

#[derive(Deserialize)]
struct Params {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    level: Option<String>,
}

async fn list_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<Params>,
) -> Result<Json<ApiResponse<PaginatedResponse<AppLog>>>, AppError> {
    require_admin(&auth)?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(50).min(500);
    let offset = (page - 1) * page_size;

    // Use parameterized queries to prevent SQL injection
    let (count_sql, list_sql) = if params.level.is_some() {
        (
            "SELECT COUNT(*) FROM app_logs WHERE level = ?",
            "SELECT * FROM app_logs WHERE level = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
    } else {
        (
            "SELECT COUNT(*) FROM app_logs",
            "SELECT * FROM app_logs ORDER BY created_at DESC LIMIT ? OFFSET ?",
        )
    };

    let mut count_q = sqlx::query_as::<_, (i64,)>(count_sql);
    if let Some(ref level) = params.level {
        count_q = count_q.bind(level);
    }
    let total: (i64,) = count_q.fetch_one(&state.pool).await?;

    let mut list_q = sqlx::query_as::<_, AppLogRow>(list_sql);
    if let Some(ref level) = params.level {
        list_q = list_q.bind(level);
    }
    list_q = list_q.bind(page_size).bind(offset);
    let rows: Vec<AppLogRow> = list_q.fetch_all(&state.pool).await?;

    let items = rows.into_iter().map(AppLog::from).collect();

    Ok(Json(ApiResponse::ok(PaginatedResponse { items, total: total.0, page, page_size })))
}

#[derive(sqlx::FromRow)]
struct AppLogRow {
    id: i64,
    level: String,
    message: String,
    source: Option<String>,
    created_at: i64,
}

impl From<AppLogRow> for AppLog {
    fn from(r: AppLogRow) -> Self {
        AppLog { id: r.id, level: r.level, message: r.message, context: r.source, created_at: r.created_at }
    }
}

const VALID_LOG_LEVELS: &[&str] = &["debug", "info", "warn", "error"];
const VALID_RETENTION_DAYS: &[i64] = &[0, 3, 7, 30, 365];

async fn get_log_settings(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    let log_level: Option<(String,)> = sqlx::query_as("SELECT value FROM system_settings WHERE key = 'log_level'")
        .fetch_optional(&state.pool).await?;
    let retention: Option<(String,)> = sqlx::query_as("SELECT value FROM system_settings WHERE key = 'log_retention_days'")
        .fetch_optional(&state.pool).await?;

    Ok(Json(ApiResponse::ok(serde_json::json!({
        "logLevel": log_level.map(|(v,)| v).unwrap_or_else(|| "info".to_string()),
        "logRetentionDays": retention.and_then(|(v,)| v.parse().ok()).unwrap_or(30),
    }))))
}

#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct UpdateLogSettingsRequest {
    log_level: Option<String>,
    log_retention_days: Option<i64>,
}

async fn update_log_settings(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateLogSettingsRequest>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;

    if let Some(ref level) = req.log_level {
        if !VALID_LOG_LEVELS.contains(&level.as_str()) {
            return Err(AppError::BadRequest(format!("Invalid log level. Allowed: {}", VALID_LOG_LEVELS.join(", "))));
        }
        sqlx::query("INSERT INTO system_settings (key, value) VALUES ('log_level', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
            .bind(level).bind(level)
            .execute(&state.pool).await?;
    }

    if let Some(days) = req.log_retention_days {
        if !VALID_RETENTION_DAYS.contains(&days) {
            return Err(AppError::BadRequest(format!("Invalid retention days. Allowed: {}", VALID_RETENTION_DAYS.iter().map(|d| d.to_string()).collect::<Vec<_>>().join(", "))));
        }
        let val = days.to_string();
        sqlx::query("INSERT INTO system_settings (key, value) VALUES ('log_retention_days', ?) ON CONFLICT(key) DO UPDATE SET value = ?")
            .bind(&val).bind(&val)
            .execute(&state.pool).await?;
    }

    Ok(Json(ApiResponse::success()))
}

/// SSE endpoint for real-time log streaming
async fn log_stream(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Sse<impl Stream<Item = Result<Event, Infallible>>> {
    let mut rx = state.log_broadcaster.subscribe();

    let stream = async_stream::stream! {
        // Initial heartbeat
        yield Ok(Event::default().comment("connected"));

        loop {
            match rx.recv().await {
                Ok(entry) => {
                    if let Ok(data) = serde_json::to_string(&entry) {
                        yield Ok(Event::default().data(data));
                    }
                }
                Err(tokio::sync::broadcast::error::RecvError::Lagged(_)) => continue,
                Err(tokio::sync::broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Sse::new(stream).keep_alive(
        axum::response::sse::KeepAlive::new()
            .interval(std::time::Duration::from_secs(30))
            .text("heartbeat"),
    )
}
