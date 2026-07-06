use axum::extract::{State, WebSocketUpgrade, Path};
use axum::extract::ws::{Message, WebSocket};
use axum::routing::{delete, get, post, patch};
use axum::{Json, Router};
use futures_util::stream::StreamExt;
use serde::Deserialize;
use std::collections::HashMap;
use std::sync::Arc;
use tokio::sync::{broadcast, RwLock};

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{RegisterPushClientRequest, UpdatePushClientRequest, AckPushRequest};
use notifyhub_common::types::ApiResponse;

use crate::auth::middleware::AuthUser;
use crate::AppState;

// ── PushState: in-memory broadcast channels for real-time delivery ──

#[derive(Clone)]
pub struct PushState {
    channels: Arc<RwLock<HashMap<String, broadcast::Sender<serde_json::Value>>>>,
}

impl PushState {
    pub fn new() -> Self {
        Self { channels: Arc::new(RwLock::new(HashMap::new())) }
    }

    pub async fn subscribe(&self, client_uuid: &str) -> broadcast::Receiver<serde_json::Value> {
        let mut channels = self.channels.write().await;
        let tx = channels.entry(client_uuid.to_string())
            .or_insert_with(|| {
                let (tx, _) = broadcast::channel(256);
                tx
            });
        tx.subscribe()
    }

    pub async fn notify(&self, client_uuid: &str, msg: serde_json::Value) {
        let channels = self.channels.read().await;
        if let Some(tx) = channels.get(client_uuid) {
            let _ = tx.send(msg);
        }
    }
}

// ── Router ──

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/push/register", post(register_client))
        .route("/api/v1/push/client", patch(update_client))
        .route("/api/v1/push/ack", post(ack_messages))
        .route("/api/v1/push/poll", get(poll_messages))
        .route("/api/v1/push/stream", get(stream_messages))
        .route("/api/v1/push/ws", get(ws_handler))
        // Admin push client management
        .route("/api/admin/push/clients", get(list_push_clients))
        .route("/api/admin/push/clients/{uuid}", delete(delete_push_client))
}

// ── Row type for push message queries ──

struct PushMessageRow {
    id: String,
    client_uuid: Option<String>,
    source_message_id: Option<String>,
    title: String,
    body: String,
    level: String,
    tags: Option<String>,
    priority: i64,
    url: Option<String>,
    attachment: Option<String>,
    format: String,
    topic_id: Option<String>,
}

impl PushMessageRow {
    fn to_json(&self) -> serde_json::Value {
        serde_json::json!({
            "id": self.id,
            "clientUuid": self.client_uuid,
            "sourceMessageId": self.source_message_id,
            "title": self.title,
            "body": self.body,
            "level": self.level,
            "tags": self.tags.as_deref().unwrap_or("[]"),
            "priority": self.priority,
            "url": self.url,
            "attachment": self.attachment.as_deref(),
            "format": self.format,
            "topicId": self.topic_id,
        })
    }
}

// Manual FromRow implementation
impl sqlx::FromRow<'_, sqlx::sqlite::SqliteRow> for PushMessageRow {
    fn from_row(row: &sqlx::sqlite::SqliteRow) -> Result<Self, sqlx::Error> {
        use sqlx::Row;
        Ok(Self {
            id: row.try_get("id")?,
            client_uuid: row.try_get("client_uuid")?,
            source_message_id: row.try_get("source_message_id")?,
            title: row.try_get("title")?,
            body: row.try_get("body")?,
            level: row.try_get("level")?,
            tags: row.try_get("tags")?,
            priority: row.try_get("priority")?,
            url: row.try_get("url")?,
            attachment: row.try_get("attachment")?,
            format: row.try_get("format")?,
            topic_id: row.try_get("topic_id")?,
        })
    }
}

// ── register_client ──

