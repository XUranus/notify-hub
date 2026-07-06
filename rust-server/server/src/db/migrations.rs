/// Consolidated initial schema matching the TypeScript server's full migration history.
/// This creates all tables and indexes as they exist after all 22 migrations.
pub const INITIAL_SCHEMA: &str = r#"
-- Admin users (legacy)
CREATE TABLE IF NOT EXISTS admin_users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    username TEXT NOT NULL UNIQUE,
    password TEXT NOT NULL,
    created_at INTEGER NOT NULL
);

-- Users
CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    username TEXT NOT NULL,
    password TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'user',
    created_at INTEGER NOT NULL
);

-- API tokens
CREATE TABLE IF NOT EXISTS api_tokens (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER,
    name TEXT NOT NULL,
    token TEXT NOT NULL UNIQUE,
    scopes TEXT NOT NULL DEFAULT '["email","sms","push"]',
    rate_limit INTEGER NOT NULL DEFAULT 100,
    ip_whitelist TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    expires_at INTEGER,
    last_used_at INTEGER,
    created_at INTEGER NOT NULL
);

-- Channels
CREATE TABLE IF NOT EXISTS channels (
    id TEXT PRIMARY KEY NOT NULL,
    type TEXT NOT NULL,
    name TEXT NOT NULL UNIQUE,
    config TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    is_default INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_channels_type_default ON channels (type, is_default);

-- Templates
CREATE TABLE IF NOT EXISTS templates (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL UNIQUE,
    channel_type TEXT NOT NULL,
    subject TEXT,
    body TEXT NOT NULL,
    variables TEXT,
    created_at INTEGER NOT NULL
);

-- Topics
CREATE TABLE IF NOT EXISTS topics (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    display_name TEXT,
    icon TEXT,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_topics_user_id ON topics (user_id);
CREATE INDEX IF NOT EXISTS idx_topics_user_id_name ON topics (user_id, name);

-- Messages
CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    channel_type TEXT NOT NULL,
    channel_id TEXT,
    to_address TEXT NOT NULL,
    subject TEXT,
    body TEXT,
    template_id TEXT,
    template_vars TEXT,
    status TEXT NOT NULL DEFAULT 'queued',
    retry_count INTEGER NOT NULL DEFAULT 0,
    max_retries INTEGER NOT NULL DEFAULT 5,
    next_retry_at INTEGER,
    error_message TEXT,
    idempotency_key TEXT UNIQUE,
    ip_address TEXT,
    ip_location TEXT,
    app TEXT,
    topic_id TEXT,
    scheduled_at INTEGER,
    sent_at INTEGER,
    created_at INTEGER NOT NULL,
    tags TEXT DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 0,
    url TEXT,
    attachment TEXT,
    format TEXT NOT NULL DEFAULT 'text',
    FOREIGN KEY (channel_id) REFERENCES channels(id) ON DELETE SET NULL,
    FOREIGN KEY (template_id) REFERENCES templates(id) ON DELETE SET NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_status ON messages (status);
CREATE INDEX IF NOT EXISTS idx_messages_created ON messages (created_at);
CREATE INDEX IF NOT EXISTS idx_messages_next_retry ON messages (next_retry_at);
CREATE INDEX IF NOT EXISTS idx_messages_user_id ON messages (user_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id_status ON messages (user_id, status);
CREATE INDEX IF NOT EXISTS idx_messages_user_id_created ON messages (user_id, created_at);
CREATE INDEX IF NOT EXISTS idx_messages_channel_type_status ON messages (channel_type, status);
CREATE INDEX IF NOT EXISTS idx_messages_topic_id ON messages (topic_id);
CREATE INDEX IF NOT EXISTS idx_messages_user_id_topic ON messages (user_id, topic_id);

-- Push clients
CREATE TABLE IF NOT EXISTS push_clients (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    uuid TEXT NOT NULL UNIQUE,
    name TEXT,
    os TEXT NOT NULL,
    arch TEXT,
    desktop TEXT,
    app_version TEXT,
    connection_mode TEXT,
    fcm_token TEXT,
    last_seen_at INTEGER,
    registered_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_push_clients_user_id ON push_clients (user_id);

-- Attachments
CREATE TABLE IF NOT EXISTS attachments (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    filename TEXT NOT NULL,
    original_name TEXT NOT NULL,
    mime_type TEXT NOT NULL,
    size INTEGER NOT NULL,
    url TEXT NOT NULL,
    download_count INTEGER NOT NULL DEFAULT 0,
    expires_at INTEGER,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_attachments_expires_at ON attachments (expires_at);
CREATE INDEX IF NOT EXISTS idx_attachments_user_id ON attachments (user_id);

-- User settings
CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    user_id INTEGER NOT NULL UNIQUE,
    attachment_expiration INTEGER NOT NULL DEFAULT 0,
    message_expiration INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    updated_at INTEGER NOT NULL
);

-- System settings (key-value)
CREATE TABLE IF NOT EXISTS system_settings (
    key TEXT PRIMARY KEY NOT NULL,
    value TEXT NOT NULL
);

-- Cleanup logs
CREATE TABLE IF NOT EXISTS cleanup_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    started_at INTEGER NOT NULL,
    finished_at INTEGER,
    duration_ms INTEGER,
    status TEXT NOT NULL DEFAULT 'running',
    expired_attachments INTEGER NOT NULL DEFAULT 0,
    expired_messages INTEGER NOT NULL DEFAULT 0,
    trimmed_messages INTEGER NOT NULL DEFAULT 0,
    error TEXT
);

-- App logs
CREATE TABLE IF NOT EXISTS app_logs (
    id INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
    level TEXT NOT NULL,
    message TEXT NOT NULL,
    source TEXT,
    created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_app_logs_level ON app_logs (level);
CREATE INDEX IF NOT EXISTS idx_app_logs_created ON app_logs (created_at);

-- Push messages
CREATE TABLE IF NOT EXISTS push_messages (
    id TEXT PRIMARY KEY NOT NULL,
    user_id INTEGER,
    client_uuid TEXT,
    source_message_id TEXT,
    title TEXT NOT NULL,
    body TEXT NOT NULL,
    level TEXT NOT NULL DEFAULT 'info',
    delivered INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL,
    tags TEXT DEFAULT '[]',
    priority INTEGER NOT NULL DEFAULT 0,
    url TEXT,
    attachment TEXT,
    format TEXT NOT NULL DEFAULT 'text',
    topic_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_push_messages_uuid_delivered ON push_messages (client_uuid, delivered);
CREATE INDEX IF NOT EXISTS idx_push_messages_delivered ON push_messages (delivered);
CREATE INDEX IF NOT EXISTS idx_push_messages_topic_id ON push_messages (topic_id);
CREATE INDEX IF NOT EXISTS idx_push_messages_source_message_id ON push_messages (source_message_id);
"#;
