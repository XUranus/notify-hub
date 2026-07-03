import { Hono } from 'hono'
import { sql, eq, and, gte } from 'drizzle-orm'
import { getDb, schema } from '../../db/index.js'

const stats = new Hono()

/**
 * GET /api/admin/stats/overview
 */
stats.get('/overview', async (c) => {
  const db = getDb()

  const now = Date.now()
  const oneDayAgo = new Date(now - 24 * 60 * 60 * 1000)
  const sevenDaysAgo = new Date(now - 7 * 24 * 60 * 60 * 1000)

  const [total] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)

  const [sent] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.status, 'sent'))

  const [failed] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.status, 'failed'))

  const [dead] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.status, 'dead'))

  const [queued] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(eq(schema.messages.status, 'queued'))

  const [last24h] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(gte(schema.messages.createdAt, oneDayAgo))

  const [last7d] = await db
    .select({ count: sql<number>`count(*)` })
    .from(schema.messages)
    .where(gte(schema.messages.createdAt, sevenDaysAgo))

  const totalMessages = total.count
  const sentMessages = sent.count
  const successRate = totalMessages > 0
    ? Math.round((sentMessages / totalMessages) * 100 * 100) / 100
    : 0

  return c.json({
    success: true,
    data: {
      totalMessages,
      sentMessages,
      failedMessages: failed.count + dead.count,
      queuedMessages: queued.count,
      successRate,
      messagesLast24h: last24h.count,
      messagesLast7d: last7d.count,
    },
  })
})

/**
 * GET /api/admin/stats/daily - Daily message counts for the last 7 days.
 */
stats.get('/daily', async (c) => {
  const db = getDb()
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

  const rows = await db
    .select({
      date: sql<string>`date(${schema.messages.createdAt} / 1000, 'unixepoch')`,
      total: sql<number>`count(*)`,
      sent: sql<number>`sum(case when ${schema.messages.status} = 'sent' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${schema.messages.status} in ('failed', 'dead') then 1 else 0 end)`,
    })
    .from(schema.messages)
    .where(gte(schema.messages.createdAt, sevenDaysAgo))
    .groupBy(sql`date(${schema.messages.createdAt} / 1000, 'unixepoch')`)
    .orderBy(sql`date(${schema.messages.createdAt} / 1000, 'unixepoch')`)

  return c.json({ success: true, data: rows })
})

export { stats }
