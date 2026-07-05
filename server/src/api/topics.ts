import { Hono } from 'hono'
import { eq, and } from 'drizzle-orm'
import { createTopicSchema, updateTopicSchema } from '@notify-hub/shared'
import { getDb, schema } from '../db/index.js'
import type { HonoEnv } from '../types.js'

const topics = new Hono<HonoEnv>()

/**
 * GET /api/admin/topics
 * List topics for the current user. Admin sees all.
 */
topics.get('/', async (c) => {
  const currentUser = c.get('currentUser')!
  const db = getDb()

  let items
  if (currentUser.role === 'admin') {
    items = await db.select().from(schema.topics).orderBy(schema.topics.createdAt)
  } else {
    items = await db
      .select()
      .from(schema.topics)
      .where(eq(schema.topics.userId, currentUser.userId))
      .orderBy(schema.topics.createdAt)
  }

  return c.json({ success: true, data: items })
})

/**
 * GET /api/admin/topics/:id
 */
topics.get('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('currentUser')!
  const db = getDb()

  const conditions = [eq(schema.topics.id, id)]
  if (currentUser.role !== 'admin') {
    conditions.push(eq(schema.topics.userId, currentUser.userId))
  }

  const [topic] = await db
    .select()
    .from(schema.topics)
    .where(and(...conditions))
    .limit(1)

  if (!topic) {
    return c.json({ success: false, error: 'Topic not found' }, 404)
  }

  return c.json({ success: true, data: topic })
})

/**
 * POST /api/admin/topics
 */
topics.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createTopicSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues[0].message },
      400
    )
  }

  const currentUser = c.get('currentUser')!
  const db = getDb()

  // Check unique name per user
  const [existing] = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(
      and(eq(schema.topics.name, parsed.data.name), eq(schema.topics.userId, currentUser.userId))
    )
    .limit(1)

  if (existing) {
    return c.json(
      { success: false, error: `Topic '${parsed.data.name}' already exists` },
      409
    )
  }

  const [topic] = await db
    .insert(schema.topics)
    .values({
      userId: currentUser.userId,
      name: parsed.data.name,
      displayName: parsed.data.displayName ?? null,
      icon: parsed.data.icon ?? null,
    })
    .returning()

  return c.json({ success: true, data: topic })
})

/**
 * PUT /api/admin/topics/:id
 */
topics.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateTopicSchema.safeParse(body)

  if (!parsed.success) {
    return c.json(
      { success: false, error: parsed.error.issues[0].message },
      400
    )
  }

  const currentUser = c.get('currentUser')!
  const db = getDb()

  // Verify ownership
  const conditions = [eq(schema.topics.id, id)]
  if (currentUser.role !== 'admin') {
    conditions.push(eq(schema.topics.userId, currentUser.userId))
  }

  const [existing] = await db
    .select()
    .from(schema.topics)
    .where(and(...conditions))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Topic not found' }, 404)
  }

  // If renaming, check uniqueness
  if (parsed.data.name && parsed.data.name !== existing.name) {
    const [dup] = await db
      .select({ id: schema.topics.id })
      .from(schema.topics)
      .where(
        and(
          eq(schema.topics.name, parsed.data.name),
          eq(schema.topics.userId, existing.userId)
        )
      )
      .limit(1)
    if (dup) {
      return c.json(
        { success: false, error: `Topic '${parsed.data.name}' already exists` },
        409
      )
    }
  }

  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (parsed.data.name !== undefined) updates.name = parsed.data.name
  if (parsed.data.displayName !== undefined) updates.displayName = parsed.data.displayName
  if (parsed.data.icon !== undefined) updates.icon = parsed.data.icon

  const [updated] = await db
    .update(schema.topics)
    .set(updates)
    .where(eq(schema.topics.id, id))
    .returning()

  return c.json({ success: true, data: updated })
})

/**
 * DELETE /api/admin/topics/:id
 */
topics.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const currentUser = c.get('currentUser')!
  const db = getDb()

  const conditions = [eq(schema.topics.id, id)]
  if (currentUser.role !== 'admin') {
    conditions.push(eq(schema.topics.userId, currentUser.userId))
  }

  const [existing] = await db
    .select({ id: schema.topics.id })
    .from(schema.topics)
    .where(and(...conditions))
    .limit(1)

  if (!existing) {
    return c.json({ success: false, error: 'Topic not found' }, 404)
  }

  // Unlink messages from this topic (set topicId to null)
  await db
    .update(schema.messages)
    .set({ topicId: null })
    .where(eq(schema.messages.topicId, id))

  await db.delete(schema.topics).where(eq(schema.topics.id, id))

  return c.json({ success: true })
})

export { topics }
