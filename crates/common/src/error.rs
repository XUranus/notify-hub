use serde::Serialize;
use thiserror::Error;

#[derive(Debug, Error)]
pub enum AppError {
    #[error("not found: {0}")]
    NotFound(String),

    #[error("unauthorized: {0}")]
    Unauthorized(String),

    #[error("forbidden: {0}")]
    Forbidden(String),

    #[error("bad request: {0}")]
    BadRequest(String),

    #[error("conflict: {0}")]
    Conflict(String),

    #[error("validation error: {0}")]
    Validation(String),

    #[error("internal error: {0}")]
    Internal(String),

    #[error("database error: {0}")]
    Database(#[from] sqlx::Error),

    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),

    #[error("io error: {0}")]
    Io(#[from] std::io::Error),

    #[error("error: {0}")]
    Anyhow(#[from] anyhow::Error),
}

#[derive(Serialize)]
struct ErrorBody {
    success: bool,
    error: String,
}

impl axum::response::IntoResponse for AppError {
    fn into_response(self) -> axum::response::Response {
        let (status, msg) = match &self {
            AppError::NotFound(m) => (axum::http::StatusCode::NOT_FOUND, m.clone()),
            AppError::Unauthorized(m) => (axum::http::StatusCode::UNAUTHORIZED, m.clone()),
            AppError::Forbidden(m) => (axum::http::StatusCode::FORBIDDEN, m.clone()),
            AppError::BadRequest(m) => (axum::http::StatusCode::BAD_REQUEST, m.clone()),
            AppError::Conflict(m) => (axum::http::StatusCode::CONFLICT, m.clone()),
            AppError::Validation(m) => {
                (axum::http::StatusCode::UNPROCESSABLE_ENTITY, m.clone())
            }
            AppError::Internal(m) => {
                tracing::error!("internal error: {m}");
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    m.clone(),
                )
            }
            AppError::Database(e) => {
                tracing::error!("database error: {e}");
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
            AppError::Json(e) => {
                tracing::error!("json error: {e}");
                (
                    axum::http::StatusCode::BAD_REQUEST,
                    "invalid json".to_string(),
                )
            }
            AppError::Io(e) => {
                tracing::error!("io error: {e}");
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
            AppError::Anyhow(e) => {
                tracing::error!("error: {e:?}");
                (
                    axum::http::StatusCode::INTERNAL_SERVER_ERROR,
                    "internal server error".to_string(),
                )
            }
        };

        let body = ErrorBody { success: false, error: msg };
        (status, axum::Json(body)).into_response()
    }
}
