use notifyhub_common::constants::ChannelType;
use notifyhub_common::types::SendResult;

use crate::config::Config;

/// Send a message through the appropriate channel adapter
pub async fn send(
    channel_type: ChannelType,
    config: Option<&str>,
    to: &str,
    subject: Option<&str>,
    body: &str,
    _tags: &Option<String>,
    _url: Option<&str>,
    _attachment: &Option<String>,
    app_config: &Config,
) -> anyhow::Result<SendResult> {
    match channel_type {
        ChannelType::Email => send_email(config, to, subject.unwrap_or(""), body).await,
        ChannelType::Sms => send_sms(config, to, subject, body).await,
        ChannelType::Push => {
            // Push messages are delivered via SSE/WS/Poll (push_messages table).
            // FCM delivery for Android is handled separately.
            if let Some(fcm_json) = get_fcm_config(app_config) {
                match send_fcm(&fcm_json, to, subject.unwrap_or("Notification"), body, app_config).await {
                    Ok(result) => return Ok(result),
                    Err(e) => tracing::warn!("[fcm] FCM send failed, falling back to poll: {e}"),
                }
            }
            Ok(SendResult { success: true, external_id: None, error: None })
        }
    }
}

// ── Email (SMTP via lettre) ──

async fn send_email(config: Option<&str>, to: &str, subject: &str, body: &str) -> anyhow::Result<SendResult> {
    let config_str = config.ok_or_else(|| anyhow::anyhow!("no email channel configured"))?;
    let cfg: serde_json::Value = serde_json::from_str(config_str)?;

    let host = cfg.get("host").and_then(|v| v.as_str()).unwrap_or("localhost");
    let port = cfg.get("port").and_then(|v| v.as_u64()).unwrap_or(587) as u16;
    let username = cfg.get("username").and_then(|v| v.as_str()).unwrap_or("");
    let password = cfg.get("password").and_then(|v| v.as_str()).unwrap_or("");
    let from_address = cfg.get("fromAddress").and_then(|v| v.as_str()).unwrap_or(username);
    let from_name = cfg.get("fromName").and_then(|v| v.as_str()).unwrap_or("NotifyHub");
    let secure = cfg.get("secure").and_then(|v| v.as_bool()).unwrap_or(true);

    use lettre::message::header::ContentType;
    use lettre::transport::smtp::authentication::Credentials;
    use lettre::{Message, SmtpTransport, Transport};

    let email = Message::builder()
        .from(format!("{from_name} <{from_address}>").parse()?)
        .to(to.parse()?)
        .subject(subject)
        .header(ContentType::TEXT_HTML)
        .body(body.to_string())?;

    let creds = Credentials::new(username.to_string(), password.to_string());

    let transport = if secure {
        SmtpTransport::relay(host)?.port(port).credentials(creds).build()
    } else {
        SmtpTransport::builder_dangerous(host).port(port).credentials(creds).build()
    };

    match transport.send(&email) {
        Ok(_) => Ok(SendResult { success: true, external_id: None, error: None }),
        Err(e) => Ok(SendResult { success: false, external_id: None, error: Some(e.to_string()) }),
    }
}

// ── SMS Router ──

async fn send_sms(config: Option<&str>, to: &str, subject: Option<&str>, body: &str) -> anyhow::Result<SendResult> {
    let config_str = config.ok_or_else(|| anyhow::anyhow!("no SMS channel configured"))?;
    let cfg: serde_json::Value = serde_json::from_str(config_str)?;

    let provider = cfg.get("provider").and_then(|v| v.as_str()).unwrap_or("twilio");

    match provider {
        "twilio" => send_twilio(&cfg, to, body).await,
        "aliyun" => send_aliyun_sms(&cfg, to, subject.unwrap_or(""), body).await,
        "tencent" => send_tencent_sms(&cfg, to, subject.unwrap_or(""), body).await,
        _ => Ok(SendResult { success: false, external_id: None, error: Some(format!("unknown SMS provider: {provider}")) }),
    }
}

// ── Twilio SMS ──

