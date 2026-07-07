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

pub fn router() -> Router<AppState> {
    Router::new()
        // Admin routes: require admin role
        .route("/api/admin/topics", get(list_topics).post(admin_create_topic))
        .route("/api/admin/topics/{id}", get(get_topic).put(admin_update_topic).delete(admin_delete_topic))
        // v1 API: topic CRUD for authenticated users (with pagination & search)
        .route("/api/v1/topics", get(list_topics_v2).post(create_topic))
        .route("/api/v1/topics/{id}", get(get_topic))
}

async fn list_topics(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<Topic>>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let rows: Vec<TopicRow> = if auth.claims.role == "admin" {
        sqlx::query_as("SELECT * FROM topics ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM topics WHERE user_id = ? ORDER BY created_at DESC")
            .bind(user_id)
            .fetch_all(&state.pool)
            .await?
    };

    Ok(Json(ApiResponse::ok(rows.into_iter().map(Topic::from).collect())))
}

async fn get_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let row: Option<TopicRow> = if auth.claims.role == "admin" {
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
    create_topic_inner(State(state), auth, req).await
}

async fn create_topic_inner(
    State(state): State<AppState>,
    auth: AuthUser,
    req: CreateTopicRequest,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);
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
        "INSERT INTO topics (id, user_id, name, display_name, icon, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&id)
    .bind(user_id)
    .bind(&req.name)
    .bind(&req.display_name)
    .bind(&req.icon)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(Topic {
        id, user_id, name: req.name, display_name: req.display_name,
        icon: req.icon, created_at: now, updated_at: now,
    })))
}

async fn update_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    update_topic_inner(State(state), auth, Path(id), req).await
}

async fn update_topic_inner(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    req: UpdateTopicRequest,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);
    let now = chrono::Utc::now().timestamp();

    // Check existence
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

    let _topic = existing.ok_or_else(|| AppError::NotFound("topic not found".into()))?;

    if let Some(ref name) = req.name {
        // Check name uniqueness for this user (excluding this topic)
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

    get_topic(State(state), auth, Path(id)).await
}

async fn delete_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    delete_topic_inner(State(state), auth, Path(id)).await
}

async fn delete_topic_inner(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let result = if auth.claims.role == "admin" {
        sqlx::query("DELETE FROM topics WHERE id = ?")
            .bind(&id)
            .execute(&state.pool)
            .await?
    } else {
        sqlx::query("DELETE FROM topics WHERE id = ? AND user_id = ?")
            .bind(&id)
            .bind(user_id)
            .execute(&state.pool)
            .await?
    };

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("topic not found".into()));
    }

    // Unlink messages
    sqlx::query("UPDATE messages SET topic_id = NULL WHERE topic_id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::success()))
}

/// Admin-only: create topic
async fn admin_create_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    require_admin(&auth)?;
    create_topic_inner(State(state), auth, req).await
}

/// Admin-only: update topic
async fn admin_update_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTopicRequest>,
) -> Result<Json<ApiResponse<Topic>>, AppError> {
    require_admin(&auth)?;
    update_topic_inner(State(state), auth, Path(id), req).await
}

/// Admin-only: delete topic
async fn admin_delete_topic(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;
    delete_topic_inner(State(state), auth, Path(id)).await
}

/// v1 list topics with pagination and search
async fn list_topics_v2(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<TopicQueryParams>,
) -> Result<Json<ApiResponse<Vec<Topic>>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;
    let limit = params.limit.unwrap_or(50).min(200);
    let offset = params.offset.unwrap_or(0);

    let rows: Vec<TopicRow> = if auth.claims.role == "admin" {
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

#[derive(sqlx::FromRow)]
struct TopicRow {
    id: String,
    user_id: i64,
    name: String,
    display_name: Option<String>,
    icon: Option<String>,
    created_at: i64,
    updated_at: i64,
}

impl From<TopicRow> for Topic {
    fn from(r: TopicRow) -> Self {
        Topic { id: r.id, user_id: r.user_id, name: r.name, display_name: r.display_name, icon: r.icon, created_at: r.created_at, updated_at: r.updated_at }
    }
}
