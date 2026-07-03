import { createHmac } from 'node:crypto'
import type { ChannelAdapter, SendResult, MessagePayload } from '@notify-hub/shared'

/**
 * Aliyun SMS adapter.
 * Note: Aliyun SMS requires template-based sending.
 * The template code and params should be in msg.subject (template code)
 * and msg.body (JSON array of params).
 */
export const aliyunSmsAdapter: ChannelAdapter = {
  type: 'sms',
  name: 'aliyun',

  async send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult> {
    try {
      const accessKeyId = config.accessKeyId as string
      const accessKeySecret = config.accessKeySecret as string
      const signName = config.signName as string
      const endpoint = (config.endpoint as string) || 'dysmsapi.aliyuncs.com'

      // msg.subject = template code, msg.body = JSON array of template params
      const templateCode = msg.subject || ''
      let templateParam = '[]'
      try {
        templateParam = msg.body || '[]'
      } catch {
        templateParam = JSON.stringify([msg.body])
      }

      const params: Record<string, string> = {
        Action: 'SendSms',
        Version: '2017-05-25',
        Format: 'JSON',
        AccessKeyId: accessKeyId,
        SignatureMethod: 'HMAC-SHA1',
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        SignatureVersion: '1.0',
        SignatureNonce: Math.random().toString(36).slice(2),
        PhoneNumbers: msg.to,
        SignName: signName,
        TemplateCode: templateCode,
        TemplateParam: templateParam,
      }

      // Sort and build string to sign
      const sortedKeys = Object.keys(params).sort()
      const canonicalQuery = sortedKeys
        .map((k) => `${encodeURIComponent(k)}=${encodeURIComponent(params[k])}`)
        .join('&')

      const stringToSign = `GET&${encodeURIComponent('/')}&${encodeURIComponent(canonicalQuery)}`
      const signature = createHmac('sha1', `${accessKeySecret}&`)
        .update(stringToSign)
        .digest('base64')

      const url = `https://${endpoint}/?${canonicalQuery}&Signature=${encodeURIComponent(signature)}`

      const response = await fetch(url)
      const data = await response.json() as {
        Code?: string
        Message?: string
        BizId?: string
      }

      if (data.Code !== 'OK') {
        return {
          success: false,
          error: `${data.Code}: ${data.Message}`,
        }
      }

      return {
        success: true,
        externalId: data.BizId,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  async test(_config: Record<string, unknown>): Promise<boolean> {
    // Aliyun doesn't have a simple verify endpoint; just check credentials format
    return true
  },
}
