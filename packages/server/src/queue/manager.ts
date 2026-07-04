import { eq, and, or, lte, isNull, sql } from 'drizzle-orm'
import { getDb, schema } from '../db/index.js'
import { getAdapter } from '../channel/index.js'
import { renderTemplate } from '../template/index.js'
import {
  RETRY_DELAYS,
  DEFAULT_MAX_RETRIES,
  WORKER_BATCH_SIZE,
  type MessageStatus,
  type ChannelType,
} from '@notify-hub/shared'
import type { MessagePayload } from '@notify-hub/shared'

/**
 * Enqueue a new message.
 */
export async function enqueue(params: {
  channelType: ChannelType
  to: string
  subject?: string
  body?: string
  templateId?: string
  templateVars?: Record<string, string>
  idempotencyKey?: string
  scheduledAt?: Date
  channelId?: string | null
  ipAddress?: string
  ipLocation?: string
  app?: string
  tags?: string[]
  priority?: number
  url?: string
  attachment?: { name: string; url?: string; data?: string }
  format?: string
  userId?: number
}): Promise<string> {
  const db = getDb()

  // Check idempotency
  if (params.idempotencyKey) {
    const [existing] = await db
      .select()
      .from(schema.messages)
      .where(eq(schema.messages.idempotencyKey, params.idempotencyKey))
      .limit(1)

    if (existing) {
      return existing.id
    }
  }

  // Resolve template if needed
  let subject = params.subject
  let body = params.body

  if (params.templateId && params.templateVars) {
    const [template] = await db
      .select()
      .from(schema.templates)
      .where(eq(schema.templates.id, params.templateId))
      .limit(1)

    if (template) {
      subject = template.subject
        ? renderTemplate(template.subject, params.templateVars)
        : subject
      body = renderTemplate(template.body, params.templateVars)
    }
  }

  const [result] = await db
    .insert(schema.messages)
    .values({
      channelType: params.channelType,
      channelId: params.channelId ?? null,
      toAddress: params.to,
      subject: subject ?? null,
      body: body ?? null,
      templateId: params.templateId ?? null,
      templateVars: params.templateVars
        ? JSON.stringify(params.templateVars)
        : null,
      status: 'queued',
      maxRetries: DEFAULT_MAX_RETRIES,
      idempotencyKey: params.idempotencyKey ?? null,
      ipAddress: params.ipAddress ?? null,
      ipLocation: params.ipLocation ?? null,
      app: params.app ?? null,
      scheduledAt: params.scheduledAt ?? null,
      tags: params.tags ? JSON.stringify(params.tags) : '[]',
      priority: params.priority ?? 0,
      url: params.url ?? null,
      attachment: params.attachment ? JSON.stringify(params.attachment) : null,
      format: params.format ?? 'text',
      userId: params.userId ?? null,
    })
    .returning()

  return result.id
}

/**
 * Enforce per-user message limit. Deletes oldest messages when count exceeds the limit.
 * Uses a single bulk DELETE with a subquery instead of N individual deletes.
 */
export async function trimUserMessages(userId: number): Promise<void> {
  const db = getDb()

  // Get max messages per user from system_settings (default 1000)
  const maxRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'max_messages_per_user'))
    .limit(1)
  const maxMessages = maxRow[0] ? parseInt(maxRow[0].value) : 1000

  // Count user's messages
  const countRow = await db.select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.userId, userId))
  const count = countRow[0]?.count ?? 0

  if (count <= maxMessages) return

  // Bulk delete oldest messages beyond the limit using subquery
  const excess = count - maxMessages
  await db.run(sql`
    DELETE FROM messages
    WHERE id IN (
      SELECT id FROM messages
      WHERE user_id = ${userId}
      ORDER BY created_at ASC
      LIMIT ${excess}
    )
  `)
}

/**
 * Delete expired messages for a user based on their messageExpiration setting.
 */
export async function cleanupExpiredUserMessages(userId: number): Promise<void> {
  const db = getDb()

  const settingsRow = await db.select().from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1)
  const expirationDays = settingsRow[0]?.messageExpiration ?? 0
  if (expirationDays <= 0) return // never expire

  const cutoff = new Date()
  cutoff.setDate(cutoff.getDate() - expirationDays)

  await db.delete(schema.messages)
    .where(and(
      eq(schema.messages.userId, userId),
      lte(schema.messages.createdAt, cutoff)
    ))
}

