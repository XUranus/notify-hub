import { Hono } from 'hono'
import { eq, and, ne } from 'drizzle-orm'
import { createTemplateSchema, updateTemplateSchema } from '@notify-hub/shared'
import { getDb, schema } from '../../db/index.js'

const templates = new Hono()

/**
 * GET /api/admin/templates
 */
templates.get('/', async (c) => {
  const db = getDb()
  const channelType = c.req.query('channelType')

  const all = channelType
    ? await db.select().from(schema.templates).where(eq(schema.templates.channelType, channelType))
    : await db.select().from(schema.templates)

  const result = all.map((t) => ({
    ...t,
    variables: t.variables ? JSON.parse(t.variables) : null,
  }))

  return c.json({ success: true, data: result })
})

/**
 * GET /api/admin/templates/:id
 */
templates.get('/:id', async (c) => {
  const db = getDb()
  const id = c.req.param('id')

  const [tpl] = await db
    .select()
    .from(schema.templates)
    .where(eq(schema.templates.id, id))
    .limit(1)

  if (!tpl) {
    return c.json({ success: false, error: 'Template not found' }, 404)
  }

  return c.json({
    success: true,
    data: { ...tpl, variables: tpl.variables ? JSON.parse(tpl.variables) : null },
  })
})

/**
 * POST /api/admin/templates
 */
templates.post('/', async (c) => {
  const body = await c.req.json()
  const parsed = createTemplateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const { name, channelType, subject, body: tplBody, variables } = parsed.data
  const db = getDb()

  // Check unique name
  const [existing] = await db
    .select({ id: schema.templates.id })
    .from(schema.templates)
    .where(eq(schema.templates.name, name))
    .limit(1)

  if (existing) {
    return c.json({ success: false, error: '模板名称已存在' }, 409)
  }

  const [result] = await db
    .insert(schema.templates)
    .values({
      name,
      channelType,
      subject: subject ?? null,
      body: tplBody,
      variables: variables ? JSON.stringify(variables) : null,
    })
    .returning()

  return c.json({ success: true, data: { id: result.id } }, 201)
})

/**
 * PUT /api/admin/templates/:id
 */
templates.put('/:id', async (c) => {
  const id = c.req.param('id')
  const body = await c.req.json()
  const parsed = updateTemplateSchema.safeParse(body)

  if (!parsed.success) {
    return c.json({ success: false, error: parsed.error.issues[0].message }, 400)
  }

  const db = getDb()
  const updates: Record<string, unknown> = {}

  if (parsed.data.name !== undefined) {
    // Check unique name (exclude self)
    const [dup] = await db
      .select({ id: schema.templates.id })
      .from(schema.templates)
      .where(and(eq(schema.templates.name, parsed.data.name), ne(schema.templates.id, id)))
      .limit(1)

    if (dup) {
      return c.json({ success: false, error: '模板名称已存在' }, 409)
    }
    updates.name = parsed.data.name
  }
  if (parsed.data.channelType !== undefined) updates.channelType = parsed.data.channelType
  if (parsed.data.subject !== undefined) updates.subject = parsed.data.subject
  if (parsed.data.body !== undefined) updates.body = parsed.data.body
  if (parsed.data.variables !== undefined) {
    updates.variables = parsed.data.variables ? JSON.stringify(parsed.data.variables) : null
  }

  await db
    .update(schema.templates)
    .set(updates)
    .where(eq(schema.templates.id, id))

  return c.json({ success: true })
})

/**
 * DELETE /api/admin/templates/:id
 */
templates.delete('/:id', async (c) => {
  const id = c.req.param('id')
  const db = getDb()

  await db.delete(schema.templates).where(eq(schema.templates.id, id))
  return c.json({ success: true })
})

export { templates }
