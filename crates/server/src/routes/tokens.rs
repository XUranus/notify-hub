use axum::extract::{Path, State};
use axum::routing::{get, post};
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{CreateTokenRequest, UpdateTokenRequest, GenerateClientTokenRequest, TokenCreatedResponse};
use notifyhub_common::types::{ApiResponse, ApiToken};
use notifyhub_common::constants::{ChannelType, API_TOKEN_PREFIX, CLIENT_JWT_EXPIRY_DAYS};

use crate::auth::jwt;
use crate::auth::middleware::AuthUser;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/tokens", get(list_tokens).post(create_token))
        .route("/api/admin/tokens/generate-client-token", post(generate_client_token))
        .route("/api/admin/tokens/{id}", get(get_token).put(update_token).delete(delete_token))
        .route("/api/admin/tokens/{id}/rotate", post(rotate_token))
}

async fn list_tokens(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<ApiToken>>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let rows: Vec<TokenRow> = if auth.claims.role == "admin" {
        sqlx::query_as("SELECT * FROM api_tokens ORDER BY created_at DESC")
            .fetch_all(&state.pool).await?
    } else {
        sqlx::query_as("SELECT * FROM api_tokens WHERE user_id = ? ORDER BY created_at DESC")
            .bind(user_id).fetch_all(&state.pool).await?
    };

    Ok(Json(ApiResponse::ok(rows.into_iter().map(ApiToken::from).collect())))
}

async fn get_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<ApiToken>>, AppError> {
    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid token id".into()))?;
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let row: Option<TokenRow> = if auth.claims.role == "admin" {
        sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
            .bind(id_num).fetch_optional(&state.pool).await?
    } else {
        sqlx::query_as("SELECT * FROM api_tokens WHERE id = ? AND user_id = ?")
            .bind(id_num).bind(user_id).fetch_optional(&state.pool).await?
    };

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(ApiToken::from(r)))),
        None => Err(AppError::NotFound("token not found".into())),
    }
}

fn generate_token_string() -> String {
    format!("{}{}", API_TOKEN_PREFIX, nanoid::nanoid!(32))
}

async fn create_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateTokenRequest>,
) -> Result<Json<ApiResponse<TokenCreatedResponse>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    // Check limit (5 per user)
    let count: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM api_tokens WHERE user_id = ?")
        .bind(user_id).fetch_one(&state.pool).await?;
    if count.0 >= 5 {
        return Err(AppError::BadRequest("maximum 5 tokens per user".into()));
    }

    let token_str = generate_token_string();
    let now = chrono::Utc::now().timestamp();
    let scopes_json = serde_json::to_string(&req.scopes).unwrap_or_else(|_| "[]".to_string());
    let ip_json = req.ip_whitelist.as_ref().map(|v| serde_json::to_string(v).unwrap_or_default());
    let expires_at = if req.expires_in.as_ms() > 0 {
        Some(now + (req.expires_in.as_ms() / 1000) as i64)
    } else {
        None
    };

    let id: i64 = sqlx::query_scalar(
        "INSERT INTO api_tokens (user_id, name, token, scopes, rate_limit, ip_whitelist, enabled, expires_at, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?) RETURNING id"
    )
    .bind(user_id)
    .bind(&req.name)
    .bind(&token_str)
    .bind(&scopes_json)
    .bind(req.rate_limit as i64)
    .bind(&ip_json)
    .bind(expires_at)
    .bind(now)
    .fetch_one(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(TokenCreatedResponse {
        id,
        name: req.name,
        token: token_str,
        scopes: req.scopes,
        rate_limit: req.rate_limit,
        expires_at,
    })))
}

