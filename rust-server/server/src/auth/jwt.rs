use chrono::Utc;
use jsonwebtoken::{decode, encode, DecodingKey, EncodingKey, Header, Validation};
use serde::{Deserialize, Serialize};

use notifyhub_common::constants::{JWT_EXPIRY_HOURS, CLIENT_JWT_EXPIRY_DAYS};
use notifyhub_common::error::AppError;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Claims {
    pub sub: String,      // user ID as string
    pub email: String,
    pub username: String,
    pub role: String,     // "admin" | "user"
    pub exp: usize,
    pub iat: usize,
}

/// Create a JWT token for admin/web login (24h expiry)
pub fn create_token(
    user_id: i64,
    email: &str,
    username: &str,
    role: &str,
    secret: &str,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp: now + (JWT_EXPIRY_HOURS as usize * 3600),
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("JWT encode error: {e}")))
}

/// Create a client JWT token (90-day expiry)
pub fn create_client_token(
    user_id: i64,
    email: &str,
    username: &str,
    role: &str,
    secret: &str,
) -> Result<String, AppError> {
    let now = Utc::now().timestamp() as usize;
    let claims = Claims {
        sub: user_id.to_string(),
        email: email.to_string(),
        username: username.to_string(),
        role: role.to_string(),
        exp: now + (CLIENT_JWT_EXPIRY_DAYS as usize * 86400),
        iat: now,
    };

    encode(
        &Header::default(),
        &claims,
        &EncodingKey::from_secret(secret.as_bytes()),
    )
    .map_err(|e| AppError::Internal(format!("JWT encode error: {e}")))
}

/// Validate a JWT token and return claims
pub fn validate_token(token: &str, secret: &str) -> Result<Claims, AppError> {
    decode::<Claims>(
        token,
        &DecodingKey::from_secret(secret.as_bytes()),
        &Validation::default(),
    )
    .map(|data| data.claims)
    .map_err(|e| AppError::Unauthorized(format!("invalid token: {e}")))
}
