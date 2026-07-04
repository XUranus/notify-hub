import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import { getDb, schema } from '../db/index.js'
import { getConfig } from '../config.js'
import { checkRateLimit } from './rate-limit.js'
import { apiTokenCache } from '../cache.js'
import type { HonoEnv } from '../types.js'

/**
 * Try to authenticate via JWT. Returns true if successful (sets currentUser), false if not a JWT.
 * Returns a Response only on hard failures (JWT present but invalid/expired).
 */
async function tryJwtAuth(c: Context<HonoEnv>): Promise<Response | true | false> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) return false

  const token = authHeader.slice(7)

  // Quick check: JWTs contain dots, API tokens don't
  if (!token.includes('.')) return false

  try {
    const config = getConfig()
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: number
      email: string
      role: 'admin' | 'user'
    }
    c.set('currentUser', payload)
    c.set('adminUser', { userId: payload.userId, username: payload.email })
    return true
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401)
  }
}

/**
 * Try to authenticate via API token. Returns true if successful (sets apiToken), false otherwise.
 * Only called when Authorization header is present.
 */
async function tryApiTokenAuth(c: Context<HonoEnv>): Promise<Response | true> {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  let apiToken = apiTokenCache.get(token)
  if (!apiToken) {
    const db = getDb()
    const [row] = await db
      .select()
      .from(schema.apiTokens)
      .where(eq(schema.apiTokens.token, token))
      .limit(1)
    if (row) {
      apiToken = row
      apiTokenCache.set(token, row)
    }
  }

  if (!apiToken) {
    return c.json({ success: false, error: 'Invalid API token' }, 401)
  }

  if (!apiToken.enabled) {
    return c.json({ success: false, error: 'API token is disabled' }, 403)
  }

  if (apiToken.expiresAt && new Date() > apiToken.expiresAt) {
    return c.json({ success: false, error: 'API token has expired' }, 401)
  }

  if (apiToken.ipWhitelist) {
    const whitelist: string[] = JSON.parse(apiToken.ipWhitelist)
    const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
      || c.req.header('X-Real-IP')
      || 'unknown'
    if (whitelist.length > 0 && !whitelist.includes(clientIp)) {
      return c.json({ success: false, error: 'IP address not allowed' }, 403)
    }
  }

  const rateLimitResult = checkRateLimit(apiToken.id, apiToken.rateLimit)
  if (!rateLimitResult.allowed) {
    return c.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
    )
  }

  getDb().update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiTokens.id, apiToken.id))
    .catch(() => { /* ignore update errors */ })

  c.set('apiToken', {
    ...apiToken,
    scopes: JSON.parse(apiToken.scopes) as string[],
  })

  return true
}

/**
 * JWT authentication middleware for any authenticated user.
 * Expects: Authorization: Bearer <jwt>
 * Sets `currentUser` on context with { userId, email, role }.
 */
export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const result = await tryJwtAuth(c)
  if (result === false) {
    return c.json({ success: false, error: 'Missing or invalid authorization header' }, 401)
  }
  if (result !== true) return result // error Response
  await next()
}

/**
 * Client authentication middleware (JWT-only, same as authMiddleware).
 * Expects: Authorization: Bearer <jwt>
 * Sets `currentUser` on context with { userId, email, role }.
 */
export const clientAuth = authMiddleware

/**
 * Admin-only access middleware. Must be used after authMiddleware.
 */
export async function requireAdmin(c: Context<HonoEnv>, next: Next) {
  const user = c.get('currentUser')
  if (!user) {
    return c.json({ success: false, error: 'Authentication required' }, 401)
  }
  if (user.role !== 'admin') {
    return c.json({ success: false, error: 'Admin access required' }, 403)
  }
  await next()
}

/**
 * Legacy admin JWT authentication middleware (backward compat).
 * @deprecated Use authMiddleware instead.
 */
export const adminAuth = authMiddleware

/**
 * API Token authentication middleware.
 * Expects: Authorization: Bearer <api-token>
 * Validates token exists, is enabled, checks scope and IP whitelist.
 */
export async function apiAuth(c: Context<HonoEnv>, next: Next) {
  const result = await tryApiTokenAuth(c)
  if (result !== true) return result
  await next()
}

/**
 * Dual authentication middleware — tries JWT first, falls back to API token.
 * Always sets `currentUser` (for userId access). Also sets `apiToken` if API token was used.
 * For endpoints that need to work with both client JWTs and API tokens.
 */
export async function dualAuth(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)

  // Try JWT first (JWTs contain dots, API tokens don't)
  if (token.includes('.')) {
    const jwtResult = await tryJwtAuth(c)
    if (jwtResult === true) return next()
    if (jwtResult !== false) return jwtResult // hard error Response
  }

  // Fall back to API token auth
  const apiResult = await tryApiTokenAuth(c)
  if (apiResult !== true) return apiResult

  // API token auth succeeded — also set currentUser for uniform userId access
  const apiToken = c.get('apiToken')!
  c.set('currentUser', {
    userId: apiToken.userId ?? 0, // 0 = orphaned legacy token (created before userId column existed)
    email: '',
    role: 'user',
  })

  await next()
}

/**
 * Scope check middleware. Must be used after apiAuth.
 */
export function requireScope(scope: string) {
  return async (c: Context<HonoEnv>, next: Next) => {
    const token = c.get('apiToken')
    if (!token) {
      return c.json({ success: false, error: 'Authentication required' }, 401)
    }

    if (!token.scopes.includes('*') && !token.scopes.includes(scope)) {
      return c.json(
        { success: false, error: `Token does not have '${scope}' scope` },
        403
      )
    }

    await next()
  }
}
