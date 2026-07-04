import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { getConfig } from '../config.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

/**
 * Run database migrations. Creates the database file if it doesn't exist.
 */
export async function runMigrations() {
  const config = getConfig()
  const dbPath = config.databaseUrl

  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')

  const db = drizzle(sqlite)

  console.log('[db] Running migrations...')
  await migrate(db, { migrationsFolder: './drizzle' })
  console.log('[db] Migrations completed.')

  sqlite.close()
}

// Allow running directly
const isDirectRun = process.argv[1]?.includes('migrate')
if (isDirectRun) {
  runMigrations()
    .then(() => console.log('Done.'))
    .catch((err) => {
      console.error('Migration failed:', err)
      process.exit(1)
    })
}
