use reqwest::Client;
use reqwest::multipart;
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
    jwt: String,
}

impl ApiClient {
    pub fn new(base_url: &str, jwt: &str) -> Self {
        Self {
            client: Client::new(),
            base_url: base_url.trim_end_matches('/').to_string(),
            jwt: jwt.to_string(),
        }
    }

    /// Login with username/email + password. Returns JWT token on success.
    pub async fn login(base_url: &str, username: &str, password: &str) -> Result<String, String> {
        let client = Client::new();
        let url = format!("{}/api/auth/login", base_url.trim_end_matches('/'));
        let body = serde_json::json!({
            "emailOrUsername": username,
            "password": password,
        });

        let resp = client
            .post(&url)
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!(
                "HTTP {}: {}",
                status,
                api_resp.error.unwrap_or_else(|| "login failed".to_string())
            ));
        }

        let token = api_resp
            .data
            .and_then(|d| d.get("token").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .ok_or_else(|| "No token in response".to_string())?;

        Ok(token)
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
            .header("Authorization", format!("Bearer {}", self.jwt))
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

    pub async fn send(
        &self,
        channel: &str,
        to: &str,
        subject: Option<&str>,
        body: Option<&str>,
        tags: Option<Vec<String>>,
        priority: Option<i32>,
        url: Option<&str>,
        format: Option<&str>,
        attachment: Option<serde_json::Value>,
    ) -> Result<String, String> {
        let url_str = format!("{}/api/v1/send", self.base_url);
        let mut payload = serde_json::json!({
            "channel": channel,
            "to": to,
        });
        if let Some(s) = subject { payload["subject"] = serde_json::json!(s); }
        if let Some(b) = body { payload["body"] = serde_json::json!(b); }
        if let Some(t) = tags { payload["tags"] = serde_json::json!(t); }
        if let Some(p) = priority { payload["priority"] = serde_json::json!(p); }
        if let Some(u) = url { payload["url"] = serde_json::json!(u); }
        if let Some(f) = format { payload["format"] = serde_json::json!(f); }
        if let Some(a) = attachment { payload["attachment"] = a; }

        let resp = self
            .client
            .post(&url_str)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .header("Content-Type", "application/json")
            .json(&payload)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!(
                "HTTP {}: {}",
                status,
                api_resp.error.unwrap_or_else(|| "send failed".to_string())
            ));
        }
        Ok(api_resp.data
            .and_then(|d| d.get("messageId").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| "ok".to_string()))
    }

    pub async fn update_client(&self, uuid: &str, name: &str) -> Result<bool, String> {
        let url = format!("{}/api/v1/push/client", self.base_url);
        let body = serde_json::json!({
            "uuid": uuid,
            "name": name,
        });

        let resp = self
            .client
            .patch(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<()> = resp.json().await.map_err(|e| e.to_string())?;
        if !status.is_success() || !api_resp.success {
            return Err(format!("HTTP {}: update client failed", status));
        }
        Ok(true)
    }

    pub async fn list_clients(&self) -> Result<Vec<serde_json::Value>, String> {
        let url = format!("{}/api/v2/clients", self.base_url);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<Vec<serde_json::Value>> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!(
                "HTTP {}: {}",
                status,
                api_resp.error.unwrap_or_else(|| "list clients failed".to_string())
            ));
        }
        Ok(api_resp.data.unwrap_or_default())
    }

    pub async fn upload_file(
        &self,
        file_name: &str,
        file_bytes: Vec<u8>,
        mime_type: &str,
    ) -> Result<serde_json::Value, String> {
        let url = format!("{}/api/v1/upload", self.base_url);

        let file_part = multipart::Part::bytes(file_bytes)
            .file_name(file_name.to_string())
            .mime_str(mime_type)
            .map_err(|e| e.to_string())?;

        let form = multipart::Form::new().part("file", file_part);

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .multipart(form)
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!(
                "HTTP {}: {}",
                status,
                api_resp.error.unwrap_or_else(|| "upload failed".to_string())
            ));
        }
        Ok(api_resp.data.unwrap_or(serde_json::json!(null)))
    }

    /// Poll for push messages. Returns (status_code, messages).
    /// If status_code is 401, the JWT has expired.
    pub async fn poll_with_status(&self, uuid: &str) -> Result<(u16, Vec<PushMessage>), String> {
        let url = format!("{}/api/v1/push/poll?uuid={}", self.base_url, uuid);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .send()
            .await
            .map_err(|e| e.to_string())?;

        let status = resp.status();
        let code = status.as_u16();

        if code == 401 {
            return Ok((401, vec![]));
        }

        let api_resp: ApiResponse<Vec<PushMessage>> =
            resp.json().await.map_err(|e| e.to_string())?;

        if !status.is_success() || !api_resp.success {
            return Err(format!("HTTP {}: {}", code, api_resp.error.unwrap_or_default()));
        }
        Ok((code, api_resp.data.unwrap_or_default()))
    }

    pub async fn poll(&self, uuid: &str) -> Result<Vec<PushMessage>, String> {
        let (_, messages) = self.poll_with_status(uuid).await?;
        Ok(messages)
    }
}
