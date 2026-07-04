import { Hono } from 'hono'
import { eq, desc, and, sql, sum } from 'drizzle-orm'
import { authMiddleware } from '../auth/middleware.js'
import { getDb, schema } from '../db/index.js'
import { readFile, access } from 'node:fs/promises'
import { saveFile, deleteFile, getFileUrl, getUploadPath, validateFileType } from '../storage.js'
import type { HonoEnv } from '../types.js'

const attachments = new Hono<HonoEnv>()

// All routes require JWT auth
attachments.use('*', authMiddleware)

// ── Upload ──
attachments.post('/upload', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()

  // Parse multipart form
  const body = await c.req.parseBody()
  const file = body['file']

  if (!file || !(file instanceof File)) {
    return c.json({ success: false, error: 'No file provided' }, 400)
  }

  // Read file into buffer
  const arrayBuffer = await file.arrayBuffer()
  const buffer = Buffer.from(arrayBuffer)

  // Validate file type
  const typeError = validateFileType(file.name, file.type)
  if (typeError) {
    return c.json({ success: false, error: typeError }, 400)
  }

  // Get system settings for limits
  const maxFileSizeRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'attachment_max_file_size'))
    .limit(1)
  const maxTotalSizeRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'attachment_max_total_size'))
    .limit(1)

  const maxFileSize = maxFileSizeRow[0] ? parseInt(maxFileSizeRow[0].value) : 1048576 // 1MB default
  const maxTotalSize = maxTotalSizeRow[0] ? parseInt(maxTotalSizeRow[0].value) : 10485760 // 10MB default

  // Admin bypasses limits
  const isAdmin = user.role === 'admin'

  // Check single file size
  if (!isAdmin && buffer.length > maxFileSize) {
    return c.json({
      success: false,
      error: `File too large. Max size: ${Math.round(maxFileSize / 1024)}KB`
    }, 413)
  }

  // Check total quota
  if (!isAdmin) {
    const totalRow = await db.select({
      total: sum(schema.attachments.size)
    }).from(schema.attachments)
      .where(eq(schema.attachments.userId, user.userId))
    const usedBytes = Number(totalRow[0]?.total ?? 0)

    if (usedBytes + buffer.length > maxTotalSize) {
      return c.json({
        success: false,
        error: `Storage quota exceeded. Used: ${Math.round(usedBytes / 1024)}KB / ${Math.round(maxTotalSize / 1024)}KB`
      }, 413)
    }
  }

  // Save file
  const filename = await saveFile(buffer, file.name)
  const url = getFileUrl(filename)

  // Get user's expiration setting
  const settingsRow = await db.select().from(schema.userSettings)
    .where(eq(schema.userSettings.userId, user.userId))
    .limit(1)
  const expirationDays = settingsRow[0]?.attachmentExpiration ?? 0

  let expiresAt: Date | null = null
  if (expirationDays > 0) {
    expiresAt = new Date()
    expiresAt.setDate(expiresAt.getDate() + expirationDays)
  }

  // Insert record
  const [record] = await db.insert(schema.attachments).values({
    userId: user.userId,
    filename,
    originalName: file.name,
    mimeType: file.type || 'application/octet-stream',
    size: buffer.length,
    url,
    expiresAt,
  }).returning()

  return c.json({
    success: true,
    data: {
      id: record.id,
      url: record.url,
      filename: record.filename,
      originalName: record.originalName,
      size: record.size,
      mimeType: record.mimeType,
      expiresAt: record.expiresAt,
      createdAt: record.createdAt,
    }
  })
})

// ── List (paginated) ──
attachments.get('/', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()

  const page = Math.max(1, parseInt(c.req.query('page') || '1'))
  const pageSize = Math.min(100, Math.max(1, parseInt(c.req.query('pageSize') || '20')))
  const offset = (page - 1) * pageSize

  const rows = await db.select({
    id: schema.attachments.id,
    originalName: schema.attachments.originalName,
    mimeType: schema.attachments.mimeType,
    size: schema.attachments.size,
    url: schema.attachments.url,
    downloadCount: schema.attachments.downloadCount,
    expiresAt: schema.attachments.expiresAt,
    createdAt: schema.attachments.createdAt,
  }).from(schema.attachments)
    .where(eq(schema.attachments.userId, user.userId))
    .orderBy(desc(schema.attachments.createdAt))
    .limit(pageSize)
    .offset(offset)

  const countRow = await db.select({ count: sql<number>`count(*)` })
    .from(schema.attachments)
    .where(eq(schema.attachments.userId, user.userId))
  const total = countRow[0]?.count ?? 0

  return c.json({
    success: true,
    data: { items: rows, total, page, pageSize }
  })
})

