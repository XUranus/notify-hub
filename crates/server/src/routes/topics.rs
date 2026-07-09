use axum::extract::{Path, Query, State};
use axum::routing::get;
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{CreateTopicRequest, UpdateTopicRequest};
use notifyhub_common::types::{ApiResponse, Topic};

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

#[derive(Debug, Deserialize)]
pub struct TopicQueryParams {
    pub limit: Option<i64>,
    pub offset: Option<i64>,
    pub search: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct ForkTopicRequest {
    pub name: String,
}

pub fn router() -> Router<AppState> {
    Router::new()
        // User API: topic CRUD (JWT, user manages own topics)
        .route("/api/user/topics", get(list_topics_v2).post(create_topic))
        .route("/api/user/topics/{id}", get(get_topic).put(update_topic).delete(delete_topic))
        .route("/api/user/topics/{id}/fork", axum::routing::post(fork_topic))
        // Admin API: topic management (admin sees all, can delete any)
        .route("/api/admin/topics", get(admin_list_topics))
        .route("/api/admin/topics/{id}", get(admin_get_topic).delete(admin_delete_topic))
}

async fn get_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.user_id()?;

    let row: Option<TopicRow> = if auth.is_admin() {
        sqlx::query_as("SELECT * FROM topics WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM topics WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?
    };

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Topic::from(r)))),
        None => Err(AppError::NotFound("topic not found".into())),
    }
}

async fn create_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.user_id()?;
    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Check name uniqueness for this user
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM topics WHERE user_id = ? AND name = ?")
        .bind(user_id)
        .bind(&req.name)
        .fetch_one(&state.pool)
        .await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("topic name already exists".into()));
    }

    sqlx::query(
        "INSERT INTO topics (id, user_id, name, display_name, description, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&req.name)
    .bind(&req.display_name)
    .bind(&req.description)
    .bind(&req.icon)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(Topic {
        id, user_id, name: req.name, display_name: req.display_name, description: req.description,
        icon: req.icon, preset: false, created_at: now, updated_at: now,
    })))
}

async fn update_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.user_id()?;
    let now = chrono::Utc::now().timestamp();

    // Check existence (admin can update any, user can only update own)
    let existing: Option<TopicRow> = if auth.claims.role == "admin" {
        sqlx::query_as("SELECT * FROM topics WHERE id = ?")
            .bind(&id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM topics WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?
    };

    let topic = existing.ok_or_else(|| AppError::NotFound("topic not found".into()))?;

    // Prevent modification of preset topics
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
            .bind(display_name.as_ref()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }
    if let Some(ref icon) = req.icon {
        sqlx::query("UPDATE topics SET icon = ?, updated_at = ? WHERE id = ?")
            .bind(icon.as_ref()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }
    if let Some(ref description) = req.description {
        sqlx::query("UPDATE topics SET description = ?, updated_at = ? WHERE id = ?")
            .bind(description.as_ref()).bind(now).bind(&id)
            .execute(&state.pool).await?;
    }

    get_topic(State(state), auth, Path(id)).await
}

async fn delete_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let user_id = auth.user_id()?;

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

    let result = if auth.is_admin() {
        sqlx::query("DELETE FROM topics WHERE id = ? AND preset = 0")
            .bind(&id)
            .execute(&state.pool)
            .await?
    } else {
        sqlx::query("DELETE FROM topics WHERE id = ? AND user_id = ? AND preset = 0")
            .bind(&id)
            .bind(user_id)
            .execute(&state.pool)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("topic not found".into()));
    }

    sqlx::query("UPDATE messages SET topic_id = NULL WHERE topic_id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::success()))
}

/// Fork a preset topic: create a new topic with the same display_name and icon
async fn fork_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<ForkTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id = auth.user_id()?;
    let now = chrono::Utc::now().timestamp();

    // Get the source topic
    let source: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;

    let source = source.ok_or_else(|| AppError::NotFound("topic not found".into()))?;

    // Check name uniqueness for this user
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM topics WHERE user_id = ? AND name = ?")
        .bind(user_id)
        .bind(&req.name)
        .fetch_one(&state.pool)
        .await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("topic name already exists".into()));
    }

    let new_id = uuid::Uuid::new_v4().to_string();

    sqlx::query(
        "INSERT INTO topics (id, user_id, name, display_name, description, icon, preset, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 0, ?, ?)",
    )
    .bind(&new_id)
    .bind(user_id)
    .bind(&req.name)
    .bind(&source.display_name)
    .bind(&source.description)
    .bind(&source.icon)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    get_topic(State(state), auth, Path(new_id)).await
}

/// v1 list topics with pagination and search
async fn list_topics_v2(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<TopicQueryParams>,
) -> Result<Json<ApiResponse<Vec<Topic>>>, AppError> {
    let user_id = auth.user_id()?;
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows: Vec<TopicRow> = if auth.is_admin() {
        if let Some(ref search) = params.search {
            let pattern = format!("%{search}%");
            sqlx::query_as("SELECT * FROM topics WHERE (name LIKE ? OR display_name LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?")
                .bind(&pattern).bind(&pattern).bind(limit).bind(offset)
                .fetch_all(&state.pool).await?
        } else {
            sqlx::query_as("SELECT * FROM topics ORDER BY created_at DESC LIMIT ? OFFSET ?")
                .bind(limit).bind(offset)
                .fetch_all(&state.pool).await?
        }
    } else if let Some(ref search) = params.search {
        let pattern = format!("%{search}%");
        sqlx::query_as("SELECT * FROM topics WHERE user_id = ? AND (name LIKE ? OR display_name LIKE ?) ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(&pattern).bind(&pattern).bind(limit).bind(offset)
            .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as("SELECT * FROM topics WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?")
            .bind(user_id).bind(limit).bind(offset)
            .fetch_all(&state.pool).await?
    };

    Ok(Json(ApiResponse::ok(rows.into_iter().map(Topic::from).collect())))
}

// ── Admin handlers ──

async fn admin_list_topics(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<Topic>>>, AppError> {
    require_admin(&auth)?;
    let rows: Vec<TopicRow> = sqlx::query_as("SELECT * FROM topics ORDER BY created_at DESC")
        .fetch_all(&state.pool)
        .await?;
    Ok(Json(ApiResponse::ok(rows.into_iter().map(Topic::from).collect())))
}

async fn admin_get_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    require_admin(&auth)?;
    let row: Option<TopicRow> = sqlx::query_as("SELECT * FROM topics WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Topic::from(r)))),
        None => Err(AppError::NotFound("topic not found".into())),
    }
}

async fn admin_delete_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;
    let result = sqlx::query("DELETE FROM topics WHERE id = ?")
        .bind(&id)
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
