import { Hono } from 'hono'
import { eq } from 'drizzle-orm'
import { getDb, schema } from '../../db/index.js'
import { getMessages, getMessage, manualRetry } from '../../queue/index.js'

const messages = new Hono()

/**
 * GET /api/admin/messages
 */
messages.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10)
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const result = await getMessages({ page, pageSize, status, channelType })
  return c.json({ success: true, data: result })
})

/**
 * GET /api/admin/messages/export - Export all messages.
 */
messages.get('/export', async (c) => {
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const result = await getMessages({ page: 1, pageSize: 10000, status, channelType })
  return c.json({ success: true, data: result.items })
})

/**
 * GET /api/admin/messages/:id
 */
messages.get('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await getMessage(id)

  if (!msg) {
    return c.json({ success: false, error: 'Message not found' }, 404)
  }

  return c.json({ success: true, data: msg })
})

/**
 * POST /api/admin/messages/:id/retry
 */
messages.post('/:id/retry', async (c) => {
  const id = c.req.param('id')

  try {
    await manualRetry(id)
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
 */
messages.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  await db.delete(schema.messages).where(eq(schema.messages.id, id))
  return c.json({ success: true })
})

export { messages }
