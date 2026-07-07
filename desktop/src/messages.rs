use log::{debug, error, info, warn};
use rusqlite::{params, Connection};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::Mutex;

const MAX_MESSAGES: usize = 15000;

/// Lock a mutex, recovering from poisoning instead of panicking.
fn lock_mutex<T>(m: &Mutex<T>) -> std::sync::MutexGuard<'_, T> {
    m.lock().unwrap_or_else(|e| e.into_inner())
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMessage {
    pub id: String,
    pub title: String,
    pub body: String,
    pub level: String,
    #[serde(alias = "receivedAt")]
    pub received_at: String,
    #[serde(default)]
    pub read: bool,
    #[serde(default)]
    pub flagged: bool,
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
    #[serde(default, alias = "localImagePath")]
    pub local_image_path: Option<String>,
    #[serde(default, alias = "topicId")]
    pub topic_id: Option<String>,
    #[serde(default, alias = "topicName")]
    pub topic_name: Option<String>,
    #[serde(default, alias = "topicDisplayName")]
    pub topic_display_name: Option<String>,
    #[serde(default, alias = "topicIcon")]
    pub topic_icon: Option<String>,
}

fn db_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("notifyhub-client");
    std::fs::create_dir_all(&dir).ok();
    dir.join("messages.db")
}

fn init_db(conn: &Connection) {
    debug!("[db] Initializing database schema");
    if let Err(e) = conn.execute_batch("PRAGMA journal_mode=WAL;") {
        warn!("[db] Failed to enable WAL mode: {}", e);
    }
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS messages (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            body TEXT NOT NULL,
            level TEXT NOT NULL DEFAULT '',
            received_at TEXT NOT NULL,
            read INTEGER NOT NULL DEFAULT 0,
            flagged INTEGER NOT NULL DEFAULT 0,
            tags TEXT,
            priority INTEGER,
            url TEXT,
            attachment TEXT,
            format TEXT,
            local_image_path TEXT,
            topic_id TEXT,
            topic_name TEXT,
            topic_display_name TEXT,
            topic_icon TEXT
        );
        CREATE INDEX IF NOT EXISTS idx_messages_received_at ON messages(received_at);",
    )
    .expect("failed to create messages table");
}

fn row_to_message(row: &rusqlite::Row) -> rusqlite::Result<LocalMessage> {
    Ok(LocalMessage {
        id: row.get(0)?,
        title: row.get(1)?,
        body: row.get(2)?,
        level: row.get(3)?,
        received_at: row.get(4)?,
        read: row.get::<_, i32>(5)? != 0,
        flagged: row.get::<_, i32>(6)? != 0,
        tags: row.get(7)?,
        priority: row.get(8)?,
        url: row.get(9)?,
        attachment: row.get(10)?,
        format: row.get(11)?,
        local_image_path: row.get(12)?,
        topic_id: row.get(13)?,
        topic_name: row.get(14)?,
        topic_display_name: row.get(15)?,
        topic_icon: row.get(16)?,
    })
}

pub struct MessageStore {
    conn: Mutex<Connection>,
    pub has_new: AtomicBool,
}

impl MessageStore {
    pub fn new() -> Self {
        let path = db_path();
        info!("[db] Opening database: {:?}", path);
        let conn = Connection::open(&path).expect("failed to open messages.db");
        init_db(&conn);
        Self {
            conn: Mutex::new(conn),
            has_new: AtomicBool::new(false),
        }
    }

