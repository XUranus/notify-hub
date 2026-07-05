import { getDb, schema } from './db/index.js'
import { lt } from 'drizzle-orm'

const LOG_LEVELS = ['debug', 'info', 'warn', 'error'] as const
export type LogLevel = (typeof LOG_LEVELS)[number]

const LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0, info: 1, warn: 2, error: 3,
}

let currentLevel: LogLevel = 'info'
let retentionDays = 0 // 0 = forever
let initialized = false

// ── SSE subscribers for real-time log streaming ──
type LogEntry = { level: LogLevel; message: string; source: string | null; createdAt: Date }
const subscribers = new Set<(entry: LogEntry) => void>()

export function onLog(callback: (entry: LogEntry) => void): () => void {
  subscribers.add(callback)
  return () => { subscribers.delete(callback) }
}

function emit(entry: LogEntry) {
  for (const cb of subscribers) {
    try { cb(entry) } catch { /* ignore */ }
  }
}

// ── Load settings from DB ──
export async function initLogger() {
  if (initialized) return
  initialized = true

  try {
    const db = getDb()
    const rows = await db.select().from(schema.systemSettings)
    const map = new Map(rows.map(r => [r.key, r.value]))

    const savedLevel = map.get('log_level') as LogLevel | undefined
    if (savedLevel && LOG_LEVELS.includes(savedLevel)) {
      currentLevel = savedLevel
    }

    const savedRetention = map.get('log_retention_days')
    if (savedRetention !== undefined) {
      retentionDays = parseInt(savedRetention) || 0
    }
  } catch { /* DB may not be ready yet */ }

  // Install console interceptors
  installInterceptors()

  // Schedule periodic cleanup (every hour)
  setInterval(cleanupOldLogs, 60 * 60 * 1000)
  // Run initial cleanup after 30 seconds
  setTimeout(cleanupOldLogs, 30_000)
}

function installInterceptors() {
  const origLog = console.log.bind(console)
  const origWarn = console.warn.bind(console)
  const origError = console.error.bind(console)

  console.log = (...args: any[]) => {
    origLog(...args)
    writeLog('info', args)
  }
  console.warn = (...args: any[]) => {
    origWarn(...args)
    writeLog('warn', args)
  }
  console.error = (...args: any[]) => {
    origError(...args)
    writeLog('error', args)
  }
}

function formatArgs(args: any[]): string {
  return args.map(a => {
    if (a instanceof Error) return `${a.message}\n${a.stack}`
    if (typeof a === 'object') {
      try { return JSON.stringify(a, null, 2) } catch { return String(a) }
    }
    return String(a)
  }).join(' ')
}

function extractSource(args: any[]): string | null {
  // Try to extract source from patterns like [tag] or [module]
  if (args.length > 0 && typeof args[0] === 'string') {
    const match = args[0].match(/^\[([^\]]+)\]/)
    if (match) return match[1].toLowerCase()
  }
  return null
}

// Debounced batch insert to avoid excessive DB writes
let pendingLogs: { level: LogLevel; message: string; source: string | null }[] = []
let flushTimer: ReturnType<typeof setTimeout> | null = null

function writeLog(level: LogLevel, args: any[]) {
  if (LEVEL_PRIORITY[level] < LEVEL_PRIORITY[currentLevel]) return

  const message = formatArgs(args)
  if (!message.trim()) return

  // Skip our own DB insert logs to avoid recursion
  if (message.includes('app_logs') && level === 'debug') return

  const source = extractSource(args)
  pendingLogs.push({ level, message, source })

  emit({ level, message, source, createdAt: new Date() })

  if (!flushTimer) {
    flushTimer = setTimeout(flushLogs, 200)
  }
}

async function flushLogs() {
  flushTimer = null
  if (pendingLogs.length === 0) return

  const batch = pendingLogs.splice(0)
  try {
    const db = getDb()
    await db.insert(schema.appLogs).values(
      batch.map(entry => ({
        level: entry.level,
        message: entry.message,
        source: entry.source,
      }))
    )
  } catch (err) {
    // Avoid infinite loop — don't log DB errors
  }
}

// ── Log retention cleanup ──
async function cleanupOldLogs() {
  if (retentionDays <= 0) return // 0 = forever
  try {
    const db = getDb()
    const cutoff = new Date(Date.now() - retentionDays * 86400 * 1000)
    await db.delete(schema.appLogs).where(lt(schema.appLogs.createdAt, cutoff))
  } catch { /* ignore */ }
}

// ── Public API for settings ──

export function getLogLevel(): LogLevel {
  return currentLevel
}

export function setLogLevel(level: LogLevel) {
  if (LOG_LEVELS.includes(level)) {
    currentLevel = level
  }
}

export function getLogRetentionDays(): number {
  return retentionDays
}

export function setLogRetentionDays(days: number) {
  retentionDays = days
  // Trigger immediate cleanup if retention changed
  if (days > 0) cleanupOldLogs()
}

export { LOG_LEVELS }
