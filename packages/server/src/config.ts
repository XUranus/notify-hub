import { readFileSync, existsSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { randomBytes } from 'node:crypto'

export interface Config {
  port: number
  host: string
  nodeEnv: 'development' | 'production' | 'test'
  databaseUrl: string
  adminEmail: string
  adminUsername: string
  adminPassword: string
  jwtSecret: string
  corsOrigin: string
}

let _config: Config | null = null

function loadEnvFile(): Record<string, string> {
  const envPath = resolve(process.cwd(), '.env')
  if (!existsSync(envPath)) return {}

  const content = readFileSync(envPath, 'utf-8')
  const env: Record<string, string> = {}

  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eqIdx = trimmed.indexOf('=')
    if (eqIdx === -1) continue
    const key = trimmed.slice(0, eqIdx).trim()
    const value = trimmed.slice(eqIdx + 1).trim()
    env[key] = value
  }

  return env
}

export function getConfig(): Config {
  if (_config) return _config

  const envFile = loadEnvFile()
  const get = (key: string, fallback = '') =>
    process.env[key] || envFile[key] || fallback

  _config = {
    port: parseInt(get('PORT', '9527'), 10),
    host: get('HOST', '0.0.0.0'),
    nodeEnv: get('NODE_ENV', 'development') as Config['nodeEnv'],
    databaseUrl: resolve(get('DATABASE_URL', './data/notify-hub.db')),
    adminEmail: get('ADMIN_EMAIL', 'admin@notifyhub.local'),
    adminUsername: get('ADMIN_USERNAME', 'admin'),
    adminPassword: get('ADMIN_PASSWORD', 'admin123'),
    jwtSecret: get('JWT_SECRET') || generateSecret('jwt'),
    corsOrigin: get('CORS_ORIGIN', '*'),
  }

  return _config
}

function generateSecret(prefix: string): string {
  const secret = randomBytes(32).toString('hex')
  console.warn(
    `[config] No ${prefix.toUpperCase()} secret configured, generated random one. ` +
    `Set ${prefix.toUpperCase()}_SECRET in .env for persistence across restarts.`
  )
  return secret
}
