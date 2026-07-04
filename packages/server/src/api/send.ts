import { Hono } from 'hono'
import { z } from 'zod'
import { and, eq } from 'drizzle-orm'
import { sendMessageSchema, sendBatchSchema, CHANNEL_TYPES, type ChannelType } from '@notify-hub/shared'
import { dualAuth, requireScope } from '../auth/index.js'
import { getDb, schema } from '../db/index.js'
import { enqueue } from '../queue/index.js'
import { trimUserMessages, cleanupExpiredUserMessages } from '../queue/manager.js'
import { lookupIpLocation } from '../utils/geoip.js'
import { channelCache, templateCache } from '../cache.js'
import type { HonoEnv } from '../types.js'

const send = new Hono<HonoEnv>()

/**
 * Parse delay string into a Date.
 * Supports relative: 30m, 1h, 1d, 1w
 * Supports absolute: yyyy-mm-dd hh:mm:ss
 */
function parseDelay(delay: string): Date {
  const relativeMatch = delay.match(/^(\d+)(s|m|h|d|w)$/)
  if (relativeMatch) {
    const amount = parseInt(relativeMatch[1])
    const unit = relativeMatch[2]
    const now = Date.now()
    const multipliers: Record<string, number> = {
      s: 1000,
      m: 60_000,
      h: 3_600_000,
      d: 86_400_000,
      w: 604_800_000,
    }
    const ms = amount * multipliers[unit]
    if (!Number.isFinite(ms) || ms > 10 * 365.25 * 24 * 3600 * 1000) {
      throw new Error(`Delay value '${delay}' is too large`)
    }
    const date = new Date(now + ms)
    if (isNaN(date.getTime())) {
      throw new Error(`Delay value '${delay}' produces an invalid date`)
    }
    return date
  }
  // Absolute datetime: yyyy-mm-dd hh:mm:ss
  const date = new Date(delay.replace(' ', 'T'))
  if (isNaN(date.getTime())) {
    throw new Error(`Invalid delay value '${delay}'`)
  }
  return date
}

// Apply dual auth to all routes (JWT or API token)
send.use('*', dualAuth)

/**
 * Resolve channel field to { channelType, channelId }.
 *  - type name ("email", "sms", "push") → default channel of that type
 *  - channel name ("163邮箱") → find by name, derive type from DB
 */
async function resolveChannel(channel: string): Promise<{ channelType: string; channelId: string | null }> {
  // Push is a built-in channel type — no DB record needed
  if (channel === 'push') {
    return { channelType: 'push', channelId: null }
  }

  const cacheKey = (CHANNEL_TYPES as readonly string[]).includes(channel)
    ? `default:${channel}`
    : `name:${channel}`

  const cached = channelCache.get(cacheKey) as { channelType: string; channelId: string | null } | undefined
  if (cached) return cached

  const db = getDb()

  // If channel is a type name, resolve to default channel of that type
  if ((CHANNEL_TYPES as readonly string[]).includes(channel)) {
    const [ch] = await db
      .select({ id: schema.channels.id, type: schema.channels.type })
      .from(schema.channels)
      .where(and(eq(schema.channels.type, channel), eq(schema.channels.isDefault, true)))
      .limit(1)

    if (!ch) {
      throw new Error(`No default channel found for type '${channel}'`)
    }
    const result = { channelType: ch.type, channelId: ch.id }
    channelCache.set(cacheKey, result)
    return result
  }

  // Otherwise, match by channel name
  const [ch] = await db
    .select({ id: schema.channels.id, type: schema.channels.type })
    .from(schema.channels)
    .where(eq(schema.channels.name, channel))
    .limit(1)

  if (!ch) {
    throw new Error(`Channel '${channel}' not found`)
  }
  const result = { channelType: ch.type, channelId: ch.id }
  channelCache.set(cacheKey, result)
  return result
}

/**
 * POST /api/v1/send - Send a single notification.
 */
