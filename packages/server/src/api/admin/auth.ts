import { Hono } from 'hono'
import jwt from 'jsonwebtoken'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { loginSchema, registerSchema } from '@notify-hub/shared'
import { getDb, schema } from '../../db/index.js'
import { getConfig } from '../../config.js'
import { JWT_EXPIRY } from '@notify-hub/shared'
import type { HonoEnv } from '../../types.js'

const auth = new Hono<HonoEnv>()

/**
 * POST /api/admin/login
 * Login with email + password. Returns JWT with { userId, email, role }.
 */
auth.post('/login', async (c) => {
  const body = await c.req.json()
  const parsed = loginSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { email, password } = parsed.data
  const db = getDb()
  const config = getConfig()

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
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
    { expiresIn: JWT_EXPIRY }
  )

  return c.json({
    success: true,
    data: {
      token,
      user: { id: user.id, email: user.email, username: user.username, role: user.role },
    },
  })
})

/**
 * POST /api/admin/register
 * Register a new user account (role = 'user').
 */
auth.post('/register', async (c) => {
  const body = await c.req.json()
  const parsed = registerSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { email, password } = parsed.data
  const db = getDb()
  const config = getConfig()

  // Check if email already exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.email, email))
    .limit(1)

  if (existing) {
    return c.json({ success: false, error: 'Email already registered' }, 409)
  }

  const hashedPassword = await bcrypt.hash(password, 10)
  const username = email.split('@')[0]

  const [newUser] = await db
    .insert(schema.users)
    .values({
      email,
      username,
      password: hashedPassword,
      role: 'user',
    })
    .returning()

  const token = jwt.sign(
    { userId: newUser.id, email: newUser.email, role: newUser.role },
    config.jwtSecret,
    { expiresIn: JWT_EXPIRY }
  )

  return c.json({
    success: true,
    data: {
      token,
      user: { id: newUser.id, email: newUser.email, username: newUser.username, role: newUser.role },
    },
  })
})

export { auth }
