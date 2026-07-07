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
        // User API (JWT, admin sees all, user sees own)
        .route("/api/user/attachments", get(list_attachments))
        .route("/api/user/attachments/stats", get(attachment_stats))
        .route("/api/user/attachments/batch-delete", post(batch_delete))
        .route("/api/user/attachments/{id}", delete(delete_attachment))
        .route("/api/user/attachments/{id}/download", get(download_attachment))
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
    let is_admin = auth.is_admin();
    let user_id = auth.user_id()?;

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
    let is_admin = auth.is_admin();
    let user_id = auth.user_id()?;

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
    ids: Option<Vec<String>>,
    all: Option<bool>,
}

async fn batch_delete(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<BatchDeleteRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let is_admin = auth.is_admin();
    let auth_user_id = auth.user_id()?;

    if req.all.unwrap_or(false) {
        // all=true: single DELETE query with ownership filter, then remove files
        let files: Vec<(String, String)> = if is_admin {
            sqlx::query_as("SELECT id, filename FROM attachments")
                .fetch_all(&state.pool).await?
        } else {
            sqlx::query_as("SELECT id, filename FROM attachments WHERE user_id = ?")
                .bind(auth_user_id)
                .fetch_all(&state.pool).await?
        };

        // Remove files from disk (ignore missing files)
        for (_id, filename) in &files {
            let file_path = state.config.upload_dir.join(auth_user_id.to_string()).join(filename);
            if let Err(e) = tokio::fs::remove_file(&file_path).await {
                tracing::warn!("failed to remove file {}: {e}", file_path.display());
            }
        }

        // Single DELETE query
        let result = if is_admin {
            sqlx::query("DELETE FROM attachments")
                .execute(&state.pool).await?
        } else {
            sqlx::query("DELETE FROM attachments WHERE user_id = ?")
                .bind(auth_user_id)
                .execute(&state.pool).await?
        };

        let deleted = result.rows_affected() as i64;
        Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": deleted, "skipped": 0 }))))
    } else {
        let ids = req.ids.unwrap_or_default();

        // Batch SELECT: fetch all matching attachments in one query
        let placeholders: String = ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let sql = format!(
            "SELECT id, filename, user_id FROM attachments WHERE id IN ({placeholders})"
        );
        let mut query = sqlx::query_as::<_, (String, String, Option<i64>)>(&sql);
        for id in &ids {
            query = query.bind(id);
        }
        let rows: Vec<(String, String, Option<i64>)> = query.fetch_all(&state.pool).await?;

        let matched_ids: Vec<String> = rows.iter().map(|(id, _, _)| id.clone()).collect();
        let skipped = ids.len() - matched_ids.len();

        // Remove files from disk (ignore missing files)
        for (_id, filename, owner_id) in &rows {
            let file_path = state.config.upload_dir.join(owner_id.unwrap_or(0).to_string()).join(filename);
            if let Err(e) = tokio::fs::remove_file(&file_path).await {
                tracing::warn!("failed to remove file {}: {e}", file_path.display());
            }
        }

        // Batch DELETE
        let del_placeholders: String = matched_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
        let del_sql = format!("DELETE FROM attachments WHERE id IN ({del_placeholders})");
        let mut del_query = sqlx::query(&del_sql);
        for id in &matched_ids {
            del_query = del_query.bind(id);
        }
        let result = del_query.execute(&state.pool).await?;
        let deleted = result.rows_affected() as i64;

        Ok(Json(ApiResponse::ok(serde_json::json!({ "deleted": deleted, "skipped": skipped }))))
    }
}

async fn delete_attachment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let is_admin = auth.is_admin();
    let auth_user_id = auth.user_id()?;

    let row: Option<(String, Option<i64>)> = sqlx::query_as("SELECT filename, user_id FROM attachments WHERE id = ?")
        .bind(&id).fetch_optional(&state.pool).await?;

    let (filename, owner_id) = row.ok_or_else(|| AppError::NotFound("attachment not found".into()))?;

    // Non-admin users can only delete their own attachments
    if !is_admin && owner_id != Some(auth_user_id) {
        return Err(AppError::Forbidden("not your attachment".into()));
    }

    let file_path = state.config.upload_dir.join(owner_id.unwrap_or(0).to_string()).join(&filename);

    // Defense-in-depth path traversal check
    if !file_path.starts_with(&state.config.upload_dir) {
        return Err(AppError::BadRequest("invalid file path".into()));
    }

    if let Err(e) = tokio::fs::remove_file(&file_path).await {
        tracing::warn!("failed to remove file {}: {e}", file_path.display());
    }

    sqlx::query("DELETE FROM attachments WHERE id = ?")
        .bind(&id).execute(&state.pool).await?;

    Ok(Json(ApiResponse::success()))
}

async fn download_attachment(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<impl axum::response::IntoResponse, AppError> {
    let is_admin = auth.is_admin();
    let auth_user_id = auth.user_id()?;

    let row: Option<(String, String, String, Option<i64>, i64)> = sqlx::query_as(
        "SELECT filename, original_name, mime_type, user_id, size FROM attachments WHERE id = ?"
    )
    .bind(&id)
    .fetch_optional(&state.pool)
    .await?;

    let (filename, original_name, mime_type, owner_id, _size) =
        row.ok_or_else(|| AppError::NotFound("attachment not found".into()))?;

    // Ownership check (Fix #2)
    if !is_admin && owner_id != Some(auth_user_id) {
        return Err(AppError::Forbidden("not your attachment".into()));
    }

    let file_path = state.config.upload_dir.join(owner_id.unwrap_or(0).to_string()).join(&filename);

    // Defense-in-depth path traversal check (Fix #4)
    if !file_path.starts_with(&state.config.upload_dir) {
        return Err(AppError::BadRequest("invalid file path".into()));
    }

    if !file_path.exists() {
        return Err(AppError::NotFound("file not found on disk".into()));
    }

    // Increment download count — log warning on error instead of silently ignoring (Fix #11)
    if let Err(e) = sqlx::query("UPDATE attachments SET download_count = download_count + 1 WHERE id = ?")
        .bind(&id).execute(&state.pool).await
    {
        tracing::warn!("failed to increment download count for attachment {id}: {e}");
    }

    let data = tokio::fs::read(file_path).await?; // Fix #7: async I/O

    // Use original filename in Content-Disposition, sanitized (Fix #9)
    let safe_name = original_name
        .replace(['/', '\\', '\0'], "_");

    Ok((
        axum::http::StatusCode::OK,
        [
            (axum::http::header::CONTENT_TYPE, mime_type),
            (axum::http::header::CONTENT_DISPOSITION, format!("attachment; filename=\"{}\"", safe_name)),
        ],
        data,
    ))
}
