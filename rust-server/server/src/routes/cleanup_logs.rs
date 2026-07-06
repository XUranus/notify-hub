use axum::extract::{Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, CleanupLog, PaginatedResponse};

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/admin/cleanup-logs", get(list_cleanup_logs))
}

#[derive(Deserialize)]
struct Params {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
}

async fn list_cleanup_logs(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<Params>,
) -> Result<Json<ApiResponse<PaginatedResponse<CleanupLog>>>, AppError> {
    require_admin(&auth)?;

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(50).min(500);
    let offset = (page - 1) * page_size;

    let total: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM cleanup_logs")
        .fetch_one(&state.pool)
        .await?;

    let rows: Vec<CleanupLog> = sqlx::query_as(
        "SELECT id, started_at, finished_at, duration_ms, status, expired_attachments, expired_messages, trimmed_messages, error \
         FROM cleanup_logs ORDER BY id DESC LIMIT ? OFFSET ?",
    )
    .bind(page_size)
    .bind(offset)
    .fetch_all(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(PaginatedResponse { items: rows, total: total.0, page, page_size })))
}
