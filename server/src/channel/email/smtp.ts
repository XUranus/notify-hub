import nodemailer from 'nodemailer'
import type { ChannelAdapter, SendResult, MessagePayload } from '@notify-hub/shared'

export const smtpAdapter: ChannelAdapter = {
  type: 'email',
  name: 'smtp',

  async send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult> {
    try {
      const transporter = nodemailer.createTransport({
        host: config.host as string,
        port: config.port as number,
        secure: config.secure as boolean,
        auth: {
          user: config.username as string,
          pass: config.password as string,
        },
      })

      const fromName = (config.fromName as string) || 'NotifyHub'
      const fromAddress = config.fromAddress as string

      const info = await transporter.sendMail({
        from: `"${fromName}" <${fromAddress}>`,
        to: msg.to,
        subject: msg.subject || '(no subject)',
        html: msg.body,
        text: msg.body?.replace(/<[^>]*>/g, ''), // strip HTML for text fallback
      })

      return {
        success: true,
        externalId: info.messageId,
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
      const transporter = nodemailer.createTransport({
        host: config.host as string,
        port: config.port as number,
        secure: config.secure as boolean,
        auth: {
          user: config.username as string,
          pass: config.password as string,
        },
      })

      await transporter.verify()
      return true
    } catch {
      return false
    }
  },
}
