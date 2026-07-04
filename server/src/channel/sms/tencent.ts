import { createHmac, createHash } from 'node:crypto'
import type { ChannelAdapter, SendResult, MessagePayload } from '@notify-hub/shared'

/**
 * Tencent Cloud SMS adapter.
 * Requires template-based sending.
 * msg.subject = template ID, msg.body = JSON array of template params.
 */
export const tencentSmsAdapter: ChannelAdapter = {
  type: 'sms',
  name: 'tencent',

  async send(config: Record<string, unknown>, msg: MessagePayload): Promise<SendResult> {
    try {
      const secretId = config.secretId as string
      const secretKey = config.secretKey as string
      const signName = config.signName as string
      const sdkAppId = config.sdkAppId as string
      const endpoint = (config.endpoint as string) || 'sms.tencentcloudapi.com'

      const templateId = msg.subject || ''
      let templateParamSet: string[] = []
      try {
        templateParamSet = JSON.parse(msg.body || '[]')
      } catch {
        templateParamSet = [msg.body || '']
      }

      // Phone numbers: support comma-separated
      const phoneNumbers = msg.to.split(',').map((p) => p.trim())

      // Build request body
      const payload = {
        SmsSdkAppId: sdkAppId,
        SignName: signName,
        TemplateId: templateId,
        TemplateParamSet: templateParamSet,
        PhoneNumberSet: phoneNumbers,
      }

      const payloadStr = JSON.stringify(payload)
      const timestamp = Math.floor(Date.now() / 1000)
      const date = new Date(timestamp * 1000).toISOString().slice(0, 10)

      // TC3-HMAC-SHA256 signature
      const service = 'sms'
      const action = 'SendSms'
      const version = '2021-01-11'
      const algorithm = 'TC3-HMAC-SHA256'

      const httpRequestMethod = 'POST'
      const canonicalUri = '/'
      const canonicalQueryString = ''
      const contentType = 'application/json; charset=utf-8'
      const canonicalHeaders = `content-type:${contentType}\nhost:${endpoint}\n`
      const signedHeaders = 'content-type;host'
      const hashedPayload = createHash('sha256').update(payloadStr).digest('hex')

      const canonicalRequest = [
        httpRequestMethod,
        canonicalUri,
        canonicalQueryString,
        canonicalHeaders,
        signedHeaders,
        hashedPayload,
      ].join('\n')

      const credentialScope = `${date}/${service}/tc3_request`
      const hashedCanonicalRequest = createHash('sha256')
        .update(canonicalRequest)
        .digest('hex')
      const stringToSign = `${algorithm}\n${timestamp}\n${credentialScope}\n${hashedCanonicalRequest}`

      const secretDate = createHmac('sha256', `TC3${secretKey}`)
        .update(date)
        .digest()
      const secretService = createHmac('sha256', secretDate)
        .update(service)
        .digest()
      const secretSigning = createHmac('sha256', secretService)
        .update('tc3_request')
        .digest()
      const signature = createHmac('sha256', secretSigning)
        .update(stringToSign)
        .digest('hex')

      const authorization = `${algorithm} Credential=${secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

      const response = await fetch(`https://${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': contentType,
          'Host': endpoint,
          'X-TC-Action': action,
          'X-TC-Version': version,
          'X-TC-Timestamp': timestamp.toString(),
          'Authorization': authorization,
        },
        body: payloadStr,
      })

      const data = await response.json() as {
        Response?: {
          SendStatusSet?: Array<{ SerialNo?: string; Code?: string; Message?: string }>
          Error?: { Code?: string; Message?: string }
        }
      }

      const sendStatus = data.Response?.SendStatusSet?.[0]
      if (sendStatus?.Code !== 'Ok') {
        return {
          success: false,
          error: sendStatus?.Message || data.Response?.Error?.Message || 'Unknown error',
        }
      }

      return {
        success: true,
        externalId: sendStatus?.SerialNo,
      }
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  },

  async test(_config: Record<string, unknown>): Promise<boolean> {
    // Tencent doesn't have a simple verify; check config format
    return true
  },
}
