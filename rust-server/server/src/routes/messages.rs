use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, Message, PaginatedResponse};
use notifyhub_common::constants::{BodyFormat, ChannelType, MessageStatus};

use crate::auth::jwt::Claims;
use crate::auth::middleware::{AuthUser, DualAuth, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Public API (supports JWT + API token)
        .route("/api/v1/messages", get(v1_list_messages))
        .route("/api/v1/messages/{id}", get(v1_get_message))
        // Admin API (JWT only, can see all messages)
        .route("/api/admin/messages", get(admin_list_messages))
        .route("/api/admin/messages/export", get(export_messages))
        .route("/api/admin/messages/{id}", get(admin_get_message).delete(delete_message))
        .route("/api/admin/messages/{id}/retry", post(retry_message))
}

#[derive(Deserialize)]
struct ListParams {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
    status: Option<String>,
    topic: Option<String>,
}

// ── v1 handlers (DualAuth: JWT + API token, always filter by user_id) ──

async fn v1_list_messages(
    State(state): State<AppState>,
    auth: DualAuth,
    Query(params): Query<ListParams>,
) -> Result<Json<ApiResponse<PaginatedResponse<Message>>>, AppError> {
    list_messages_core(&state, &auth.claims, false, params).await
}

async fn v1_get_message(
    State(state): State<AppState>,
    auth: DualAuth,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Message>>, AppError> {
    get_message_core(&state, &auth.claims, false, id).await
}

// ── Admin handlers (AuthUser: JWT only, can see all messages) ──

async fn admin_list_messages(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ListParams>,
) -> Result<Json<ApiResponse<PaginatedResponse<Message>>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    list_messages_core(&state, &auth.claims, is_admin, params).await
}

async fn admin_get_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Message>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    get_message_core(&state, &auth.claims, is_admin, id).await
}

// ── Core logic ──

async fn list_messages_core(
    state: &AppState,
    claims: &Claims,
    is_admin: bool,
    params: ListParams,
) -> Result<Json<ApiResponse<PaginatedResponse<Message>>>, AppError> {
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(50).min(500);
    let offset = (page - 1) * page_size;

    let (count_sql, list_sql) = match (is_admin, &params.status, &params.topic) {
        (true, Some(_), Some(_)) => (
            "SELECT COUNT(*) FROM messages WHERE status = ? AND topic_id = ?",
            "SELECT * FROM messages WHERE status = ? AND topic_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (true, Some(_), None) => (
            "SELECT COUNT(*) FROM messages WHERE status = ?",
            "SELECT * FROM messages WHERE status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (true, None, Some(_)) => (
            "SELECT COUNT(*) FROM messages WHERE topic_id = ?",
            "SELECT * FROM messages WHERE topic_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (true, None, None) => (
            "SELECT COUNT(*) FROM messages",
            "SELECT * FROM messages ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (false, Some(_), Some(_)) => (
            "SELECT COUNT(*) FROM messages WHERE user_id = ? AND status = ? AND topic_id = ?",
            "SELECT * FROM messages WHERE user_id = ? AND status = ? AND topic_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (false, Some(_), None) => (
            "SELECT COUNT(*) FROM messages WHERE user_id = ? AND status = ?",
            "SELECT * FROM messages WHERE user_id = ? AND status = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (false, None, Some(_)) => (
            "SELECT COUNT(*) FROM messages WHERE user_id = ? AND topic_id = ?",
            "SELECT * FROM messages WHERE user_id = ? AND topic_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
        (false, None, None) => (
            "SELECT COUNT(*) FROM messages WHERE user_id = ?",
            "SELECT * FROM messages WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?",
        ),
    };

    let mut count_q = sqlx::query_as::<_, (i64,)>(count_sql);
    if !is_admin { count_q = count_q.bind(user_id); }
    if let Some(ref status) = params.status { count_q = count_q.bind(status); }
    if let Some(ref topic) = params.topic { count_q = count_q.bind(topic); }
    let total: (i64,) = count_q.fetch_one(&state.pool).await?;

    let mut list_q = sqlx::query_as::<_, MessageRow>(list_sql);
    if !is_admin { list_q = list_q.bind(user_id); }
    if let Some(ref status) = params.status { list_q = list_q.bind(status); }
    if let Some(ref topic) = params.topic { list_q = list_q.bind(topic); }
    list_q = list_q.bind(page_size).bind(offset);
    let rows: Vec<MessageRow> = list_q.fetch_all(&state.pool).await?;

    let messages: Vec<Message> = rows.into_iter().map(Message::from).collect();

    Ok(Json(ApiResponse::ok(PaginatedResponse {
        items: messages,
        total: total.0,
        page,
        page_size,
    })))
}

async fn get_message_core(
    state: &AppState,
    claims: &Claims,
    is_admin: bool,
    id: String,
) -> Result<Json<ApiResponse<Message>>, AppError> {
    let user_id: i64 = claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let row: Option<MessageRow> = if is_admin {
        sqlx::query_as("SELECT * FROM messages WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM messages WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?
    };

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Message::from(r)))),
        None => Err(AppError::NotFound("message not found".into())),
    }
}

