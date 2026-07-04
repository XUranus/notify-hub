import type { ChannelAdapter, SendResult, MessagePayload } from '@notify-hub/shared'

export const twilioAdapter: ChannelAdapter = {
  type: 'sms',
  name: 'twilio',

  async send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult> {
    try {
      const accountSid = config.accountSid as string
      const authToken = config.authToken as string
      const fromNumber = config.fromNumber as string

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`

      const params = new URLSearchParams()
      params.append('To', msg.to)
      params.append('From', fromNumber)
      params.append('Body', msg.body)

      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Authorization': `Basic ${credentials}`,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: params.toString(),
      })

      const data = await response.json() as { sid?: string; message?: string }

      if (!response.ok) {
        return {
          success: false,
          error: data.message || `Twilio API error: ${response.status}`,
        }
      }

      return {
        success: true,
        externalId: data.sid,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  async test(config: Record<string, unknown>): Promise<boolean> {
    try {
      const accountSid = config.accountSid as string
      const authToken = config.authToken as string

      const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}.json`
      const credentials = Buffer.from(`${accountSid}:${authToken}`).toString('base64')

      const response = await fetch(url, {
        headers: { 'Authorization': `Basic ${credentials}` },
      })

      return response.ok
    } catch {
      return false
    }
  },
}
