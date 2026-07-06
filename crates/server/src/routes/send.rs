use axum::extract::State;
use axum::routing::post;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{SendMessageRequest, SendBatchRequest};
use notifyhub_common::types::ApiResponse;
use notifyhub_common::schemas::SendResponse;

use crate::auth::middleware::DualAuth;
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/v1/send", post(send_message))
        .route("/api/v1/send/batch", post(send_batch))
}

async fn send_message(
    State(state): State<AppState>,
    auth: DualAuth,
    Json(req): Json<SendMessageRequest>,
) -> Result<Json<ApiResponse<SendResponse>>, AppError> {
    let user_id: i64 = auth.claims.sub.parse()
        .map_err(|_| AppError::BadRequest("invalid user id".into()))?;

    // Validate that either body or template is provided
    if req.body.is_none() && req.template_name.is_none() {
        return Err(AppError::BadRequest("either body or template is required".into()));
    }

    // Check idempotency
    if let Some(ref key) = req.idempotency_key {
        let existing: Option<(String, String)> = sqlx::query_as(
            "SELECT id, status FROM messages WHERE idempotency_key = ?",
        )
        .bind(key)
        .fetch_optional(&state.pool)
        .await?;

        if let Some((id, status)) = existing {
            return Ok(Json(ApiResponse::ok(SendResponse { message_id: id, status })));
        }
    }

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();

    // Resolve template if specified
    let (body, subject) = if let Some(ref tpl_name) = req.template_name {
        let tpl: Option<(String, Option<String>, String)> = sqlx::query_as(
            "SELECT id, subject, body FROM templates WHERE name = ?",
        )
        .bind(tpl_name)
        .fetch_optional(&state.pool)
        .await?;

        match tpl {
            Some((_tpl_id, tpl_subject, tpl_body)) => {
                let rendered_body = render_template(&tpl_body, req.variables.as_ref());
                let rendered_subject = tpl_subject.map(|s| render_template(&s, req.variables.as_ref()));
                (Some(rendered_body), rendered_subject.or(req.subject.clone()))
            }
            None => return Err(AppError::NotFound(format!("template '{}' not found", tpl_name))),
        }
    } else {
        (req.body.clone(), req.subject.clone())
    };

    let body_str = body.unwrap_or_default();

    // Find default channel for this type
    let channel_type: notifyhub_common::constants::ChannelType = req.channel.parse()
        .map_err(|e: String| AppError::BadRequest(e))?;

    let channel_id: Option<String> = sqlx::query_scalar(
        "SELECT id FROM channels WHERE type = ? AND enabled = 1 AND is_default = 1 LIMIT 1",
    )
    .bind(channel_type.as_str())
    .fetch_optional(&state.pool)
    .await?;

    // Parse scheduled time
    let scheduled_at: Option<i64> = if let Some(ref sched) = req.scheduled_at {
        Some(parse_datetime(sched)?)
    } else {
        None
    };

    // Handle delay
    let delay_at: Option<i64> = if let Some(ref delay) = req.delay {
        Some(parse_delay(delay, now)?)
    } else {
        None
    };

    let effective_scheduled = scheduled_at.or(delay_at);

    let tags_json = serde_json::to_string(&req.tags).unwrap_or_else(|_| "[]".to_string());
    let attachment_json = req.attachment.as_ref().map(|a| serde_json::to_string(a).unwrap_or_default());

    // Resolve topic ID if specified
    let topic_id: Option<String> = if let Some(ref topic_name) = req.topic {
        sqlx::query_scalar("SELECT id FROM topics WHERE name = ? AND user_id = ?")
            .bind(topic_name)
            .bind(user_id)
            .fetch_optional(&state.pool)
            .await?
    } else {
        None
    };

    sqlx::query(
        r#"INSERT INTO messages
           (id, user_id, channel_type, channel_id, to_address, subject, body,
            template_id, status, idempotency_key, ip_address, topic_id,
            scheduled_at, created_at, tags, priority, url, attachment, format)
           VALUES (?, ?, ?, ?, ?, ?, ?, NULL, ?, ?, NULL, ?, ?, ?, ?, ?, ?, ?, ?)"#,
    )
    .bind(&id)
    .bind(user_id)
    .bind(channel_type.as_str())
    .bind(&channel_id)
    .bind(&req.to)
    .bind(&subject)
    .bind(&body_str)
    .bind(if effective_scheduled.is_some() { "queued" } else { "queued" })
    .bind(&req.idempotency_key)
    .bind(&topic_id)
    .bind(effective_scheduled)
    .bind(now)
    .bind(&tags_json)
    .bind(req.priority)
    .bind(&req.url)
    .bind(&attachment_json)
    .bind(req.format.as_str())
    .execute(&state.pool)
    .await?;

    Ok(Json(ApiResponse::ok(SendResponse {
        message_id: id,
        status: "queued".to_string(),
    })))
}

