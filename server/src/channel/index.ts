import { registerAdapter } from './adapter.js'
import { smtpAdapter } from './email/smtp.js'
import { twilioAdapter } from './sms/twilio.js'
import { aliyunSmsAdapter } from './sms/aliyun.js'
import { tencentSmsAdapter } from './sms/tencent.js'
import { pollPushAdapter } from './push/poll.js'

export { registerAdapter, getAdapter, getAdaptersForType } from './adapter.js'
export type { ChannelAdapter } from '@notify-hub/shared'

/**
 * Register all built-in channel adapters.
 */
export function registerBuiltinAdapters() {
  // Email
  registerAdapter(smtpAdapter)

  // SMS
  registerAdapter(twilioAdapter)
  registerAdapter(aliyunSmsAdapter)
  registerAdapter(tencentSmsAdapter)

  // Push (client polling)
  registerAdapter(pollPushAdapter)
}
