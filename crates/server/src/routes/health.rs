use axum::Router;
use axum::routing::get;
use notifyhub_common::types::ApiResponse;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/health", get(health))
}

async fn health() -> axum::Json<ApiResponse<serde_json::Value>> {
    axum::Json(ApiResponse::ok(serde_json::json!({
        "status": "ok",
        "version": env!("CARGO_PKG_VERSION"),
    })))
}
