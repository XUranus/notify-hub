import { Context, Next } from 'hono'
import jwt from 'jsonwebtoken'
import { eq, and } from 'drizzle-orm'
import { getDb, schema } from '../db/index.js'
import { getConfig } from '../config.js'
import { checkRateLimit } from './rate-limit.js'
import type { HonoEnv } from '../types.js'

/**
 * JWT authentication middleware for any authenticated user.
 * Expects: Authorization: Bearer <jwt>
 * Sets `currentUser` on context with { userId, email, role }.
 */
export async function authMiddleware(c: Context<HonoEnv>, next: Next) {
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)
  try {
    const config = getConfig()
    const payload = jwt.verify(token, config.jwtSecret) as {
      userId: number
      email: string
      role: 'admin' | 'user'
    }
    c.set('currentUser', payload)
    // Also set adminUser for backward compatibility
    c.set('adminUser', { userId: payload.userId, username: payload.email })
    await next()
  } catch {
    return c.json({ success: false, error: 'Invalid or expired token' }, 401)
  }
}

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
  const authHeader = c.req.header('Authorization')
  if (!authHeader?.startsWith('Bearer ')) {
    return c.json({ success: false, error: 'Missing or invalid authorization header' }, 401)
  }

  const token = authHeader.slice(7)
  const db = getDb()

  const [apiToken] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.token, token))
    .limit(1)

  if (!apiToken) {
    return c.json({ success: false, error: 'Invalid API token' }, 401)
  }

  if (!apiToken.enabled) {
    return c.json({ success: false, error: 'API token is disabled' }, 403)
  }

  // Check IP whitelist
  if (apiToken.ipWhitelist) {
    const whitelist: string[] = JSON.parse(apiToken.ipWhitelist)
    const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
      || c.req.header('X-Real-IP')
      || 'unknown'

    if (whitelist.length > 0 && !whitelist.includes(clientIp)) {
      return c.json({ success: false, error: 'IP address not allowed' }, 403)
    }
  }

  // Check rate limit
  const rateLimitResult = checkRateLimit(apiToken.id, apiToken.rateLimit)
  if (!rateLimitResult.allowed) {
    return c.json(
      { success: false, error: 'Rate limit exceeded' },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
    )
  }

  // Update last used timestamp (fire-and-forget, don't block the request)
  db.update(schema.apiTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(schema.apiTokens.id, apiToken.id))
    .catch(() => { /* ignore update errors */ })

  c.set('apiToken', {
    ...apiToken,
    scopes: JSON.parse(apiToken.scopes) as string[],
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
