import { Hono } from 'hono'
import { eq, sum, sql } from 'drizzle-orm'
import { dualAuth } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import { saveFile, getFileUrl, validateFileType } from '../storage.js'
import type { HonoEnv } from '../types.js'

/** Check if a userId has admin role */
async function isAdminUser(userId: number): Promise<boolean> {
  const db = getDb()
  const [user] = await db.select({ role: schema.users.role })
    .from(schema.users).where(eq(schema.users.id, userId)).limit(1)
  return user?.role === 'admin'
}

const upload = new Hono<HonoEnv>()

upload.use('*', dualAuth)

/** Helper: read user's quota settings from system_settings */
async function getUserQuota(userId: number) {
  const db = getDb()

  const maxFileSizeRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'attachment_max_file_size')).limit(1)
  const maxTotalSizeRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'attachment_max_total_size')).limit(1)

  const maxFileSize = maxFileSizeRow[0] ? parseInt(maxFileSizeRow[0].value) : 1048576
  const maxTotalSize = maxTotalSizeRow[0] ? parseInt(maxTotalSizeRow[0].value) : 10485760

  const [usage] = await db.select({ total: sum(schema.attachments.size) })
    .from(schema.attachments)
    .where(eq(schema.attachments.userId, userId))
  const usedBytes = Number(usage?.total ?? 0)

  const countRow = await db.select({ count: sql<number>`count(*)` })
    .from(schema.attachments)
    .where(eq(schema.attachments.userId, userId))
  const fileCount = countRow[0]?.count ?? 0

  return { maxFileSize, maxTotalSize, usedBytes, fileCount }
}

// ── GET /quota — return user's upload quota ──
upload.get('/quota', async (c) => {
  const user = c.get('currentUser')!
  const userId = user.userId
  if (!userId) {
    return c.json({ success: false, error: 'Not associated with a user' }, 400)
  }

  const admin = await isAdminUser(userId)
  const q = await getUserQuota(userId)

  return c.json({
    success: true,
    data: {
      maxFileSize: admin ? null : q.maxFileSize,
      maxTotalSize: admin ? null : q.maxTotalSize,
      usedBytes: q.usedBytes,
      remainingBytes: admin ? null : Math.max(0, q.maxTotalSize - q.usedBytes),
      fileCount: q.fileCount,
      isAdmin: admin,
    }
  })
})

upload.post('/', async (c) => {
  const user = c.get('currentUser')!
  const userId = user.userId
  if (!userId) {
    return c.json({ success: false, error: 'Not associated with a user' }, 400)
  }

  const db = getDb()

  const body = await c.req.parseBody()
  const file = body['file']
  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'No file provided' }, 400)
  }

  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Validate file type
  const typeError = validateFileType(file.name, file.type)
  if (typeError) {
    return c.json({ success: false, error: typeError }, 400)
  }

  const admin = await isAdminUser(userId)
  const q = await getUserQuota(userId)

  // Admin bypasses quota limits
  if (!admin) {
    if (buffer.length > q.maxFileSize) {
      return c.json({
        success: false,
        error: `File too large. Max size: ${Math.round(q.maxFileSize / 1024)}KB`
      }, 413)
    }

    if (q.usedBytes + buffer.length > q.maxTotalSize) {
      return c.json({
        success: false,
        error: `Storage quota exceeded. Used: ${Math.round(q.usedBytes / 1024)}KB / ${Math.round(q.maxTotalSize / 1024)}KB`
      }, 413)
    }
  }

  const filename = await saveFile(buffer, file.name)
  const url = getFileUrl(filename)

  const [record] = await db.insert(schema.attachments).values({
    userId,
    filename,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
    url,
  }).returning()

  return c.json({
    success: true,
    data: {
      id: record.id,
      url,
      filename: file.name,
      size: buffer.length,
    }
  })
})

export { upload }