async fn register_client(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<RegisterPushClientRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    // Validate name
    if let Some(ref name) = req.name {
        if name == "*" {
            return Err(AppError::BadRequest("name '*' is reserved".into()));
        }
        if name.len() > 100 {
            return Err(AppError::BadRequest("name must be at most 100 characters".into()));
        }
    }

    let now = chrono::Utc::now().timestamp();

    // Upsert: if UUID exists, update; otherwise insert
    let existing: Option<(String,)> = sqlx::query_as(
        "SELECT uuid FROM push_clients WHERE uuid = ?",
    )
    .bind(&req.uuid)
    .fetch_optional(&state.pool)
    .await?;

    if existing.is_some() {
        sqlx::query(
            "UPDATE push_clients SET user_id = ?, name = ?, os = ?, arch = ?, desktop = ?, app_version = ?, fcm_token = ?, last_seen_at = ? WHERE uuid = ?",
        )
        .bind(user_id)
        .bind(&req.name)
        .bind(&req.device_os)
        .bind(&req.arch)
        .bind(&req.desktop)
        .bind(&req.app_version)
        .bind(&req.fcm_token)
        .bind(now)
        .bind(&req.uuid)
        .execute(&state.pool)
        .await?;
    } else {
        let id = uuid::Uuid::new_v4().to_string();
        sqlx::query(
            r#"INSERT INTO push_clients (id, user_id, uuid, name, os, arch, desktop, app_version, fcm_token, last_seen_at, registered_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(&id)
        .bind(user_id)
        .bind(&req.uuid)
        .bind(&req.name)
        .bind(&req.device_os)
        .bind(&req.arch)
        .bind(&req.desktop)
        .bind(&req.app_version)
        .bind(&req.fcm_token)
        .bind(now)
        .bind(now)
        .execute(&state.pool)
        .await?;
    }

    Ok(Json(ApiResponse::ok(serde_json::json!({ "registered": true }))))
}

// ── update_client ──

async fn update_client(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdatePushClientRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    // Use uuid from request body to identify the client
    let uuid = req.uuid
        .ok_or_else(|| AppError::BadRequest("uuid is required".into()))?;

    // Verify the client belongs to this user
    let owner: Option<(i64,)> = sqlx::query_as(
        "SELECT user_id FROM push_clients WHERE uuid = ?",
    )
    .bind(&uuid)
    .fetch_optional(&state.pool)
    .await?;

    match owner {
        Some((owner_id,)) if owner_id == user_id => {}
        Some(_) => return Err(AppError::Forbidden("client does not belong to this user".into())),
        None => return Err(AppError::NotFound("push client not found".into())),
    }

    if let Some(ref name) = req.name {
        sqlx::query("UPDATE push_clients SET name = ? WHERE uuid = ?")
            .bind(name)
            .bind(&uuid)
            .execute(&state.pool)
            .await?;
    }

    if let Some(ref fcm_token) = req.fcm_token {
        sqlx::query("UPDATE push_clients SET fcm_token = ? WHERE uuid = ?")
            .bind(fcm_token)
            .bind(&uuid)
            .execute(&state.pool)
            .await?;
    }

    if req.desktop.is_some() || req.app_version.is_some() {
        sqlx::query("UPDATE push_clients SET desktop = COALESCE(?, desktop), app_version = COALESCE(?, app_version) WHERE uuid = ?")
            .bind(&req.desktop)
            .bind(&req.app_version)
            .bind(&uuid)
            .execute(&state.pool)
            .await?;
    }

    Ok(Json(ApiResponse::ok(serde_json::json!({ "updated": true }))))
}

// ── ack_messages ──

async fn ack_messages(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<AckPushRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let mut source_ids_to_check: Vec<String> = Vec::new();

    for msg_id in &req.message_ids {
        // Mark push message as delivered and collect source_message_ids
        let source: Option<(Option<String>,)> = sqlx::query_as(
            "UPDATE push_messages SET delivered = 1 WHERE id = ? AND user_id = ? RETURNING source_message_id",
        )
        .bind(msg_id)
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await?;

        if let Some((Some(sid),)) = source {
            if !source_ids_to_check.contains(&sid) {
                source_ids_to_check.push(sid);
            }
        }
    }

    // For each source message, check if all push_messages are delivered
    for source_id in &source_ids_to_check {
        let undelivered: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM push_messages WHERE source_message_id = ? AND delivered = 0"
        )
        .bind(source_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        if undelivered.0 == 0 {
            // All push_messages for this source are delivered — update the original message
            let now = chrono::Utc::now().timestamp();
            sqlx::query("UPDATE messages SET status = 'delivered', sent_at = COALESCE(sent_at, ?) WHERE id = ? AND status = 'sent'")
                .bind(now)
                .bind(source_id)
                .execute(&state.pool)
                .await
                .ok();
        }
    }

    Ok(Json(ApiResponse::ok(serde_json::json!({ "acked": req.message_ids.len() }))))
}

// ── poll_messages ──

#[derive(Deserialize)]
struct PollParams {
    limit: Option<i64>,
    uuid: Option<String>,
}

async fn poll_messages(
    State(state): State<AppState>,
    auth: AuthUser,
    axum::extract::Query(params): axum::extract::Query<PollParams>,
) -> Result<Json<ApiResponse<Vec<serde_json::Value>>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let limit = params.limit.unwrap_or(50).min(200);
    let client_uuid = params.uuid.clone().unwrap_or_default();

    let rows: Vec<PushMessageRow> = sqlx::query_as(
        r#"SELECT pm.id, pm.client_uuid, pm.source_message_id, pm.title, pm.body, pm.level,
                  pm.tags, pm.priority, pm.url, pm.attachment, pm.format, pm.topic_id
           FROM push_messages pm
           WHERE pm.user_id = ? AND pm.delivered = 0
             AND (pm.client_uuid = ? OR ? = '')
           ORDER BY pm.created_at ASC LIMIT ?"#,
    )
    .bind(user_id)
    .bind(&client_uuid)
    .bind(&client_uuid)
    .bind(limit)
    .fetch_all(&state.pool)
    .await?;

    let messages: Vec<serde_json::Value> = rows.iter().map(|r| r.to_json()).collect();

    // Mark as delivered using push message id
    let mut source_ids_to_check: Vec<String> = Vec::new();
    for row in &rows {
        sqlx::query("UPDATE push_messages SET delivered = 1 WHERE id = ? AND user_id = ?")
            .bind(&row.id)
            .bind(user_id)
            .execute(&state.pool)
            .await.ok();

        if let Some(ref sid) = row.source_message_id {
            if !source_ids_to_check.contains(sid) {
                source_ids_to_check.push(sid.clone());
            }
        }
    }

    // Update original messages to "delivered" status when all push_messages are ack'd
    for source_id in &source_ids_to_check {
        let undelivered: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM push_messages WHERE source_message_id = ? AND delivered = 0"
        )
        .bind(source_id)
        .fetch_one(&state.pool)
        .await
        .unwrap_or((0,));

        if undelivered.0 == 0 {
            let now = chrono::Utc::now().timestamp();
            sqlx::query("UPDATE messages SET status = 'delivered', sent_at = COALESCE(sent_at, ?) WHERE id = ? AND status = 'sent'")
                .bind(now)
                .bind(source_id)
                .execute(&state.pool)
                .await
                .ok();
        }
    }

    Ok(Json(ApiResponse::ok(messages)))
}

