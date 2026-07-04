/**
 * Hono environment type for type-safe c.get() / c.set().
 */
export type HonoEnv = {
  Variables: {
    currentUser?: { userId: number; email: string; role: 'admin' | 'user' }
    adminUser?: { userId: number; username: string } // legacy compat
    apiToken?: {
      id: number
      userId: number | null
      name: string
      token: string
      scopes: string[]
      rateLimit: number
      ipWhitelist: string | null
      enabled: boolean
      expiresAt: Date | null
      lastUsedAt: Date | null
      createdAt: Date
    }
  }
}
