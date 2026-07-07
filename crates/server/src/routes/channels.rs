use axum::extract::{Path, Query, State};
use axum::routing::{get, post};
use axum::{Json, Router};
use serde::Deserialize;

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{CreateChannelRequest, UpdateChannelRequest, TestChannelConfigRequest};
use notifyhub_common::types::{ApiResponse, Channel};
use notifyhub_common::constants::ChannelType;

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/channels", get(list_channels).post(create_channel))
        .route("/api/admin/channels/test-config", post(test_config))
        .route("/api/admin/channels/{id}", get(get_channel).put(update_channel).delete(delete_channel))
        .route("/api/admin/channels/{id}/test", post(test_channel))
}

#[derive(Deserialize)]
struct ChannelListParams {
    #[serde(rename = "type")]
    channel_type: Option<String>,
}

/// Mask sensitive fields in channel config (password, secret, key, token fields)
fn mask_config(mut config: serde_json::Value) -> serde_json::Value {
    if let Some(obj) = config.as_object_mut() {
        for (key, value) in obj.iter_mut() {
            let lower = key.to_lowercase();
            if lower.contains("password") || lower.contains("secret")
                || lower.contains("key") || lower.contains("token") {
                if let Some(s) = value.as_str() {
                    if s.len() > 4 {
                        *value = serde_json::Value::String(
                            format!("{}****", &s[..4])
                        );
                    } else {
                        *value = serde_json::Value::String("****".to_string());
                    }
                }
            }
        }
    }
    config
}

async fn list_channels(
    State(state): State<AppState>,
    auth: AuthUser,
    Query(params): Query<ChannelListParams>,
) -> Result<Json<ApiResponse<Vec<Channel>>>, AppError> {
    require_admin(&auth)?;

    let rows: Vec<ChannelRow> = if let Some(ref ct) = params.channel_type {
        sqlx::query_as("SELECT * FROM channels WHERE type = ? ORDER BY created_at DESC")
            .bind(ct)
            .fetch_all(&state.pool)
            .await?
    } else {
        sqlx::query_as("SELECT * FROM channels ORDER BY created_at DESC")
            .fetch_all(&state.pool)
            .await?
    };

    let channels: Vec<Channel> = rows.into_iter().map(|r| {
        let mut ch = Channel::from(r);
        ch.config = mask_config(ch.config);
        ch
    }).collect();
    Ok(Json(ApiResponse::ok(channels)))
}

async fn get_channel(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Channel>>, AppError> {
    require_admin(&auth)?;

    let row: Option<ChannelRow> = sqlx::query_as("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Channel::from(r)))),
        None => Err(AppError::NotFound("channel not found".into())),
    }
}

async fn create_channel(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateChannelRequest>,
) -> Result<Json<ApiResponse<Channel>>, AppError> {
    require_admin(&auth)?;

    // Check name uniqueness
    let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM channels WHERE name = ?")
        .bind(&req.name).fetch_one(&state.pool).await?;
    if exists.0 > 0 {
        return Err(AppError::Conflict("channel name already exists".into()));
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let config_json = serde_json::to_string(&req.config)?;

    // If setting as default, unset other defaults for this type
    if req.is_default {
        sqlx::query("UPDATE channels SET is_default = 0 WHERE type = ?")
            .bind(req.channel_type.as_str())
            .execute(&state.pool)
            .await?;
    }

    sqlx::query(
        "INSERT INTO channels (id, type, name, config, enabled, is_default, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(req.channel_type.as_str())
    .bind(&req.name)
    .bind(&config_json)
    .bind(req.enabled as i32)
    .bind(req.is_default as i32)
    .bind(now)
    .bind(now)
    .execute(&state.pool)
    .await?;

    get_channel(State(state), auth, Path(id)).await
}

async fn update_channel(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateChannelRequest>,
) -> Result<Json<ApiResponse<Channel>>, AppError> {
    require_admin(&auth)?;

    // Check existence
    let existing: Option<ChannelRow> = sqlx::query_as("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    existing.ok_or_else(|| AppError::NotFound("channel not found".into()))?;

    let now = chrono::Utc::now().timestamp();

    if let Some(ref name) = req.name {
        // Check name uniqueness (excluding this channel)
        let exists: (i64,) = sqlx::query_as("SELECT COUNT(*) FROM channels WHERE name = ? AND id != ?")
            .bind(name).bind(&id).fetch_one(&state.pool).await?;
        if exists.0 > 0 {
            return Err(AppError::Conflict("channel name already exists".into()));
        }
        sqlx::query("UPDATE channels SET name = ?, updated_at = ? WHERE id = ?")
            .bind(name).bind(now).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref config) = req.config {
        let config_json = serde_json::to_string(config)?;
        sqlx::query("UPDATE channels SET config = ?, updated_at = ? WHERE id = ?")
            .bind(&config_json).bind(now).bind(&id).execute(&state.pool).await?;
    }
    if let Some(enabled) = req.enabled {
        sqlx::query("UPDATE channels SET enabled = ?, updated_at = ? WHERE id = ?")
            .bind(enabled as i32).bind(now).bind(&id).execute(&state.pool).await?;
    }
    if let Some(is_default) = req.is_default {
        if is_default {
            // Get channel type to unset other defaults
            let ct: Option<String> = sqlx::query_scalar("SELECT type FROM channels WHERE id = ?")
                .bind(&id).fetch_optional(&state.pool).await?;
            if let Some(ct) = ct {
                sqlx::query("UPDATE channels SET is_default = 0 WHERE type = ? AND id != ?")
                    .bind(&ct).bind(&id).execute(&state.pool).await?;
            }
        }
        sqlx::query("UPDATE channels SET is_default = ?, updated_at = ? WHERE id = ?")
            .bind(is_default as i32).bind(now).bind(&id).execute(&state.pool).await?;
    }

    get_channel(State(state), auth, Path(id)).await
}

async fn delete_channel(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;

    let result = sqlx::query("DELETE FROM channels WHERE id = ?")
        .bind(&id)
        .execute(&state.pool)
        .await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("channel not found".into()));
    }

    Ok(Json(ApiResponse::success()))
}

async fn test_config(
    State(_state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<TestChannelConfigRequest>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    let config_json = serde_json::to_string(&req.config)
        .map_err(|e| AppError::BadRequest(format!("invalid config: {e}")))?;

    match req.channel_type {
        ChannelType::Email => test_email_channel(&config_json).await,
        ChannelType::Sms => test_sms_channel(&config_json).await,
        ChannelType::Push => Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": true,
            "message": "Push channel does not require connectivity test"
        })))),
    }
}

