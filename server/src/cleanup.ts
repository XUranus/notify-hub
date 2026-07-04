import { eq, and, lt, isNotNull, sql, desc } from 'drizzle-orm'
import { getDb, schema } from './db/index.js'
import { deleteFile } from './storage.js'

const DEFAULT_INTERVAL_MS = 60 * 60 * 1000 // 1 hour

let timer: ReturnType<typeof setInterval> | null = null
let running = false

/** Get configured cleanup interval from system_settings */
async function getConfiguredIntervalMs(): Promise<number> {
  const db = getDb()
  const row = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'cleanup_interval_minutes'))
    .limit(1)
  if (!row[0]) return DEFAULT_INTERVAL_MS
  const minutes = parseInt(row[0].value)
  if (isNaN(minutes) || minutes <= 0) return DEFAULT_INTERVAL_MS
  return minutes * 60 * 1000
}

/** Delete expired attachments from DB and disk */
async function cleanupExpiredAttachments(): Promise<number> {
  const db = getDb()
  const now = new Date()

  // Get filenames for disk cleanup, then bulk delete from DB
  const expired = await db.select({
    id: schema.attachments.id,
    filename: schema.attachments.filename,
  }).from(schema.attachments)
    .where(and(
      isNotNull(schema.attachments.expiresAt),
      lt(schema.attachments.expiresAt, now)
    ))

  if (expired.length === 0) return 0

  // Delete files from disk
  for (const att of expired) {
    await deleteFile(att.filename)
  }

  // Bulk delete from DB
  const ids = expired.map(a => a.id)
  await db.delete(schema.attachments)
    .where(sql`${schema.attachments.id} IN (${sql.join(ids.map(id => sql`${id}`), sql`, `)})`)

  return expired.length
}

/** Delete expired messages for all users who have messageExpiration set */
async function cleanupExpiredMessages(): Promise<number> {
  const db = getDb()

  const usersWithExpiration = await db.select().from(schema.userSettings)
    .where(sql`${schema.userSettings.messageExpiration} > 0`)

  if (usersWithExpiration.length === 0) return 0

  let totalDeleted = 0
  for (const settings of usersWithExpiration) {
    const cutoff = new Date()
    cutoff.setDate(cutoff.getDate() - settings.messageExpiration)

    // Bulk delete instead of SELECT→loop→DELETE
    const result = await db.delete(schema.messages)
      .where(and(
        eq(schema.messages.userId, settings.userId),
        lt(schema.messages.createdAt, cutoff)
      ))

    totalDeleted += (result as any).rowsAffected ?? 0
  }

  return totalDeleted
}

/** Enforce per-user message limits */
async function enforceUserMessageLimits(): Promise<number> {
  const db = getDb()

  const maxRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'max_messages_per_user'))
    .limit(1)
  const maxMessages = maxRow[0] ? parseInt(maxRow[0].value) : 1000

  const userIds = await db.select({ userId: schema.messages.userId })
    .from(schema.messages)
    .where(sql`${schema.messages.userId} IS NOT NULL`)
    .groupBy(schema.messages.userId)

  let totalTrimmed = 0
  for (const { userId } of userIds) {
    if (!userId) continue

    const countRow = await db.select({ count: sql<number>`count(*)` })
      .from(schema.messages)
      .where(eq(schema.messages.userId, userId))
    const count = countRow[0]?.count ?? 0

    if (count <= maxMessages) continue

    const excess = count - maxMessages
    // Bulk delete using subquery instead of loop
    await db.run(sql`
      DELETE FROM messages
      WHERE id IN (
        SELECT id FROM messages
        WHERE user_id = ${userId}
        ORDER BY created_at ASC
        LIMIT ${excess}
      )
    `)
    totalTrimmed += excess
  }

  return totalTrimmed
}

/** Run all cleanup tasks and record results */
async function runCleanup(): Promise<void> {
  if (running) return
  running = true

  const db = getDb()
  const startedAt = new Date()

  // Insert a running log entry
  const [logEntry] = await db.insert(schema.cleanupLogs).values({
    startedAt,
    status: 'running',
  }).returning()

  let expiredAttachments = 0
  let expiredMessages = 0
  let trimmedMessages = 0
  let error: string | null = null

  try {
    expiredAttachments = await cleanupExpiredAttachments()
    expiredMessages = await cleanupExpiredMessages()
    trimmedMessages = await enforceUserMessageLimits()
  } catch (err) {
    error = err instanceof Error ? err.message : String(err)
    console.error('[cleanup] Error during cleanup:', err)
  }

  const finishedAt = new Date()
  const durationMs = finishedAt.getTime() - startedAt.getTime()

  await db.update(schema.cleanupLogs)
    .set({
      finishedAt,
      durationMs,
      status: error ? 'error' : 'success',
      expiredAttachments,
      expiredMessages,
      trimmedMessages,
      error,
    })
    .where(eq(schema.cleanupLogs.id, logEntry.id))

  const parts: string[] = []
  if (expiredAttachments > 0) parts.push(`${expiredAttachments} attachments`)
  if (expiredMessages > 0) parts.push(`${expiredMessages} expired messages`)
  if (trimmedMessages > 0) parts.push(`${trimmedMessages} trimmed messages`)

  if (parts.length > 0) {
    console.log(`[cleanup] Done in ${durationMs}ms: ${parts.join(', ')}`)
  } else {
    console.log(`[cleanup] Done in ${durationMs}ms: nothing to clean`)
  }

  running = false
}

/** Start the cleanup scheduler */
export async function startCleanupScheduler() {
  // Run immediately on startup
  runCleanup().catch(err => {
    console.error('[cleanup] Initial run failed:', err)
  })

  // Schedule periodic runs
  const scheduleNext = async () => {
    const intervalMs = await getConfiguredIntervalMs()
    if (timer) clearInterval(timer)
    timer = setInterval(() => {
      runCleanup().catch(err => {
        console.error('[cleanup] Periodic run failed:', err)
      })
    }, intervalMs)
    console.log(`[cleanup] Scheduler started (interval: ${Math.round(intervalMs / 60000)}min)`)
  }

  await scheduleNext()

  // Re-read interval every 5 minutes in case admin changed it
  setInterval(() => {
    scheduleNext().catch(() => {})
  }, 5 * 60 * 1000)
}

/** Get cleanup logs (paginated) */
export async function getCleanupLogs(page = 1, pageSize = 20) {
  const db = getDb()
  const offset = (page - 1) * pageSize

  const items = await db.select().from(schema.cleanupLogs)
    .orderBy(desc(schema.cleanupLogs.startedAt))
    .limit(pageSize)
    .offset(offset)

  const countRow = await db.select({ count: sql<number>`count(*)` })
    .from(schema.cleanupLogs)
  const total = countRow[0]?.count ?? 0

  return { items, total, page, pageSize }
}
