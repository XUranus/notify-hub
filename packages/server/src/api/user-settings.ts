import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { authMiddleware } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import type { HonoEnv } from '../types.js'

const userSettings = new Hono<HonoEnv>()

userSettings.use('*', authMiddleware)

/** Get or create user settings row */
async function getOrCreateSettings(userId: number) {
  const db = getDb()
  const rows = await db.select().from(schema.userSettings)
    .where(eq(schema.userSettings.userId, userId))
    .limit(1)

  if (rows[0]) return rows[0]

  // Create with defaults
  const [created] = await db.insert(schema.userSettings).values({
    userId,
    attachmentExpiration: 0,
    messageExpiration: 0,
  }).returning()
  return created
}

// ── Get current user's settings ──
userSettings.get('/', async (c) => {
  const user = c.get('currentUser')!
  const settings = await getOrCreateSettings(user.userId)

  return c.json({
    success: true,
    data: {
      attachmentExpiration: settings.attachmentExpiration,
      messageExpiration: settings.messageExpiration,
    }
  })
})

// ── Update current user's settings ──
userSettings.put('/', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()
  const body = await c.req.json()

  const updates: Record<string, unknown> = {}

  if (body.attachmentExpiration !== undefined) {
    const valid = [0, 1, 3, 7, 30]
    if (!valid.includes(body.attachmentExpiration)) {
      return c.json({ success: false, error: 'Invalid attachmentExpiration value' }, 400)
    }
    updates.attachmentExpiration = body.attachmentExpiration
  }

  if (body.messageExpiration !== undefined) {
    const valid = [0, 1, 3, 7]
    if (!valid.includes(body.messageExpiration)) {
      return c.json({ success: false, error: 'Invalid messageExpiration value' }, 400)
    }
    updates.messageExpiration = body.messageExpiration
  }

  if (Object.keys(updates).length === 0) {
    return c.json({ success: false, error: 'No valid fields to update' }, 400)
  }

  updates.updatedAt = new Date()

  const existing = await db.select().from(schema.userSettings)
    .where(eq(schema.userSettings.userId, user.userId))
    .limit(1)

  if (existing[0]) {
    await db.update(schema.userSettings)
      .set(updates)
      .where(eq(schema.userSettings.userId, user.userId))
  } else {
    await db.insert(schema.userSettings).values({
      userId: user.userId,
      attachmentExpiration: body.attachmentExpiration ?? 0,
      messageExpiration: body.messageExpiration ?? 0,
    })
  }

  return c.json({ success: true })
})

// ── Backward compat: GET /attachment ──
userSettings.get('/attachment', async (c) => {
  const user = c.get('currentUser')!
  const settings = await getOrCreateSettings(user.userId)
  return c.json({
    success: true,
    data: { attachmentExpiration: settings.attachmentExpiration }
  })
})

// ── Backward compat: PUT /attachment ──
userSettings.put('/attachment', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()
  const body = await c.req.json()
  const { attachmentExpiration } = body

  const valid = [0, 1, 3, 7, 30]
  if (!valid.includes(attachmentExpiration)) {
    return c.json({ success: false, error: 'Invalid expiration value' }, 400)
  }

  const existing = await db.select().from(schema.userSettings)
    .where(eq(schema.userSettings.userId, user.userId))
    .limit(1)

  if (existing[0]) {
    await db.update(schema.userSettings)
      .set({ attachmentExpiration, updatedAt: new Date() })
      .where(eq(schema.userSettings.userId, user.userId))
  } else {
    await db.insert(schema.userSettings).values({
      userId: user.userId,
      attachmentExpiration,
    })
  }

  return c.json({ success: true })
})

export { userSettings }
