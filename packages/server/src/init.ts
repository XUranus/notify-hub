import bcrypt from 'bcryptjs'
import { eq } from 'drizzle-orm'
import { getDb, schema } from './db/index.js'
import { getConfig } from './config.js'

/**
 * Ensure admin user exists in the users table. Creates default admin if no admin role users exist.
 */
export async function initAdminUser() {
  const db = getDb()
  const config = getConfig()

  // Check if an admin user already exists in the new users table
  const [existing] = await db
    .select()
    .from(schema.users)
    .where(eq(schema.users.role, 'admin'))
    .limit(1)

  if (existing) {
    return // Admin already exists
  }

  // Also check legacy admin_users table for migration
  const [legacyAdmin] = await db
    .select()
    .from(schema.adminUsers)
    .limit(1)

  if (legacyAdmin) {
    // Migrate legacy admin to new users table
    console.log('[init] Migrating legacy admin user to users table...')
    await db.insert(schema.users).values({
      email: config.adminEmail,
      username: legacyAdmin.username,
      password: legacyAdmin.password,
      role: 'admin',
    })
    console.log(`[init] Legacy admin migrated with email: ${config.adminEmail}`)
    return
  }

  console.log('[init] No admin user found, creating default admin...')
  const hashedPassword = await bcrypt.hash(config.adminPassword, 10)

  await db.insert(schema.users).values({
    email: config.adminEmail,
    username: config.adminUsername,
    password: hashedPassword,
    role: 'admin',
  })

  console.log(`[init] Default admin created: ${config.adminEmail}`)
  console.log('[init] ⚠️  Change the default password after first login!')
}
