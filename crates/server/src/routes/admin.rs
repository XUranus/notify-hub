use axum::extract::State;
use axum::routing::post;
use axum::Router;
use axum::Json;

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{LoginRequest, RegisterRequest, ChangePasswordRequest};
use notifyhub_common::types::ApiResponse;
use notifyhub_common::schemas::{LoginResponse, UserInfo};

use crate::auth::jwt;
use crate::auth::login_rate_limit;
use crate::auth::middleware::AuthUser;
use crate::auth::password;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // Auth: admin login (web panel)
        .route("/api/admin/login", post(admin_login))
        // Auth: user registration and login (clients)
        .route("/api/auth/register", post(register))
        .route("/api/auth/login", post(client_login))
        // Auth: password change (JWT required)
        .route("/api/auth/change-password", post(change_password))
}

/// Admin login with email + password
async fn admin_login(
    State(state): State<AppState>,
    Json(req): Json<LoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, AppError> {
    // Check rate limit
    if let Err((msg, _)) = login_rate_limit::check_login_allowed(&req.email) {
        return Err(AppError::Forbidden(msg));
    }

    // Try by email or username in users table
    let row: Option<(i64, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, email, username, password, created_at FROM users WHERE (email = ? OR username = ?) AND role = 'admin'",
    )
    .bind(&req.email)
    .bind(&req.email)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, username, hash, created_at) = match row {
        Some(r) => r,
        None => {
            login_rate_limit::record_failure(&req.email);
            return Err(AppError::Unauthorized("invalid credentials".into()));
        }
    };

    if !password::verify_password(&req.password, &hash)? {
        login_rate_limit::record_failure(&req.email);
        return Err(AppError::Unauthorized("invalid credentials".into()));
    }

    login_rate_limit::clear_failures(&req.email);

    let token = jwt::create_token(id, &email, &username, "admin", &state.config.jwt_secret)?;

    Ok(Json(ApiResponse::ok(LoginResponse {
        token,
        user: UserInfo { id, email, username, role: notifyhub_common::constants::UserRole::Admin, created_at },
    })))
}

/// Register new user account
async fn register(
    State(state): State<AppState>,
    Json(req): Json<RegisterRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, AppError> {
    // Check if email already exists
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM users WHERE email = ?")
        .bind(&req.email)
        .fetch_one(&state.pool)
        .await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("email already registered".into()));
    }

    let hash = password::hash_password(&req.password)?;
    let now = chrono::Utc::now().timestamp();
    let id: i64 = rand::random::<i64>().abs() % 80000000 + 10000000;

    // Extract username from email prefix (part before @)
    let username = req.email.split('@').next().unwrap_or(&req.email).to_string();

    sqlx::query(
        "INSERT INTO users (id, email, username, password, role, created_at) VALUES (?, ?, ?, ?, 'user', ?)",
    )
    .bind(id)
    .bind(&req.email)
    .bind(&username)
    .bind(&hash)
    .bind(now)
    .execute(&state.pool)
    .await?;

    let token = jwt::create_token(id, &req.email, &username, "user", &state.config.jwt_secret)?;

    Ok(Json(ApiResponse::ok(LoginResponse {
        token,
        user: UserInfo { id, email: req.email.clone(), username, role: notifyhub_common::constants::UserRole::User, created_at: now },
    })))
}

/// Client login (mobile/desktop) with email or username + password
async fn client_login(
    State(state): State<AppState>,
    Json(req): Json<notifyhub_common::schemas::ClientLoginRequest>,
) -> Result<Json<ApiResponse<LoginResponse>>, AppError> {
    // Check rate limit
    if let Err((msg, _)) = login_rate_limit::check_login_allowed(&req.email_or_username) {
        return Err(AppError::Forbidden(msg));
    }

    let row: Option<(i64, String, String, String, String, i64)> = sqlx::query_as(
        "SELECT id, email, username, password, role, created_at FROM users WHERE email = ? OR username = ?",
    )
    .bind(&req.email_or_username)
    .bind(&req.email_or_username)
    .fetch_optional(&state.pool)
    .await?;

    let (id, email, username, hash, role, created_at) = match row {
        Some(r) => r,
        None => {
            login_rate_limit::record_failure(&req.email_or_username);
            return Err(AppError::Unauthorized("invalid credentials".into()));
        }
    };

    if !password::verify_password(&req.password, &hash)? {
        login_rate_limit::record_failure(&req.email_or_username);
        return Err(AppError::Unauthorized("invalid credentials".into()));
    }

    login_rate_limit::clear_failures(&req.email_or_username);

    let token = jwt::create_client_token(id, &email, &username, &role, &state.config.jwt_secret)?;

    let user_role: notifyhub_common::constants::UserRole = role.parse()
        .unwrap_or(notifyhub_common::constants::UserRole::User);

    Ok(Json(ApiResponse::ok(LoginResponse {
        token,
        user: UserInfo { id, email, username, role: user_role, created_at },
    })))
}

/// Change password
async fn change_password(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<ChangePasswordRequest>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id in token".into()))?;

    let row: Option<(String,)> = sqlx::query_as("SELECT password FROM users WHERE id = ?")
        .bind(user_id)
        .fetch_optional(&state.pool)
        .await?;

    let hash = match row {
        Some((h,)) => h,
        None => return Err(AppError::NotFound("user not found".into())),
    };

    if !password::verify_password(&req.old_password, &hash)? {
        return Err(AppError::BadRequest("incorrect old password".into()));
    }

    let new_hash = password::hash_password(&req.new_password)?;
    sqlx::query("UPDATE users SET password = ? WHERE id = ?")
        .bind(&new_hash)
        .bind(user_id)
        .execute(&state.pool)
        .await?;

    Ok(Json(ApiResponse::success()))
}
