use axum::extract::FromRequestParts;
use axum::extract::FromRef;
use axum::http::request::Parts;
use std::sync::Arc;

use notifyhub_common::error::AppError;

use super::jwt::{Claims, validate_token};
use crate::config::Config;
use crate::AppState;

/// Extractor that validates JWT from Authorization header.
/// Usage: `async fn handler(auth: AuthUser, ...) { let user = auth.claims; }`
#[derive(Debug, Clone)]
pub struct AuthUser {
    pub claims: Claims,
}

impl<S: Send + Sync> FromRequestParts<S> for AuthUser {
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, _state: &S) -> Result<Self, Self::Rejection> {
        // Extract config from extensions (injected by AppState middleware as Arc<Config>)
        let config = parts
            .extensions
            .get::<Arc<Config>>()
            .ok_or_else(|| AppError::Internal("config not found in request extensions".into()))?;

        let auth_header = parts
            .headers
            .get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("missing Authorization header".into()))?;

        let token = auth_header
            .strip_prefix("Bearer ")
            .or_else(|| auth_header.strip_prefix("bearer "))
            .ok_or_else(|| AppError::Unauthorized("invalid Authorization format".into()))?;

        let claims = validate_token(token, &config.jwt_secret)?;

        Ok(AuthUser { claims })
    }
}

/// Require admin role. Use after AuthUser.
pub fn require_admin(auth: &AuthUser) -> Result<(), AppError> {
    if auth.claims.role != "admin" {
        return Err(AppError::Forbidden("admin access required".into()));
    }
    Ok(())
}

/// Extractor for dual auth: tries JWT first, then API token lookup in database.
#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct DualAuth {
    pub claims: Claims,
    pub is_api_token: bool,
}

impl<S: Send + Sync> FromRequestParts<S> for DualAuth
where
    AppState: FromRef<S>,
{
    type Rejection = AppError;

    async fn from_request_parts(parts: &mut Parts, state: &S) -> Result<Self, Self::Rejection> {
        // Try JWT first (inline validation to avoid FromRef bound issues)
        let config = parts.extensions.get::<Arc<Config>>();
        if let Some(config) = config {
            if let Some(auth_header) = parts.headers.get("authorization").and_then(|v| v.to_str().ok()) {
                if let Some(token) = auth_header.strip_prefix("Bearer ").or_else(|| auth_header.strip_prefix("bearer ")) {
                    if let Ok(claims) = validate_token(token, &config.jwt_secret) {
                        return Ok(DualAuth { claims, is_api_token: false });
                    }
                }
            }
        }

        // Extract token string from header for API token lookup
        let auth_header = parts.headers.get("authorization")
            .and_then(|v| v.to_str().ok())
            .ok_or_else(|| AppError::Unauthorized("missing Authorization header".into()))?;
        let token_str = auth_header.strip_prefix("Bearer ")
            .or_else(|| auth_header.strip_prefix("bearer "))
            .ok_or_else(|| AppError::Unauthorized("invalid Authorization format".into()))?;

        // Get pool from AppState
        let app_state = AppState::from_ref(state);

        // Look up API token in database
        let row: Option<(i64, String, i32, Option<i64>)> = sqlx::query_as(
            "SELECT id, COALESCE(CAST(user_id AS TEXT), ''), enabled, expires_at FROM api_tokens WHERE token = ?"
        )
        .bind(token_str)
        .fetch_optional(&app_state.pool)
        .await
        .map_err(|e| AppError::Internal(e.to_string()))?;

        let (token_id, user_id_str, enabled, expires_at) =
            row.ok_or_else(|| AppError::Unauthorized("invalid API token".into()))?;

        if enabled == 0 {
            return Err(AppError::Forbidden("token is disabled".into()));
        }

        if let Some(exp) = expires_at {
            if chrono::Utc::now().timestamp() > exp {
                return Err(AppError::Unauthorized("token has expired".into()));
            }
        }

        // Update last_used_at
        let now = chrono::Utc::now().timestamp();
        sqlx::query("UPDATE api_tokens SET last_used_at = ? WHERE id = ?")
            .bind(now).bind(token_id)
            .execute(&app_state.pool).await.ok();

        let claims = Claims {
            sub: user_id_str,
            email: String::new(),
            username: String::new(),
            role: "user".to_string(),
            exp: 0,
            iat: now as usize,
        };

        Ok(DualAuth { claims, is_api_token: true })
    }
}