// ── Admin-only handlers ──

async fn export_messages(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<Message>>>, AppError> {
    require_admin(&auth)?;

    let rows: Vec<MessageRow> = sqlx::query_as(
        "SELECT * FROM messages ORDER BY created_at DESC LIMIT 10000"
    )
    .fetch_all(&state.pool)
    .await?;

    let messages: Vec<Message> = rows.into_iter().map(Message::from).collect();
    Ok(Json(ApiResponse::ok(messages)))
}

async fn delete_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;

    let result = sqlx::query("DELETE FROM messages WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("message not found".into()));
    }

    Ok(Json(ApiResponse::success()))
}

async fn retry_message(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    let result = sqlx::query(
        "UPDATE messages SET status = 'queued', retry_count = 0, next_retry_at = NULL, error_message = NULL WHERE id = ? AND status IN ('failed', 'dead')"
    )
    .bind(&id)
    .execute(&state.pool)
    .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("message not found or not in failed/dead state".into()));
    }

    Ok(Json(ApiResponse::ok(serde_json::json!({ "retried": true }))))
}

// ── Row type ──

#[derive(sqlx::FromRow)]
#[allow(dead_code)]
struct MessageRow {
    id: String,
    user_id: Option<i64>,
    channel_type: String,
    channel_id: Option<String>,
    to_address: String,
    subject: Option<String>,
    body: Option<String>,
    template_id: Option<String>,
    template_vars: Option<String>,
    status: String,
    retry_count: i64,
    max_retries: i64,
    next_retry_at: Option<i64>,
    error_message: Option<String>,
    idempotency_key: Option<String>,
    ip_address: Option<String>,
    ip_location: Option<String>,
    app: Option<String>,
    topic_id: Option<String>,
    scheduled_at: Option<i64>,
    sent_at: Option<i64>,
    created_at: i64,
    tags: Option<String>,
    priority: i64,
    url: Option<String>,
    attachment: Option<String>,
    format: String,
}

impl From<MessageRow> for Message {
    fn from(r: MessageRow) -> Self {
        Message {
            id: r.id,
            channel_type: r.channel_type.parse().unwrap_or(ChannelType::Push),
            channel_id: r.channel_id,
            to_address: r.to_address,
            subject: r.subject,
            body: r.body,
            template_id: r.template_id,
            template_vars: r.template_vars.and_then(|s| serde_json::from_str(&s).ok()),
            status: r.status.parse().unwrap_or(MessageStatus::Queued),
            retry_count: r.retry_count as u32,
            max_retries: r.max_retries as u32,
            next_retry_at: r.next_retry_at,
            error_message: r.error_message,
            idempotency_key: r.idempotency_key,
            ip_address: r.ip_address,
            ip_location: r.ip_location,
            app: r.app,
            topic_id: r.topic_id,
            scheduled_at: r.scheduled_at,
            sent_at: r.sent_at,
            created_at: r.created_at,
            tags: r.tags.and_then(|s| serde_json::from_str(&s).ok()),
            priority: r.priority as u32,
            url: r.url,
            attachment: r.attachment.and_then(|s| serde_json::from_str(&s).ok()),
            format: r.format.parse().unwrap_or(BodyFormat::Text),
        }
    }
}
