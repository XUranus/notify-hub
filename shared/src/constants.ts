// Channel types
export const CHANNEL_TYPES = ['email', 'sms', 'push'] as const
export type ChannelType = (typeof CHANNEL_TYPES)[number]

// Reserved channel names (cannot be used as user-defined channel names)
export const RESERVED_CHANNEL_NAMES = CHANNEL_TYPES

// Message statuses
export const MESSAGE_STATUSES = [
  'queued',
  'sending',
  'sent',
  'delivered',
  'failed',
  'dead',
] as const
export type MessageStatus = (typeof MESSAGE_STATUSES)[number]

// SMS provider names
export const SMS_PROVIDERS = ['twilio', 'aliyun', 'tencent'] as const
export type SmsProvider = (typeof SMS_PROVIDERS)[number]

// Retry strategy: delays in seconds (exponential backoff)
export const RETRY_DELAYS = [1, 5, 30, 300, 1800] // 1s, 5s, 30s, 5min, 30min
export const DEFAULT_MAX_RETRIES = 5

// Rate limiting
export const DEFAULT_RATE_LIMIT = 100 // requests per minute

// Worker
export const WORKER_POLL_INTERVAL_MS = 1000 // 1 second
export const WORKER_BATCH_SIZE = 10

// Token prefix
export const API_TOKEN_PREFIX = 'nfkey_'

// JWT
export const JWT_EXPIRY = '24h'
export const CLIENT_JWT_EXPIRY = '90d'

// Admin default credentials
export const DEFAULT_ADMIN_USERNAME = 'admin'
export const DEFAULT_ADMIN_PASSWORD = 'admin123'
