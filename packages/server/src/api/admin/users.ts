import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import bcrypt from 'bcryptjs'
import { createUserSchema, updateUserSchema } from '@notify-hub/shared'
import { getDb, schema } from '../../db/index.js'
import { ADMIN_USER_ID, generateUserId } from '../../init.js'
import type { HonoEnv } from '../../types.js'

const users = new Hono<HonoEnv>()

/**
 * GET /api/admin/users — List all users (admin only).
 */
users.get('/', async (c) => {
  const db = getDb()
  const allUsers = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)

  return c.json({ success: true, data: allUsers })
})

/**
 * GET /api/admin/users/:id — Get a single user.
 */
users.get('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const db = getDb()

  const [user] = await db
    .select({
      id: schema.users.id,
      email: schema.users.email,
      username: schema.users.username,
      role: schema.users.role,
      createdAt: schema.users.createdAt,
    })
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404)
  }

  return c.json({ success: true, data: user })
})

/**
 * POST /api/admin/users — Create a new user (admin only).
 */
users.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createUserSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { email, username, password, role } = parsed.data

  // Block creating admin users — admin is config-only
  if (role === 'admin') {
    return c.json({ success: false, error: 'Cannot create admin users via API. Admin is managed by server config.' }, 400)
  }

  const db = getDb()

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
  const userId = await generateUserId(db)

  const [newUser] = await db
    .insert(schema.users)
    .values({
      id: userId,
      email,
      username,
      password: hashedPassword,
      role,
    })
    .returning()

  return c.json({
    success: true,
    data: {
      id: newUser.id,
      email: newUser.email,
      username: newUser.username,
      role: newUser.role,
      createdAt: newUser.createdAt,
    },
  }, 201)
})

/**
 * PUT /api/admin/users/:id — Update a user (admin only).
 */
users.put('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = updateUserSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'User not found' }, 404)
  }

  // Check email uniqueness if changing email
  if (parsed.data.email && parsed.data.email !== existing.email) {
    const [emailTaken] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.email, parsed.data.email))
      .limit(1)

    if (emailTaken) {
      return c.json({ success: false, error: 'Email already in use' }, 409)
    }
  }

  // Block changing role to admin
  if (parsed.data.role === 'admin') {
    return c.json({ success: false, error: 'Cannot grant admin role via API. Admin is managed by server config.' }, 400)
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.email !== undefined) updates.email = parsed.data.email
  if (parsed.data.username !== undefined) updates.username = parsed.data.username
  if (parsed.data.role !== undefined) updates.role = parsed.data.role

  if (Object.keys(updates).length === 0) {
    return c.json({ success: true })
  }

  await db
    .update(schema.users)
    .set(updates)
    .where(eq(schema.users.id, id))

  return c.json({ success: true })
})

/**
 * DELETE /api/admin/users/:id — Delete a user (admin only).
 * Prevents deleting the last admin user.
 */
users.delete('/:id', async (c) => {
  const id = parseInt(c.req.param('id'), 10)
  const db = getDb()

  const [user] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, id))
    .limit(1)

  if (!user) {
    return c.json({ success: false, error: 'User not found' }, 404)
  }

  // Block deleting admin user
  if (id === ADMIN_USER_ID || user.role === 'admin') {
    return c.json({ success: false, error: 'Cannot delete admin user. Admin is managed by server config.' }, 400)
  }

  await db.delete(schema.users).where(eq(schema.users.id, id))
  return c.json({ success: true })
})

export { users }
