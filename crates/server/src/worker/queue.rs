use sqlx::SqlitePool;
use std::sync::Arc;
use tokio::time::{sleep, Duration};

use notifyhub_common::constants::{WORKER_POLL_INTERVAL_MS, WORKER_BATCH_SIZE, RETRY_DELAYS};
use crate::routes::push::has_no_retention_policy;
use notifyhub_common::constants::ChannelType;

use crate::config::Config;
use crate::routes::push::PushState;
use super::channels;

/// Start the message queue worker loop
pub async fn start(pool: SqlitePool, config: Arc<Config>, push_state: PushState) {
    tracing::info!("[worker] Starting queue worker (batch_size={WORKER_BATCH_SIZE}, poll_interval={WORKER_POLL_INTERVAL_MS}ms)");

    loop {
        match process_batch(&pool, &config, &push_state).await {
            Ok(count) => {
                if count > 0 {
                    tracing::debug!("[worker] Processed {count} messages");
                }
                // If we processed a full batch, there may be more — check immediately
                if count >= WORKER_BATCH_SIZE as usize {
                    continue;
                }
            }
            Err(e) => {
                tracing::error!("[worker] Error processing batch: {e}");
            }
        }

        sleep(Duration::from_millis(WORKER_POLL_INTERVAL_MS)).await;
    }
}

/// Process a batch of queued messages. Returns count of processed messages.
async fn process_batch(pool: &SqlitePool, config: &Config, push_state: &PushState) -> anyhow::Result<usize> {
    let now = chrono::Utc::now().timestamp();

    // Atomically claim a batch of messages using UPDATE...RETURNING
    // (id, channel_type, channel_id, to_address, subject, body, template_vars, tags, url, attachment, format, user_id, topic_id)
    let messages: Vec<(String, String, Option<String>, String, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, Option<String>, String, Option<i64>, Option<String>)> = sqlx::query_as(
        r#"UPDATE messages SET status = 'sending'
           WHERE id IN (
             SELECT id FROM messages
             WHERE ((status = 'queued' AND (scheduled_at IS NULL OR scheduled_at <= ?))
                OR (status = 'failed' AND retry_count < max_retries AND next_retry_at <= ?))
             ORDER BY priority DESC, created_at ASC
             LIMIT ?
           )
           RETURNING id, channel_type, channel_id, to_address, subject, body, template_vars, tags, url, attachment, format, user_id, topic_id"#
    )
    .bind(now)
    .bind(now)
    .bind(WORKER_BATCH_SIZE)
    .fetch_all(pool)
    .await?;

    let count = messages.len();

    for msg in messages {
        let (id, channel_type_str, channel_id, to_address, subject, body, _template_vars, tags, url, attachment, format, user_id, topic_id) = msg;

        let channel_type: ChannelType = channel_type_str.parse().unwrap_or(ChannelType::Push);
        let body_str = body.unwrap_or_default();
        let user_id_val = user_id.unwrap_or(0);

        // Resolve channel config
        let channel_config = if let Some(ref cid) = channel_id {
            let row: Option<(String,)> = sqlx::query_as("SELECT config FROM channels WHERE id = ? AND enabled = 1")
                .bind(cid)
                .fetch_optional(pool)
                .await?;
            row.map(|(c,)| c)
        } else {
            // Try default channel for this type
            let row: Option<(String,)> = sqlx::query_as("SELECT config FROM channels WHERE type = ? AND enabled = 1 AND is_default = 1 LIMIT 1")
                .bind(channel_type.as_str())
                .fetch_optional(pool)
                .await?;
            row.map(|(c,)| c)
        };

        // Send via appropriate channel adapter
        let result = channels::send(
            channel_type,
            channel_config.as_deref(),
            &to_address,
            subject.as_deref(),
            &body_str,
            &tags,
            url.as_deref(),
            &attachment,
            config,
        ).await;

        match result {
            Ok(send_result) => {
                if send_result.success {
                    sqlx::query("UPDATE messages SET status = 'sent', sent_at = ? WHERE id = ?")
                        .bind(now)
                        .bind(&id)
                        .execute(pool)
                        .await?;

                    // Create push messages for connected clients + send FCM
                    if channel_type == ChannelType::Push {
                        create_push_messages(pool, push_state, config, &id, user_id_val, &to_address, subject.as_deref(), &body_str, &tags, &url, &attachment, &format, &topic_id).await;
                    }

                    // Check if user has "don't keep messages" policy (-1)
                    if user_id_val > 0 && has_no_retention_policy(pool, user_id_val).await {
                        sqlx::query("DELETE FROM messages WHERE id = ?")
                            .bind(&id)
                            .execute(pool)
                            .await
                            .ok();
                        tracing::debug!("[worker] Message {id} deleted (user policy: no retention)");
                    }

                    tracing::debug!("[worker] Message {id} sent successfully");
                } else {
                    handle_failure(pool, &id, send_result.error.as_deref(), now).await;
                }
            }
            Err(e) => {
                handle_failure(pool, &id, Some(&e.to_string()), now).await;
            }
        }
    }

    Ok(count)
}

