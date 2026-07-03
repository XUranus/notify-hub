import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { customAlphabet } from 'nanoid'

const nanoid = customAlphabet('ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789', 32)
import { createTokenSchema, updateTokenSchema } from '@notify-hub/shared'
import { getDb, schema } from '../../db/index.js'
import { API_TOKEN_PREFIX } from '@notify-hub/shared'
import type { HonoEnv } from '../../types.js'

const tokens = new Hono<HonoEnv>()

/**
 * GET /api/admin/tokens
 * Admin sees all tokens; regular users see only their own.
 */
tokens.get('/', async (c) => {
  const currentUser = c.get('currentUser')
  const db = getDb()

  const allTokens = currentUser?.role === 'admin'
    ? await db.select().from(schema.apiTokens)
    : await db
        .select()
        .from(schema.apiTokens)
        .where(eq(schema.apiTokens.userId, currentUser?.userId ?? -1))

  const result = allTokens.map((t) => ({
    ...t,
    scopes: JSON.parse(t.scopes),
    ipWhitelist: t.ipWhitelist ? JSON.parse(t.ipWhitelist) : null,
  }))

  return c.json({ success: true, data: result })
})

/**
 * GET /api/admin/tokens/:id - Get token with full value (only on create or this endpoint).
 */
tokens.get('/:id', async (c) => {
  const currentUser = c.get('currentUser')
  const db = getDb()
  const id = parseInt(c.req.param('id'), 10)

  const [token] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1)

  if (!token) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  // Regular users can only view their own tokens
  if (currentUser?.role !== 'admin' && token.userId !== currentUser?.userId) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  return c.json({
    success: true,
    data: {
      ...token,
      scopes: JSON.parse(token.scopes),
      ipWhitelist: token.ipWhitelist ? JSON.parse(token.ipWhitelist) : null,
    },
  })
})

/**
 * POST /api/admin/tokens - Create a new API token.
 * Token is automatically assigned to the current user.
 */
tokens.post('/', async (c) => {
  const currentUser = c.get('currentUser')
  const body = await c.req.json()
  const parsed = createTokenSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { name, scopes, rateLimit, ipWhitelist } = parsed.data
  const db = getDb()

  const tokenValue = API_TOKEN_PREFIX + nanoid(32)

  const [result] = await db
    .insert(schema.apiTokens)
    .values({
      userId: currentUser?.userId ?? null,
      name,
      token: tokenValue,
      scopes: JSON.stringify(scopes),
      rateLimit,
      ipWhitelist: ipWhitelist ? JSON.stringify(ipWhitelist) : null,
    })
    .returning()

  return c.json({
    success: true,
    data: {
      id: result.id,
      name,
      token: tokenValue, // Full token, only shown on create
      scopes,
      rateLimit,
    },
  }, 201)
})

/**
 * PUT /api/admin/tokens/:id - Update token settings.
 */
tokens.put('/:id', async (c) => {
  const currentUser = c.get('currentUser')
  const id = parseInt(c.req.param('id'), 10)
  const body = await c.req.json()
  const parsed = updateTokenSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  // Regular users can only update their own tokens
  if (currentUser?.role !== 'admin' && existing.userId !== currentUser?.userId) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  const updates: Record<string, unknown> = {}
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.scopes !== undefined) updates.scopes = JSON.stringify(parsed.data.scopes)
  if (parsed.data.rateLimit !== undefined) updates.rateLimit = parsed.data.rateLimit
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled
  if (parsed.data.ipWhitelist !== undefined) {
    updates.ipWhitelist = parsed.data.ipWhitelist ? JSON.stringify(parsed.data.ipWhitelist) : null
  }

  await db
    .update(schema.apiTokens)
    .set(updates)
    .where(eq(schema.apiTokens.id, id))

  return c.json({ success: true })
})

/**
 * DELETE /api/admin/tokens/:id
 */
tokens.delete('/:id', async (c) => {
  const currentUser = c.get('currentUser')
  const id = parseInt(c.req.param('id'), 10)
  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  // Regular users can only delete their own tokens
  if (currentUser?.role !== 'admin' && existing.userId !== currentUser?.userId) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  await db.delete(schema.apiTokens).where(eq(schema.apiTokens.id, id))
  return c.json({ success: true })
})

/**
 * POST /api/admin/tokens/:id/rotate - Regenerate token key.
 */
tokens.post('/:id/rotate', async (c) => {
  const currentUser = c.get('currentUser')
  const id = parseInt(c.req.param('id'), 10)
  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.apiTokens)
    .where(eq(schema.apiTokens.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  if (currentUser?.role !== 'admin' && existing.userId !== currentUser?.userId) {
    return c.json({ success: false, error: 'Token not found' }, 404)
  }

  const newTokenValue = API_TOKEN_PREFIX + nanoid(32)

  await db
    .update(schema.apiTokens)
    .set({ token: newTokenValue })
    .where(eq(schema.apiTokens.id, id))

  return c.json({ success: true, data: { token: newTokenValue } })
})

export { tokens }
