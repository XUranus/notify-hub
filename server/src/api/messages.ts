import { Hono } from 'hono'
import { dualAuth } from '../auth/index.js'
import { getMessage, getMessages } from '../queue/index.js'
import type { HonoEnv } from '../types.js'

const messages = new Hono<HonoEnv>()

messages.use('*', dualAuth)

/**
 * GET /api/v1/messages - List messages (scoped to API token owner).
 */
messages.get('/', async (c) => {
  const page = parseInt(c.req.query('page') || '1', 10)
  const pageSize = parseInt(c.req.query('pageSize') || '20', 10)
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const user = c.get('currentUser')
  const userId = user?.userId

  const result = await getMessages({ page, pageSize, status, channelType, userId })
  return c.json({ success: true, data: result })
})

/**
 * GET /api/v1/messages/export - Export messages (scoped to auth user).
 */
messages.get('/export', async (c) => {
  const status = c.req.query('status') as any
  const channelType = c.req.query('channel') as any

  const user = c.get('currentUser')
  const userId = user?.userId

  const result = await getMessages({ page: 1, pageSize: 10000, status, channelType, userId })
  return c.json({ success: true, data: result.items })
})

/**
 * GET /api/v1/messages/:id - Get message by ID (scoped to auth user).
 */
messages.get('/:id', async (c) => {
  const id = c.req.param('id')
  const user = c.get('currentUser')
  const userId = user?.userId

  const msg = await getMessage(id, userId)

  if (!msg) {
    return c.json({ success: false, error: 'Message not found' }, 404)
  }

  return c.json({ success: true, data: msg })
})

export { messages }
