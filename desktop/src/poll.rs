use crate::api::ApiClient;
use crate::config::AppConfig;
use crate::messages::{LocalMessage, MessageStore};
use crate::notify::show_notification;
use std::sync::Arc;
use std::sync::Mutex;
use std::time::Duration;

pub struct PollState {
    pub running: bool,
    pub last_poll: Option<String>,
    pub error: Option<String>,
}

pub fn start_polling(config: AppConfig, state: Arc<Mutex<PollState>>, msg_store: Arc<MessageStore>) {
    let api = ApiClient::new(&config.server.url, &config.server.api_key);
    let uuid = config.client.uuid.clone();

    std::thread::spawn(move || {
        let rt = tokio::runtime::Runtime::new().unwrap();
        loop {
            rt.block_on(async {
                match api.poll(&uuid).await {
                    Ok(messages) => {
                        {
                            let mut s = state.lock().unwrap();
                            s.last_poll = Some(chrono::Local::now().format("%H:%M:%S").to_string());
                            s.error = None;
                        }
                        for msg in messages {
                            // Store locally
                            let local = LocalMessage {
                                id: msg.id.clone(),
                                title: msg.title.clone(),
                                body: msg.body.clone(),
                                level: msg.level.clone(),
                                received_at: chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string(),
                                read: false,
                                flagged: false,
                                tags: msg.tags.clone(),
                                priority: msg.priority,
                                url: msg.url.clone(),
                                attachment: msg.attachment.clone(),
                                format: msg.format.clone(),
                            };
                            msg_store.add(local);
                            // Show desktop notification
                            show_notification(&msg.title, &msg.body);
                        }
                    }
                    Err(e) => {
                        let mut s = state.lock().unwrap();
                        s.error = Some(e);
                    }
                }
            });

            std::thread::sleep(Duration::from_secs(5));
        }
    });
}
