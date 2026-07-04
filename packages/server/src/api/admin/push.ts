import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { authMiddleware, requireAdmin } from '../../auth/middleware.js'
import { getDb, schema } from '../../db/index.js'
import type { HonoEnv } from '../../types.js'

/**
 * Admin-only push client management routes.
 * Mounted at /api/admin/push — JWT auth + admin role required.
 */
const adminPush = new Hono<HonoEnv>()

adminPush.use('*', authMiddleware, requireAdmin)

/**
 * GET /api/admin/push/clients — List all registered push clients.
 */
adminPush.get('/clients', async (c) => {
  const db = getDb()
  const clients = await db
    .select({
      id: schema.pushClients.id,
      uuid: schema.pushClients.uuid,
      userId: schema.pushClients.userId,
      name: schema.pushClients.name,
      os: schema.pushClients.os,
      arch: schema.pushClients.arch,
      desktop: schema.pushClients.desktop,
      appVersion: schema.pushClients.appVersion,
      lastSeenAt: schema.pushClients.lastSeenAt,
      registeredAt: schema.pushClients.registeredAt,
    })
    .from(schema.pushClients)
    .orderBy(desc(schema.pushClients.lastSeenAt))

  return c.json({ success: true, data: clients })
})

/**
 * DELETE /api/admin/push/clients/:uuid — Remove a push client.
 */
adminPush.delete('/clients/:uuid', async (c) => {
  const uuid = c.req.param('uuid')!
  const db = getDb()

  await db.delete(schema.pushClients).where(eq(schema.pushClients.uuid, uuid))
  return c.json({ success: true })
})

export { adminPush }