// ── Auth helper: try Authorization header, then ?token= query param ──

async fn extract_auth(
    headers: &axum::http::HeaderMap,
    state: &AppState,
    query_token: Option<&str>,
) -> Result<crate::auth::jwt::Claims, AppError> {
    use crate::auth::jwt::validate_token;

    // Try Authorization header first
    if let Some(auth_header) = headers.get("authorization").and_then(|v| v.to_str().ok()) {
        if let Some(token) = auth_header.strip_prefix("Bearer ").or_else(|| auth_header.strip_prefix("bearer ")) {
            if let Ok(claims) = validate_token(token, &state.config.jwt_secret) {
                return Ok(claims);
            }
        }
    }

    // Fall back to ?token= query param
    if let Some(token) = query_token {
        let claims = validate_token(token, &state.config.jwt_secret)?;
        return Ok(claims);
    }

    Err(AppError::Unauthorized("missing Authorization header or token query param".into()))
}

// ── SSE stream (real-time via broadcast) ──

use axum::response::sse::{Event, Sse};
use futures_util::stream::Stream;
use std::convert::Infallible;
use std::time::Duration;

#[derive(Deserialize)]
struct StreamParams {
    uuid: Option<String>,
    token: Option<String>,
}

async fn stream_messages(
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<StreamParams>,
    headers: axum::http::HeaderMap,
) -> Result<Sse<impl Stream<Item = Result<Event, Infallible>>>, AppError> {
    // Authenticate: try Authorization header first, then ?token= query param
    let auth = extract_auth(&headers, &state, params.token.as_deref()).await?;
    let user_id: i64 = auth.sub.parse().unwrap_or(0);
    let client_uuid = params.uuid.clone().unwrap_or_default();
    let pool = state.pool.clone();
    let push_state = state.push_state.clone();

    let stream = async_stream::stream! {
        // Send connected event
        yield Ok(Event::default().event("connected").data(r#"{"connected":true}"#));

        // Send any undelivered messages from DB first
        let rows: Vec<PushMessageRow> = sqlx::query_as(
            r#"SELECT pm.id, pm.client_uuid, pm.source_message_id, pm.title, pm.body,
                      pm.level, pm.tags, pm.priority, pm.url, pm.attachment, pm.format, pm.topic_id
               FROM push_messages pm
               WHERE pm.user_id = ? AND pm.delivered = 0
                 AND (pm.client_uuid = ? OR ? = '')
               ORDER BY pm.created_at ASC"#
        )
        .bind(user_id).bind(&client_uuid).bind(&client_uuid)
        .fetch_all(&pool).await.unwrap_or_default();

        // Send initial undelivered messages as a batch: {"data": [...]}
        if !rows.is_empty() {
            let messages: Vec<serde_json::Value> = rows.iter().map(|r| r.to_json()).collect();
            let wrapper = serde_json::json!({"data": messages});
            yield Ok(Event::default().data(serde_json::to_string(&wrapper).unwrap_or_default()));
        }

        // Subscribe to real-time messages
        let mut rx = push_state.subscribe(&client_uuid).await;
        loop {
            match rx.recv().await {
                Ok(msg) => {
                    // Wrap single message as {"data": [msg]}
                    let wrapper = serde_json::json!({"data": [msg]});
                    yield Ok(Event::default().data(serde_json::to_string(&wrapper).unwrap_or_default()));
                }
                Err(broadcast::error::RecvError::Lagged(_)) => continue,
                Err(broadcast::error::RecvError::Closed) => break,
            }
        }
    };

    Ok(Sse::new(stream))
}

// ── WebSocket (real-time via broadcast) ──

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<AppState>,
    axum::extract::Query(params): axum::extract::Query<StreamParams>,
    headers: axum::http::HeaderMap,
) -> Result<axum::response::Response, AppError> {
    // Authenticate: try Authorization header first, then ?token= query param
    let auth = extract_auth(&headers, &state, params.token.as_deref()).await?;
    let user_id: i64 = auth.sub.parse().unwrap_or(0);
    let client_uuid = params.uuid.clone().unwrap_or_default();
    Ok(ws.on_upgrade(move |socket| handle_ws(socket, user_id, client_uuid, state)))
}

async fn handle_ws(mut socket: WebSocket, user_id: i64, client_uuid: String, state: AppState) {
    tracing::info!("[ws] Client connected: user_id={user_id} client_uuid={client_uuid}");

    // Send connected event
    let connected = serde_json::json!({"event": "connected", "data": {"connected": true}});
    if socket.send(Message::Text(serde_json::to_string(&connected).unwrap_or_default().into())).await.is_err() {
        return;
    }

    // Send undelivered messages from DB first as a batch
    let rows: Vec<PushMessageRow> = sqlx::query_as(
        r#"SELECT pm.id, pm.client_uuid, pm.source_message_id, pm.title, pm.body,
                  pm.level, pm.tags, pm.priority, pm.url, pm.attachment, pm.format, pm.topic_id
           FROM push_messages pm
           WHERE pm.user_id = ? AND pm.delivered = 0
             AND (pm.client_uuid = ? OR ? = '')
           ORDER BY pm.created_at ASC"#
    )
    .bind(user_id).bind(&client_uuid).bind(&client_uuid)
    .fetch_all(&state.pool).await.unwrap_or_default();

    if !rows.is_empty() {
        let messages: Vec<serde_json::Value> = rows.iter().map(|r| r.to_json()).collect();
        let wrapper = serde_json::json!({"data": messages});
        if socket.send(Message::Text(serde_json::to_string(&wrapper).unwrap_or_default().into())).await.is_err() {
            tracing::info!("[ws] Client disconnected (user_id={user_id})");
            return;
        }
    }

    // Subscribe to real-time messages
    let mut rx = state.push_state.subscribe(&client_uuid).await;

    loop {
        tokio::select! {
            msg = rx.recv() => {
                match msg {
                    Ok(data) => {
                        // Wrap single message as {"data": [msg]}
                        let wrapper = serde_json::json!({"data": [data]});
                        let text = serde_json::to_string(&wrapper).unwrap_or_default();
                        if socket.send(Message::Text(text.into())).await.is_err() {
                            tracing::info!("[ws] Client disconnected (user_id={user_id})");
                            return;
                        }
                    }
                    Err(broadcast::error::RecvError::Lagged(_)) => continue,
                    Err(broadcast::error::RecvError::Closed) => break,
                }
            }
            Some(msg) = socket.next() => {
                match msg {
                    Ok(Message::Ping(data)) => { let _ = socket.send(Message::Pong(data)).await; }
                    Ok(Message::Close(_)) => {
                        tracing::info!("[ws] Client closed (user_id={user_id})");
                        return;
                    }
                    Err(_) => {
                        tracing::info!("[ws] Client error (user_id={user_id})");
                        return;
                    }
                    _ => {}
                }
            }
            _ = tokio::time::sleep(Duration::from_secs(30)) => {
                if socket.send(Message::Ping(vec![].into())).await.is_err() {
                    tracing::info!("[ws] Client disconnected (user_id={user_id})");
                    return;
                }
            }
        }
    }
}

// ── Admin: List all push clients ──

async fn list_push_clients(
    State(state): State<AppState>,
    _auth: AuthUser,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let rows: Vec<(String, String, i64, Option<String>, String, String, Option<String>, Option<String>, Option<String>, i64, i64)> =
        sqlx::query_as(
            "SELECT id, uuid, user_id, name, os, arch, desktop, app_version, connection_mode, last_seen_at, registered_at \
             FROM push_clients ORDER BY last_seen_at DESC"
        )
        .fetch_all(&state.pool)
        .await?;

    let clients: Vec<serde_json::Value> = rows.into_iter().map(|r| {
        serde_json::json!({
            "id": r.0,
            "uuid": r.1,
            "userId": r.2,
            "name": r.3,
            "os": r.4,
            "arch": r.5,
            "desktop": r.6,
            "appVersion": r.7,
            "connectionMode": r.8,
            "lastSeenAt": r.9,
            "registeredAt": r.10,
        })
    }).collect();

    Ok(Json(ApiResponse::ok(serde_json::json!(clients))))
}

// ── Admin: Delete a push client by UUID ──

async fn delete_push_client(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(uuid): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let result = sqlx::query("DELETE FROM push_clients WHERE uuid = ?")
        .bind(&uuid)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("push client not found".into()));
    }

    Ok(Json(ApiResponse::success()))
}
