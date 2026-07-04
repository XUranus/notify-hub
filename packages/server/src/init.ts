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
    // Ensure role is admin
    if (existing.role !== 'admin') {
      await db.update(schema.users).set({ role: 'admin' }).where(eq(schema.users.id, ADMIN_USER_ID))
    }
    return
  }

  // Check if any admin exists (legacy or wrong ID) — migrate to correct ID
  const [anyAdmin] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .limit(1)

  if (anyAdmin) {
    console.log(`[init] Migrating admin user ID ${anyAdmin.id} → ${ADMIN_USER_ID}...`)
    // Update related tables first
    await db.update(schema.messages).set({ userId: ADMIN_USER_ID }).where(eq(schema.messages.userId, anyAdmin.id))
    await db.update(schema.apiTokens).set({ userId: ADMIN_USER_ID }).where(eq(schema.apiTokens.userId, anyAdmin.id))
    await db.update(schema.pushClients).set({ userId: ADMIN_USER_ID }).where(eq(schema.pushClients.userId, anyAdmin.id))
    await db.update(schema.attachments).set({ userId: ADMIN_USER_ID }).where(eq(schema.attachments.userId, anyAdmin.id))
    await db.update(schema.userSettings).set({ userId: ADMIN_USER_ID }).where(eq(schema.userSettings.userId, anyAdmin.id))
    // Update the user row
    await db.update(schema.users).set({ id: ADMIN_USER_ID }).where(eq(schema.users.id, anyAdmin.id))
    console.log(`[init] Admin user migrated to ID ${ADMIN_USER_ID}`)
    return
  }

  // Check legacy admin_users table for migration
  const [legacyAdmin] = await db
    .select()
    .from(schema.adminUsers)
    .limit(1)

  if (legacyAdmin) {
    console.log('[init] Migrating legacy admin user to users table...')
    await db.insert(schema.users).values({
      id: ADMIN_USER_ID,
      email: config.adminEmail,
      username: legacyAdmin.username,
      password: legacyAdmin.password,
      role: 'admin',
    })
    console.log(`[init] Legacy admin migrated with ID ${ADMIN_USER_ID}, email: ${config.adminEmail}`)
    return
  }

  // Create default admin
  console.log('[init] No admin user found, creating default admin...')
  const hashedPassword = await bcrypt.hash(config.adminPassword, 10)

  await db.insert(schema.users).values({
    id: ADMIN_USER_ID,
    email: config.adminEmail,
    username: config.adminUsername,
    password: hashedPassword,
    role: 'admin',
  })

  console.log(`[init] Default admin created: ${config.adminEmail} (ID: ${ADMIN_USER_ID})`)
  console.log('[init] ⚠️  Change the default password after first login!')
}