async fn handle_failure(pool: &SqlitePool, id: &str, error: Option<&str>, now: i64) {
    // Get current retry count
    let row: Option<(i64, i64)> = sqlx::query_as("SELECT retry_count, max_retries FROM messages WHERE id = ?")
        .bind(id)
        .fetch_optional(pool)
        .await
        .unwrap_or(None);

    if let Some((retry_count, max_retries)) = row {
        if retry_count + 1 >= max_retries {
            // Dead letter
            if let Err(e) = sqlx::query("UPDATE messages SET status = 'dead', error_message = ?, retry_count = retry_count + 1 WHERE id = ?")
                .bind(error.unwrap_or("max retries exceeded"))
                .bind(id)
                .execute(pool)
                .await
            {
                tracing::error!("[worker] Failed to mark message {id} as dead: {e}");
            }
            tracing::warn!("[worker] Message {id} dead after {retry_count} retries");
        } else {
            // Schedule retry with exponential backoff
            let delay_idx = (retry_count as usize).min(RETRY_DELAYS.len() - 1);
            let next_retry = now + RETRY_DELAYS[delay_idx] as i64;

            if let Err(e) = sqlx::query(
                "UPDATE messages SET status = 'failed', error_message = ?, retry_count = retry_count + 1, next_retry_at = ? WHERE id = ?"
            )
            .bind(error.unwrap_or("unknown error"))
            .bind(next_retry)
            .bind(id)
            .execute(pool)
            .await
            {
                tracing::error!("[worker] Failed to schedule retry for message {id}: {e}");
            }
            tracing::debug!("[worker] Message {id} scheduled for retry #{}", retry_count + 1);
        }
    }
}

