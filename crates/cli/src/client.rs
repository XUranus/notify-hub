use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize)]
pub struct ApiResponse<T> {
    pub success: bool,
    pub data: Option<T>,
    pub error: Option<String>,
}

pub struct NotifyClient {
    server: String,
    token: String,
    http: reqwest::Client,
}

impl NotifyClient {
    pub fn new(server: &str, token: &str) -> Self {
        Self {
            server: server.trim_end_matches('/').to_string(),
            token: token.to_string(),
            http: reqwest::Client::new(),
        }
    }

    pub async fn send(&self, body: &serde_json::Value) -> anyhow::Result<ApiResponse<serde_json::Value>> {
        let resp = self.http
            .post(format!("{}/api/v1/send", self.server))
            .header("Authorization", format!("Bearer {}", self.token))
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
            .header("Authorization", format!("Bearer {}", self.token))
            .send()
            .await?;

        let data: ApiResponse<serde_json::Value> = resp.json().await?;
        Ok(data)
    }
}
