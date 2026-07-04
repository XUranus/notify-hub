import { Hono } from 'hono'
import { sql, eq, and } from 'drizzle-orm'
import { getDb, schema } from '../../db/index.js'
import type { HonoEnv } from '../../types.js'

const stats = new Hono<HonoEnv>()

/**
 * GET /api/admin/stats/overview
 * Admin sees global stats; regular user sees their own (defense-in-depth).
 * Uses a single conditional aggregation query instead of 7 separate COUNTs.
 */
stats.get('/overview', async (c) => {
  const db = getDb()
  const currentUser = c.get('currentUser')!
  const userFilter = currentUser.role === 'admin'
    ? undefined
    : eq(schema.messages.userId, currentUser.userId)

  const nowSec = Math.floor(Date.now() / 1000)
  const oneDayAgoSec = nowSec - 24 * 60 * 60
  const sevenDaysAgoSec = nowSec - 7 * 24 * 60 * 60

  const [row] = await db
    .select({
      totalMessages: sql<number>`count(*)`,
      sentMessages: sql<number>`sum(case when ${schema.messages.status} = 'sent' then 1 else 0 end)`,
      failedMessages: sql<number>`sum(case when ${schema.messages.status} = 'failed' then 1 else 0 end)`,
      deadMessages: sql<number>`sum(case when ${schema.messages.status} = 'dead' then 1 else 0 end)`,
      queuedMessages: sql<number>`sum(case when ${schema.messages.status} = 'queued' then 1 else 0 end)`,
      messagesLast24h: sql<number>`sum(case when ${schema.messages.createdAt} >= ${oneDayAgoSec} then 1 else 0 end)`,
      messagesLast7d: sql<number>`sum(case when ${schema.messages.createdAt} >= ${sevenDaysAgoSec} then 1 else 0 end)`,
    })
    .from(schema.messages)
    .where(userFilter)

  const totalMessages = row?.totalMessages ?? 0
  const sentMessages = row?.sentMessages ?? 0
  const successRate = totalMessages > 0
    ? Math.round((sentMessages / totalMessages) * 100 * 100) / 100
    : 0

  return c.json({
    success: true,
    data: {
      totalMessages,
      sentMessages,
      failedMessages: (row?.failedMessages ?? 0) + (row?.deadMessages ?? 0),
      queuedMessages: row?.queuedMessages ?? 0,
      successRate,
      messagesLast24h: row?.messagesLast24h ?? 0,
      messagesLast7d: row?.messagesLast7d ?? 0,
    },
  })
})

/**
 * GET /api/admin/stats/daily - Daily message counts for the last 7 days.
 */
stats.get('/daily', async (c) => {
  const db = getDb()
  const currentUser = c.get('currentUser')!
  const userFilter = currentUser.role === 'admin'
    ? undefined
    : eq(schema.messages.userId, currentUser.userId)

  const sevenDaysAgoSec = Math.floor((Date.now() - 7 * 24 * 60 * 60 * 1000) / 1000)
  const whereClauses = (extra?: any) => userFilter ? (extra ? and(userFilter, extra) : userFilter) : extra

  const rows = await db
    .select({
      date: sql<string>`date(${schema.messages.createdAt}, 'unixepoch', 'localtime')`,
      total: sql<number>`count(*)`,
      sent: sql<number>`sum(case when ${schema.messages.status} = 'sent' then 1 else 0 end)`,
      failed: sql<number>`sum(case when ${schema.messages.status} in ('failed', 'dead') then 1 else 0 end)`,
    })
    .from(schema.messages)
    .where(whereClauses(sql`${schema.messages.createdAt} >= ${sevenDaysAgoSec}`))
    .groupBy(sql`date(${schema.messages.createdAt}, 'unixepoch', 'localtime')`)
    .orderBy(sql`date(${schema.messages.createdAt}, 'unixepoch', 'localtime')`)

  return c.json({ success: true, data: rows })
})

/**
 * GET /api/admin/stats/channels - Message counts grouped by channel type.
 */
stats.get('/channels', async (c) => {
  const db = getDb()
  const currentUser = c.get('currentUser')!
  const userFilter = currentUser.role === 'admin'
    ? undefined
    : eq(schema.messages.userId, currentUser.userId)

  const rows = await db
    .select({
      channel: schema.messages.channelType,
      count: sql<number>`count(*)`,
    })
    .from(schema.messages)
    .where(userFilter)
    .groupBy(schema.messages.channelType)
    .orderBy(sql`count(*) desc`)

  return c.json({ success: true, data: rows })
})

/**
 * GET /api/admin/stats/recent - Latest 10 messages for activity feed.
 */
stats.get('/recent', async (c) => {
  const db = getDb()
  const currentUser = c.get('currentUser')!
  const userFilter = currentUser.role === 'admin'
    ? undefined
    : eq(schema.messages.userId, currentUser.userId)

  const rows = await db
    .select({
      id: schema.messages.id,
      channelType: schema.messages.channelType,
      toAddress: schema.messages.toAddress,
      subject: schema.messages.subject,
      status: schema.messages.status,
      createdAt: schema.messages.createdAt,
    })
    .from(schema.messages)
    .where(userFilter)
    .orderBy(sql`${schema.messages.createdAt} desc`)
    .limit(10)

  return c.json({ success: true, data: rows })
})

export { stats }
