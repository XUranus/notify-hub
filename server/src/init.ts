import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db/index.js'
import { getConfig } from './config.js'

export const ADMIN_USER_ID = 99999999

const USER_ID_MIN = 10000000
const USER_ID_MAX = 80000000

/** Generate a random 8-digit user ID in range [10000000, 80000000). */
export async function generateUserId(db: ReturnType<typeof getDb>): Promise<number> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const id = Math.floor(Math.random() * (USER_ID_MAX - USER_ID_MIN)) + USER_ID_MIN
    const [existing] = await db.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.id, id)).limit(1)
    if (!existing) return id
  }
  throw new Error('Failed to generate unique user ID after 20 attempts')
}

/**
 * Ensure admin user exists in the users table with fixed ID 99999999.
 * Admin is config-only: created from env vars, cannot be deleted via API.
 */
export async function initAdminUser() {
  const db = getDb()
  const config = getConfig()

  // Check if admin with correct ID exists
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.id, ADMIN_USER_ID))
    .limit(1)

  if (existing) {
    if (existing.role !== 'admin') {
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, ADMIN_USER_ID))
    }
    return
  }

  // If an admin exists with a different ID, clean up and recreate
  const [anyAdmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .limit(1)

  if (anyAdmin) {
    console.log(`[init] Removing legacy admin (ID ${anyAdmin.id}), will recreate with ID ${ADMIN_USER_ID}`)
    await db.delete(schema.messages).where(eq(schema.messages.userId, anyAdmin.id))
    await db.delete(schema.apiTokens).where(eq(schema.apiTokens.userId, anyAdmin.id))
    await db.delete(schema.pushClients).where(eq(schema.pushClients.userId, anyAdmin.id))
    await db.delete(schema.attachments).where(eq(schema.attachments.userId, anyAdmin.id))
    await db.delete(schema.userSettings).where(eq(schema.userSettings.userId, anyAdmin.id))
    await db.delete(schema.users).where(eq(schema.users.id, anyAdmin.id))
  }

  // Create default admin
  const hashedPassword = await bcrypt.hash(config.adminPassword, 10)

  await db.insert(schema.users).values({
    id: ADMIN_USER_ID,
    email: config.adminEmail,
    username: config.adminUsername,
    password: hashedPassword,
    role: 'admin',
  })

  console.log(`[init] Admin created: ${config.adminEmail} (ID: ${ADMIN_USER_ID})`)
  console.log('[init] ⚠️  Change the default password after first login!')
}
