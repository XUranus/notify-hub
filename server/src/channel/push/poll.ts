import { eq, and } from 'drizzle-orm'
import { getDb, schema } from '../../db/index.js'
import type { ChannelAdapter, MessagePayload } from '@notify-hub/shared'

/**
 * Push adapter using client polling.
 * Messages are stored in push_messages table; clients poll to retrieve them.
 * `config` is unused — the push channel has no external provider config.
 */
export const pollPushAdapter: ChannelAdapter = {
  type: 'push',
  name: 'poll',

  async send(_config: Record<string, unknown>, msg: MessagePayload): Promise<{ success: boolean; error?: string }> {
    const db = getDb()

    // msg.to = client UUID, or empty/'*' for broadcast
    const rawTo = msg.to && msg.to.trim() ? msg.to.trim() : ''
    const isBroadcast = rawTo === '' || rawTo === '*'

    const baseRow = {
      title: msg.subject || 'Notification',
      body: msg.body,
      level: 'info',
      delivered: false,
      tags: msg.tags ? JSON.stringify(msg.tags) : '[]',
      priority: msg.priority ?? 0,
      url: msg.url ?? null,
      attachment: msg.attachment ? JSON.stringify(msg.attachment) : null,
      format: msg.format ?? 'text',
      userId: msg.userId ?? null,
      topicId: msg.topicId ?? null,
    }

    if (isBroadcast) {
      // Expand broadcast to all registered clients of this user
      if (msg.userId) {
        const clients = await db
          .select({ uuid: schema.pushClients.uuid })
          .from(schema.pushClients)
          .where(eq(schema.pushClients.userId, msg.userId))

        if (clients.length > 0) {
          await db.insert(schema.pushMessages).values(
            clients.map((c) => ({ ...baseRow, clientUuid: c.uuid }))
          )
        }
      } else {
        // No userId (legacy token) — broadcast to ALL clients
        const clients = await db.select({ uuid: schema.pushClients.uuid }).from(schema.pushClients)
        if (clients.length > 0) {
          await db.insert(schema.pushMessages).values(
            clients.map((c) => ({ ...baseRow, clientUuid: c.uuid }))
          )
        }
      }
    } else {
      // Targeted message to a specific client
      await db.insert(schema.pushMessages).values({ ...baseRow, clientUuid: rawTo })
    }

    return { success: true }
  },

  async test(): Promise<boolean> {
    // Push channel is always available (no external service to test)
    return true
  },
}
