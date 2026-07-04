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

    // msg.to = client UUID, or empty string for broadcast
    const clientUuid = msg.to && msg.to.trim() ? msg.to.trim() : '__broadcast__'

    await db.insert(schema.pushMessages).values({
      clientUuid,
      title: msg.subject || 'Notification',
      body: msg.body,
      level: 'info',
      delivered: false,
      tags: msg.tags ? JSON.stringify(msg.tags) : '[]',
      priority: msg.priority ?? 0,
      url: msg.url ?? null,
      attachment: msg.attachment ? JSON.stringify(msg.attachment) : null,
      format: msg.format ?? 'text',
    })

    return { success: true }
  },

  async test(): Promise<boolean> {
    // Push channel is always available (no external service to test)
    return true
  },
}
