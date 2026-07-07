use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushMessage {
    pub id: Option<String>,
    #[serde(alias = "clientUuid")]
    pub client_uuid: Option<String>,
    #[serde(alias = "sourceMessageId")]
    pub source_message_id: Option<String>,
    pub title: Option<String>,
    pub body: Option<String>,
    pub level: Option<String>,
    pub tags: Option<String>,
    pub priority: Option<u32>,
    pub url: Option<String>,
    pub attachment: Option<String>,
    pub format: Option<String>,
    #[serde(alias = "topicId")]
    pub topic_id: Option<String>,
    #[serde(alias = "topicName")]
    pub topic_name: Option<String>,
    #[serde(alias = "topicDisplayName")]
    pub topic_display_name: Option<String>,
    #[serde(alias = "topicIcon")]
    pub topic_icon: Option<String>,
}

pub struct NotifyClient {
    pub server: String,
    pub token: String,
    pub http: reqwest::Client,
}

impl NotifyClient {
    pub fn new(server: &str, token: &str) -> Self {
        Self {
            server: server.trim_end_matches('/').to_string(),
            token: token.to_string(),
            http: reqwest::Client::new(),
        }
    }

    pub fn auth_header(&self) -> String {
        format!("Bearer {}", self.token)
    }

    pub async fn send(&self, body: &serde_json::Value) -> anyhow::Result<ApiResponse<serde_json::Value>> {
        let resp = self.http
            .post(format!("{}/api/v1/send", self.server))
            .header("Authorization", self.auth_header())
            .header("Content-Type", "application/json")
            .json(body)
            .send()
            .await?;

        let data: ApiResponse<serde_json::Value> = resp.json().await?;
        Ok(data)
    }

    pub async fn get_message(&self, id: &str) -> anyhow::Result<ApiResponse<serde_json::Value>> {
        let resp = self.http
            .get(format!("{}/api/v1/messages/{}", self.server, id))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        let data: ApiResponse<serde_json::Value> = resp.json().await?;
        Ok(data)
    }

    /// Login with username/password, returns JWT token
    pub async fn login(server: &str, username: &str, password: &str) -> anyhow::Result<String> {
        let http = reqwest::Client::new();
        let resp = http
            .post(format!("{}/api/auth/login", server.trim_end_matches('/')))
            .json(&serde_json::json!({ "emailOrUsername": username, "password": password }))
            .send()
            .await?;

        let status = resp.status();
        let body: serde_json::Value = resp.json().await?;

        if !status.is_success() {
            let err = body.get("error").and_then(|v| v.as_str()).unwrap_or("login failed");
            anyhow::bail!("Login failed ({status}): {err}");
        }

        let token = body.get("data")
            .and_then(|d| d.get("token"))
            .and_then(|v| v.as_str())
            .ok_or_else(|| anyhow::anyhow!("No token in login response: {:?}", body))?;

        Ok(token.to_string())
    }

    /// Register this CLI as a push client
    pub async fn register_client(&self, uuid: &str, name: &str, os: &str, arch: &str) -> anyhow::Result<()> {
        let resp = self.http
            .post(format!("{}/api/v1/push/register", self.server))
            .header("Authorization", self.auth_header())
            .json(&serde_json::json!({
                "uuid": uuid,
                "name": name,
                "os": os,
                "arch": arch,
                "desktop": "cli",
                "appVersion": env!("CARGO_PKG_VERSION"),
            }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let err = body.get("error").and_then(|v| v.as_str()).unwrap_or("register failed");
            anyhow::bail!("Register failed ({status}): {err}");
        }
        Ok(())
    }

    /// Poll for undelivered messages
    pub async fn poll(&self, uuid: &str, limit: u32) -> anyhow::Result<(u16, Vec<PushMessage>)> {
        let resp = self.http
            .get(format!("{}/api/v1/push/poll?uuid={}&limit={}", self.server, uuid, limit))
            .header("Authorization", self.auth_header())
            .send()
            .await?;

        let status = resp.status().as_u16();
        if status == 401 {
            return Ok((401, vec![]));
        }

        let body: serde_json::Value = resp.json().await?;
        let messages = if let Some(data) = body.get("data") {
            serde_json::from_value(data.clone()).unwrap_or_default()
        } else {
            vec![]
        };

        Ok((status, messages))
    }

    /// ACK message IDs to mark as delivered
    pub async fn ack(&self, uuid: &str, message_ids: &[String]) -> anyhow::Result<()> {
        let resp = self.http
            .post(format!("{}/api/v1/push/ack", self.server))
            .header("Authorization", self.auth_header())
            .json(&serde_json::json!({ "uuid": uuid, "messageIds": message_ids }))
            .send()
            .await?;

        if !resp.status().is_success() {
            let status = resp.status();
            let body: serde_json::Value = resp.json().await.unwrap_or_default();
            let err = body.get("error").and_then(|v| v.as_str()).unwrap_or("ack failed");
            anyhow::bail!("ACK failed ({status}): {err}");
        }
        Ok(())
    }

    /// Get the server URL for SSE/WS connections
    pub fn server_url(&self) -> &str {
        &self.server
    }
}