    /// Adds a message. Returns true if inserted (new), false if duplicate (already exists).
    pub fn add(&self, msg: LocalMessage) -> bool {
        let conn = lock_mutex(&self.conn);
        // Check for duplicate
        let exists: bool = match conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE id = ?1",
            params![msg.id],
            |row| row.get::<_, i64>(0),
        ) {
            Ok(count) => count > 0,
            Err(e) => {
                warn!("[db] Duplicate check query failed for id={}: {}", msg.id, e);
                false
            }
        };
        if exists {
            return false;
        }
        debug!("[db] Adding message: id={}", msg.id);
        if let Err(e) = conn.execute(
            "INSERT OR REPLACE INTO messages (
                id, title, body, level, received_at, read, flagged,
                tags, priority, url, attachment, format,
                local_image_path, topic_id, topic_name, topic_display_name, topic_icon
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
            params![
                msg.id,
                msg.title,
                msg.body,
                msg.level,
                msg.received_at,
                msg.read as i32,
                msg.flagged as i32,
                msg.tags,
                msg.priority,
                msg.url,
                msg.attachment,
                msg.format,
                msg.local_image_path,
                msg.topic_id,
                msg.topic_name,
                msg.topic_display_name,
                msg.topic_icon,
            ],
        ) {
            error!("[db] Failed to insert message: id={}: {}", msg.id, e);
            return false;
        } else {
            debug!("[db] Message stored: id={}", msg.id);
        }
        // Enforce max messages: delete oldest beyond the limit
        if let Err(e) = conn.execute(
            "DELETE FROM messages WHERE id IN (
                SELECT id FROM messages ORDER BY received_at DESC LIMIT -1 OFFSET ?1
            )",
            params![MAX_MESSAGES as i64],
        ) {
            warn!("[db] Failed to enforce max messages: {}", e);
        }
        drop(conn);
        self.has_new.store(true, Ordering::Relaxed);
        true
    }

    pub fn get_all(&self) -> Vec<LocalMessage> {
        debug!("[db] Loading all messages");
        let conn = lock_mutex(&self.conn);
        let mut stmt = conn
            .prepare("SELECT id, title, body, level, received_at, read, flagged, tags, priority, url, attachment, format, local_image_path, topic_id, topic_name, topic_display_name, topic_icon FROM messages ORDER BY received_at DESC")
            .expect("failed to prepare get_all");
        stmt.query_map([], row_to_message)
            .expect("failed to query messages")
            .filter_map(|r| match r {
                Ok(msg) => Some(msg),
                Err(e) => {
                    warn!("[db] Failed to deserialize message row: {}", e);
                    None
                }
            })
            .collect()
    }

    pub fn mark_as_read(&self, id: &str) {
        debug!("[db] Mark as read: id={}", id);
        let conn = lock_mutex(&self.conn);
        if let Err(e) = conn.execute("UPDATE messages SET read = 1 WHERE id = ?1", params![id]) {
            warn!("[db] Failed to mark as read: id={}: {}", id, e);
        }
    }

    pub fn toggle_flag(&self, id: &str) {
        debug!("[db] Toggle flag: id={}", id);
        let conn = lock_mutex(&self.conn);
        if let Err(e) = conn.execute(
            "UPDATE messages SET flagged = CASE WHEN flagged = 0 THEN 1 ELSE 0 END WHERE id = ?1",
            params![id],
        ) {
            warn!("[db] Failed to toggle flag: id={}: {}", id, e);
        }
    }

    pub fn delete_and_return(&self, id: &str) -> Option<LocalMessage> {
        debug!("[db] Delete and return: id={}", id);
        let conn = lock_mutex(&self.conn);
        // Query first
        let msg = {
            let mut stmt = match conn
                .prepare("SELECT id, title, body, level, received_at, read, flagged, tags, priority, url, attachment, format, local_image_path, topic_id, topic_name, topic_display_name, topic_icon FROM messages WHERE id = ?1")
            {
                Ok(stmt) => stmt,
                Err(e) => {
                    warn!("[db] Failed to prepare delete_and_return query: id={}: {}", id, e);
                    return None;
                }
            };
            match stmt.query_row(params![id], row_to_message) {
                Ok(msg) => Some(msg),
                Err(_) => None,
            }
        };
        if msg.is_some() {
            if let Err(e) = conn.execute("DELETE FROM messages WHERE id = ?1", params![id]) {
                warn!("[db] Failed to delete message: id={}: {}", id, e);
            }
        }
        msg
    }

    pub fn insert_at(&self, msg: LocalMessage, index: usize) {
        debug!("[db] Insert at index {}: id={}", index, msg.id);
        let conn = lock_mutex(&self.conn);
        if index == 0 {
            // Insert at the top: set received_at to now so it sorts first
            let effective_received_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
            if let Err(e) = conn.execute(
                "INSERT OR REPLACE INTO messages (
                    id, title, body, level, received_at, read, flagged,
                    tags, priority, url, attachment, format,
                    local_image_path, topic_id, topic_name, topic_display_name, topic_icon
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                params![
                    msg.id,
                    msg.title,
                    msg.body,
                    msg.level,
                    effective_received_at,
                    msg.read as i32,
                    msg.flagged as i32,
                    msg.tags,
                    msg.priority,
                    msg.url,
                    msg.attachment,
                    msg.format,
                    msg.local_image_path,
                    msg.topic_id,
                    msg.topic_name,
                    msg.topic_display_name,
                    msg.topic_icon,
                ],
            ) {
                error!("[db] Failed to insert message at index {}: id={}: {}", index, msg.id, e);
            }
        } else {
            // Insert at a specific position: use current time to ensure unique, valid timestamp
            let effective_received_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S%.3f").to_string();
            if let Err(e) = conn.execute(
                "INSERT OR REPLACE INTO messages (
                    id, title, body, level, received_at, read, flagged,
                    tags, priority, url, attachment, format,
                    local_image_path, topic_id, topic_name, topic_display_name, topic_icon
                ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
                params![
                    msg.id,
                    msg.title,
                    msg.body,
                    msg.level,
                    effective_received_at,
                    msg.read as i32,
                    msg.flagged as i32,
                    msg.tags,
                    msg.priority,
                    msg.url,
                    msg.attachment,
                    msg.format,
                    msg.local_image_path,
                    msg.topic_id,
                    msg.topic_name,
                    msg.topic_display_name,
                    msg.topic_icon,
                ],
            ) {
                error!("[db] Failed to insert message at index {}: id={}: {}", index, msg.id, e);
            }
        }
        // Enforce max messages
        if let Err(e) = conn.execute(
            "DELETE FROM messages WHERE id IN (
                SELECT id FROM messages ORDER BY received_at DESC LIMIT -1 OFFSET ?1
            )",
            params![MAX_MESSAGES as i64],
        ) {
            warn!("[db] Failed to enforce max messages: {}", e);
        }
    }

    pub fn delete(&self, id: &str) {
        debug!("[db] Delete message: id={}", id);
        let conn = lock_mutex(&self.conn);
        if let Err(e) = conn.execute("DELETE FROM messages WHERE id = ?1", params![id]) {
            warn!("[db] Failed to delete message: id={}: {}", id, e);
        }
    }

    pub fn clear(&self) {
        info!("[db] Clear all messages");
        let conn = lock_mutex(&self.conn);
        if let Err(e) = conn.execute("DELETE FROM messages", []) {
            error!("[db] Failed to clear all messages: {}", e);
        }
    }

    pub fn restore(&self, new_msgs: Vec<LocalMessage>) {
        info!("[db] Restore {} messages", new_msgs.len());
        let conn = lock_mutex(&self.conn);
        // Wrap in a transaction for performance (single fsync instead of one per insert)
        if let Err(e) = conn.execute("BEGIN", []) {
            error!("[db] Failed to begin transaction for restore: {}", e);
            return;
        }
        if let Err(e) = conn.execute("DELETE FROM messages", []) {
            error!("[db] Failed to clear messages before restore: {}", e);
        }
        let mut stmt = match conn.prepare(
            "INSERT INTO messages (
                id, title, body, level, received_at, read, flagged,
                tags, priority, url, attachment, format,
                local_image_path, topic_id, topic_name, topic_display_name, topic_icon
            ) VALUES (?1,?2,?3,?4,?5,?6,?7,?8,?9,?10,?11,?12,?13,?14,?15,?16,?17)",
        ) {
            Ok(s) => s,
            Err(e) => {
                error!("[db] Failed to prepare restore insert: {}", e);
                let _ = conn.execute("ROLLBACK", []);
                return;
            }
        };
        let mut count = 0usize;
        for m in &new_msgs {
            if count >= MAX_MESSAGES {
                break;
            }
            if let Err(e) = stmt.execute(params![
                m.id,
                m.title,
                m.body,
                m.level,
                m.received_at,
                m.read as i32,
                m.flagged as i32,
                m.tags,
                m.priority,
                m.url,
                m.attachment,
                m.format,
                m.local_image_path,
                m.topic_id,
                m.topic_name,
                m.topic_display_name,
                m.topic_icon,
            ]) {
                warn!("[db] Failed to restore message: id={}: {}", m.id, e);
            }
            count += 1;
        }
        if let Err(e) = conn.execute("COMMIT", []) {
            error!("[db] Failed to commit restore transaction: {}", e);
        }
    }

    pub fn unread_count(&self) -> usize {
        let conn = lock_mutex(&self.conn);
        match conn.query_row(
            "SELECT COUNT(*) FROM messages WHERE read = 0",
            [],
            |row| row.get::<_, i64>(0),
        ) {
            Ok(count) => count as usize,
            Err(e) => {
                warn!("[db] Failed to query unread count: {}", e);
                0
            }
        }
    }

    /// Returns true if new messages arrived since last check, and resets the flag.
    pub fn drain_has_new(&self) -> bool {
        self.has_new.swap(false, Ordering::Relaxed)
    }
}
