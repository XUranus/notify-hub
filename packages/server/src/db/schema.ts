import { randomUUID } from 'node:crypto'
import { sqliteTable, text, integer, index, foreignKey } from 'drizzle-orm/sqlite-core'

// ── Admin Users (legacy) ──

export const adminUsers = sqliteTable('admin_users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  username: text('username').notNull().unique(),
  password: text('password').notNull(), // bcrypt hash
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Users ──

export const users = sqliteTable('users', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  email: text('email').notNull().unique(),
  username: text('username').notNull(),
  password: text('password').notNull(), // bcrypt hash
  role: text('role').notNull().default('user'), // 'admin' | 'user'
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── API Tokens ──

export const apiTokens = sqliteTable('api_tokens', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id'),
  name: text('name').notNull(),
  token: text('token').notNull().unique(),
  scopes: text('scopes').notNull().default('["email","sms","push"]'), // JSON
  rateLimit: integer('rate_limit').notNull().default(100),
  ipWhitelist: text('ip_whitelist'), // JSON array or null
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = never expires
  lastUsedAt: integer('last_used_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Channels ──

export const channels = sqliteTable('channels', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  type: text('type').notNull(), // 'email' | 'sms' | 'push'
  name: text('name').notNull().unique(),
  config: text('config').notNull(), // JSON string
  enabled: integer('enabled', { mode: 'boolean' }).notNull().default(true),
  isDefault: integer('is_default', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  typeDefaultIdx: index('idx_channels_type_default').on(table.type, table.isDefault),
}))

// ── Templates ──

export const templates = sqliteTable('templates', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  name: text('name').notNull().unique(),
  channelType: text('channel_type').notNull(),
  subject: text('subject'),
  body: text('body').notNull(),
  variables: text('variables'), // JSON: { varName: "description" }
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── Messages ──

export const messages = sqliteTable(
  'messages',
  {
    id: text('id').primaryKey().$defaultFn(() => randomUUID()),
    userId: integer('user_id'),
    channelType: text('channel_type').notNull(),
    channelId: text('channel_id'),
    toAddress: text('to_address').notNull(),
    subject: text('subject'),
    body: text('body'),
    templateId: text('template_id'),
    templateVars: text('template_vars'), // JSON
    status: text('status').notNull().default('queued'),
    retryCount: integer('retry_count').notNull().default(0),
    maxRetries: integer('max_retries').notNull().default(5),
    nextRetryAt: integer('next_retry_at', { mode: 'timestamp' }),
    errorMessage: text('error_message'),
    idempotencyKey: text('idempotency_key').unique(),
    ipAddress: text('ip_address'),
    ipLocation: text('ip_location'),
    app: text('app'),
    scheduledAt: integer('scheduled_at', { mode: 'timestamp' }),
    sentAt: integer('sent_at', { mode: 'timestamp' }),
    createdAt: integer('created_at', { mode: 'timestamp' })
      .notNull()
      .$defaultFn(() => new Date()),
    // Extended fields
    tags: text('tags').default('[]'), // JSON array
    priority: integer('priority').notNull().default(0),
    url: text('url'),
    attachment: text('attachment'), // JSON: {name, url?, data?}
    format: text('format').notNull().default('text'), // 'text' | 'markdown' | 'html' | 'json'
  },
  (table) => ({
    statusIdx: index('idx_messages_status').on(table.status),
    createdIdx: index('idx_messages_created').on(table.createdAt),
    nextRetryIdx: index('idx_messages_next_retry').on(table.nextRetryAt),
    userIdIdx: index('idx_messages_user_id').on(table.userId),
    userIdStatusIdx: index('idx_messages_user_id_status').on(table.userId, table.status),
    userIdCreatedIdx: index('idx_messages_user_id_created').on(table.userId, table.createdAt),
    channelTypeStatusIdx: index('idx_messages_channel_type_status').on(table.channelType, table.status),
    channelFk: foreignKey({
      columns: [table.channelId],
      foreignColumns: [channels.id],
    }).onDelete('set null'),
    templateFk: foreignKey({
      columns: [table.templateId],
      foreignColumns: [templates.id],
    }).onDelete('set null'),
    userFk: foreignKey({
      columns: [table.userId],
      foreignColumns: [users.id],
    }).onDelete('set null'),
  })
)

// ── Push Clients ──

export const pushClients = sqliteTable('push_clients', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: integer('user_id'),         // owner of this client device
  uuid: text('uuid').notNull().unique(),
  name: text('name'),
  os: text('os').notNull(),           // 'linux' | 'windows' | 'macos' | 'android'
  arch: text('arch'),                 // 'x86_64' | 'aarch64'
  desktop: text('desktop'),           // 'KDE' | 'GNOME' | 'macOS' | 'Windows' | etc.
  appVersion: text('app_version'),
  lastSeenAt: integer('last_seen_at', { mode: 'timestamp' }),
  registeredAt: integer('registered_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  userIdIdx: index('idx_push_clients_user_id').on(table.userId),
}))

// ── Attachments ──

export const attachments = sqliteTable('attachments', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  userId: integer('user_id'),
  filename: text('filename').notNull(),
  originalName: text('original_name').notNull(),
  mimeType: text('mime_type').notNull(),
  size: integer('size').notNull(), // bytes
  url: text('url').notNull(),
  downloadCount: integer('download_count').notNull().default(0),
  expiresAt: integer('expires_at', { mode: 'timestamp' }), // null = never
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
}, (table) => ({
  expiresAtIdx: index('idx_attachments_expires_at').on(table.expiresAt),
  userIdIdx: index('idx_attachments_user_id').on(table.userId),
}))

// ── User Settings ──

export const userSettings = sqliteTable('user_settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  userId: integer('user_id').notNull().unique(),
  attachmentExpiration: integer('attachment_expiration').notNull().default(0), // 0=never, 1=24h, 3=3d, 7=1w, 30=1m
  messageExpiration: integer('message_expiration').notNull().default(0), // 0=never, 1=24h, 3=3d, 7=1w
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
})

// ── System Settings ──

export const systemSettings = sqliteTable('system_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
})