/**
 * Get message by ID.
 * @param userId - If provided, only return message owned by this user. Undefined = any (admin).
 */
export async function getMessage(id: string, userId?: number) {
  const db = getDb()
  const conditions = [eq(schema.messages.id, id)]
  if (userId !== undefined) {
    conditions.push(eq(schema.messages.userId, userId))
  }
  const [msg] = await db
    .select()
    .from(schema.messages)
    .where(and(...conditions))
    .limit(1)
  return msg
}

/**
 * Get messages with pagination and filters.
 * @param userId - If provided, only return messages owned by this user. Undefined = any (admin).
 */
export async function getMessages(params: {
  page?: number
  pageSize?: number
  status?: MessageStatus
  channelType?: ChannelType
  userId?: number
}) {
  const db = getDb()
  const page = params.page || 1
  const pageSize = Math.min(params.pageSize || 20, 100)
  const offset = (page - 1) * pageSize

  const conditions = []
  if (params.userId !== undefined) {
    conditions.push(eq(schema.messages.userId, params.userId))
  }
  if (params.status) {
    conditions.push(eq(schema.messages.status, params.status))
  }
  if (params.channelType) {
    conditions.push(eq(schema.messages.channelType, params.channelType))
  }

  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [countResult] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(where)

  const items = await db
    .select({
      id: schema.messages.id,
      channelType: schema.messages.channelType,
      channelId: schema.messages.channelId,
      toAddress: schema.messages.toAddress,
      subject: schema.messages.subject,
      body: schema.messages.body,
      templateId: schema.messages.templateId,
      templateVars: schema.messages.templateVars,
      status: schema.messages.status,
      retryCount: schema.messages.retryCount,
      maxRetries: schema.messages.maxRetries,
      errorMessage: schema.messages.errorMessage,
      sentAt: schema.messages.sentAt,
      ipAddress: schema.messages.ipAddress,
      ipLocation: schema.messages.ipLocation,
      app: schema.messages.app,
      createdAt: schema.messages.createdAt,
      tags: schema.messages.tags,
      priority: schema.messages.priority,
      url: schema.messages.url,
      attachment: schema.messages.attachment,
      format: schema.messages.format,
      channelName: schema.channels.name,
    })
    .from(schema.messages)
    .leftJoin(schema.channels, eq(schema.messages.channelId, schema.channels.id))
    .where(where)
    .orderBy(sql`${schema.messages.createdAt} DESC`)
    .limit(pageSize)
    .offset(offset)

  return {
    items,
    total: countResult.count,
    page,
    pageSize,
  }
}

/**
 * Atomically claim the next batch of messages for processing.
 * Uses UPDATE ... RETURNING to prevent duplicate processing across concurrent workers.
 */
export async function fetchBatch() {
  const db = getDb()
  const now = new Date()

  // Atomically claim messages by updating their status to 'sending' in one shot.
  // We use a subquery to select candidate IDs, then update them.
  const candidateIds = db
    .select({ id: schema.messages.id })
    .from(schema.messages)
    .where(
      or(
        and(
          eq(schema.messages.status, 'queued'),
          or(
            isNull(schema.messages.scheduledAt),
            lte(schema.messages.scheduledAt, now)
          )
        ),
        and(
          eq(schema.messages.status, 'failed'),
          lte(schema.messages.nextRetryAt, now)
        )
      )
    )
    .orderBy(sql`${schema.messages.priority} DESC, ${schema.messages.createdAt}`)
    .limit(WORKER_BATCH_SIZE)

  // Atomically claim by setting status to 'sending', return the full rows
  const claimed = await db
    .update(schema.messages)
    .set({ status: 'sending' })
    .where(
      and(
        eq(schema.messages.id, sql`${candidateIds}`),
        // Double-check status hasn't changed between subquery and update
        or(
          eq(schema.messages.status, 'queued'),
          eq(schema.messages.status, 'failed')
        )
      )
    )
    .returning()

  return claimed
}

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/**
 * Process a single message: find channel, get adapter, send.
 */