async fn send_twilio(cfg: &serde_json::Value, to: &str, body: &str) -> anyhow::Result<SendResult> {
    let account_sid = cfg.get("accountSid").and_then(|v| v.as_str()).unwrap_or("");
    let auth_token = cfg.get("authToken").and_then(|v| v.as_str()).unwrap_or("");
    let from_number = cfg.get("fromNumber").and_then(|v| v.as_str()).unwrap_or("");

    let url = format!("https://api.twilio.com/2010-04-01/Accounts/{account_sid}/Messages.json");

    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .basic_auth(account_sid, Some(auth_token))
        .form(&[("To", to), ("From", from_number), ("Body", body)])
        .send()
        .await?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        let sid = data.get("sid").and_then(|v| v.as_str()).map(String::from);
        Ok(SendResult { success: true, external_id: sid, error: None })
    } else {
        let err = resp.text().await.unwrap_or_else(|_| "unknown error".to_string());
        Ok(SendResult { success: false, external_id: None, error: Some(err) })
    }
}

// ── Aliyun SMS (HMAC-SHA1 signature) ──

async fn send_aliyun_sms(cfg: &serde_json::Value, to: &str, template_code: &str, body: &str) -> anyhow::Result<SendResult> {
    let access_key_id = cfg.get("accessKeyId").and_then(|v| v.as_str()).unwrap_or("");
    let access_key_secret = cfg.get("accessKeySecret").and_then(|v| v.as_str()).unwrap_or("");
    let sign_name = cfg.get("signName").and_then(|v| v.as_str()).unwrap_or("");
    let endpoint = cfg.get("endpoint").and_then(|v| v.as_str()).unwrap_or("dysmsapi.aliyuncs.com");

    use hmac::{Hmac, Mac};
    use sha1::Sha1;
    type HmacSha1 = Hmac<Sha1>;

    let nonce = uuid::Uuid::new_v4().to_string();
    let timestamp = chrono::Utc::now().format("%Y-%m-%dT%H:%M:%SZ").to_string();

    // body = JSON array of template params, or wrap as single param
    let template_param = if body.starts_with('[') {
        body.to_string()
    } else {
        serde_json::to_string(&[body]).unwrap_or_else(|_| format!("[\"{}\"]", body.replace('"', "\\\"")))
    };

    let mut params: Vec<(&str, String)> = vec![
        ("Action", "SendSms".to_string()),
        ("Version", "2017-05-25".to_string()),
        ("Format", "JSON".to_string()),
        ("AccessKeyId", access_key_id.to_string()),
        ("SignatureMethod", "HMAC-SHA1".to_string()),
        ("Timestamp", timestamp),
        ("SignatureVersion", "1.0".to_string()),
        ("SignatureNonce", nonce),
        ("PhoneNumbers", to.to_string()),
        ("SignName", sign_name.to_string()),
        ("TemplateCode", template_code.to_string()),
        ("TemplateParam", template_param),
    ];

    params.sort_by(|a, b| a.0.cmp(b.0));

    let canonical_query: String = params.iter()
        .map(|(k, v)| format!("{}={}", urlencoding::encode(k), urlencoding::encode(v)))
        .collect::<Vec<_>>()
        .join("&");

    let string_to_sign = format!("GET&{}&{}",
        urlencoding::encode("/"),
        urlencoding::encode(&canonical_query)
    );

    let mut mac = HmacSha1::new_from_slice(format!("{access_key_secret}&").as_bytes())
        .map_err(|e| anyhow::anyhow!("HMAC error: {e}"))?;
    mac.update(string_to_sign.as_bytes());
    let signature = base64::Engine::encode(&base64::engine::general_purpose::STANDARD, mac.finalize().into_bytes());

    let url = format!("https://{endpoint}/?{canonical_query}&Signature={}", urlencoding::encode(&signature));

    let client = reqwest::Client::new();
    let resp = client.get(&url).send().await?;
    let data: serde_json::Value = resp.json().await?;

    let code = data.get("Code").and_then(|v| v.as_str()).unwrap_or("Unknown");
    if code == "OK" {
        let biz_id = data.get("BizId").and_then(|v| v.as_str()).map(String::from);
        Ok(SendResult { success: true, external_id: biz_id, error: None })
    } else {
        let msg = data.get("Message").and_then(|v| v.as_str()).unwrap_or("unknown error");
        Ok(SendResult { success: false, external_id: None, error: Some(format!("{code}: {msg}")) })
    }
}

// ── Tencent SMS (TC3-HMAC-SHA256 signature) ──