async fn create_push_messages(
    pool: &SqlitePool,
    push_state: &PushState,
    config: &Config,
    source_message_id: &str,
    user_id: i64,
    to_address: &str,
    subject: Option<&str>,
    body: &str,
    tags: &Option<String>,
    url: &Option<String>,
    attachment: &Option<String>,
    format: &str,
    topic_id: &Option<String>,
) {
    // Find clients to deliver to (uuid + fcm_token)
    let clients: Vec<(String, Option<String>)> = if to_address == "*" || to_address.is_empty() || to_address == "__broadcast__" {
        sqlx::query_as("SELECT uuid, fcm_token FROM push_clients WHERE user_id = ?")
            .bind(user_id)
            .fetch_all(pool)
            .await
            .unwrap_or_default()
    } else {
        sqlx::query_as("SELECT uuid, fcm_token FROM push_clients WHERE uuid = ? AND user_id = ?")
            .bind(to_address)
            .bind(user_id)
            .fetch_all(pool)
            .await
            .unwrap_or_default()
    };

    let title = subject.unwrap_or("Notification");
    let now = chrono::Utc::now().timestamp();
    let tags_str = tags.as_deref().unwrap_or("[]");

    // Look up topic info if topic_id is present
    let (topic_name, topic_display_name, topic_icon): (Option<String>, Option<String>, Option<String>) = if let Some(ref tid) = topic_id {
        match sqlx::query_as::<_, (Option<String>, Option<String>, Option<String>)>(
            "SELECT name, display_name, icon FROM topics WHERE id = ?"
        )
        .bind(tid)
        .fetch_optional(pool)
        .await {
            Ok(Some(row)) => row,
            Ok(None) => {
                tracing::warn!("[worker] Topic {} not found", tid);
                (None, None, None)
            }
            Err(e) => {
                tracing::warn!("[worker] Failed to query topic: {e}");
                (None, None, None)
            }
        }
    } else {
        (None, None, None)
    };

    if clients.is_empty() {
        tracing::warn!("[worker] No push clients found for user_id={user_id}, to_address={to_address}");
        return;
    }

    tracing::debug!("[worker] Creating push_messages for source={source_message_id}, user_id={user_id}, clients={}", clients.len());

    // Check if FCM is configured
    let fcm_json = channels::get_fcm_config(config);
    if fcm_json.is_some() {
        tracing::debug!("[worker] FCM is configured, will attempt push delivery");
    }

    // Generate push IDs upfront to avoid borrow issues
    let push_ids: Vec<String> = clients.iter().map(|_| uuid::Uuid::new_v4().to_string()).collect();

    // Insert push messages one by one (more reliable than batch for SQLite)
    for (i, (client_uuid, fcm_token)) in clients.iter().enumerate() {
        let result = sqlx::query(
            r#"INSERT INTO push_messages (id, user_id, client_uuid, source_message_id, title, body, level, delivered, created_at, tags, priority, url, attachment, format, topic_id)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"#
        )
        .bind(&push_ids[i])
        .bind(user_id)
        .bind(client_uuid)
        .bind(source_message_id)
        .bind(title)
        .bind(body)
        .bind("info")
        .bind(0i32)
        .bind(now)
        .bind(tags_str)
        .bind(0i64)
        .bind(url)
        .bind(attachment)
        .bind(format)
        .bind(topic_id)
        .execute(pool)
        .await;

        if let Err(e) = result {
            tracing::error!("[worker] Failed to create push_message for client {client_uuid}: {e}");
        }

        // Send FCM data message if token is available
        if let (Some(ref fcm_cfg), Some(token)) = (&fcm_json, fcm_token) {
            if !token.is_empty() {
                let mut data = std::collections::HashMap::new();
                data.insert("id".to_string(), push_ids[i].clone());
                data.insert("title".to_string(), title.to_string());
                data.insert("body".to_string(), body.to_string());
                data.insert("level".to_string(), "info".to_string());
                data.insert("tags".to_string(), tags_str.to_string());
                data.insert("url".to_string(), url.clone().unwrap_or_default());
                data.insert("attachment".to_string(), attachment.clone().unwrap_or_default());
                data.insert("format".to_string(), format.to_string());
                data.insert("topicId".to_string(), topic_id.clone().unwrap_or_default());
                data.insert("topicName".to_string(), topic_name.clone().unwrap_or_default());
                data.insert("topicDisplayName".to_string(), topic_display_name.clone().unwrap_or_default());
                data.insert("topicIcon".to_string(), topic_icon.clone().unwrap_or_default());

                match channels::send_fcm(fcm_cfg, token, data).await {
                    Ok(_) => tracing::debug!("[worker] FCM sent to {}", client_uuid),
                    Err(e) => tracing::warn!("[worker] FCM failed for {}: {e}", client_uuid),
                }
            }
        }
    }

    // Notify connected clients in real-time via SSE/WS
    for (i, (client_uuid, _)) in clients.iter().enumerate() {
        let msg = serde_json::json!({
            "id": push_ids[i],
            "clientUuid": client_uuid,
            "sourceMessageId": source_message_id,
            "title": title,
            "body": body,
            "level": "info",
            "tags": tags_str,
            "priority": 0,
            "url": url,
            "attachment": attachment.as_deref(),
            "format": format,
            "topicId": topic_id,
            "topicName": topic_name,
            "topicDisplayName": topic_display_name,
            "topicIcon": topic_icon,
        });
        push_state.notify(client_uuid, msg).await;
    }
}