// ── Stats ──
attachments.get('/stats', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()

  const totalRow = await db.select({
    total: sum(schema.attachments.size)
  }).from(schema.attachments)
    .where(eq(schema.attachments.userId, user.userId))
  const usedBytes = Number(totalRow[0]?.total ?? 0)

  const countRow = await db.select({ count: sql<number>`count(*)` })
    .from(schema.attachments)
    .where(eq(schema.attachments.userId, user.userId))
  const fileCount = countRow[0]?.count ?? 0

  // Get max total size
  const maxRow = await db.select().from(schema.systemSettings)
    .where(eq(schema.systemSettings.key, 'attachment_max_total_size'))
    .limit(1)
  const maxBytes = maxRow[0] ? parseInt(maxRow[0].value) : 10485760

  const isAdmin = user.role === 'admin'

  return c.json({
    success: true,
    data: {
      usedBytes,
      maxBytes: isAdmin ? null : maxBytes,
      fileCount,
      isAdmin,
    }
  })
})

// ── Batch Delete ──
attachments.post('/batch-delete', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()

  const body = await c.req.json<{ ids?: string[]; all?: boolean }>()
  let rows: { id: string; filename: string }[]

  if (body.all) {
    // Delete all for this user
    rows = await db.select({
      id: schema.attachments.id,
      filename: schema.attachments.filename,
    }).from(schema.attachments)
      .where(eq(schema.attachments.userId, user.userId))
  } else if (body.ids && body.ids.length > 0) {
    // Delete specific IDs (verify ownership)
    rows = await db.select({
      id: schema.attachments.id,
      filename: schema.attachments.filename,
    }).from(schema.attachments)
      .where(and(
        eq(schema.attachments.userId, user.userId),
        sql`${schema.attachments.id} IN (${sql.join(body.ids.map(id => sql`${id}`), sql`, `)})`
      ))
  } else {
    return c.json({ success: false, error: 'Provide ids[] or all: true' }, 400)
  }

  // Delete files from disk
  for (const row of rows) {
    await deleteFile(row.filename)
  }

  // Delete records
  if (rows.length > 0) {
    await db.delete(schema.attachments)
      .where(sql`${schema.attachments.id} IN (${sql.join(rows.map(r => sql`${r.id}`), sql`, `)})`)
  }

  return c.json({ success: true, data: { deleted: rows.length } })
})

// ── Download (authenticated) ──
attachments.get('/:id/download', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()
  const id = c.req.param('id')

  const [row] = await db.select().from(schema.attachments)
    .where(and(
      eq(schema.attachments.id, id),
      eq(schema.attachments.userId, user.userId)
    ))
    .limit(1)

  if (!row) {
    return c.json({ success: false, error: 'Attachment not found' }, 404)
  }

  const filePath = getUploadPath(row.filename)
  try {
    await access(filePath)
  } catch {
    return c.json({ success: false, error: 'File not found on disk' }, 404)
  }

  // Increment download count
  await db.update(schema.attachments)
    .set({ downloadCount: row.downloadCount + 1 })
    .where(eq(schema.attachments.id, id))

  const fileBuffer = await readFile(filePath)
  return new Response(fileBuffer, {
    headers: {
      'Content-Type': row.mimeType,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(row.originalName)}"`,
      'Content-Length': String(row.size),
    },
  })
})

// ── Delete ──
attachments.delete('/:id', async (c) => {
  const user = c.get('currentUser')!
  const db = getDb()
  const id = c.req.param('id')

  const rows = await db.select().from(schema.attachments)
    .where(and(
      eq(schema.attachments.id, id),
      eq(schema.attachments.userId, user.userId)
    ))
    .limit(1)

  if (!rows[0]) {
    return c.json({ success: false, error: 'Attachment not found' }, 404)
  }

  // Delete file from disk
  await deleteFile(rows[0].filename)

  // Delete record
  await db.delete(schema.attachments).where(eq(schema.attachments.id, id))

  return c.json({ success: true })
})

export { attachments }
