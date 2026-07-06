use axum::extract::{Path, State};
use axum::routing::get;
use axum::{Json, Router};

use notifyhub_common::error::AppError;
use notifyhub_common::schemas::{CreateTemplateRequest, UpdateTemplateRequest};
use notifyhub_common::types::{ApiResponse, Template};
use notifyhub_common::constants::ChannelType;

use crate::auth::middleware::{AuthUser, require_admin};
use crate::AppState;

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/api/admin/templates", get(list_templates).post(create_template))
        .route("/api/admin/templates/{id}", get(get_template).put(update_template).delete(delete_template))
}

async fn list_templates(
    State(state): State<AppState>,
    auth: AuthUser,
) -> Result<Json<ApiResponse<Vec<Template>>>, AppError> {
    require_admin(&auth)?;

    let rows: Vec<TemplateRow> = sqlx::query_as("SELECT * FROM templates ORDER BY created_at DESC")
        .fetch_all(&state.pool)
        .await?;

    Ok(Json(ApiResponse::ok(rows.into_iter().map(Template::from).collect())))
}

async fn get_template(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<Template>>, AppError> {
    require_admin(&auth)?;

    let row: Option<TemplateRow> = sqlx::query_as("SELECT * FROM templates WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;

    match row {
        Some(r) => Ok(Json(ApiResponse::ok(Template::from(r)))),
        None => Err(AppError::NotFound("template not found".into())),
    }
}

async fn create_template(
    State(state): State<AppState>,
    auth: AuthUser,
    Json(req): Json<CreateTemplateRequest>,
) -> Result<Json<ApiResponse<Template>>, AppError> {
    require_admin(&auth)?;

    let id = uuid::Uuid::new_v4().to_string();
    let now = chrono::Utc::now().timestamp();
    let variables_json = req.variables.map(|v| serde_json::to_string(&v).unwrap_or_default());

    sqlx::query(
        "INSERT INTO templates (id, name, channel_type, subject, body, variables, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(&id)
    .bind(&req.name)
    .bind(req.channel_type.as_str())
    .bind(&req.subject)
    .bind(&req.body)
    .bind(&variables_json)
    .bind(now)
    .execute(&state.pool)
    .await?;

    get_template(State(state), auth, Path(id)).await
}

async fn update_template(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
    Json(req): Json<UpdateTemplateRequest>,
) -> Result<Json<ApiResponse<Template>>, AppError> {
    require_admin(&auth)?;

    let existing: Option<TemplateRow> = sqlx::query_as("SELECT * FROM templates WHERE id = ?")
        .bind(&id)
        .fetch_optional(&state.pool)
        .await?;
    existing.ok_or_else(|| AppError::NotFound("template not found".into()))?;

    if let Some(ref name) = req.name {
        sqlx::query("UPDATE templates SET name = ? WHERE id = ?").bind(name).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ct) = req.channel_type {
        sqlx::query("UPDATE templates SET channel_type = ? WHERE id = ?").bind(ct.as_str()).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref subject) = req.subject {
        sqlx::query("UPDATE templates SET subject = ? WHERE id = ?").bind(subject).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref body) = req.body {
        sqlx::query("UPDATE templates SET body = ? WHERE id = ?").bind(body).bind(&id).execute(&state.pool).await?;
    }
    if let Some(ref variables) = req.variables {
        let v = serde_json::to_string(variables)?;
        sqlx::query("UPDATE templates SET variables = ? WHERE id = ?").bind(&v).bind(&id).execute(&state.pool).await?;
    }

    get_template(State(state), auth, Path(id)).await
}

async fn delete_template(
    State(state): State<AppState>,
    auth: AuthUser,
    Path(id): Path<String>,
) -> Result<Json<ApiResponse<()>>, AppError> {
    require_admin(&auth)?;

    let result = sqlx::query("DELETE FROM templates WHERE id = ?")
        .bind(&id).execute(&state.pool).await?;

    if result.rows_affected() == 0 {
        return Err(AppError::NotFound("template not found".into()));
    }
    Ok(Json(ApiResponse::success()))
}

#[derive(sqlx::FromRow)]
struct TemplateRow {
    id: String,
    name: String,
    channel_type: String,
    subject: Option<String>,
    body: String,
    variables: Option<String>,
    created_at: i64,
}

impl From<TemplateRow> for Template {
    fn from(r: TemplateRow) -> Self {
        Template {
            id: r.id,
            name: r.name,
            channel_type: r.channel_type.parse().unwrap_or(ChannelType::Push),
            subject: r.subject,
            body: r.body,
            variables: r.variables.and_then(|s| serde_json::from_str(&s).ok()),
            created_at: r.created_at,
        }
    }
}
