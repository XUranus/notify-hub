import { Hono } from 'hono'
import { desc, eq } from 'drizzle-orm'
import { dualAuth } from '../auth/index.js'
import { getDb, schema } from '../db/index.js'
import type { HonoEnv } from '../types.js'

const clients = new Hono<HonoEnv>()

/**
 * GET /api/v2/clients — List push clients owned by the authenticated user.
 */
clients.get('/', dualAuth, async (c) => {
  const user = c.get('currentUser')
  const userId = user?.userId
  const db = getDb()

  const query = db
    .select({
      uuid: schema.pushClients.uuid,
      name: schema.pushClients.name,
      os: schema.pushClients.os,
      arch: schema.pushClients.arch,
      desktop: schema.pushClients.desktop,
      appVersion: schema.pushClients.appVersion,
      lastSeenAt: schema.pushClients.lastSeenAt,
    })
    .from(schema.pushClients)

  // Filter by userId if authenticated
  const allClients = userId
    ? await query
        .where(eq(schema.pushClients.userId, userId))
        .orderBy(desc(schema.pushClients.lastSeenAt))
    : await query.orderBy(desc(schema.pushClients.lastSeenAt))

  return c.json({ success: true, data: allClients })
})

export { clients }