async fn send_tencent_sms(cfg: &serde_json::Value, to: &str, template_id: &str, body: &str) -> anyhow::Result<SendResult> {
    let secret_id = cfg.get("secretId").and_then(|v| v.as_str()).unwrap_or("");
    let secret_key = cfg.get("secretKey").and_then(|v| v.as_str()).unwrap_or("");
    let sign_name = cfg.get("signName").and_then(|v| v.as_str()).unwrap_or("");
    let sdk_app_id = cfg.get("sdkAppId").and_then(|v| v.as_str()).unwrap_or("");
    let endpoint = cfg.get("endpoint").and_then(|v| v.as_str()).unwrap_or("sms.tencentcloudapi.com");

    use hmac::{Hmac, Mac};
    use sha2::{Sha256, Digest};
    type HmacSha256 = Hmac<Sha256>;

    // Parse template params
    let template_param_set: Vec<String> = if body.starts_with('[') {
        serde_json::from_str(body).unwrap_or_else(|_| vec![body.to_string()])
    } else {
        vec![body.to_string()]
    };

    let phone_numbers: Vec<String> = to.split(',').map(|s| s.trim().to_string()).collect();

    let payload = serde_json::json!({
        "SmsSdkAppId": sdk_app_id,
        "SignName": sign_name,
        "TemplateId": template_id,
        "TemplateParamSet": template_param_set,
        "PhoneNumberSet": phone_numbers,
    });
    let payload_str = serde_json::to_string(&payload)?;

    let timestamp = chrono::Utc::now().timestamp();
    let date = chrono::DateTime::from_timestamp(timestamp, 0)
        .map(|d| d.format("%Y-%m-%d").to_string())
        .unwrap_or_default();

    let content_type = "application/json; charset=utf-8";
    let canonical_headers = format!("content-type:{content_type}\nhost:{endpoint}\n");
    let signed_headers = "content-type;host";

    let hashed_payload = {
        let mut hasher = Sha256::new();
        hasher.update(payload_str.as_bytes());
        hex::encode(hasher.finalize())
    };

    let canonical_request = format!(
        "POST\n/\n\n{canonical_headers}\n{signed_headers}\n{hashed_payload}"
    );

    let credential_scope = format!("{date}/sms/tc3_request");
    let hashed_canonical_request = {
        let mut hasher = Sha256::new();
        hasher.update(canonical_request.as_bytes());
        hex::encode(hasher.finalize())
    };
    let string_to_sign = format!("TC3-HMAC-SHA256\n{timestamp}\n{credential_scope}\n{hashed_canonical_request}");

    // Signing
    let secret_date = {
        let mut mac = HmacSha256::new_from_slice(format!("TC3{secret_key}").as_bytes())?;
        mac.update(date.as_bytes());
        mac.finalize().into_bytes()
    };
    let secret_service = {
        let mut mac = HmacSha256::new_from_slice(&secret_date)?;
        mac.update(b"sms");
        mac.finalize().into_bytes()
    };
    let secret_signing = {
        let mut mac = HmacSha256::new_from_slice(&secret_service)?;
        mac.update(b"tc3_request");
        mac.finalize().into_bytes()
    };
    let signature = {
        let mut mac = HmacSha256::new_from_slice(&secret_signing)?;
        mac.update(string_to_sign.as_bytes());
        hex::encode(mac.finalize().into_bytes())
    };

    let authorization = format!("TC3-HMAC-SHA256 Credential={secret_id}/{credential_scope}, SignedHeaders={signed_headers}, Signature={signature}");

    let client = reqwest::Client::new();
    let resp = client
        .post(format!("https://{endpoint}"))
        .header("Content-Type", content_type)
        .header("Host", endpoint)
        .header("X-TC-Action", "SendSms")
        .header("X-TC-Version", "2021-01-11")
        .header("X-TC-Timestamp", timestamp.to_string())
        .header("Authorization", authorization)
        .body(payload_str)
        .send()
        .await?;

    let data: serde_json::Value = resp.json().await?;

    let send_status = data.pointer("/Response/SendStatusSet/0");
    let code = send_status.and_then(|s| s.get("Code")).and_then(|v| v.as_str());

    if code == Some("Ok") {
        let serial_no = send_status.and_then(|s| s.get("SerialNo")).and_then(|v| v.as_str()).map(String::from);
        Ok(SendResult { success: true, external_id: serial_no, error: None })
    } else {
        let msg = send_status.and_then(|s| s.get("Message")).and_then(|v| v.as_str())
            .or_else(|| data.pointer("/Response/Error/Message").and_then(|v| v.as_str()))
            .unwrap_or("unknown error");
        Ok(SendResult { success: false, external_id: None, error: Some(msg.to_string()) })
    }
}

