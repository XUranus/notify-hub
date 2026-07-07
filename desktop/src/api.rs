use log::{debug, error, info, warn};
use reqwest::Client;
use reqwest::multipart;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct PushMessage {
    pub id: String,
    #[serde(default)]
    pub client_uuid: Option<String>,
    pub title: String,
    pub body: String,
    pub level: String,
    #[serde(default)]
    pub delivered: bool,
    #[serde(default)]
    pub created_at: Option<String>,
    // Extended fields
    #[serde(default)]
    pub tags: Option<String>,
    #[serde(default)]
    pub priority: Option<i32>,
    #[serde(default)]
    pub url: Option<String>,
    #[serde(default)]
    pub attachment: Option<String>,
    #[serde(default)]
    pub format: Option<String>,
    #[serde(default)]
    pub topic_id: Option<String>,
    #[serde(default)]
    pub topic_name: Option<String>,
    #[serde(default)]
    pub topic_display_name: Option<String>,
    #[serde(default)]
    pub topic_icon: Option<String>,
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
        debug!("[api] Client created for {}", base_url);
        Self {
            client: Client::builder()
                .timeout(std::time::Duration::from_secs(30))
                .build()
                .unwrap_or_default(),
            base_url: base_url.trim_end_matches('/').to_string(),
            jwt: jwt.to_string(),
        }
    }

    /// Login with username/email + password. Returns JWT token on success.
    pub async fn login(base_url: &str, username: &str, password: &str) -> Result<String, String> {
        info!("[api] Login attempt: url={}, username={}", base_url, username);
        let client = Client::builder()
            .timeout(std::time::Duration::from_secs(30))
            .build()
            .unwrap_or_default();
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
            .map_err(|e| { error!("[api] Login request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| { error!("[api] Login response parse failed: {}", e); e.to_string() })?;

        if !status.is_success() || !api_resp.success {
            let msg = api_resp.error.unwrap_or_else(|| "login failed".to_string());
            error!("[api] Login HTTP error: {} - {}", status, msg);
            return Err(format!("HTTP {}: {}", status, msg));
        }

        let token = api_resp
            .data
            .and_then(|d| d.get("token").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .ok_or_else(|| "No token in response".to_string())?;

        info!("[api] Login successful");
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
        info!("[api] Register: uuid={}", uuid);
        let url = format!("{}/api/user/push/register", self.base_url);
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
            .map_err(|e| { error!("[api] Register request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> = resp.json().await.map_err(|e| { error!("[api] Register response parse failed: {}", e); e.to_string() })?;
        if !status.is_success() || !api_resp.success {
            error!("[api] Register HTTP error: {}", status);
            return Err(format!("HTTP {}: register failed", status));
        }
        info!("[api] Register successful");
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
        info!("[api] Send message: channel={}, to={}", channel, to);
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
            .map_err(|e| { error!("[api] Send request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| { error!("[api] Send response parse failed: {}", e); e.to_string() })?;

        if !status.is_success() || !api_resp.success {
            let msg = api_resp.error.unwrap_or_else(|| "send failed".to_string());
            error!("[api] Send HTTP error: {} - {}", status, msg);
            return Err(format!("HTTP {}: {}", status, msg));
        }
        info!("[api] Message sent successfully");
        Ok(api_resp.data
            .and_then(|d| d.get("messageId").and_then(|v| v.as_str()).map(|s| s.to_string()))
            .unwrap_or_else(|| "ok".to_string()))
    }

    pub async fn update_client(&self, uuid: &str, name: &str) -> Result<bool, String> {
        info!("[api] Update client name: uuid={}", uuid);
        let url = format!("{}/api/user/push/client", self.base_url);
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
            .map_err(|e| { error!("[api] Update client request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> = resp.json().await.map_err(|e| { error!("[api] Update client response parse failed: {}", e); e.to_string() })?;
        if !status.is_success() || !api_resp.success {
            error!("[api] Update client HTTP error: {}", status);
            return Err(format!("HTTP {}: update client failed", status));
        }
        info!("[api] Client name updated");
        Ok(true)
    }

    pub async fn list_clients(&self) -> Result<Vec<serde_json::Value>, String> {
        debug!("[api] Listing clients");
        let url = format!("{}/api/user/clients", self.base_url);
        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .send()
            .await
            .map_err(|e| { error!("[api] List clients request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<Vec<serde_json::Value>> =
            resp.json().await.map_err(|e| { error!("[api] List clients response parse failed: {}", e); e.to_string() })?;

        if !status.is_success() || !api_resp.success {
            let msg = api_resp.error.unwrap_or_else(|| "list clients failed".to_string());
            error!("[api] List clients HTTP error: {} - {}", status, msg);
            return Err(format!("HTTP {}: {}", status, msg));
        }
        let clients = api_resp.data.unwrap_or_default();
        debug!("[api] Listed {} clients", clients.len());
        Ok(clients)
    }

    #[allow(dead_code)]
    pub async fn upload_file(
        &self,
        file_name: &str,
        file_bytes: Vec<u8>,
        mime_type: &str,
    ) -> Result<serde_json::Value, String> {
        info!("[api] Upload file: name={}, mime={}", file_name, mime_type);
        let url = format!("{}/api/user/upload", self.base_url);

        let file_part = multipart::Part::bytes(file_bytes)
            .file_name(file_name.to_string())
            .mime_str(mime_type)
            .map_err(|e| { error!("[api] Upload file part creation failed: {}", e); e.to_string() })?;

        let form = multipart::Form::new().part("file", file_part);

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .multipart(form)
            .send()
            .await
            .map_err(|e| { error!("[api] Upload request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let api_resp: ApiResponse<serde_json::Value> =
            resp.json().await.map_err(|e| { error!("[api] Upload response parse failed: {}", e); e.to_string() })?;

        if !status.is_success() || !api_resp.success {
            let msg = api_resp.error.unwrap_or_else(|| "upload failed".to_string());
            error!("[api] Upload HTTP error: {} - {}", status, msg);
            return Err(format!("HTTP {}: {}", status, msg));
        }
        info!("[api] Upload successful");
        Ok(api_resp.data.unwrap_or(serde_json::json!(null)))
    }

    /// Poll for push messages. Returns (status_code, messages).
    /// If status_code is 401, the JWT has expired.
    pub async fn poll_with_status(&self, uuid: &str) -> Result<(u16, Vec<PushMessage>), String> {
        debug!("[api] Polling: uuid={}", uuid);
        let url = format!("{}/api/user/push/poll?uuid={}", self.base_url, uuid);

        let resp = self
            .client
            .get(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .send()
            .await
            .map_err(|e| { error!("[api] Poll request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        let code = status.as_u16();

        if code == 401 {
            warn!("[api] Poll 401: JWT expired");
            return Ok((401, vec![]));
        }

        let api_resp: ApiResponse<Vec<PushMessage>> =
            resp.json().await.map_err(|e| { error!("[api] Poll response parse failed: {}", e); e.to_string() })?;

        if !status.is_success() || !api_resp.success {
            error!("[api] Poll HTTP error: {} - {}", code, api_resp.error.as_deref().unwrap_or("unknown"));
            return Err(format!("HTTP {}: {}", code, api_resp.error.unwrap_or_default()));
        }
        let messages = api_resp.data.unwrap_or_default();
        debug!("[api] Poll response: status={}, messages={}", code, messages.len());
        Ok((code, messages))
    }

    #[allow(dead_code)]
    pub async fn poll(&self, uuid: &str) -> Result<Vec<PushMessage>, String> {
        let (_, messages) = self.poll_with_status(uuid).await?;
        Ok(messages)
    }

    /// Acknowledge received push messages so they won't be re-delivered.
    pub async fn ack(&self, uuid: &str, message_ids: &[String]) -> Result<(), String> {
        debug!("[api] ACK: uuid={}, count={}", uuid, message_ids.len());
        let url = format!("{}/api/user/push/ack", self.base_url);
        let body = serde_json::json!({
            "uuid": uuid,
            "messageIds": message_ids,
        });

        let resp = self
            .client
            .post(&url)
            .header("Authorization", format!("Bearer {}", self.jwt))
            .header("Content-Type", "application/json")
            .json(&body)
            .send()
            .await
            .map_err(|e| { error!("[api] ACK request failed: {}", e); e.to_string() })?;

        let status = resp.status();
        if !status.is_success() {
            error!("[api] ACK HTTP error: {}", status);
            return Err(format!("HTTP {}: ack failed", status));
        }
        debug!("[api] ACK successful");
        Ok(())
    }
}
