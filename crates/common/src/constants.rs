use serde::{Deserialize, Serialize};

// ── Channel types ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ChannelType {
    Email,
    Sms,
    Push,
}

impl ChannelType {
    pub const ALL: &'static [ChannelType] = &[ChannelType::Email, ChannelType::Sms, ChannelType::Push];

    pub fn as_str(&self) -> &'static str {
        match self {
            ChannelType::Email => "email",
            ChannelType::Sms => "sms",
            ChannelType::Push => "push",
        }
    }
}

impl std::fmt::Display for ChannelType {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for ChannelType {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "email" => Ok(ChannelType::Email),
            "sms" => Ok(ChannelType::Sms),
            "push" => Ok(ChannelType::Push),
            _ => Err(format!("invalid channel type: {s}")),
        }
    }
}

// ── Message statuses ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum MessageStatus {
    Queued,
    Sending,
    Sent,
    Delivered,
    Failed,
    Dead,
}

impl MessageStatus {
    pub const ALL: &'static [MessageStatus] = &[
        MessageStatus::Queued,
        MessageStatus::Sending,
        MessageStatus::Sent,
        MessageStatus::Delivered,
        MessageStatus::Failed,
        MessageStatus::Dead,
    ];

    pub fn as_str(&self) -> &'static str {
        match self {
            MessageStatus::Queued => "queued",
            MessageStatus::Sending => "sending",
            MessageStatus::Sent => "sent",
            MessageStatus::Delivered => "delivered",
            MessageStatus::Failed => "failed",
            MessageStatus::Dead => "dead",
        }
    }
}

impl std::fmt::Display for MessageStatus {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        f.write_str(self.as_str())
    }
}

impl std::str::FromStr for MessageStatus {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "queued" => Ok(MessageStatus::Queued),
            "sending" => Ok(MessageStatus::Sending),
            "sent" => Ok(MessageStatus::Sent),
            "delivered" => Ok(MessageStatus::Delivered),
            "failed" => Ok(MessageStatus::Failed),
            "dead" => Ok(MessageStatus::Dead),
            _ => Err(format!("invalid message status: {s}")),
        }
    }
}

// ── SMS providers ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum SmsProvider {
    Twilio,
    Aliyun,
    Tencent,
}

impl SmsProvider {
    pub fn as_str(&self) -> &'static str {
        match self {
            SmsProvider::Twilio => "twilio",
            SmsProvider::Aliyun => "aliyun",
            SmsProvider::Tencent => "tencent",
        }
    }
}

impl std::str::FromStr for SmsProvider {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "twilio" => Ok(SmsProvider::Twilio),
            "aliyun" => Ok(SmsProvider::Aliyun),
            "tencent" => Ok(SmsProvider::Tencent),
            _ => Err(format!("invalid SMS provider: {s}")),
        }
    }
}

// ── Constants ──
/// Exponential backoff retry delays in seconds: 1s, 5s, 30s, 5min, 30min
pub const RETRY_DELAYS: &[u64] = &[1, 5, 30, 300, 1800];
pub const DEFAULT_MAX_RETRIES: u32 = 5;
pub const DEFAULT_RATE_LIMIT: u32 = 100; // requests/min
pub const WORKER_POLL_INTERVAL_MS: u64 = 1000;
pub const WORKER_BATCH_SIZE: i64 = 10;
pub const API_TOKEN_PREFIX: &str = "nfkey_";
pub const JWT_EXPIRY_HOURS: u64 = 24;
pub const CLIENT_JWT_EXPIRY_DAYS: u64 = 90;
pub const DEFAULT_ADMIN_USERNAME: &str = "admin";
pub const DEFAULT_ADMIN_PASSWORD: &str = "admin123";

// ── Body format ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum BodyFormat {
    Text,
    Markdown,
    Html,
    Json,
}

impl BodyFormat {
    pub fn as_str(&self) -> &'static str {
        match self {
            BodyFormat::Text => "text",
            BodyFormat::Markdown => "markdown",
            BodyFormat::Html => "html",
            BodyFormat::Json => "json",
        }
    }
}

impl Default for BodyFormat {
    fn default() -> Self {
        BodyFormat::Text
    }
}

impl std::str::FromStr for BodyFormat {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "text" => Ok(BodyFormat::Text),
            "markdown" => Ok(BodyFormat::Markdown),
            "html" => Ok(BodyFormat::Html),
            "json" => Ok(BodyFormat::Json),
            _ => Err(format!("invalid body format: {s}")),
        }
    }
}

// ── User roles ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum UserRole {
    Admin,
    User,
}

impl UserRole {
    pub fn as_str(&self) -> &'static str {
        match self {
            UserRole::Admin => "admin",
            UserRole::User => "user",
        }
    }
}

impl std::str::FromStr for UserRole {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s.to_lowercase().as_str() {
            "admin" => Ok(UserRole::Admin),
            "user" => Ok(UserRole::User),
            _ => Err(format!("invalid user role: {s}")),
        }
    }
}

// ── Token expiration ──
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum TokenExpiration {
    #[serde(rename = "1d")]
    OneDay,
    #[serde(rename = "7d")]
    SevenDays,
    #[serde(rename = "30d")]
    ThirtyDays,
    #[serde(rename = "365d")]
    OneYear,
    Never,
}

impl TokenExpiration {
    pub fn as_str(&self) -> &'static str {
        match self {
            TokenExpiration::OneDay => "1d",
            TokenExpiration::SevenDays => "7d",
            TokenExpiration::ThirtyDays => "30d",
            TokenExpiration::OneYear => "365d",
            TokenExpiration::Never => "never",
        }
    }

    /// Returns expiration in milliseconds, 0 for never
    pub fn as_ms(&self) -> u64 {
        match self {
            TokenExpiration::OneDay => 86_400_000,
            TokenExpiration::SevenDays => 604_800_000,
            TokenExpiration::ThirtyDays => 2_592_000_000,
            TokenExpiration::OneYear => 31_536_000_000,
            TokenExpiration::Never => 0,
        }
    }
}

impl Default for TokenExpiration {
    fn default() -> Self {
        TokenExpiration::Never
    }
}

impl std::str::FromStr for TokenExpiration {
    type Err = String;
    fn from_str(s: &str) -> Result<Self, Self::Err> {
        match s {
            "1d" => Ok(TokenExpiration::OneDay),
            "7d" => Ok(TokenExpiration::SevenDays),
            "30d" => Ok(TokenExpiration::ThirtyDays),
            "365d" => Ok(TokenExpiration::OneYear),
            "never" => Ok(TokenExpiration::Never),
            _ => Err(format!("invalid token expiration: {s}")),
        }
    }
}
