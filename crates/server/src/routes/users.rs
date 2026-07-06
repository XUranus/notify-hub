use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{CreateUserRequest, UpdateUserRequest};
use notifyhub_common::types::ApiResponse;
use notifyhub_common::schemas::UserInfo;
use notifyhub_common::constants::UserRole;

use crate::auth::middleware::{AuthUser, require_admin};
use crate::auth::password;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/users", get(list_users).post(create_user))
        .route("/api/admin/users/{id}", get(get_user).put(update_user).delete(delete_user))
}

async fn list_users(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<UserInfo>>>, AppError> {
    require_admin(&auth)?;

    let rows: Vec<(i64, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, email, username, role, created_at FROM users ORDER BY created_at DESC"
    )
    .fetch_all(&state.pool)
    .await?;

    let users = rows.into_iter().map(|(id, email, username, role, created_at)| {
        UserInfo {
            id, email, username,
            role: role.parse().unwrap_or(UserRole::User),
            created_at,
        }
    }).collect();

    Ok(Json(ApiResponse::ok(users)))
}

async fn get_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<UserInfo>>, AppError> {
    require_admin(&auth)?;

    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let row: Option<(i64, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, email, username, role, created_at FROM users WHERE id = ?"
    )
    .bind(id_num)
    .fetch_optional(&state.pool)
    .await?;

    match row {
        Some((id, email, username, role, created_at)) => Ok(Json(ApiResponse::ok(UserInfo {
            id, email, username,
            role: role.parse().unwrap_or(UserRole::User),
            created_at,
        }))),
        None => Err(AppError::NotFound("user not found".into())),
    }
}

async fn create_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateUserRequest>,
) -> Result<Json<ApiResponse<UserInfo>>, AppError> {
    require_admin(&auth)?;

    // Block creating admin role users via API
    if req.role == UserRole::Admin {
        return Err(AppError::BadRequest("cannot create admin users via API".into()));
    }

    // Check email uniqueness
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE email = ?")
        .bind(&req.email).fetch_one(&state.pool).await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("email already exists".into()));
    }

    let hash = password::hash_password(&req.password)?;
    let now = chrono::Utc::now().timestamp();
    let id: i64 = rand::random::<i64>().abs() % 80000000 + 10000000;

    sqlx::query(
        "INSERT INTO users (id, email, username, password, role, created_at) VALUES (?, ?, ?, ?, ?, ?)"
    )
    .bind(id).bind(&req.email).bind(&req.username).bind(&hash).bind(req.role.as_str()).bind(now)
    .execute(&state.pool).await?;

    Ok(Json(ApiResponse::ok(UserInfo { id, email: req.email, username: req.username, role: req.role, created_at: now })))
}

async fn update_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateUserRequest>,
) -> Result<Json<ApiResponse<UserInfo>>, AppError> {
    require_admin(&auth)?;

    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let existing: Option<(i64,)> = sqlx::query_as("SELECT id FROM users WHERE id = ?")
        .bind(id_num).fetch_optional(&state.pool).await?;
    existing.ok_or_else(|| AppError::NotFound("user not found".into()))?;

    if let Some(ref email) = req.email {
        // Check email uniqueness on update
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE email = ? AND id != ?")
            .bind(email).bind(id_num).fetch_one(&state.pool).await?;
        if exists.0 > 0 {
            return Err(AppError::Conflict("email already exists".into()));
        }
        sqlx::query("UPDATE users SET email = ? WHERE id = ?").bind(email).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(ref username) = req.username {
        sqlx::query("UPDATE users SET username = ? WHERE id = ?").bind(username).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(role) = req.role {
        // Block granting admin role via API
        if role == UserRole::Admin {
            return Err(AppError::BadRequest("cannot grant admin role via API".into()));
        }
        sqlx::query("UPDATE users SET role = ? WHERE id = ?").bind(role.as_str()).bind(id_num).execute(&state.pool).await?;
    }

    get_user(State(state), auth, Path(id)).await
}

async fn delete_user(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;

    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    // Cannot delete admin users (check role, not just hardcoded ID)
    let user_role: Option<String> = sqlx::query_scalar("SELECT role FROM users WHERE id = ?")
        .bind(id_num).fetch_optional(&state.pool).await?;
    if user_role.as_deref() == Some("admin") {
        return Err(AppError::BadRequest("cannot delete admin users".into()));
    }

    let result = sqlx::query("DELETE FROM users WHERE id = ?")
        .bind(id_num).execute(&state.pool).await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("user not found".into()));
    }

    // Also delete their tokens
    sqlx::query("DELETE FROM api_tokens WHERE user_id = ?")
        .bind(id_num).execute(&state.pool).await.ok();

    Ok(Json(ApiResponse::success()))
}
