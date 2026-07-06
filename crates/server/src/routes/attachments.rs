use axum::extract::{Path, Query, State};
use axum::routing::{get, post, delete};
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, PaginatedResponse};

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/attachments", get(list_attachments))
        .route("/api/admin/attachments/stats", get(attachment_stats))
        .route("/api/admin/attachments/batch-delete", post(batch_delete))
        .route("/api/admin/attachments/{id}", delete(delete_attachment))
        .route("/api/admin/attachments/{id}/download", get(download_attachment))
}

#[derive(Deserialize)]
struct ListParams {
    page: Option<i64>,
    #[serde(rename = "pageSize")]
    page_size: Option<i64>,
}

async fn list_attachments(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ListParams>,
) -> Result<Json<ApiResponse<PaginatedResponse<serde_json::Value>>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let page = params.page.unwrap_or(1).max(1);
    let page_size = params.page_size.unwrap_or(50).min(500);
    let offset = (page - 1) * page_size;

    let total: (i64,) = if is_admin {
        sqlx::query_as("SELECT COUNT(*) FROM attachments")
            .fetch_one(&state.pool).await?
    } else {
        sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?
    };

    let rows: Vec<(String, Option<i64>, String, String, String, i64, String, i64, Option<i64>, i64)> = if is_admin {
        sqlx::query_as(
            "SELECT id, user_id, filename, original_name, mime_type, size, url, download_count, expires_at, created_at FROM attachments ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as(
            "SELECT id, user_id, filename, original_name, mime_type, size, url, download_count, expires_at, created_at FROM attachments WHERE user_id = ? ORDER BY created_at DESC LIMIT ? OFFSET ?"
        )
        .bind(user_id)
        .bind(page_size)
        .bind(offset)
        .fetch_all(&state.pool).await?
    };

    let items = rows.into_iter().map(|r| {
        serde_json::json!({
            "id": r.0, "userId": r.1, "filename": r.2, "originalName": r.3,
            "mimeType": r.4, "size": r.5, "url": r.6, "downloadCount": r.7,
            "expiresAt": r.8, "createdAt": r.9,
        })
    }).collect();

    Ok(Json(ApiResponse::ok(PaginatedResponse { items, total: total.0, page, page_size })))
}

async fn attachment_stats(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let (file_count, used_bytes) = if is_admin {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attachments")
            .fetch_one(&state.pool).await?;
        let size: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(size), 0) FROM attachments")
            .fetch_one(&state.pool).await?;
        (count.0, size.0)
    } else {
        let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM attachments WHERE user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        let size: (i64,) = sqlx::query_as("SELECT COALESCE(SUM(size), 0) FROM attachments WHERE user_id = ?")
            .bind(user_id).fetch_one(&state.pool).await?;
        (count.0, size.0)
    };

    // For non-admin users, get max total size from system_settings (default 10MB)
    let max_bytes: Option<i64> = if is_admin {
        None
    } else {
        let row: Option<(String,)> = sqlx::query_as("SELECT value FROM system_settings WHERE key = 'attachment_max_total_size'")
            .fetch_optional(&state.pool).await?;
        Some(row.and_then(|(v,)| v.parse().ok()).unwrap_or(10485760))
    };

    Ok(Json(ApiResponse::ok(serde_json::json!({
        "usedBytes": used_bytes,
        "maxBytes": max_bytes,
        "fileCount": file_count,
        "isAdmin": is_admin,
    }))))
}

#[derive(Deserialize)]
struct BatchDeleteRequest {
    ids: Vec<String>,
}

async fn batch_delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<BatchDeleteRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let auth_user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let mut deleted = 0i64;
    for id in &req.ids {
        // Get file path before deleting
        let row: Option<(String, Option<i64>)> = sqlx::query_as("SELECT filename, user_id FROM attachments WHERE id = ?")
            .bind(id).fetch_optional(&state.pool).await?;

        if let Some((filename, owner_id)) = row {
            // Non-admin users can only delete their own attachments
            if !is_admin && owner_id != Some(auth_user_id) {
                continue;
            }

            let file_path = state.config.upload_dir.join(owner_id.unwrap_or(0).to_string()).join(&filename);
            let _ = std::fs::remove_file(file_path);

            let result = sqlx::query("DELETE FROM attachments WHERE id = ?")
                .bind(id).execute(&state.pool).await?;
            deleted += result.rows_affected() as i64;
        }
    }

    Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": deleted }))))
}

async fn delete_attachment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let is_admin = auth.claims.role == "admin";
    let auth_user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let row: Option<(String, Option<i64>)> = sqlx::query_as("SELECT filename, user_id FROM attachments WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await?;

    let (filename, owner_id) = row.ok_or_else(|| AppError::NotFound("attachment not found".into()))?;

    // Non-admin users can only delete their own attachments
    if !is_admin && owner_id != Some(auth_user_id) {
        return Err(AppError::Forbidden("not your attachment".into()));
    }

    let file_path = state.config.upload_dir.join(owner_id.unwrap_or(0).to_string()).join(&filename);
    let _ = std::fs::remove_file(file_path);

    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(&id).execute(&state.pool).await?;

    Ok(Json(ApiResponse::success()))
}

async fn download_attachment(
    State(state): State<AppState>,
    _auth: AuthUser,
    Path(id): Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let row: Option<(String, String, Option<i64>, i64)> = sqlx::query_as(
        "SELECT filename, mime_type, user_id, size FROM attachments WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let (filename, mime_type, user_id, _size) = row.ok_or_else(|| AppError::NotFound("attachment not found".into()))?;

    let file_path = state.config.upload_dir.join(user_id.unwrap_or(0).to_string()).join(&filename);

    if !file_path.exists() {
        return Err(AppError::NotFound("file not found on disk".into()));
    }

    // Increment download count
    sqlx::query("UPDATE attachments SET download_count = download_count + 1 WHERE id = ?")
        .bind(&id).execute(&state.pool).await.ok();

    let data = std::fs::read(file_path)?;

    Ok((
        axum::http::StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, mime_type),
            (axum::http::header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", id)),
        ],
        data,
    ))
}
