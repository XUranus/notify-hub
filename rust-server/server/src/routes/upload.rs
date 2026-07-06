use axum::extract::{Multipart, State};
use axum::routing::{get, post};
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::types::ApiResponse;
use notifyhub_common::schemas::UploadQuota;

use crate::auth::middleware::DualAuth;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/upload", post(upload_file))
        .route("/api/v1/upload/quota", get(get_quota))
}

async fn get_quota(
    State(state): State<AppState>,
    auth: DualAuth,
) -> Result<Json<ApiResponse<UploadQuota>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let used: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(size), 0) FROM attachments WHERE user_id = ?")
        .bind(user_id)
        .fetch_one(&state.pool)
        .await?;

    // Default limit: 100MB
    let limit_str: Option<String> = sqlx::query_scalar("SELECT value FROM system_settings WHERE key = 'max_upload_size_mb'")
        .fetch_optional(&state.pool)
        .await?;
    let limit_mb: i64 = limit_str.and_then(|s| s.parse().ok()).unwrap_or(100);

    Ok(Json(ApiResponse::ok(UploadQuota {
        used: used.0,
        limit: limit_mb * 1024 * 1024,
    })))
}

async fn upload_file(
    State(state): State<AppState>,
    auth: DualAuth,
    mut multipart: Multipart,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    // Ensure upload directory exists
    let upload_dir = state.config.upload_dir.join(user_id.to_string());
    std::fs::create_dir_all(&upload_dir)?;

    while let Some(field) = multipart.next_field().await.map_err(|e| AppError::BadRequest(e.to_string()))? {
        let file_name = field.file_name()
            .unwrap_or("unknown")
            .to_string();
        let content_type = field.content_type()
            .unwrap_or("application/octet-stream")
            .to_string();
        let data = field.bytes().await.map_err(|e| AppError::BadRequest(e.to_string()))?;

        // Check quota
        let used: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(size), 0) FROM attachments WHERE user_id = ?")
            .bind(user_id)
            .fetch_one(&state.pool)
            .await?;

        let limit_str: Option<String> = sqlx::query_scalar("SELECT value FROM system_settings WHERE key = 'max_upload_size_mb'")
            .fetch_optional(&state.pool)
            .await?;
        let limit_mb: i64 = limit_str.and_then(|s| s.parse().ok()).unwrap_or(100);
        let limit = limit_mb * 1024 * 1024;

        if used.0 + data.len() as i64 > limit {
            return Err(AppError::BadRequest("upload quota exceeded".into()));
        }

        // Generate unique filename
        let ext = std::path::Path::new(&file_name)
            .extension()
            .and_then(|e| e.to_str())
            .unwrap_or("bin");
        let stored_name = format!("{}.{}", uuid::Uuid::new_v4(), ext);
        let file_path = upload_dir.join(&stored_name);

        // Write file
        std::fs::write(&file_path, &data)?;

        let id = uuid::Uuid::new_v4().to_string();
        let now = chrono::Utc::now().timestamp();
        let url = format!("/uploads/{}/{}", user_id, stored_name);

        // Save to database
        sqlx::query(
            r#"INSERT INTO attachments (id, user_id, filename, original_name, mime_type, size, url, created_at)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#
        )
        .bind(&id)
        .bind(user_id)
        .bind(&stored_name)
        .bind(&file_name)
        .bind(&content_type)
        .bind(data.len() as i64)
        .bind(&url)
        .bind(now)
        .execute(&state.pool)
        .await?;

        return Ok(Json(ApiResponse::ok(serde_json::json!({
            "id": id,
            "filename": stored_name,
            "originalName": file_name,
            "mimeType": content_type,
            "size": data.len(),
            "url": url,
        }))));
    }

    Err(AppError::BadRequest("no file provided".into()))
}
