import type { ChannelType, MessageStatus, SmsProvider } from './constants.js'

// ── Database Models ──

export interface AdminUser {
  id: number
  username: string
  password: string // bcrypt hash
  createdAt: number
}

export interface User {
  id: number
  email: string
  username: string
  password: string // bcrypt hash
  role: 'admin' | 'user'
  createdAt: number
}

export interface ApiToken {
  id: number
  name: string
  token: string
  scopes: string // JSON array of ChannelType
  rateLimit: number
  ipWhitelist: string | null // JSON array of IPs
  enabled: number // 0 or 1
  lastUsedAt: number | null
  createdAt: number
}

export interface Channel {
  id: string
  type: ChannelType
  name: string
  config: string // JSON
  enabled: number
  isDefault: number
  createdAt: number
  updatedAt: number
}

export interface Template {
  id: string
  name: string
  channelType: ChannelType
  subject: string | null
  body: string
  variables: string | null // JSON: variable descriptions
  createdAt: number
}

export interface MessageAttachment {
  name: string
  url?: string
  data?: string // base64
}

export interface Message {
  id: string
  channelType: ChannelType
  channelId: string | null
  toAddress: string
  subject: string | null
  body: string | null
  templateId: string | null
  templateVars: string | null // JSON
  status: MessageStatus
  retryCount: number
  maxRetries: number
  nextRetryAt: number | null
  errorMessage: string | null
  idempotencyKey: string | null
  ipAddress: string | null
  ipLocation: string | null
  app: string | null
  scheduledAt: number | null
  sentAt: number | null
  createdAt: number
  // Extended fields
  tags: string | null // JSON array
  priority: number
  url: string | null
  attachment: string | null // JSON: MessageAttachment
  format: string // 'text' | 'markdown' | 'html' | 'json'
}

// ── Channel Adapter Types ──

export interface SendResult {
  success: boolean
  externalId?: string
  error?: string
}

export interface MessagePayload {
  to: string
  subject?: string
  body: string
  tags?: string[]
  priority?: number
  url?: string
  attachment?: MessageAttachment
  format?: string
}

export interface ChannelAdapter {
  type: ChannelType
  name: string
  send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult>
  test(config: Record<string, unknown>): Promise<boolean>
}

// ── API Types ──

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
}

export interface PaginatedResponse<T> {
  items: T[]
  total: number
  page: number
  pageSize: number
}

export interface StatsOverview {
  totalMessages: number
  sentMessages: number
  failedMessages: number
  queuedMessages: number
  successRate: number
  messagesLast24h: number
  messagesLast7d: number
}
