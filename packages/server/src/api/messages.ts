import { Hono } from 'hono'
import { apiAuth } from '../auth/index.js'
import { getMessage, getMessages } from '../queue/index.js'

const messages = new Hono()

messages.use('*', apiAuth)

/**
 * GET /api/v1/messages - List messages.
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
 * GET /api/v1/messages/export - Export all messages (no pagination).
 */
messages.get('/export', async (c) => {
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const result = await getMessages({ page: 1, pageSize: 10000, status, channelType })
  return c.json({ success: true, data: result.items })
})

/**
 * GET /api/v1/messages/:id - Get message by ID.
 */
messages.get('/:id', async (c) => {
  const id = c.req.param('id')
  const msg = await getMessage(id)

  if (!msg) {
    return c.json({ success: false, error: 'Message not found' }, 404)
  }

  return c.json({ success: true, data: msg })
})

export { messages }