async fn send_batch(
    State(state): State<AppState>,
    auth: DualAuth,
    Json(req): Json<SendBatchRequest>,
) -> Result<Json<ApiResponse<Vec<SendResponse>>>, AppError> {
    let mut results = Vec::with_capacity(req.messages.len());
    for msg in req.messages {
        match send_message(State(state.clone()), auth.clone(), Json(msg)).await {
            Ok(resp) => {
                if let Some(data) = resp.0.data {
                    results.push(data);
                }
            }
            Err(e) => {
                results.push(SendResponse {
                    message_id: String::new(),
                    status: format!("error: {}", e),
                });
            }
        }
    }
    Ok(Json(ApiResponse::ok(results)))
}

/// Simple template rendering: replaces {{var}} and {{var | default:"value"}}
fn render_template(template: &str, variables: Option<&serde_json::Value>) -> String {
    let mut result = template.to_string();
    let vars = match variables {
        Some(serde_json::Value::Object(m)) => m,
        _ => return result,
    };

    // Match {{var}} and {{var | default:"value"}}
    let re = regex::Regex::new(r#"\{\{\s*(\w+)(?:\s*\|\s*default:"([^"]*)")?\s*\}\}"#).unwrap();
    result = re.replace_all(&result, |caps: &regex::Captures| {
        let var_name = &caps[1];
        let default = caps.get(2).map(|m| m.as_str()).unwrap_or("");
        vars.get(var_name)
            .and_then(|v| v.as_str())
            .unwrap_or(default)
            .to_string()
    }).to_string();

    result
}

/// Parse a datetime string like "2024-01-15 14:30:00" to Unix timestamp
fn parse_datetime(s: &str) -> Result<i64, AppError> {
    chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%d %H:%M:%S")
        .map(|dt| dt.and_utc().timestamp())
        .or_else(|_| {
            chrono::NaiveDateTime::parse_from_str(s, "%Y-%m-%dT%H:%M:%S")
                .map(|dt| dt.and_utc().timestamp())
        })
        .map_err(|_| AppError::BadRequest(format!("invalid datetime format: {s}")))
}

/// Parse a delay string like "30m", "1h", "1d", "1w" to a future timestamp
fn parse_delay(delay: &str, now: i64) -> Result<i64, AppError> {
    let re = regex::Regex::new(r"^(\d+)([smhdw])$").unwrap();
    let caps = re.captures(delay)
        .ok_or_else(|| AppError::BadRequest(format!("invalid delay format: {delay}")))?;

    let amount: i64 = caps[1].parse()
        .map_err(|_| AppError::BadRequest(format!("invalid delay number: {}", &caps[1])))?;

    let multiplier = match &caps[2] {
        "s" => 1,
        "m" => 60,
        "h" => 3600,
        "d" => 86400,
        "w" => 604800,
        _ => return Err(AppError::BadRequest(format!("invalid delay unit: {}", &caps[2]))),
    };

    Ok(now + amount * multiplier)
}
