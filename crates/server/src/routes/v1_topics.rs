use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, Topic};

use crate::auth::middleware::DualAuth;
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct TopicQueryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CreateTopicRequest {
    pub name: String,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
    /// If set, fork from an existing topic (copies display_name and icon from source)
    pub fork_from: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTopicRequest {
    pub name: Option<String>,
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/topic", get(list_topics).post(create_topic))
        .route("/api/v1/topic/{id}", get(get_topic).put(update_topic).delete(delete_topic))
}

async fn list_topics(
    State(state): State<AppState>,
    auth: DualAuth,
    Query(params): Query<TopicQueryParams>,
) -> Result<Json<ApiResponse<Vec<Topic>>>, AppError> {
    let user_id = auth.claims.sub.parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows: Vec<TopicRow> = if let Some(ref search) = params.search {
        let pattern = format!("%{search}%");
        sqlx::query_as("SELECT * FROM topics WHERE (user_id = ? OR preset = 1) AND (name LIKE ? OR display_name LIKE ?) ORDER BY preset DESC, created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(&pattern).bind(&pattern).bind(limit).bind(offset)
            .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as("SELECT * FROM topics WHERE user_id = ? OR preset = 1 ORDER BY preset DESC, created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(limit).bind(offset)
            .fetch_all(&state.pool).await?
    };

    Ok(Json(ApiResponse::ok(rows.into_iter().map(Topic::from).collect())))
}

async fn get_topic(
    State(state): State<AppState>,
    auth: DualAuth,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.claims.sub.parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let row: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await?;

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Topic::from(r)))),
        None => Err(AppError::NotFound("topic not found".into())),
    }
}

async fn create_topic(
    State(state): State<AppState>,
    auth: DualAuth,
    Json(req): Json<CreateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.claims.sub.parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let (display_name, description, icon) = if let Some(ref fork_id) = req.fork_from {
        // Fork from existing topic: copy display_name, description, and icon from source
        let source: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ?")
            .bind(fork_id)
            .fetch_optional(&state.pool)
            .await?;
        let source = source.ok_or_else(|| AppError::NotFound("fork source topic not found".into()))?;
        (source.display_name, source.description, source.icon)
    } else {
        (req.display_name.clone(), req.description.clone(), req.icon.clone())
    };

    // Check name uniqueness for this user
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM topics WHERE user_id = ? AND name = ?")
        .bind(user_id)
        .bind(&req.name)
        .fetch_one(&state.pool)
        .await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("topic name already exists".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    sqlx::query(
        "INSERT INTO topics (id, user_id, name, display_name, description, icon, preset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&req.name)
    .bind(&display_name)
    .bind(&description)
    .bind(&icon)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(Topic {
        id, user_id, name: req.name, display_name, description,
        icon, preset: false, created_at: now, updated_at: now,
    })))
}

async fn update_topic(
    State(state): State<AppState>,
    auth: DualAuth,
    Path(id): Path<String>,
    Json(req): Json<UpdateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.claims.sub.parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let now = chrono::Utc::now().timestamp();

    // Check existence and ownership
    let existing: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ? AND user_id = ?")
        .bind(&id)
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await?;

    let topic = existing.ok_or_else(|| AppError::NotFound("topic not found".into()))?;

    if topic.preset {
        return Err(AppError::Forbidden("cannot modify preset topic".into()));
    }

    if let Some(ref name) = req.name {
        let exists: (i64,) = sqlx::query_as(
            "SELECT COUNT(*) FROM topics WHERE name = ? AND user_id = ? AND id != ?"
        ).bind(name).bind(user_id).bind(&id).fetch_one(&state.pool).await?;
        if exists.0 > 0 {
            return Err(AppError::Conflict("topic name already exists".into()));
        }
        sqlx::query("UPDATE topics SET name = ?, updated_at = ? WHERE id = ?")
            .bind(name).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }
    if let Some(ref display_name) = req.display_name {
        sqlx::query("UPDATE topics SET display_name = ?, updated_at = ? WHERE id = ?")
            .bind(display_name.as_str()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }
    if let Some(ref icon) = req.icon {
        sqlx::query("UPDATE topics SET icon = ?, updated_at = ? WHERE id = ?")
            .bind(icon.as_str()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }
    if let Some(ref description) = req.description {
        sqlx::query("UPDATE topics SET description = ?, updated_at = ? WHERE id = ?")
            .bind(description.as_str()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }

    get_topic(State(state), auth, Path(id)).await
}

async fn delete_topic(
    State(state): State<AppState>,
    auth: DualAuth,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let user_id = auth.claims.sub.parse::<i64>()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    // Check if topic is preset
    let topic: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;

    if let Some(t) = topic {
        if t.preset {
            return Err(AppError::Forbidden("cannot delete preset topic".into()));
        }
    }

    let result = sqlx::query("DELETE FROM topics WHERE id = ? AND user_id = ? AND preset = 0")
        .bind(&id)
        .bind(user_id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("topic not found".into()));
    }

    sqlx::query("UPDATE messages SET topic_id = NULL WHERE topic_id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::success()))
}

// ── Internal types ──

#[derive(sqlx::FromRow)]
struct TopicRow {
    id: String,
    user_id: i64,
    name: String,
    display_name: Option<String>,
    description: Option<String>,
    icon: Option<String>,
    preset: bool,
    created_at: i64,
    updated_at: i64,
}

impl From<TopicRow> for Topic {
    fn from(r: TopicRow) -> Self {
        Topic { id: r.id, user_id: r.user_id, name: r.name, display_name: r.display_name, description: r.description, icon: r.icon, preset: r.preset, created_at: r.created_at, updated_at: r.updated_at }
    }
}
