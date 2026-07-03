import type { ApiResponse } from '@notify-hub/shared'
import { loadConfig } from './config.js'

export class NotifyClient {
  private baseUrl: string
  private token: string

  constructor(baseUrl?: string, token?: string) {
    const config = loadConfig()
    this.baseUrl = (baseUrl || config.server || 'http://localhost:3000').replace(/\/$/, '')
    this.token = token || config.token || ''
  }

  private async request<T>(
    method: string,
    path: string,
    body?: unknown
  ): Promise<ApiResponse<T>> {
    const url = `${this.baseUrl}${path}`
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.token}`,
    }

    try {
      const response = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      })

      const data = await response.json() as ApiResponse<T>
      return data
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : 'Request failed',
      }
    }
  }

  async send(params: {
    channel: string
    to: string
    subject?: string
    body?: string
    template?: string
    variables?: Record<string, string>
    idempotencyKey?: string
    tags?: string[]
    priority?: number
    url?: string
    delay?: string
    attachment?: { name: string; url?: string; data?: string }
    format?: string
  }) {
    return this.request<{ messageId: string; status: string }>('POST', '/api/v1/send', params)
  }

  async getMessage(id: string) {
    return this.request<any>('GET', `/api/v1/messages/${id}`)
  }

  async getMessages(params?: { page?: number; pageSize?: number; status?: string }) {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    if (params?.status) query.set('status', params.status)
    const qs = query.toString()
    return this.request<any>('GET', `/api/v1/messages${qs ? `?${qs}` : ''}`)
  }
}
