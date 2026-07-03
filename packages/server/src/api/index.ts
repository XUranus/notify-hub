import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireAdmin } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import { send } from './send.js'
import { messages } from './messages.js'
import { push } from './push.js'
import { auth } from './admin/auth.js'
import { channels } from './admin/channels.js'
import { tokens } from './admin/tokens.js'
import { templates } from './admin/templates.js'
import { stats } from './admin/stats.js'
import { users } from './admin/users.js'
import { messages as adminMessages } from './admin/messages.js'
import type { HonoEnv } from '../types.js'

export function createApiRouter(): Hono<HonoEnv> {
  const api = new Hono<HonoEnv>()

  // Public API routes (token auth applied in each router)
  api.route('/v1/send', send)
  api.route('/v1/messages', messages)
  api.route('/v1/push', push)

  // Admin auth (no auth required for login/register)
  api.route('/admin', auth)

  // Admin routes (JWT auth required)
  const admin = new Hono<HonoEnv>()
  admin.use('*', authMiddleware)

  admin.route('/channels', channels)
  admin.route('/tokens', tokens)
  admin.route('/templates', templates)
  admin.route('/stats', stats)
  admin.route('/messages', adminMessages)
  admin.route('/push', push)

  // Users management (admin only)
  const adminUsersRouter = new Hono<HonoEnv>()
  adminUsersRouter.use('*', requireAdmin)
  adminUsersRouter.route('/', users)
  admin.route('/users', adminUsersRouter)

  /**
   * POST /api/admin/change-password
   * Any authenticated user can change their own password.
   */
  admin.post('/change-password', async (c) => {
    const body = await c.req.json()
    const { currentPassword, newPassword } = body as {
      currentPassword?: string
      newPassword?: string
    }

    if (!currentPassword || !newPassword) {
      return c.json({ success: false, error: 'Both currentPassword and newPassword are required' }, 400)
    }

    if (newPassword.length < 6) {
      return c.json({ success: false, error: 'New password must be at least 6 characters' }, 400)
    }

    const currentUser = c.get('currentUser')
    if (!currentUser) {
      return c.json({ success: false, error: 'Authentication required' }, 401)
    }

    const db = getDb()

    const [user] = await db
      .select()
      .from(schema.users)
      .where(eq(schema.users.id, currentUser.userId))
      .limit(1)

    if (!user) {
      return c.json({ success: false, error: 'User not found' }, 404)
    }

    const valid = await bcrypt.compare(currentPassword, user.password)
    if (!valid) {
      return c.json({ success: false, error: 'Current password is incorrect' }, 401)
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10)
    await db
      .update(schema.users)
      .set({ password: hashedPassword })
      .where(eq(schema.users.id, user.id))

    return c.json({ success: true })
  })

  api.route('/admin', admin)

  return api
}