// ── FCM Push (HTTP v1 API with service account) ──

fn get_fcm_config(config: &Config) -> Option<String> {
    if let Some(ref path) = config.fcm_service_account_path {
        std::fs::read_to_string(path).ok()
    } else {
        config.fcm_service_account_json.clone()
    }
}

async fn get_fcm_access_token(service_account_json: &str) -> anyhow::Result<String> {
    use jsonwebtoken::{encode, Algorithm, Header};

    let sa: serde_json::Value = serde_json::from_str(service_account_json)?;
    let client_email = sa.get("client_email").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("missing client_email"))?;
    let private_key = sa.get("private_key").and_then(|v| v.as_str()).ok_or_else(|| anyhow::anyhow!("missing private_key"))?;
    let token_uri = sa.get("token_uri").and_then(|v| v.as_str()).unwrap_or("https://oauth2.googleapis.com/token");

    let now = chrono::Utc::now().timestamp();

    #[derive(serde::Serialize)]
    struct Claims {
        iss: String,
        scope: String,
        aud: String,
        iat: i64,
        exp: i64,
    }

    let claims = Claims {
        iss: client_email.to_string(),
        scope: "https://www.googleapis.com/auth/firebase.messaging".to_string(),
        aud: token_uri.to_string(),
        iat: now,
        exp: now + 3600,
    };

    // Decode PEM private key
    let pem = private_key
        .replace("-----BEGIN PRIVATE KEY-----", "")
        .replace("-----END PRIVATE KEY-----", "")
        .replace('\n', "")
        .replace('\r', "");
    let key_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, &pem)?;
    let encoding_key = jsonwebtoken::EncodingKey::from_rsa_pem(&key_bytes)?;

    let jwt = encode(&Header::new(Algorithm::RS256), &claims, &encoding_key)?;

    // Exchange JWT for access token
    let client = reqwest::Client::new();
    let resp = client
        .post(token_uri)
        .form(&[
            ("grant_type", "urn:ietf:params:oauth:grant-type:jwt-bearer"),
            ("assertion", &jwt),
        ])
        .send()
        .await?;

    let data: serde_json::Value = resp.json().await?;
    let access_token = data.get("access_token").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("no access_token in response: {:?}", data))?;

    Ok(access_token.to_string())
}

async fn send_fcm(
    service_account_json: &str,
    to: &str,
    title: &str,
    body: &str,
    _config: &Config,
) -> anyhow::Result<SendResult> {
    let sa: serde_json::Value = serde_json::from_str(service_account_json)?;
    let project_id = sa.get("project_id").and_then(|v| v.as_str())
        .ok_or_else(|| anyhow::anyhow!("missing project_id"))?;

    let access_token = get_fcm_access_token(service_account_json).await?;

    let is_broadcast = to.is_empty() || to == "*";

    let message = if is_broadcast {
        serde_json::json!({
            "message": {
                "topic": "all",
                "notification": { "title": title, "body": body },
                "android": { "priority": "high" }
            }
        })
    } else {
        serde_json::json!({
            "message": {
                "token": to,
                "notification": { "title": title, "body": body },
                "android": { "priority": "high" }
            }
        })
    };

    let url = format!("https://fcm.googleapis.com/v1/projects/{project_id}/messages:send");
    let client = reqwest::Client::new();
    let resp = client
        .post(&url)
        .header("Authorization", format!("Bearer {access_token}"))
        .json(&message)
        .send()
        .await?;

    if resp.status().is_success() {
        let data: serde_json::Value = resp.json().await?;
        let name = data.get("name").and_then(|v| v.as_str()).map(String::from);
        Ok(SendResult { success: true, external_id: name, error: None })
    } else {
        let status = resp.status();
        let err = resp.text().await.unwrap_or_default();
        Ok(SendResult { success: false, external_id: None, error: Some(format!("FCM {status}: {err}")) })
    }
}