async fn update_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTokenRequest>,
) -> Result<Json<ApiResponse<ApiToken>>, AppError> {
    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid token id".into()))?;

    let existing: Option<TokenRow> = sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
        .bind(id_num).fetch_optional(&state.pool).await?;
    let existing = existing.ok_or_else(|| AppError::NotFound("token not found".into()))?;

    if auth.claims.role != "admin" {
        let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);
        if existing.user_id != Some(user_id) {
            return Err(AppError::Forbidden("not your token".into()));
        }
    }

    if let Some(ref name) = req.name {
        sqlx::query("UPDATE api_tokens SET name = ? WHERE id = ?").bind(name).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(ref scopes) = req.scopes {
        let s = serde_json::to_string(scopes)?;
        sqlx::query("UPDATE api_tokens SET scopes = ? WHERE id = ?").bind(&s).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(rate_limit) = req.rate_limit {
        sqlx::query("UPDATE api_tokens SET rate_limit = ? WHERE id = ?").bind(rate_limit as i64).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(ref ip) = req.ip_whitelist {
        let v = serde_json::to_string(ip)?;
        sqlx::query("UPDATE api_tokens SET ip_whitelist = ? WHERE id = ?").bind(&v).bind(id_num).execute(&state.pool).await?;
    }
    if let Some(enabled) = req.enabled {
        sqlx::query("UPDATE api_tokens SET enabled = ? WHERE id = ?").bind(enabled as i32).bind(id_num).execute(&state.pool).await?;
    }

    get_token(State(state), auth, Path(id)).await
}

async fn delete_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid token id".into()))?;

    let existing: Option<TokenRow> = sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
        .bind(id_num).fetch_optional(&state.pool).await?;
    let existing = existing.ok_or_else(|| AppError::NotFound("token not found".into()))?;

    if auth.claims.role != "admin" {
        let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);
        if existing.user_id != Some(user_id) {
            return Err(AppError::Forbidden("not your token".into()));
        }
    }

    let result = sqlx::query("DELETE FROM api_tokens WHERE id = ?")
        .bind(id_num).execute(&state.pool).await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("token not found".into()));
    }
    Ok(Json(ApiResponse::success()))
}

async fn rotate_token(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<TokenCreatedResponse>>, AppError> {
    let id_num: i64 = id.parse().map_err(|_| AppError::BadRequest("invalid token id".into()))?;

    let row: Option<TokenRow> = sqlx::query_as("SELECT * FROM api_tokens WHERE id = ?")
        .bind(id_num).fetch_optional(&state.pool).await?;
    let token = row.ok_or_else(|| AppError::NotFound("token not found".into()))?;

    if auth.claims.role != "admin" {
        let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);
        if token.user_id != Some(user_id) {
            return Err(AppError::Forbidden("not your token".into()));
        }
    }

    let new_token = generate_token_string();
    sqlx::query("UPDATE api_tokens SET token = ? WHERE id = ?")
        .bind(&new_token).bind(id_num).execute(&state.pool).await?;

    let scopes: Vec<ChannelType> = serde_json::from_str(&token.scopes).unwrap_or_default();

    Ok(Json(ApiResponse::ok(TokenCreatedResponse {
        id: token.id,
        name: token.name,
        token: new_token,
        scopes,
        rate_limit: token.rate_limit as u32,
        expires_at: token.expires_at,
    })))
}

async fn generate_client_token(
    State(state): State<AppState>,
    auth: AuthUser,
    req: Option<Json<GenerateClientTokenRequest>>,
) -> Result<Json<ApiResponse<TokenCreatedResponse>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse().unwrap_or(0);

    let token = jwt::create_client_token(
        user_id, &auth.claims.email, &auth.claims.username, &auth.claims.role, &state.config.jwt_secret,
    )?;

    let now = chrono::Utc::now().timestamp();
    let expires_at = now + (CLIENT_JWT_EXPIRY_DAYS as i64 * 86400);

    Ok(Json(ApiResponse::ok(TokenCreatedResponse {
        id: 0,
        name: "client-token".to_string(),
        token,
        scopes: notifyhub_common::constants::ChannelType::ALL.to_vec(),
        rate_limit: 100,
        expires_at: Some(expires_at),
    })))
}

#[derive(sqlx::FromRow)]
struct TokenRow {
    id: i64,
    user_id: Option<i64>,
    name: String,
    token: String,
    scopes: String,
    rate_limit: i64,
    ip_whitelist: Option<String>,
    enabled: i32,
    expires_at: Option<i64>,
    last_used_at: Option<i64>,
    created_at: i64,
}

impl From<TokenRow> for ApiToken {
    fn from(r: TokenRow) -> Self {
        ApiToken {
            id: r.id,
            name: r.name,
            token: r.token,
            scopes: serde_json::from_str(&r.scopes).unwrap_or_default(),
            rate_limit: r.rate_limit as u32,
            ip_whitelist: r.ip_whitelist.and_then(|s| serde_json::from_str(&s).ok()),
            enabled: r.enabled != 0,
            last_used_at: r.last_used_at,
            created_at: r.created_at,
        }
    }
}
