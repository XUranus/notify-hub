import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import * as schema from './schema.js'
import { getConfig } from '../config.js'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'

let _db: ReturnType<typeof drizzle> | null = null

export function getDb() {
  if (_db) return _db

  const config = getConfig()
  const dbPath = config.databaseUrl

  // Ensure data directory exists
  mkdirSync(dirname(dbPath), { recursive: true })

  const sqlite = new Database(dbPath)
  sqlite.pragma('journal_mode = WAL')
  sqlite.pragma('busy_timeout = 5000')
  sqlite.pragma('synchronous = NORMAL')

  _db = drizzle(sqlite, { schema })
  return _db
}

export { schema }
