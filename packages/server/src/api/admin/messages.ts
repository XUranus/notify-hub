import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { getDb, schema } from '../../db/index.js'
import { getMessages, getMessage, manualRetry } from '../../queue/index.js'
import type { HonoEnv } from '../../types.js'

const messages = new Hono<HonoEnv>()

/**
 * GET /api/admin/messages
 * Admin sees all; regular user sees only their own.
 */
messages.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10)
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const currentUser = c.get('currentUser')!
  const userId = currentUser.role === 'admin' ? undefined : currentUser.userId

  const result = await getMessages({ page, pageSize, status, channelType, userId })
  return c.json({ success: true, data: result })
})

/**
 * GET /api/admin/messages/export - Export messages.
 * Admin exports all; regular user exports only their own.
 */
messages.get('/export', async (c) => {
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const currentUser = c.get('currentUser')!
  const userId = currentUser.role === 'admin' ? undefined : currentUser.userId

  const result = await getMessages({ page: 1, pageSize: 10000, status, channelType, userId })
  return c.json({ success: true, data: result.items })
})

/**
 * GET /api/admin/messages/:id
 * Admin can view any; regular user can view only their own.
 */
messages.get('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('currentUser')!
  const userId = currentUser.role === 'admin' ? undefined : currentUser.userId

  const msg = await getMessage(id, userId)

  if (!msg) {
    return c.json({ success: false, error: 'Message not found' }, 404)
  }

  return c.json({ success: true, data: msg })
})

/**
 * POST /api/admin/messages/:id/retry
 * Admin can retry any; regular user can retry only their own.
 */
messages.post('/:id/retry', async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('currentUser')!
  const userId = currentUser.role === 'admin' ? undefined : currentUser.userId

  try {
    await manualRetry(id, userId)
    return c.json({ success: true })
  } catch (err) {
    return c.json(
      { success: false, error: err instanceof Error ? err.message : 'Retry failed' },
      400
    )
  }
})

/**
 * DELETE /api/admin/messages/:id
 * Admin can delete any; regular user can delete only their own.
 */
messages.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('currentUser')!
  const db = getDb()

  if (currentUser.role === 'admin') {
    await db.delete(schema.messages).where(eq(schema.messages.id, id))
  } else {
    // Non-admin: verify ownership
    const [existing] = await db.select({ id: schema.messages.id })
      .from(schema.messages)
      .where(and(
        eq(schema.messages.id, id),
        eq(schema.messages.userId, currentUser.userId)
      ))
      .limit(1)

    if (!existing) {
      return c.json({ success: false, error: 'Message not found' }, 404)
    }

    await db.delete(schema.messages).where(eq(schema.messages.id, id))
  }

  return c.json({ success: true })
})

export { messages }
