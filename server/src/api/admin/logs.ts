import { Hono } from 'hono'
import { desc, eq, and, count } from 'drizzle-orm'
import { authMiddleware, requireAdmin } from '../../auth/middleware.js'
import { getDb, schema } from '../../db/index.js'
import { systemSettingsCache } from '../../cache.js'
import {
  getLogLevel, setLogLevel, getLogRetentionDays, setLogRetentionDays,
  onLog, LOG_LEVELS, type LogLevel,
} from '../../logger.js'
import type { HonoEnv } from '../../types.js'

const logs = new Hono<HonoEnv>()

logs.use('*', authMiddleware, requireAdmin)

// ── List logs (paginated) ──
logs.get('/', async (c) => {
  const db = getDb()
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const pageSize = Math.min(200, Math.max(1, parseInt(c.req.query('pageSize') || '50')))
  const level = c.req.query('level') as LogLevel | undefined
  const offset = (page - 1) * pageSize

  const conditions = []
  if (level && LOG_LEVELS.includes(level)) {
    conditions.push(eq(schema.appLogs.level, level))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const [totalRow] = await db.select({ n: count() }).from(schema.appLogs).where(where)
  const items = await db.select().from(schema.appLogs)
    .where(where)
    .orderBy(desc(schema.appLogs.createdAt))
    .limit(pageSize)
    .offset(offset)

  return c.json({
    success: true,
    data: {
      items,
      total: totalRow.n,
      page,
      pageSize,
    },
  })
})

// ── Export logs as text ──
logs.get('/export', async (c) => {
  const db = getDb()
  const level = c.req.query('level') as LogLevel | undefined
  const limit = Math.min(10000, parseInt(c.req.query('limit') || '5000'))

  const conditions = []
  if (level && LOG_LEVELS.includes(level)) {
    conditions.push(eq(schema.appLogs.level, level))
  }
  const where = conditions.length > 0 ? and(...conditions) : undefined

  const items = await db.select().from(schema.appLogs)
    .where(where)
    .orderBy(desc(schema.appLogs.createdAt))
    .limit(limit)

  const lines = items.map(row => {
    const ts = new Date(row.createdAt).toISOString()
    const src = row.source ? `[${row.source}]` : ''
    return `${ts} [${row.level.toUpperCase()}]${src} ${row.message}`
  }).reverse().join('\n')

  return new Response(lines, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Content-Disposition': `attachment; filename="notifyhub-logs-${new Date().toISOString().slice(0, 10)}.txt"`,
    },
  })
})

// ── SSE stream for real-time logs ──
// Accept token via query param as fallback for environments that strip headers on long connections
logs.get('/stream', async (c) => {
  // Verify auth explicitly (middleware already ran, but double-check for SSE keep-alive)
  const currentUser = c.get('currentUser')
  if (!currentUser || currentUser.role !== 'admin') {
    return c.json({ success: false, error: 'Admin access required' }, 403)
  }

  const encoder = new TextEncoder()

  const stream = new ReadableStream({
    start(controller) {
      // Send initial heartbeat
      controller.enqueue(encoder.encode(': connected\n\n'))

      const unsubscribe = onLog((entry) => {
        try {
          const data = JSON.stringify({
            level: entry.level,
            message: entry.message,
            source: entry.source,
            createdAt: entry.createdAt.toISOString(),
          })
          controller.enqueue(encoder.encode(`data: ${data}\n\n`))
        } catch { /* client disconnected */ }
      })

      // Heartbeat every 30s to keep connection alive
      const heartbeat = setInterval(() => {
        try {
          controller.enqueue(encoder.encode(': heartbeat\n\n'))
        } catch {
          clearInterval(heartbeat)
        }
      }, 30_000)

      // Cleanup when the connection closes
      c.req.raw.signal.addEventListener('abort', () => {
        unsubscribe()
        clearInterval(heartbeat)
        try { controller.close() } catch { /* already closed */ }
      })
    },
  })

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  })
})

// ── Get log settings ──
logs.get('/settings', async (c) => {
  return c.json({
    success: true,
    data: {
      logLevel: getLogLevel(),
      logRetentionDays: getLogRetentionDays(),
    },
  })
})

// ── Update log settings ──
logs.put('/settings', async (c) => {
  const db = getDb()
  const body = await c.req.json()

  if (body.logLevel !== undefined) {
    const level = body.logLevel as LogLevel
    if (!LOG_LEVELS.includes(level)) {
      return c.json({ success: false, error: `Invalid log level. Allowed: ${LOG_LEVELS.join(', ')}` }, 400)
    }
    setLogLevel(level)

    const existing = await db.select().from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'log_level')).limit(1)
    if (existing[0]) {
      await db.update(schema.systemSettings).set({ value: level }).where(eq(schema.systemSettings.key, 'log_level'))
    } else {
      await db.insert(schema.systemSettings).values({ key: 'log_level', value: level })
    }
    systemSettingsCache.delete('log_level')
  }

  if (body.logRetentionDays !== undefined) {
    const days = parseInt(body.logRetentionDays)
    // Allowed: 0 (forever), 3, 7, 30, 365
    if (![0, 3, 7, 30, 365].includes(days)) {
      return c.json({ success: false, error: 'Invalid retention days. Allowed: 0, 3, 7, 30, 365' }, 400)
    }
    setLogRetentionDays(days)

    const existing = await db.select().from(schema.systemSettings)
      .where(eq(schema.systemSettings.key, 'log_retention_days')).limit(1)
    if (existing[0]) {
      await db.update(schema.systemSettings).set({ value: String(days) }).where(eq(schema.systemSettings.key, 'log_retention_days'))
    } else {
      await db.insert(schema.systemSettings).values({ key: 'log_retention_days', value: String(days) })
    }
    systemSettingsCache.delete('log_retention_days')
  }

  return c.json({ success: true })
})

export { logs }
