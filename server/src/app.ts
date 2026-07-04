import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { logger } from 'hono/logger'
import { serveStatic } from '@hono/node-server/serve-static'
import { getConfig } from './config.js'
import { createApiRouter } from './api/index.js'
import { registerBuiltinAdapters } from './channel/index.js'
import { startWorker } from './queue/index.js'
import { initAdminUser } from './init.js'
import { runMigrations } from './db/migrate.js'
import { startCleanupScheduler } from './cleanup.js'
import { stat } from 'node:fs/promises'
import { createReadStream } from 'node:fs'
import { join, extname } from 'node:path'

export function createApp(): Hono {
  const app = new Hono()
  const config = getConfig()

  // Body size limit: 10MB max for any request
  // Individual upload routes enforce their own file-size checks after parsing
  app.use('*', async (c, next) => {
    const contentLength = c.req.header('content-length')
    if (contentLength && parseInt(contentLength) > 10 * 1024 * 1024) {
      return c.json({ success: false, error: 'Request body too large (max 10MB)' }, 413)
    }
    await next()
  })

  // Middleware
  app.use('*', cors({
    origin: config.corsOrigin === '*' ? '*' : config.corsOrigin.split(','),
    allowMethods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowHeaders: ['Content-Type', 'Authorization'],
  }))
  app.use('*', logger())

  // Health check
  app.get('/health', (c) => c.json({ status: 'ok', timestamp: new Date().toISOString() }))

  // API routes
  const api = createApiRouter()
  app.route('/api', api)

  // Serve uploaded files (no auth required — filenames are random UUIDs).
  app.get('/uploads/:filename', async (c) => {
    const filename = c.req.param('filename')
    if (!filename || filename.includes('..') || filename.includes('/')) {
      return c.json({ success: false, error: 'Invalid filename' }, 400)
    }
    const filePath = join(process.cwd(), 'data', 'uploads', filename)
    try {
      const fileStat = await stat(filePath)
      if (!fileStat.isFile()) return c.json({ success: false, error: 'Not found' }, 404)
      const stream = createReadStream(filePath)
      const ext = extname(filename).toLowerCase()
      const mimeMap: Record<string, string> = {
        '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
        '.gif': 'image/gif', '.webp': 'image/webp', '.svg': 'image/svg+xml',
        '.bmp': 'image/bmp', '.pdf': 'application/pdf',
        '.txt': 'text/plain', '.json': 'application/json',
      }
      const contentType = mimeMap[ext] || 'application/octet-stream'
      return c.body(stream as any, 200, {
        'Content-Type': contentType,
        'Content-Length': String(fileStat.size),
        'Cache-Control': 'public, max-age=86400',
      })
    } catch {
      return c.json({ success: false, error: 'File not found' }, 404)
    }
  })

  // Serve static frontend files in production
  if (config.nodeEnv === 'production') {
    app.use('/*', serveStatic({ root: './public' }))
    app.get('*', serveStatic({ root: './public', path: 'index.html' }))
  }

  // Global error handler
  app.onError((err, c) => {
    console.error('[server] Unhandled error:', err)
    return c.json(
      { success: false, error: 'Internal server error' },
      500
    )
  })

  // 404 handler
  app.notFound((c) => {
    return c.json({ success: false, error: 'Not found' }, 404)
  })

  return app
}

/**
 * Initialize and start the server.
 */
export async function bootstrap() {
  const config = getConfig()

  // Run database migrations
  await runMigrations()

  // Register channel adapters
  registerBuiltinAdapters()

  // Initialize admin user
  await initAdminUser()

  // Start background worker
  startWorker()

  // Start cleanup scheduler
  await startCleanupScheduler()

  return createApp()
}