send.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = sendMessageSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues[0].message },
      400
    )
  }

  const { channel, to, subject, body: msgBody, template, variables, idempotencyKey, scheduledAt, app, tags, priority, url, delay, attachment, format } = parsed.data

  // Parse delay into scheduledAt
  let resolvedScheduledAt: Date | undefined
  if (delay) {
    resolvedScheduledAt = parseDelay(delay)
  } else if (scheduledAt) {
    resolvedScheduledAt = new Date(scheduledAt)
  }

  // Resolve channel
  let channelType: string
  let channelId: string | null
  try {
    const resolved = await resolveChannel(channel)
    channelType = resolved.channelType
    channelId = resolved.channelId
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to resolve channel' },
      400
    )
  }

  // Check scope (based on channel type)
  const token = c.get('apiToken')
  if (token && !token.scopes.includes('*') && !token.scopes.includes(channelType)) {
    return c.json(
      { success: false, error: `Token does not have '${channelType}' scope` },
      403
    )
  }

  // Resolve template if specified (with cache)
  let templateId: string | undefined
  if (template) {
    const tplCacheKey = `${template}:${channelType}`
    let tpl = templateCache.get(tplCacheKey) as { id: string } | undefined
    if (!tpl) {
      const db = getDb()
      const [row] = await db
        .select({ id: schema.templates.id })
        .from(schema.templates)
        .where(
          and(
            eq(schema.templates.name, template),
            eq(schema.templates.channelType, channelType)
          )
        )
        .limit(1)
      if (row) {
        tpl = row
        templateCache.set(tplCacheKey, row)
      }
    }

    if (!tpl) {
      return c.json(
        { success: false, error: `Template '${template}' not found for channel '${channelType}'` },
        404
      )
    }
    templateId = tpl.id
  }

  // Validate: need either body or template
  if (!msgBody && !templateId) {
    return c.json(
      { success: false, error: 'Either body or template is required' },
      400
    )
  }

  // Get caller IP and lookup geolocation
  const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown'
  const ipLocation = ipAddress !== 'unknown' ? await lookupIpLocation(ipAddress) : null

  try {
    // Get userId from auth context (JWT or API token)
    const currentUser = c.get('currentUser')
    const userId = currentUser?.userId

    const messageId = await enqueue({
      channelType: channelType as ChannelType,
      to,
      subject,
      body: msgBody,
      templateId,
      templateVars: variables,
      idempotencyKey,
      scheduledAt: resolvedScheduledAt,
      channelId,
      ipAddress,
      ipLocation: ipLocation ?? undefined,
      app,
      tags,
      priority,
      url,
      attachment,
      format,
      userId,
    })

    // Enforce per-user limits (fire-and-forget)
    if (userId) {
      cleanupExpiredUserMessages(userId).catch(() => {})
      trimUserMessages(userId).catch(() => {})
    }

    return c.json({
      success: true,
      data: { messageId, status: 'queued' },
    })
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Failed to enqueue' },
      500
    )
  }
})

/**
 * POST /api/v1/send/batch - Send multiple notifications.
 */
send.post('/batch', async (c) => {
  const body = await c.req.json()
  const parsed = sendBatchSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues[0].message },
      400
    )
  }

  const currentUser = c.get('currentUser')
  const userId = currentUser?.userId
  const apiToken = c.get('apiToken')
  const results: Array<{ messageId: string; status: string } | { error: string }> = []
  const db = getDb()

  // Get caller IP and lookup geolocation
  const ipAddress = c.req.header('x-forwarded-for')?.split(',')[0]?.trim()
    || c.req.header('x-real-ip')
    || 'unknown'
  const ipLocation = ipAddress !== 'unknown' ? await lookupIpLocation(ipAddress) : null

  for (const msg of parsed.data.messages) {
    try {
      // Resolve channel
      let channelType: string
      let channelId: string | null
      try {
        const resolved = await resolveChannel(msg.channel)
        channelType = resolved.channelType
        channelId = resolved.channelId
      } catch (err) {
        results.push({ error: err instanceof Error ? err.message : 'Failed to resolve channel' })
        continue
      }

      // Check scope per message (based on channel type) — only applies to API tokens
      if (apiToken && !apiToken.scopes.includes('*') && !apiToken.scopes.includes(channelType)) {
        results.push({ error: `Token does not have '${channelType}' scope` })
        continue
      }

      let templateId: string | undefined
      if (msg.template) {
        const tplCacheKey = `${msg.template}:${channelType}`
        let tpl = templateCache.get(tplCacheKey) as { id: string } | undefined
        if (!tpl) {
          const [row] = await db
            .select({ id: schema.templates.id })
            .from(schema.templates)
            .where(
              and(
                eq(schema.templates.name, msg.template),
                eq(schema.templates.channelType, channelType)
              )
            )
            .limit(1)
          if (row) {
            tpl = row
            templateCache.set(tplCacheKey, row)
          }
        }

        if (!tpl) {
          results.push({ error: `Template '${msg.template}' not found for channel '${channelType}'` })
          continue
        }
        templateId = tpl.id
      }

      let batchScheduledAt: Date | undefined
      if (msg.delay) {
        batchScheduledAt = parseDelay(msg.delay)
      } else if (msg.scheduledAt) {
        batchScheduledAt = new Date(msg.scheduledAt)
      }

      const messageId = await enqueue({
        channelType: channelType as ChannelType,
        to: msg.to,
        subject: msg.subject,
        body: msg.body,
        templateId,
        templateVars: msg.variables,
        idempotencyKey: msg.idempotencyKey,
        scheduledAt: batchScheduledAt,
        channelId,
        ipAddress,
        ipLocation: ipLocation ?? undefined,
        app: msg.app,
        tags: msg.tags,
        priority: msg.priority,
        url: msg.url,
        attachment: msg.attachment,
        format: msg.format,
        userId,
      })

      results.push({ messageId, status: 'queued' })
    } catch (err) {
      results.push({ error: err instanceof Error ? err.message : 'Failed' })
    }
  }

  // Enforce per-user limits after batch (fire-and-forget)
  if (userId) {
    cleanupExpiredUserMessages(userId).catch(() => {})
    trimUserMessages(userId).catch(() => {})
  }

  return c.json({ success: true, data: results })
})

export { send }
