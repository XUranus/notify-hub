use tokio::sync::broadcast;
use tracing_subscriber::Layer;
use tracing_subscriber::layer::Context;
use tracing_subscriber::registry::LookupSpan;
use serde::Serialize;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct LogEntry {
    pub level: String,
    pub message: String,
    pub source: Option<String>,
    pub created_at: i64,
}

#[derive(Clone)]
pub struct LogBroadcaster {
    tx: broadcast::Sender<LogEntry>,
}

impl LogBroadcaster {
    pub fn new() -> Self {
        let (tx, _) = broadcast::channel(256);
        Self { tx }
    }

    pub fn subscribe(&self) -> broadcast::Receiver<LogEntry> {
        self.tx.subscribe()
    }

    pub fn send(&self, entry: LogEntry) {
        let _ = self.tx.send(entry);
    }
}

/// A tracing Layer that broadcasts log entries via LogBroadcaster
pub struct BroadcastLayer {
    broadcaster: LogBroadcaster,
}

impl BroadcastLayer {
    pub fn new(broadcaster: LogBroadcaster) -> Self {
        Self { broadcaster }
    }
}

impl<S> Layer<S> for BroadcastLayer
where
    S: tracing::Subscriber + for<'a> LookupSpan<'a>,
{
    fn on_event(&self, event: &tracing::Event<'_>, _ctx: Context<'_, S>) {
        let mut visitor = MessageVisitor(String::new());
        event.record(&mut visitor);

        let level = match *event.metadata().level() {
            tracing::Level::ERROR => "error",
            tracing::Level::WARN => "warn",
            tracing::Level::INFO => "info",
            tracing::Level::DEBUG => "debug",
            tracing::Level::TRACE => "debug",
        };

        let source = event.metadata().module_path().map(|s| s.to_string());

        let entry = LogEntry {
            level: level.to_string(),
            message: visitor.0,
            source,
            created_at: chrono::Utc::now().timestamp(),
        };

        self.broadcaster.send(entry);
    }
}

struct MessageVisitor(String);

impl tracing::field::Visit for MessageVisitor {
    fn record_debug(&mut self, field: &tracing::field::Field, value: &dyn std::fmt::Debug) {
        if field.name() == "message" {
            self.0 = format!("{:?}", value);
        }
    }

    fn record_str(&mut self, field: &tracing::field::Field, value: &str) {
        if field.name() == "message" {
            self.0 = value.to_string();
        }
    }
}