// ── Cleanup Logs ──

export const cleanupLogs = sqliteTable('cleanup_logs', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  startedAt: integer('started_at', { mode: 'timestamp' }).notNull(),
  finishedAt: integer('finished_at', { mode: 'timestamp' }),
  durationMs: integer('duration_ms'),
  status: text('status').notNull().default('running'), // 'running' | 'success' | 'error'
  expiredAttachments: integer('expired_attachments').notNull().default(0),
  expiredMessages: integer('expired_messages').notNull().default(0),
  trimmedMessages: integer('trimmed_messages').notNull().default(0),
  error: text('error'),
})

// ── Push Messages (separate from main queue, no retry) ──

export const pushMessages = sqliteTable('push_messages', {
  id: text('id').primaryKey().$defaultFn(() => randomUUID()),
  clientUuid: text('client_uuid'),    // null = broadcast to all
  title: text('title').notNull(),
  body: text('body').notNull(),
  level: text('level').notNull().default('info'), // 'info' | 'warning' | 'error'
  delivered: integer('delivered', { mode: 'boolean' }).notNull().default(false),
  createdAt: integer('created_at', { mode: 'timestamp' })
    .notNull()
    .$defaultFn(() => new Date()),
  // Extended fields
  tags: text('tags').default('[]'), // JSON array
  priority: integer('priority').notNull().default(0),
  url: text('url'),
  attachment: text('attachment'), // JSON
  format: text('format').notNull().default('text'),
}, (table) => ({
  clientUuidDeliveredIdx: index('idx_push_messages_uuid_delivered').on(table.clientUuid, table.delivered),
  deliveredIdx: index('idx_push_messages_delivered').on(table.delivered),
}))
