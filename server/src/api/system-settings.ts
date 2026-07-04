import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireAdmin } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import { systemSettingsCache } from '../cache.js'
import type { HonoEnv } from '../types.js'

const systemSettings = new Hono<HonoEnv>()

systemSettings.use('*', authMiddleware, requireAdmin)

const SETTINGS_KEYS = [
  'attachment_max_file_size',
  'attachment_max_total_size',
] as const

// ── Get all system settings ──
systemSettings.get('/', async (c) => {
  const db = getDb()

  const rows = await db.select().from(schema.systemSettings)
  const map = new Map(rows.map(r => [r.key, r.value]))

  return c.json({
    success: true,
    data: {
      attachmentMaxFileSize: parseInt(map.get('attachment_max_file_size') || '1048576'),
      attachmentMaxTotalSize: parseInt(map.get('attachment_max_total_size') || '10485760'),
      maxMessagesPerUser: parseInt(map.get('max_messages_per_user') || '1000'),
      cleanupIntervalMinutes: parseInt(map.get('cleanup_interval_minutes') || '60'),
    }
  })
})

// ── Update system settings ──
systemSettings.put('/', async (c) => {
  const db = getDb()
  const body = await c.req.json()

  const updates: Record<string, string> = {}

  if (body.attachmentMaxFileSize !== undefined) {
    const val = parseInt(body.attachmentMaxFileSize)
    if (isNaN(val) || val < 0) {
      return c.json({ success: false, error: 'Invalid attachmentMaxFileSize' }, 400)
    }
    updates['attachment_max_file_size'] = String(val)
  }

  if (body.attachmentMaxTotalSize !== undefined) {
    const val = parseInt(body.attachmentMaxTotalSize)
    if (isNaN(val) || val < 0) {
      return c.json({ success: false, error: 'Invalid attachmentMaxTotalSize' }, 400)
    }
    updates['attachment_max_total_size'] = String(val)
  }

  if (body.maxMessagesPerUser !== undefined) {
    const val = parseInt(body.maxMessagesPerUser)
    if (isNaN(val) || val < 0) {
      return c.json({ success: false, error: 'Invalid maxMessagesPerUser' }, 400)
    }
    updates['max_messages_per_user'] = String(val)
  }

  if (body.cleanupIntervalMinutes !== undefined) {
    const val = parseInt(body.cleanupIntervalMinutes)
    // Valid values: 5, 60, 720 (5min, 1h, 12h)
    if (![5, 60, 720].includes(val)) {
      return c.json({ success: false, error: 'Invalid cleanupIntervalMinutes (allowed: 5, 60, 720)' }, 400)
    }
    updates['cleanup_interval_minutes'] = String(val)
  }

  for (const [key, value] of Object.entries(updates)) {
    const existing = await db.select().from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, key))
      .limit(1)

    if (existing[0]) {
      await db.update(schema.systemSettings)
        .set({ value })
        .where(eq(schema.systemSettings.key, key))
    } else {
      await db.insert(schema.systemSettings).values({ key, value })
    }
    systemSettingsCache.delete(key)
  }

  return c.json({ success: true })
})

export { systemSettings }
