import { Hono } from 'hono'
import { eq, and, ne } from 'drizzle-orm'
import { createChannelSchema, updateChannelSchema, RESERVED_CHANNEL_NAMES } from '@notify-hub/shared'
import { getDb, schema } from '../../db/index.js'
import { getAdapter } from '../../channel/index.js'
import { channelCache } from '../../cache.js'

const channels = new Hono()

/**
 * GET /api/admin/channels - List all channels.
 */
channels.get('/', async (c) => {
  const db = getDb()
  const type = c.req.query('type')

  const allChannels = type
    ? await db.select().from(schema.channels).where(eq(schema.channels.type, type))
    : await db.select().from(schema.channels)

  // Mask sensitive fields
  const result = allChannels.map((ch) => {
    let configData: Record<string, unknown> = {}
    try {
      configData = JSON.parse(ch.config)
    } catch {
      configData = { error: 'Failed to parse config' }
    }

    const masked = { ...configData }
    for (const key of Object.keys(masked)) {
      if (/password|secret|key|token/i.test(key) && typeof masked[key] === 'string') {
        masked[key] = '***'
      }
    }

    return { ...ch, config: masked }
  })

  return c.json({ success: true, data: result })
})

/**
 * GET /api/admin/channels/:id
 */
channels.get('/:id', async (c) => {
  const db = getDb()
  const id = c.req.param('id')

  const [ch] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, id))
    .limit(1)

  if (!ch) {
    return c.json({ success: false, error: 'Channel not found' }, 404)
  }

  let configData: Record<string, unknown> = {}
  try {
    configData = JSON.parse(ch.config)
  } catch {
    configData = { error: 'Failed to parse config' }
  }

  const masked = { ...configData }
  for (const key of Object.keys(masked)) {
    if (/password|secret|key|token/i.test(key) && typeof masked[key] === 'string') {
      masked[key] = '***'
    }
  }

  return c.json({ success: true, data: { ...ch, config: masked } })
})

/**
 * POST /api/admin/channels - Create a new channel.
 */
channels.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createChannelSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { type, name, config: channelConfig, enabled, isDefault } = parsed.data
  const db = getDb()

  // Check reserved names
  if (RESERVED_CHANNEL_NAMES.includes(name as any)) {
    return c.json({ success: false, error: `"${name}" 是保留字，不可用作渠道名称` }, 400)
  }

  // Check unique name
  const [existing] = await db
    .select({ id: schema.channels.id })
    .from(schema.channels)
    .where(eq(schema.channels.name, name))
    .limit(1)

  if (existing) {
    return c.json({ success: false, error: '渠道名称已存在' }, 409)
  }

  const result = db.transaction((tx) => {
    if (isDefault) {
      tx.update(schema.channels)
        .set({ isDefault: false })
        .where(eq(schema.channels.type, type))
        .run()
    }

    const [inserted] = tx
      .insert(schema.channels)
      .values({
        type,
        name,
        config: JSON.stringify(channelConfig),
        enabled,
        isDefault,
      })
      .returning()
      .all()

    return inserted
  })

  channelCache.clear()
  return c.json({ success: true, data: { id: result.id } }, 201)
})

/**
 * PUT /api/admin/channels/:id - Update a channel.
 */
channels.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateChannelSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Channel not found' }, 404)
  }

  const updates: Record<string, unknown> = {
    updatedAt: new Date(),
  }

  if (parsed.data.name !== undefined) {
    // Check unique name (exclude self)
    const [dup] = await db
      .select({ id: schema.channels.id })
      .from(schema.channels)
      .where(and(eq(schema.channels.name, parsed.data.name), ne(schema.channels.id, id)))
      .limit(1)

    if (dup) {
      return c.json({ success: false, error: '渠道名称已存在' }, 409)
    }
    updates.name = parsed.data.name
  }
  if (parsed.data.enabled !== undefined) updates.enabled = parsed.data.enabled

  if (parsed.data.config) {
    let existingConfig: Record<string, unknown> = {}
    try {
      existingConfig = JSON.parse(existing.config)
    } catch {}
    const mergedConfig = { ...existingConfig, ...parsed.data.config }
    updates.config = JSON.stringify(mergedConfig)
  }

  if (parsed.data.isDefault !== undefined) {
    updates.isDefault = parsed.data.isDefault

    db.transaction((tx) => {
      if (parsed.data.isDefault) {
        tx.update(schema.channels)
          .set({ isDefault: false })
          .where(eq(schema.channels.type, existing.type))
          .run()
      }

      tx.update(schema.channels)
        .set(updates)
        .where(eq(schema.channels.id, id))
        .run()
    })
  } else {
    await db
      .update(schema.channels)
      .set(updates)
      .where(eq(schema.channels.id, id))
  }

  channelCache.clear()
  return c.json({ success: true })
})

/**
 * DELETE /api/admin/channels/:id
 */
channels.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  const [existing] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, id))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Channel not found' }, 404)
  }

  await db.delete(schema.channels).where(eq(schema.channels.id, id))
  channelCache.clear()
  return c.json({ success: true })
})

/**
 * POST /api/admin/channels/test-config - Test a raw channel config without saving.
 */
channels.post('/test-config', async (c) => {
  const body = await c.req.json()
  const { type, config: channelConfig } = body as { type: string; config: Record<string, unknown> }

  if (!type || !channelConfig) {
    return c.json({ success: false, error: 'Missing type or config' }, 400)
  }

  try {
    const adapter = getAdapter(type, channelConfig.provider as string | undefined)
    if (!adapter) {
      return c.json({ success: false, error: `No adapter for type '${type}'` }, 400)
    }

    const ok = await adapter.test(channelConfig)
    return c.json({ success: true, data: { connected: ok } })
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : 'Test failed',
    }, 500)
  }
})

/**
 * POST /api/admin/channels/:id/test - Test channel connectivity.
 */
channels.post('/:id/test', async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  const [ch] = await db
    .select()
    .from(schema.channels)
    .where(eq(schema.channels.id, id))
    .limit(1)

  if (!ch) {
    return c.json({ success: false, error: 'Channel not found' }, 404)
  }

  try {
    const configData = JSON.parse(ch.config) as Record<string, unknown>

    const adapter = getAdapter(ch.type, configData.provider as string | undefined)
    if (!adapter) {
      return c.json({ success: false, error: `No adapter for type '${ch.type}'` }, 400)
    }

    const ok = await adapter.test(configData)
    return c.json({ success: true, data: { connected: ok } })
  } catch (err) {
    return c.json({
      success: false,
      error: err instanceof Error ? err.message : 'Test failed',
    }, 500)
  }
})

export { channels }
