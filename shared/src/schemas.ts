import { z } from 'zod'
import { CHANNEL_TYPES, SMS_PROVIDERS } from './constants.js'

// ── Channel Config Schemas ──

export const emailConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean().default(true),
  username: z.string().min(1),
  password: z.string().min(1),
  fromName: z.string().optional(),
  fromAddress: z.string().email(),
})

export const twilioConfigSchema = z.object({
  provider: z.literal('twilio'),
  accountSid: z.string().min(1),
  authToken: z.string().min(1),
  fromNumber: z.string().min(1),
})

export const aliyunSmsConfigSchema = z.object({
  provider: z.literal('aliyun'),
  accessKeyId: z.string().min(1),
  accessKeySecret: z.string().min(1),
  signName: z.string().min(1),
  endpoint: z.string().default('dysmsapi.aliyuncs.com'),
})

export const tencentSmsConfigSchema = z.object({
  provider: z.literal('tencent'),
  secretId: z.string().min(1),
  secretKey: z.string().min(1),
  signName: z.string().min(1),
  sdkAppId: z.string().min(1),
  endpoint: z.string().default('sms.tencentcloudapi.com'),
})

export const smsConfigSchema = z.discriminatedUnion('provider', [
  twilioConfigSchema,
  aliyunSmsConfigSchema,
  tencentSmsConfigSchema,
])

// ── API Request Schemas ──

const attachmentSchema = z.object({
  name: z.string().min(1),
  url: z.string().url().optional(),
  data: z.string().optional(), // base64
}).refine((val) => val.url || val.data, {
  message: 'Attachment must have either url or data',
})

const delayRegex = /^(\d+)(s|m|h|d|w)$/
const datetimeRegex = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/

export const sendMessageSchema = z.object({
  channel: z.string().min(1), // channel type ("email"/"sms"/"push") or channel name
  to: z.string().min(1),
  subject: z.string().optional(),
  body: z.string().optional(),
  template: z.string().optional(),
  variables: z.record(z.string()).optional(),
  idempotencyKey: z.string().optional(),
  scheduledAt: z.string().datetime().optional(),
  app: z.string().optional(),
  // Extended fields
  tags: z.array(z.string()).default([]),
  priority: z.number().int().min(0).max(99).default(0),
  url: z.string().url().optional(),
  delay: z.string().optional().refine(
    (val) => {
      if (!val) return true
      if (delayRegex.test(val)) return true
      if (datetimeRegex.test(val)) {
        const d = new Date(val.replace(' ', 'T'))
        return !isNaN(d.getTime())
      }
      return false
    },
    { message: 'Invalid delay format. Use relative (e.g. 30m, 1h, 1d, 1w) or absolute (yyyy-mm-dd hh:mm:ss)' }
  ),
  attachment: attachmentSchema.optional(),
  format: z.enum(['text', 'markdown', 'html', 'json']).default('text'),
})

export const sendBatchSchema = z.object({
  messages: z.array(sendMessageSchema).min(1).max(100),
})

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
})

export const clientLoginSchema = z.object({
  emailOrUsername: z.string().min(1),
  password: z.string().min(1),
})

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(6),
})

export const createUserSchema = z.object({
  email: z.string().email(),
  username: z.string().min(1).max(50),
  password: z.string().min(6),
  role: z.enum(['admin', 'user']).default('user'),
})

export const updateUserSchema = z.object({
  email: z.string().email().optional(),
  username: z.string().min(1).max(50).optional(),
  role: z.enum(['admin', 'user']).optional(),
})

export const createChannelSchema = z.object({
  type: z.enum(CHANNEL_TYPES),
  name: z.string().min(1).max(32),
  config: z.record(z.unknown()),
  enabled: z.boolean().default(true),
  isDefault: z.boolean().default(false),
}).superRefine((data, ctx) => {
  // Validate config against type-specific schema
  const configSchemas: Record<string, z.ZodTypeAny> = {
    email: emailConfigSchema,
    sms: smsConfigSchema,
  }

  const schema = configSchemas[data.type]
  if (schema) {
    const result = schema.safeParse(data.config)
    if (!result.success) {
      for (const issue of result.error.issues) {
        ctx.addIssue({
          ...issue,
          path: ['config', ...issue.path],
        })
      }
    }
  }
})

export const updateChannelSchema = z.object({
  type: z.enum(CHANNEL_TYPES).optional(),
  name: z.string().min(1).max(32).optional(),
  config: z.record(z.unknown()).optional(),
  enabled: z.boolean().optional(),
  isDefault: z.boolean().optional(),
})

export const TOKEN_EXPIRATION_OPTIONS = [
  { value: '1d', label: '1 Day', ms: 86_400_000 },
  { value: '7d', label: '1 Week', ms: 604_800_000 },
  { value: '30d', label: '1 Month', ms: 2_592_000_000 },
  { value: '365d', label: '1 Year', ms: 31_536_000_000 },
  { value: 'never', label: 'Never', ms: 0 },
] as const

export type TokenExpiration = (typeof TOKEN_EXPIRATION_OPTIONS)[number]['value']

export const createTokenSchema = z.object({
  name: z.string().min(1).max(100),
  scopes: z.array(z.enum(CHANNEL_TYPES)).default(['email', 'sms', 'push']),
  rateLimit: z.number().int().min(1).max(10000).default(100),
  ipWhitelist: z.array(z.string()).optional(),
  expiresIn: z.enum(['1d', '7d', '30d', '365d', 'never']).default('never'),
})

export const updateTokenSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  scopes: z.array(z.enum(CHANNEL_TYPES)).optional(),
  rateLimit: z.number().int().min(1).max(10000).optional(),
  ipWhitelist: z.array(z.string()).nullable().optional(),
  enabled: z.boolean().optional(),
})

export const createTemplateSchema = z.object({
  name: z.string().min(1).max(32),
  channelType: z.enum(CHANNEL_TYPES),
  subject: z.string().optional(),
  body: z.string().min(1),
  variables: z.record(z.string()).optional(),
})

export const updateTemplateSchema = createTemplateSchema.partial()

// ── API Response Schema ──

export const apiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
  })