export async function processMessage(msg: typeof schema.messages.$inferSelect) {
  const db = getDb()

  // Message is already claimed as 'sending' by fetchBatch()
  try {
    // Find the channel to use
    let channel
    if (msg.channelId) {
      const [ch] = await db
        .select()
        .from(schema.channels)
        .where(eq(schema.channels.id, msg.channelId))
        .limit(1)
      channel = ch
    } else {
      // Use default channel for this type
      const [ch] = await db
        .select()
        .from(schema.channels)
        .where(
          and(
            eq(schema.channels.type, msg.channelType),
            eq(schema.channels.isDefault, true),
            eq(schema.channels.enabled, true)
          )
        )
        .limit(1)
      channel = ch
    }

    // Push is a built-in channel — no DB record or config needed
    if (!channel && msg.channelType === 'push') {
      const adapter = getAdapter('push')
      if (!adapter) {
        throw new Error('No push adapter found')
      }
      const payload: MessagePayload = {
        to: msg.toAddress,
        subject: msg.subject || undefined,
        body: msg.body || '',
        tags: safeJsonParse<string[]>(msg.tags, []),
        priority: msg.priority ?? undefined,
        url: msg.url || undefined,
        attachment: safeJsonParse(msg.attachment, undefined),
        format: msg.format || undefined,
      }
      const result = await adapter.send({}, payload)
      if (result.success) {
        await db
          .update(schema.messages)
          .set({ status: 'sent', sentAt: new Date(), errorMessage: null })
          .where(eq(schema.messages.id, msg.id))
      } else {
        throw new Error(result.error || 'Push send failed')
      }
      return
    }

    if (!channel) {
      throw new Error(`No ${msg.channelType} channel configured`)
    }

    const channelConfig = JSON.parse(channel.config) as Record<string, unknown>

    // Get adapter
    const adapter = getAdapter(msg.channelType, channelConfig.provider as string | undefined)
    if (!adapter) {
      throw new Error(`No adapter found for ${msg.channelType}`)
    }

    // Prepare payload
    const payload: MessagePayload = {
      to: msg.toAddress,
      subject: msg.subject || undefined,
      body: msg.body || '',
      tags: safeJsonParse<string[]>(msg.tags, []),
      priority: msg.priority ?? undefined,
      url: msg.url || undefined,
      attachment: safeJsonParse(msg.attachment, undefined),
      format: msg.format || undefined,
    }

    // Send!
    const result = await adapter.send(channelConfig, payload)

    if (result.success) {
      await db
        .update(schema.messages)
        .set({
          status: 'sent',
          sentAt: new Date(),
          errorMessage: null,
        })
        .where(eq(schema.messages.id, msg.id))
    } else {
      throw new Error(result.error || 'Send failed')
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const newRetryCount = msg.retryCount + 1

    if (newRetryCount >= msg.maxRetries) {
      // Dead letter
      await db
        .update(schema.messages)
        .set({
          status: 'dead',
          retryCount: newRetryCount,
          errorMessage: errorMsg,
        })
        .where(eq(schema.messages.id, msg.id))
    } else {
      // Schedule retry
      const delaySec = RETRY_DELAYS[Math.min(newRetryCount - 1, RETRY_DELAYS.length - 1)]
      const nextRetry = new Date(Date.now() + delaySec * 1000)

      await db
        .update(schema.messages)
        .set({
          status: 'failed',
          retryCount: newRetryCount,
          nextRetryAt: nextRetry,
          errorMessage: errorMsg,
        })
        .where(eq(schema.messages.id, msg.id))
    }
  }
}

/**
 * Manually retry a dead/failed message.
 * @param userId - If provided, only retry message owned by this user. Undefined = any (admin).
 */
export async function manualRetry(id: string, userId?: number) {
  const db = getDb()

  const conditions = [eq(schema.messages.id, id)]
  if (userId !== undefined) {
    conditions.push(eq(schema.messages.userId, userId))
  }

  const [msg] = await db
    .select()
    .from(schema.messages)
    .where(and(...conditions))
    .limit(1)

  if (!msg) {
    throw new Error('Message not found')
  }

  if (msg.status !== 'failed' && msg.status !== 'dead') {
    throw new Error(`Cannot retry message with status '${msg.status}'`)
  }

  await db
    .update(schema.messages)
    .set({
      status: 'queued',
      retryCount: 0,
      nextRetryAt: null,
      errorMessage: null,
    })
    .where(eq(schema.messages.id, msg.id))

  return true
}
