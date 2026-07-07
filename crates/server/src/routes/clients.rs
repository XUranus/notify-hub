use axum::extract::State;
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::types::{ApiResponse, PushClient};

use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new().route("/api/user/clients", get(list_clients))
}

async fn list_clients(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<PushClient>>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    let rows: Vec<(String, String, i64, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, i64, i64)> = sqlx::query_as(
        "SELECT id, uuid, user_id, name, os, arch, desktop, app_version, connection_mode, fcm_token, last_seen_at, registered_at FROM push_clients WHERE user_id = ? ORDER BY last_seen_at DESC",
    )
    .bind(user_id)
    .fetch_all(&state.pool)
    .await?;

    let clients = rows.into_iter().map(|r| PushClient {
        id: r.0,
        uuid: r.1,
        user_id: r.2,
        device_name: r.3,
        device_os: r.4,
        device_arch: r.5,
        desktop: r.6,
        app_version: r.7,
        connection_mode: r.8,
        fcm_token: r.9,
        last_seen_at: r.10,
        created_at: r.11,
    }).collect();

    Ok(Json(ApiResponse::ok(clients)))
}
