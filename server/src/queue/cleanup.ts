import { and, eq, lt, sql } from 'drizzle-orm'
import { getDb, schema } from '../db/index.js'

const DEFAULT_RETENTION_DAYS = 30

/**
 * Purge old sent/dead messages older than the retention period.
 * Returns the number of deleted rows.
 */
export async function cleanupOldMessages(
  retentionDays: number = DEFAULT_RETENTION_DAYS
): Promise<number> {
  const db = getDb()
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000)

  // Only delete terminal-state messages (sent, delivered, dead)
  const result = await db
    .delete(schema.messages)
    .where(
      and(
        sql`${schema.messages.status} IN ('sent', 'delivered', 'dead')`,
        lt(schema.messages.createdAt, cutoff)
      )
    )

  // better-sqlite3 returns changes count via .changes
  return (result as any).rowsAffected ?? 0
}
