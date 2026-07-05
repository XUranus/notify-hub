import { Hono } from 'hono'
import { eq, and, or, lte, sql } from 'drizzle-orm'
import { clientAuth, dualAuth } from '../auth/index.js'
import { getDb, schema } from '../db/index.js'
import type { HonoEnv } from '../types.js'

const push = new Hono<HonoEnv>()

// Throttle lastSeenAt updates: only update per-client every 5 minutes
const lastSeenThrottle = new Map<string, number>()
const LAST_SEEN_THROTTLE_MS = 5 * 60 * 1000 // 5 minutes

// Clean stale throttle entries every 10 minutes
setInterval(() => {
  const cutoff = Date.now() - LAST_SEEN_THROTTLE_MS * 2
  for (const [key, ts] of lastSeenThrottle) {
    if (ts < cutoff) lastSeenThrottle.delete(key)
  }
}, 600_000).unref()

// ── Client endpoints (API token auth) ──

/**
 * POST /api/v1/push/register — Register or update a push client.
 * Associates client with the API token's userId.
 */
push.post('/register', dualAuth, async (c) => {
  const body = await c.req.json()
  const { uuid, name, os, arch, desktop, appVersion } = body

  if (!uuid || !os) {
    return c.json({ success: false, error: 'uuid and os are required' }, 400)
  }

  if (name === '*') {
    return c.json({ success: false, error: "Device name '*' is reserved" }, 400)
  }

  const user = c.get('currentUser')!
  const userId = user.userId

  const db = getDb()
  const now = new Date()

  const [existing] = await db
    .select({ id: schema.pushClients.id })
    .from(schema.pushClients)
    .where(eq(schema.pushClients.uuid, uuid))
    .limit(1)

  if (existing) {
    await db
      .update(schema.pushClients)
      .set({ name, os, arch, desktop: desktop || null, appVersion, lastSeenAt: now, userId })
      .where(eq(schema.pushClients.uuid, uuid))
  } else {
    await db.insert(schema.pushClients).values({
      userId,
      uuid,
      name: name || null,
      os,
      arch: arch || null,
      desktop: desktop || null,
      appVersion: appVersion || null,
      lastSeenAt: now,
    })
  }

  return c.json({ success: true })
})

/**
 * PATCH /api/v1/push/client — Update client device info (name, etc.).
 * JWT auth only. Body: { uuid, name }
 */
push.patch('/client', clientAuth, async (c) => {
  const body = await c.req.json()
  const { uuid, name } = body

  if (!uuid) {
    return c.json({ success: false, error: 'uuid is required' }, 400)
  }

  const user = c.get('currentUser')!
  const userId = user.userId
  const db = getDb()

  // Verify ownership
  const [client] = await db
    .select({ id: schema.pushClients.id })
    .from(schema.pushClients)
    .where(and(
      eq(schema.pushClients.uuid, uuid),
      eq(schema.pushClients.userId, userId)
    ))
    .limit(1)

  if (!client) {
    return c.json({ success: false, error: 'Client not found or access denied' }, 403)
  }

  const updates: Record<string, unknown> = {}
  if (name !== undefined) {
    const trimmed = typeof name === 'string' ? name.trim() : ''
    if (trimmed === '*') {
      return c.json({ success: false, error: "Device name '*' is reserved" }, 400)
    }
    if (trimmed.length > 100) {
      return c.json({ success: false, error: 'Name too long (max 100 characters)' }, 400)
    }
    updates.name = trimmed
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: 'No fields to update' }, 400)
  }

  await db
    .update(schema.pushClients)
    .set(updates)
    .where(eq(schema.pushClients.uuid, uuid))

  return c.json({ success: true })
})

/**
 * Verify that a client UUID belongs to the requesting API token's userId.
 * Returns the client record if valid, or null if not found / not owned.
 */
async function verifyClientOwnership(uuid: string, userId: number | null): Promise<boolean> {
  if (userId === null) return true // token without userId can access any client (legacy)
  const db = getDb()
  const [client] = await db
    .select({ id: schema.pushClients.id })
    .from(schema.pushClients)
    .where(and(
      eq(schema.pushClients.uuid, uuid),
      eq(schema.pushClients.userId, userId)
    ))
    .limit(1)
  return !!client
}

