import { Hono } from 'hono'
import { eq, and, or, lte, desc } from 'drizzle-orm'
import { apiAuth } from '../auth/index.js'
import { authMiddleware, requireAdmin } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import type { HonoEnv } from '../types.js'

const push = new Hono<HonoEnv>()

// ── Client endpoints (API token auth) ──

/**
 * POST /api/v1/push/register — Register or update a push client.
 */
push.post('/register', apiAuth, async (c) => {
  const body = await c.req.json()
  const { uuid, name, os, arch, desktop, appVersion } = body

  if (!uuid || !os) {
    return c.json({ success: false, error: 'uuid and os are required' }, 400)
  }

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
      .set({ name, os, arch, desktop: desktop || null, appVersion, lastSeenAt: now })
      .where(eq(schema.pushClients.uuid, uuid))
  } else {
    await db.insert(schema.pushClients).values({
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
 * GET /api/v1/push/poll — Client polls for pending messages.
 * Query: ?uuid=xxx
 */
push.get('/poll', apiAuth, async (c) => {
  const uuid = c.req.query('uuid')
  if (!uuid) {
    return c.json({ success: false, error: 'uuid is required' }, 400)
  }

  const db = getDb()

  // Update lastSeenAt
  await db
    .update(schema.pushClients)
    .set({ lastSeenAt: new Date() })
    .where(eq(schema.pushClients.uuid, uuid))

  // Fetch undelivered messages for this client (targeted or broadcast)
  const messages = await db
    .select()
    .from(schema.pushMessages)
    .where(
      and(
        eq(schema.pushMessages.delivered, false),
        or(
          eq(schema.pushMessages.clientUuid, uuid),
          eq(schema.pushMessages.clientUuid, '__broadcast__')
        )
      )
    )
    .orderBy(schema.pushMessages.createdAt)

  // Mark as delivered
  if (messages.length > 0) {
    const ids = messages.map((m) => m.id)
    for (const id of ids) {
      await db
        .update(schema.pushMessages)
        .set({ delivered: true })
        .where(eq(schema.pushMessages.id, id))
    }
  }

  return c.json({ success: true, data: messages })
})

/**
 * POST /api/v1/push/ack — Client acknowledges received messages.
 */
push.post('/ack', apiAuth, async (c) => {
  const body = await c.req.json()
  const { ids } = body as { ids?: string[] }

  if (!ids || !Array.isArray(ids)) {
    return c.json({ success: false, error: 'ids array is required' }, 400)
  }

  const db = getDb()
  for (const id of ids) {
    await db
      .update(schema.pushMessages)
      .set({ delivered: true })
      .where(eq(schema.pushMessages.id, id))
  }

  return c.json({ success: true })
})

// ── Admin endpoints (JWT auth) ──

/**
 * GET /api/admin/push/clients — List all registered push clients.
 */
push.get('/clients', authMiddleware, requireAdmin, async (c) => {
  const db = getDb()
  const clients = await db
    .select()
    .from(schema.pushClients)
    .orderBy(desc(schema.pushClients.lastSeenAt))

  return c.json({ success: true, data: clients })
})

/**
 * DELETE /api/admin/push/clients/:uuid — Remove a push client.
 */
push.delete('/clients/:uuid', authMiddleware, requireAdmin, async (c) => {
  const uuid = c.req.param('uuid')!
  const db = getDb()

  await db.delete(schema.pushClients).where(eq(schema.pushClients.uuid, uuid))
  return c.json({ success: true })
})

export { push }
