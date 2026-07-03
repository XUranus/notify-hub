use reqwest::Client;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct PushMessage {
    pub id: String,
    pub client_uuid: Option<String>,
    pub title: String,
    pub body: String,
    pub level: String,
    pub delivered: bool,
    pub created_at: Option<String>,
    // Extended fields
    pub tags: Option<String>,
    pub priority: Option<i32>,
    pub url: Option<String>,
    pub attachment: Option<String>,
    pub format: Option<String>,
}

#[derive(Debug, Deserialize)]
struct ApiResponse<T> {
    success: bool,
    data: Option<T>,
    error: Option<String>,
}

pub struct ApiClient {
    client: Client,
    base_url: String,
    api_key: String,
}

impl ApiClient {
    pub fn new(base_url: &str, api_key: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            api_key: api_key.to_string(),
        }
    }

    pub async fn register(
        &self,
        uuid: &str,
        name: &str,
        os: &str,
        arch: &str,
        desktop: &str,
        app_version: &str,
    ) -> Result<bool, String> {
        let url = format!("{}/api/v1/push/register", self.base_url);
        let body = serde_json::json!({
            "uuid": uuid,
            "name": name,
            "os": os,
            "arch": arch,
            "desktop": desktop,
            "appVersion": app_version,
        });

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<()> = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() || !api_resp.success {
            return Err(format!("HTTP {}: register failed", status));
        }
        Ok(true)
    }

    pub async fn poll(&self, uuid: &str) -> Result<Vec<PushMessage>, String> {
        let url = format!("{}/api/v1/push/poll?uuid={}", self.base_url, uuid);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.api_key))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<Vec<PushMessage>> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!("HTTP {}: {}", status, api_resp.error.unwrap_or_default()));
        }
        Ok(api_resp.data.unwrap_or_default())
    }
}