/**
 * GET /api/v1/push/poll — Client polls for pending messages.
 * Query: ?uuid=xxx
 * Verifies that the UUID belongs to the requesting token's user.
 */
push.get('/poll', dualAuth, async (c) => {
  const uuid = c.req.query('uuid')
  if (!uuid) {
    return c.json({ success: false, error: 'uuid is required' }, 400)
  }

  const user = c.get('currentUser')!
  const userId = user.userId

  // Verify ownership of this client UUID
  if (userId !== null) {
    const owned = await verifyClientOwnership(uuid, userId)
    if (!owned) {
      return c.json({ success: false, error: 'Client not found or access denied' }, 403)
    }
  }

  const db = getDb()

  // Update lastSeenAt (throttled to once per 5 minutes per client)
  const now = Date.now()
  const lastSeen = lastSeenThrottle.get(uuid) ?? 0
  if (now - lastSeen > LAST_SEEN_THROTTLE_MS) {
    lastSeenThrottle.set(uuid, now)
    await db
      .update(schema.pushClients)
      .set({ lastSeenAt: new Date() })
      .where(eq(schema.pushClients.uuid, uuid))
  }

  // Fetch undelivered messages for this client
  const messages = await db
    .select({
      id: schema.pushMessages.id,
      clientUuid: schema.pushMessages.clientUuid,
      title: schema.pushMessages.title,
      body: schema.pushMessages.body,
      level: schema.pushMessages.level,
      delivered: schema.pushMessages.delivered,
      createdAt: schema.pushMessages.createdAt,
      tags: schema.pushMessages.tags,
      priority: schema.pushMessages.priority,
      url: schema.pushMessages.url,
      attachment: schema.pushMessages.attachment,
      format: schema.pushMessages.format,
      topicId: schema.pushMessages.topicId,
      topicName: schema.topics.name,
      topicDisplayName: schema.topics.displayName,
      topicIcon: schema.topics.icon,
    })
    .from(schema.pushMessages)
    .leftJoin(schema.topics, eq(schema.pushMessages.topicId, schema.topics.id))
    .where(
      and(
        eq(schema.pushMessages.delivered, false),
        eq(schema.pushMessages.clientUuid, uuid)
      )
    )
    .orderBy(schema.pushMessages.createdAt)

  // Mark all as delivered in one query
  if (messages.length > 0) {
    const ids = messages.map((m) => m.id)
    await db
      .update(schema.pushMessages)
      .set({ delivered: true })
      .where(sql`${schema.pushMessages.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)
  }

  return c.json({ success: true, data: messages })
})

/**
 * POST /api/v1/push/ack — Client acknowledges received messages.
 * Verifies that the acked messages belong to the requesting user's clients.
 */
push.post('/ack', dualAuth, async (c) => {
  const body = await c.req.json()
  const { ids, uuid } = body as { ids?: string[]; uuid?: string }

  if (!ids || !Array.isArray(ids)) {
    return c.json({ success: false, error: 'ids array is required' }, 400)
  }

  const user = c.get('currentUser')!
  const userId = user.userId

  // If uuid provided, verify ownership
  if (uuid && userId !== null) {
    const owned = await verifyClientOwnership(uuid, userId)
    if (!owned) {
      return c.json({ success: false, error: 'Client not found or access denied' }, 403)
    }
  }

  const db = getDb()

  if (userId !== null) {
    // Get all client UUIDs owned by this user
    const ownedClients = await db
      .select({ uuid: schema.pushClients.uuid })
      .from(schema.pushClients)
      .where(eq(schema.pushClients.userId, userId))
    const ownedUuids = new Set(ownedClients.map(c => c.uuid))

    // Batch verify: fetch all messages at once
    const msgs = await db
      .select({ id: schema.pushMessages.id, clientUuid: schema.pushMessages.clientUuid })
      .from(schema.pushMessages)
      .where(sql`${schema.pushMessages.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)

    for (const msg of msgs) {
      if (msg.clientUuid && !ownedUuids.has(msg.clientUuid)) {
        return c.json({ success: false, error: `Message ${msg.id} not found or access denied` }, 403)
      }
    }
  }

  // Batch update all as delivered
  await db
    .update(schema.pushMessages)
    .set({ delivered: true })
    .where(sql`${schema.pushMessages.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)

  return c.json({ success: true })
})

export { push }
