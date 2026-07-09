use serde::{Deserialize, Serialize};
use validator::Validate;

use crate::constants::{BodyFormat, ChannelType, TokenExpiration, UserRole};

// ── Send Message ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequest {
    pub channel: String,
    #[validate(length(min = 1))]
    pub to: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    #[serde(rename = "template")]
    pub template_name: Option<String>,
    pub variables: Option<serde_json::Value>,
    pub idempotency_key: Option<String>,
    pub topic: Option<String>,
    #[serde(default)]
    pub tags: Vec<String>,
    #[serde(default)]
    pub priority: u32,
    pub url: Option<String>,
    pub delay: Option<String>,
    pub attachment: Option<AttachmentRequest>,
    #[serde(default)]
    pub format: BodyFormat,
    pub scheduled_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentRequest {
    pub name: String,
    pub url: Option<String>,
    pub data: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendBatchRequest {
    pub messages: Vec<SendMessageRequest>,
}

// ── Auth ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct LoginRequest {
    #[validate(email)]
    pub email: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ClientLoginRequest {
    pub email_or_username: String,
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct RegisterRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 6))]
    pub password: String,
}

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateUserRequest {
    #[validate(email)]
    pub email: String,
    #[validate(length(min = 1, max = 50))]
    pub username: String,
    #[validate(length(min = 6))]
    pub password: String,
    #[serde(default = "default_user_role")]
    pub role: UserRole,
}

fn default_user_role() -> UserRole {
    UserRole::User
}

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserRequest {
    pub email: Option<String>,
    pub username: Option<String>,
    pub role: Option<UserRole>,
}

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct ChangePasswordRequest {
    pub old_password: String,
    #[validate(length(min = 6))]
    pub new_password: String,
}

// ── Channel CRUD ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateChannelRequest {
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    #[validate(length(min = 1, max = 32))]
    pub name: String,
    pub config: serde_json::Value,
    #[serde(default = "default_true")]
    pub enabled: bool,
    #[serde(default, rename = "isDefault")]
    pub is_default: bool,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateChannelRequest {
    pub channel_type: Option<ChannelType>,
    pub name: Option<String>,
    pub config: Option<serde_json::Value>,
    pub enabled: Option<bool>,
    pub is_default: Option<bool>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TestChannelConfigRequest {
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    pub config: serde_json::Value,
}

// ── Token CRUD ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateTokenRequest {
    #[validate(length(min = 1, max = 100))]
    pub name: String,
    #[serde(default = "default_scopes")]
    pub scopes: Vec<ChannelType>,
    #[serde(default = "default_rate_limit", rename = "rateLimit")]
    pub rate_limit: u32,
    #[serde(rename = "ipWhitelist")]
    pub ip_whitelist: Option<Vec<String>>,
    #[serde(default, rename = "expiresIn")]
    pub expires_in: TokenExpiration,
}

fn default_scopes() -> Vec<ChannelType> {
    ChannelType::ALL.to_vec()
}

fn default_rate_limit() -> u32 {
    100
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTokenRequest {
    pub name: Option<String>,
    pub scopes: Option<Vec<ChannelType>>,
    pub rate_limit: Option<u32>,
    pub ip_whitelist: Option<Vec<String>>,
    pub enabled: Option<bool>,
}

// ── Template CRUD ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateTemplateRequest {
    #[validate(length(min = 1, max = 32))]
    pub name: String,
    #[serde(rename = "channelType")]
    pub channel_type: ChannelType,
    pub subject: Option<String>,
    pub body: String,
    pub variables: Option<serde_json::Value>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTemplateRequest {
    pub name: Option<String>,
    pub channel_type: Option<ChannelType>,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub variables: Option<serde_json::Value>,
}

// ── Topic CRUD ──

#[derive(Debug, Clone, Deserialize, Validate)]
#[serde(rename_all = "camelCase")]
pub struct CreateTopicRequest {
    #[validate(length(min = 1, max = 50))]
    pub name: String,
    #[validate(length(max = 100))]
    pub display_name: Option<String>,
    pub description: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateTopicRequest {
    pub name: Option<String>,
    pub display_name: Option<Option<String>>,
    pub description: Option<Option<String>>,
    pub icon: Option<Option<String>>,
}

// ── Push Client ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct RegisterPushClientRequest {
    pub uuid: String,
    pub name: Option<String>,
    #[serde(rename = "os")]
    pub device_os: Option<String>,
    pub arch: Option<String>,
    pub desktop: Option<String>,
    #[serde(rename = "appVersion")]
    pub app_version: Option<String>,
    pub fcm_token: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdatePushClientRequest {
    pub uuid: Option<String>,
    pub name: Option<String>,
    pub fcm_token: Option<String>,
    pub desktop: Option<String>,
    #[serde(rename = "appVersion")]
    pub app_version: Option<String>,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AckPushRequest {
    pub message_ids: Vec<String>,
    pub uuid: Option<String>,
}

// ── User Settings ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateUserSettingsRequest {
    pub max_messages: Option<i64>,
    pub message_expiry_days: Option<i64>,
    pub attachment_expiry_days: Option<i64>,
}

// ── System Settings ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateSystemSettingsRequest {
    pub attachment_max_file_size: Option<i64>,
    pub attachment_max_total_size: Option<i64>,
    pub max_messages_per_user: Option<i64>,
    pub cleanup_interval_minutes: Option<i64>,
}

// ── Log Settings ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UpdateLogSettingsRequest {
    pub level: Option<String>,
    pub retention_days: Option<i64>,
}

// ── Client Token Generation ──

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct GenerateClientTokenRequest {
    pub device_name: Option<String>,
}

// ── API Response ──

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResponse {
    #[serde(rename = "messageId")]
    pub message_id: String,
    pub status: String,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct TokenCreatedResponse {
    pub id: i64,
    pub name: String,
    pub token: String,
    pub scopes: Vec<ChannelType>,
    pub rate_limit: u32,
    pub expires_at: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LoginResponse {
    pub token: String,
    pub user: UserInfo,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UserInfo {
    pub id: i64,
    pub email: String,
    pub username: String,
    pub role: UserRole,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DailyStats {
    pub date: String,
    pub total: i64,
    pub sent: i64,
    pub failed: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ChannelStats {
    pub channel_type: ChannelType,
    pub count: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AttachmentStats {
    pub total_count: i64,
    pub total_size: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct UploadQuota {
    pub used: i64,
    pub limit: i64,
}

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogSettings {
    pub level: String,
    pub retention_days: i64,
}
