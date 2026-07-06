use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::types::ApiResponse;
use notifyhub_common::schemas::UpdateSystemSettingsRequest;

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/system-settings", get(get_system_settings).put(update_system_settings))
}

async fn get_system_settings(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    let rows: Vec<(String, String)> = sqlx::query_as("SELECT key, value FROM system_settings")
        .fetch_all(&state.pool)
        .await?;

    let map: std::collections::HashMap<String, String> = rows.into_iter().collect();

    let get_int = |key: &str, default: i64| -> i64 {
        map.get(key).and_then(|v| v.parse().ok()).unwrap_or(default)
    };

    Ok(Json(ApiResponse::ok(serde_json::json!({
        "attachmentMaxFileSize": get_int("attachment_max_file_size", 1048576),
        "attachmentMaxTotalSize": get_int("attachment_max_total_size", 10485760),
        "maxMessagesPerUser": get_int("max_messages_per_user", 1000),
        "cleanupIntervalMinutes": get_int("cleanup_interval_minutes", 60),
    }))))
}

async fn update_system_settings(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<UpdateSystemSettingsRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    if let Some(v) = req.attachment_max_file_size {
        upsert_setting(&state, "attachment_max_file_size", &v.to_string()).await?;
    }
    if let Some(v) = req.attachment_max_total_size {
        upsert_setting(&state, "attachment_max_total_size", &v.to_string()).await?;
    }
    if let Some(v) = req.max_messages_per_user {
        upsert_setting(&state, "max_messages_per_user", &v.to_string()).await?;
    }
    if let Some(v) = req.cleanup_interval_minutes {
        upsert_setting(&state, "cleanup_interval_minutes", &v.to_string()).await?;
    }

    get_system_settings(State(state), auth).await
}

async fn upsert_setting(state: &AppState, key: &str, value: &str) -> Result<(), AppError> {
    sqlx::query(
        "INSERT INTO system_settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?",
    )
    .bind(key)
    .bind(value)
    .bind(value)
    .execute(&state.pool)
    .await?;
    Ok(())
}
