import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { eq, or } from 'drizzle-orm'
import { clientLoginSchema, CLIENT_JWT_EXPIRY } from '@notify-hub/shared'
import { getDb, schema } from '../db/index.js'
import { getConfig } from '../config.js'
import { checkRegistrationRateLimit } from '../auth/rate-limit.js'
import type { HonoEnv } from '../types.js'

const clientAuth = new Hono<HonoEnv>()

/**
 * POST /api/auth/login
 * Client login with email/username + password. Returns JWT with 90-day expiry.
 */
clientAuth.post('/login', async (c) => {
  // Rate limit: 5 login attempts per IP per hour
  const clientIp = c.req.header('X-Forwarded-For')?.split(',')[0]?.trim()
    || c.req.header('X-Real-IP')
    || 'unknown'
  const rateLimitResult = checkRegistrationRateLimit(clientIp)
  if (!rateLimitResult.allowed) {
    return c.json(
      { success: false, error: 'Too many login attempts. Please try again later.' },
      { status: 429, headers: { 'Retry-After': String(rateLimitResult.retryAfter) } }
    )
  }

  const body = await c.req.json()
  const parsed = clientLoginSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { emailOrUsername, password } = parsed.data
  const db = getDb()
  const config = getConfig()

  // Look up user by email or username
  const [user] = await db
    .select()
    .from(schema.users)
    .where(
      or(
        eq(schema.users.email, emailOrUsername),
        eq(schema.users.username, emailOrUsername)
      )
    )
    .limit(1)

  if (!user) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  const valid = await bcrypt.compare(password, user.password)
  if (!valid) {
    return c.json({ success: false, error: 'Invalid credentials' }, 401)
  }

  const token = jwt.sign(
    { userId: user.id, email: user.email, role: user.role },
    config.jwtSecret,
    { expiresIn: CLIENT_JWT_EXPIRY }
  )

  return c.json({
    success: true,
    data: {
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    },
  })
})

export { clientAuth }
