use serde::{Deserialize, Serialize};
use std::fs;
use std::path::PathBuf;
use std::sync::Mutex;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LocalMessage {
    pub id: String,
    pub title: String,
    pub body: String,
    pub level: String,
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
    #[serde(default)]
    pub local_image_path: Option<String>,
    // Topic fields
    #[serde(default)]
    pub topic_id: Option<String>,
    #[serde(default)]
    pub topic_name: Option<String>,
    #[serde(default)]
    pub topic_display_name: Option<String>,
    #[serde(default)]
    pub topic_icon: Option<String>,
}

fn messages_path() -> PathBuf {
    let dir = dirs::config_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("notifyhub-client");
    fs::create_dir_all(&dir).ok();
    dir.join("messages.json")
}

fn load_raw() -> Vec<LocalMessage> {
    let path = messages_path();
    if path.exists() {
        fs::read_to_string(&path)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or_default()
    } else {
        Vec::new()
    }
}

fn save_raw(msgs: &[LocalMessage]) {
    let path = messages_path();
    if let Ok(json) = serde_json::to_string_pretty(msgs) {
        fs::write(&path, json).ok();
    }
}

pub struct MessageStore {
    inner: Mutex<Vec<LocalMessage>>,
}

impl MessageStore {
    pub fn new() -> Self {
        Self {
            inner: Mutex::new(load_raw()),
        }
    }

    pub fn add(&self, msg: LocalMessage) {
        let mut msgs = self.inner.lock().unwrap();
        msgs.insert(0, msg);
        // Keep max 15000 messages
        msgs.truncate(15000);
        save_raw(&msgs);
    }

    pub fn get_all(&self) -> Vec<LocalMessage> {
        self.inner.lock().unwrap().clone()
    }

    pub fn mark_as_read(&self, id: &str) {
        let mut msgs = self.inner.lock().unwrap();
        if let Some(m) = msgs.iter_mut().find(|m| m.id == id) {
            m.read = true;
            save_raw(&msgs);
        }
    }

    pub fn toggle_flag(&self, id: &str) {
        let mut msgs = self.inner.lock().unwrap();
        if let Some(m) = msgs.iter_mut().find(|m| m.id == id) {
            m.flagged = !m.flagged;
            save_raw(&msgs);
        }
    }

    pub fn delete_and_return(&self, id: &str) -> Option<LocalMessage> {
        let mut msgs = self.inner.lock().unwrap();
        if let Some(pos) = msgs.iter().position(|m| m.id == id) {
            let removed = msgs.remove(pos);
            save_raw(&msgs);
            Some(removed)
        } else {
            None
        }
    }

    pub fn insert_at(&self, msg: LocalMessage, index: usize) {
        let mut msgs = self.inner.lock().unwrap();
        let idx = index.min(msgs.len());
        msgs.insert(idx, msg);
        msgs.truncate(15000);
        save_raw(&msgs);
    }

    pub fn delete(&self, id: &str) {
        let mut msgs = self.inner.lock().unwrap();
        msgs.retain(|m| m.id != id);
        save_raw(&msgs);
    }

    pub fn clear(&self) {
        let mut msgs = self.inner.lock().unwrap();
        msgs.clear();
        save_raw(&msgs);
    }

    pub fn restore(&self, new_msgs: Vec<LocalMessage>) {
        let mut msgs = self.inner.lock().unwrap();
        *msgs = new_msgs;
        msgs.truncate(15000);
        save_raw(&msgs);
    }

    pub fn unread_count(&self) -> usize {
        let msgs = self.inner.lock().unwrap();
        msgs.iter().filter(|m| !m.read).count()
    }
}
