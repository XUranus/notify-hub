import { Hono } from 'hono'
import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { authMiddleware, requireAdmin } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import { send } from './send.js'
import { messages } from './messages.js'
import { push } from './push.js'
import { clients } from './clients.js'
import { attachments } from './attachments.js'
import { userSettings } from './user-settings.js'
import { systemSettings } from './system-settings.js'
import { cleanupLogs } from './cleanup-logs.js'
import { upload } from './upload.js'
import { auth } from './admin/auth.js'
import { clientAuth as clientAuthRoute } from './client-auth.js'
import { channels } from './admin/channels.js'
import { tokens } from './admin/tokens.js'
import { templates } from './admin/templates.js'
import { stats } from './admin/stats.js'
import { users } from './admin/users.js'
import { messages as adminMessages } from './admin/messages.js'
import { adminPush } from './admin/push.js'
import type { HonoEnv } from '../types.js'

export function createApiRouter(): Hono<HonoEnv> {
  const api = new Hono<HonoEnv>()

  // Public API routes (token auth applied in each router)
  api.route('/v1/send', send)
  api.route('/v1/messages', messages)
  api.route('/v1/push', push)
  api.route('/v2/clients', clients)
  api.route('/v1/upload', upload)
  api.route('/admin/attachments', attachments)
  api.route('/admin/settings', userSettings)
  api.route('/admin/system-settings', systemSettings)
  api.route('/admin/cleanup-logs', cleanupLogs)

  // Client auth (no auth required — login with email/username + password, returns JWT)
  api.route('/auth', clientAuthRoute)

  // Admin auth (no auth required for login/register)
  api.route('/admin', auth)

  // Admin routes (JWT auth required)
  const admin = new Hono<HonoEnv>()
  admin.use('*', authMiddleware)

  // Token management is user-scoped (any authenticated user can manage their own tokens)
  admin.route('/tokens', tokens)

  // Admin-only routes: require admin role
  admin.use('/channels/*', requireAdmin)
  admin.use('/channels', requireAdmin)
  admin.route('/channels', channels)

  admin.use('/templates/*', requireAdmin)
  admin.use('/templates', requireAdmin)
  admin.route('/templates', templates)

  admin.use('/stats/*', requireAdmin)
  admin.use('/stats', requireAdmin)
  admin.route('/stats', stats)

  admin.use('/messages/*', requireAdmin)
  admin.use('/messages', requireAdmin)
  admin.route('/messages', adminMessages)

  // Push admin endpoints only (clients list/delete).
  // Client endpoints (poll/ack/register) are at /api/v1/push with apiAuth.
  admin.route('/push', adminPush)

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

  /**
   * DELETE /api/admin/account
   * Self-service account deletion. Non-admin only. Requires email + password confirmation.
   * Cascade deletes: API tokens, push clients, attachments, user settings.
   */
  admin.delete('/account', async (c) => {
    const currentUser = c.get('currentUser')
    if (!currentUser) {
      return c.json({ success: false, error: 'Authentication required' }, 401)
    }

    // Block admin from self-deletion
    if (currentUser.role === 'admin') {
      return c.json({ success: false, error: 'Admin account cannot be deleted' }, 400)
    }

    const body = await c.req.json()
    const { email, password } = body as { email?: string; password?: string }

    if (!email || !password) {
      return c.json({ success: false, error: 'Email and password are required' }, 400)
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

    // Verify email matches
    if (email !== user.email) {
      return c.json({ success: false, error: 'Email does not match' }, 400)
    }

    // Verify password
    const valid = await bcrypt.compare(password, user.password)
    if (!valid) {
      return c.json({ success: false, error: 'Password is incorrect' }, 401)
    }

    const userId = user.id

    // Cascade delete related data
    await db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, userId))
    await db.delete(schema.pushClients).where(eq(schema.pushClients.userId, userId))
    await db.delete(schema.attachments).where(eq(schema.attachments.userId, userId))
    await db.delete(schema.userSettings).where(eq(schema.userSettings.userId, userId))
    // Messages: set userId to NULL (keep messages for audit)
    await db.update(schema.messages).set({ userId: null }).where(eq(schema.messages.userId, userId))
    // Delete the user
    await db.delete(schema.users).where(eq(schema.users.id, userId))

    return c.json({ success: true, data: { deleted: true } })
  })

  api.route('/admin', admin)

  return api
}
