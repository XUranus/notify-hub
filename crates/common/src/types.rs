use serde::{Deserialize, Serialize};

use crate::constants::{
    BodyFormat, ChannelType, MessageStatus, SmsProvider, UserRole,
};

// ── Database Models ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AdminUser {
    pub id: i64,
    pub username: String,
    pub password: String,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct User {
    pub id: i64,
    pub email: String,
    pub username: String,
    pub password: String,
    pub role: UserRole,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiToken {
    pub id: i64,
    pub name: String,
    pub token: String,
    pub scopes: Vec<ChannelType>,
    pub rate_limit: u32,
    pub ip_whitelist: Option<Vec<String>>,
    pub enabled: bool,
    pub last_used_at: Option<i64>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Channel {
    pub id: String,
    #[serde(rename = "type")]
    pub channel_type: ChannelType,
    pub name: String,
    pub config: serde_json::Value,
    pub enabled: bool,
    pub is_default: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Template {
    pub id: String,
    pub name: String,
    pub channel_type: ChannelType,
    pub subject: Option<String>,
    pub body: String,
    pub variables: Option<serde_json::Value>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Topic {
    pub id: String,
    pub user_id: i64,
    pub name: String,
    pub display_name: Option<String>,
    pub icon: Option<String>,
    pub preset: bool,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessageAttachment {
    pub name: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Message {
    pub id: String,
    pub channel_type: ChannelType,
    pub channel_id: Option<String>,
    pub to_address: String,
    pub subject: Option<String>,
    pub body: Option<String>,
    pub template_id: Option<String>,
    pub template_vars: Option<serde_json::Value>,
    pub status: MessageStatus,
    pub retry_count: u32,
    pub max_retries: u32,
    pub next_retry_at: Option<i64>,
    pub error_message: Option<String>,
    pub idempotency_key: Option<String>,
    pub ip_address: Option<String>,
    pub ip_location: Option<String>,
    pub app: Option<String>,
    pub topic_id: Option<String>,
    pub scheduled_at: Option<i64>,
    pub sent_at: Option<i64>,
    pub created_at: i64,
    pub tags: Option<Vec<String>>,
    pub priority: u32,
    pub url: Option<String>,
    pub attachment: Option<MessageAttachment>,
    pub format: BodyFormat,
}

// ── Push Client ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushClient {
    pub id: String,
    pub uuid: String,
    pub user_id: i64,
    pub device_name: Option<String>,
    pub device_os: Option<String>,
    pub device_arch: Option<String>,
    pub desktop: Option<String>,
    pub app_version: Option<String>,
    pub connection_mode: Option<String>,
    pub fcm_token: Option<String>,
    pub last_seen_at: i64,
    pub created_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushMessage {
    pub id: i64,
    pub source_message_id: String,
    pub client_uuid: String,
    pub user_id: i64,
    pub delivered: bool,
    pub created_at: i64,
}

// ── Channel Adapter Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SendResult {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub external_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct MessagePayload {
    pub to: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub subject: Option<String>,
    pub body: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tags: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<u32>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub url: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment: Option<MessageAttachment>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub format: Option<BodyFormat>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub user_id: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub topic_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_id: Option<String>,
}

// ── API Response Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ApiResponse<T: Serialize> {
    pub success: bool,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub data: Option<T>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

impl<T: Serialize> ApiResponse<T> {
    pub fn ok(data: T) -> Self {
        Self { success: true, data: Some(data), error: None }
    }

    pub fn err(msg: impl Into<String>) -> Self {
        Self { success: false, data: None, error: Some(msg.into()) }
    }
}

// For empty success responses
impl ApiResponse<()> {
    pub fn success() -> Self {
        Self { success: true, data: None, error: None }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PaginatedResponse<T: Serialize> {
    pub items: Vec<T>,
    pub total: i64,
    pub page: i64,
    pub page_size: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct StatsOverview {
    pub total_messages: i64,
    pub sent_messages: i64,
    pub failed_messages: i64,
    pub queued_messages: i64,
    pub success_rate: f64,
    pub messages_last_24h: i64,
    pub messages_last_7d: i64,
}

// ── Channel Config Types ──

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct EmailConfig {
    pub host: String,
    pub port: u16,
    #[serde(default = "default_true")]
    pub secure: bool,
    pub username: String,
    pub password: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub from_name: Option<String>,
    pub from_address: String,
}

fn default_true() -> bool {
    true
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TwilioConfig {
    pub provider: SmsProvider,
    pub account_sid: String,
    pub auth_token: String,
    pub from_number: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AliyunSmsConfig {
    pub provider: SmsProvider,
    pub access_key_id: String,
    pub access_key_secret: String,
    pub sign_name: String,
    #[serde(default = "default_aliyun_endpoint")]
    pub endpoint: String,
}

fn default_aliyun_endpoint() -> String {
    "dysmsapi.aliyuncs.com".to_string()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TencentSmsConfig {
    pub provider: SmsProvider,
    pub secret_id: String,
    pub secret_key: String,
    pub sign_name: String,
    pub sdk_app_id: String,
    #[serde(default = "default_tencent_endpoint")]
    pub endpoint: String,
}

fn default_tencent_endpoint() -> String {
    "sms.tencentcloudapi.com".to_string()
}

// ── App Log ──
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppLog {
    pub id: i64,
    pub level: String,
    pub message: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub context: Option<String>,
    pub created_at: i64,
}

// ── Cleanup Log ──
#[derive(Debug, Clone, Serialize, Deserialize, sqlx::FromRow)]
#[serde(rename_all = "camelCase")]
pub struct CleanupLog {
    pub id: i64,
    pub started_at: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub finished_at: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub duration_ms: Option<i64>,
    pub status: String,
    pub expired_attachments: i64,
    pub expired_messages: i64,
    pub trimmed_messages: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub error: Option<String>,
}

// ── User Settings ──
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UserSettings {
    pub user_id: i64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_messages: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub message_expiry_days: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub attachment_expiry_days: Option<i64>,
}

// ── System Settings ──
#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct SystemSettings {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub allow_registration: Option<bool>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_upload_size_mb: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cleanup_interval_hours: Option<i64>,
}
