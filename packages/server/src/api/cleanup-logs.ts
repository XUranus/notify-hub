import { Hono } from 'hono'
import { authMiddleware, requireAdmin } from '../auth/middleware.js'
import { getCleanupLogs } from '../cleanup.js'
import type { HonoEnv } from '../types.js'

const cleanupLogs = new Hono<HonoEnv>()

cleanupLogs.use('*', authMiddleware, requireAdmin)

// GET /api/admin/cleanup-logs?page=1&pageSize=20
cleanupLogs.get('/', async (c) => {
  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20')))

  const data = await getCleanupLogs(page, pageSize)
  return c.json({ success: true, data })
})

export { cleanupLogs }
