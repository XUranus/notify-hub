use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, UserSettings};
use notifyhub_common::schemas::UpdateUserSettingsRequest;

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        // User API (JWT, current user's settings)
        .route("/api/user/settings", get(get_settings).put(update_settings))
}

async fn get_settings(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<UserSettings>>, AppError> {
    let user_id = auth.user_id()?;

    let row: Option<(i64, i64, i64)> = sqlx::query_as(
        "SELECT attachment_expiration, message_expiration, 0 FROM user_settings WHERE user_id = ?",
    )
    .bind(user_id)
    .fetch_optional(&state.pool)
    .await?;

    let (attachment_expiry, message_expiry, _) = if let Some(r) = row {
        r
    } else {
        // Auto-create defaults: attachment_expiration=30, message_expiration=0
        let now = chrono::Utc::now().timestamp();
        sqlx::query(
            "INSERT INTO user_settings (user_id, attachment_expiration, message_expiration, created_at, updated_at) VALUES (?, 30, 0, ?, ?)"
        )
        .bind(user_id).bind(now).bind(now)
        .execute(&state.pool).await?;
        (30, 0, 0)
    };

    Ok(Json(ApiResponse::ok(UserSettings {
        user_id,
        max_messages: None,
        message_expiry_days: Some(message_expiry),
        attachment_expiry_days: Some(attachment_expiry),
    })))
}

async fn update_settings(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateUserSettingsRequest>,
) -> Result<Json<ApiResponse<UserSettings>>, AppError> {
    let user_id = auth.user_id()?;
    let now = chrono::Utc::now().timestamp();

    // Upsert
    sqlx::query(
        r#"INSERT INTO user_settings (user_id, attachment_expiration, message_expiration, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?)
           ON CONFLICT(user_id) DO UPDATE SET
             attachment_expiration = COALESCE(?, attachment_expiration),
             message_expiration = COALESCE(?, message_expiration),
             updated_at = ?"#,
    )
    .bind(user_id)
    .bind(req.attachment_expiry_days.unwrap_or(0))
    .bind(req.message_expiry_days.unwrap_or(0))
    .bind(now)
    .bind(now)
    .bind(req.attachment_expiry_days)
    .bind(req.message_expiry_days)
    .bind(now)
    .execute(&state.pool)
    .await?;

    get_settings(State(state), auth).await
}