async fn test_channel(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    require_admin(&auth)?;

    let row: Option<ChannelRow> = sqlx::query_as("SELECT * FROM channels WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;

    let channel = row.ok_or_else(|| AppError::NotFound("channel not found".into()))?;
    let channel_type: ChannelType = channel.channel_type.parse().unwrap_or(ChannelType::Push);

    match channel_type {
        ChannelType::Email => test_email_channel(&channel.config).await,
        ChannelType::Sms => test_sms_channel(&channel.config).await,
        ChannelType::Push => Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": true,
            "message": "Push channel does not require connectivity test"
        })))),
    }
}

async fn test_email_channel(config_str: &str) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let cfg: serde_json::Value = serde_json::from_str(config_str)
        .map_err(|e| AppError::BadRequest(format!("invalid channel config: {e}")))?;

    let host = cfg.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
    let port = cfg.get("port").and_then(|v| v.as_u64()).unwrap_or(587) as u16;
    let username = cfg.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let password = cfg.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let secure = cfg.get("secure").and_then(|v| v.as_bool()).unwrap_or(true);

    use lettre::transport::smtp::authentication::Credentials;
    use lettre::SmtpTransport;

    let creds = Credentials::new(username.to_string(), password.to_string());

    let transport = if secure {
        SmtpTransport::relay(host)
            .map_err(|e| AppError::BadRequest(format!("SMTP relay error: {e}")))?
            .port(port)
            .credentials(creds)
            .build()
    } else {
        SmtpTransport::builder_dangerous(host)
            .port(port)
            .credentials(creds)
            .build()
    };

    // Test connection by trying to send a NOOP command
    match transport.test_connection() {
        Ok(true) => Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": true,
            "message": format!("SMTP connection to {}:{} successful", host, port)
        })))),
        Ok(false) => Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": false,
            "message": format!("SMTP connection to {}:{} failed", host, port)
        })))),
        Err(e) => Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": false,
            "message": format!("SMTP connection error: {}", e)
        })))),
    }
}

async fn test_sms_channel(config_str: &str) -> Result<Json<ApiResponse<serde_json::Value>>, AppError> {
    let cfg: serde_json::Value = serde_json::from_str(config_str)
        .map_err(|e| AppError::BadRequest(format!("invalid channel config: {e}")))?;

    let provider = cfg.get("provider").and_then(|v| v.as_str()).unwrap_or("twilio");

    // For SMS, we just validate the config is present, actual sending test would cost money
    let has_credentials = match provider {
        "twilio" => {
            let sid = cfg.get("accountSid").and_then(|v| v.as_str());
            let token = cfg.get("authToken").and_then(|v| v.as_str());
            sid.is_some() && !sid.unwrap().is_empty() && token.is_some() && !token.unwrap().is_empty()
        }
        "aliyun" => {
            let key = cfg.get("accessKeyId").and_then(|v| v.as_str());
            let secret = cfg.get("accessKeySecret").and_then(|v| v.as_str());
            key.is_some() && !key.unwrap().is_empty() && secret.is_some() && !secret.unwrap().is_empty()
        }
        "tencent" => {
            let id = cfg.get("secretId").and_then(|v| v.as_str());
            let key = cfg.get("secretKey").and_then(|v| v.as_str());
            id.is_some() && !id.unwrap().is_empty() && key.is_some() && !key.unwrap().is_empty()
        }
        _ => false,
    };

    if has_credentials {
        Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": true,
            "message": format!("SMS channel ({provider}) configuration is valid")
        }))))
    } else {
        Ok(Json(ApiResponse::ok(serde_json::json!({
            "success": false,
            "message": format!("SMS channel ({provider}) is missing credentials")
        }))))
    }
}

#[derive(sqlx::FromRow)]
struct ChannelRow {
    id: String,
    #[sqlx(rename = "type")]
    channel_type: String,
    name: String,
    config: String,
    enabled: i32,
    is_default: i32,
    created_at: i64,
    updated_at: i64,
}

impl From<ChannelRow> for Channel {
    fn from(r: ChannelRow) -> Self {
        Channel {
            id: r.id,
            channel_type: r.channel_type.parse().unwrap_or(ChannelType::Push),
            name: r.name,
            config: serde_json::from_str(&r.config).unwrap_or(serde_json::Value::Null),
            enabled: r.enabled != 0,
            is_default: r.is_default != 0,
            created_at: r.created_at,
            updated_at: r.updated_at,
        }
    }
}
