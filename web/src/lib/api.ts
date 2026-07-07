const BASE_URL = '/api'

function getToken(): string | null {
  return localStorage.getItem('notifyhub_token')
}

export function setToken(token: string) {
  localStorage.setItem('notifyhub_token', token)
}

export function clearToken() {
  localStorage.removeItem('notifyhub_token')
  localStorage.removeItem('notifyhub_user')
}

export function isAuthenticated(): boolean {
  return !!getToken()
}

export interface CurrentUser {
  id: number
  email: string
  username: string
  role: 'admin' | 'user'
}

export function setCurrentUser(user: CurrentUser) {
  localStorage.setItem('notifyhub_user', JSON.stringify(user))
}

export function getCurrentUser(): CurrentUser | null {
  const raw = localStorage.getItem('notifyhub_user')
  if (!raw) return null
  try {
    return JSON.parse(raw)
  } catch {
    return null
  }
}

export function isAdmin(): boolean {
  return getCurrentUser()?.role === 'admin'
}

async function request<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<{ success: boolean; data?: T; error?: string }> {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
  }

  const token = getToken()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    })

    if (response.status === 401) {
      // Don't redirect on login endpoint — let caller handle the error
      if (path === '/admin/login') {
        return await response.json()
      }
      clearToken()
      window.location.href = '/login'
      return { success: false, error: 'Unauthorized' }
    }

    const contentType = response.headers.get('content-type') || ''
    if (!contentType.includes('application/json')) {
      return {
        success: false,
        error: `Server returned ${response.status}: ${response.statusText || 'unexpected response'}`,
      }
    }

    return await response.json()
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : 'Request failed' }
  }
}

// ── Auth ──

export const authApi = {
  login: (email: string, password: string) =>
    request<{ token: string; user: CurrentUser; mustChangePassword?: boolean }>(
      'POST', '/admin/login', { email, password }
    ),
  register: (email: string, password: string) =>
    request<{ token: string; user: CurrentUser }>(
      'POST', '/auth/register', { email, password }
    ),
  changePassword: (currentPassword: string, newPassword: string) =>
    request<void>('POST', '/auth/change-password', { currentPassword, newPassword }),
  deleteAccount: (email: string, password: string) =>
    request<{ deleted: boolean }>('DELETE', '/admin/account', { email, password }),
}

// ── Stats ──

export const statsApi = {
  overview: () => request<any>('GET', '/user/stats/overview'),
  daily: () => request<any[]>('GET', '/user/stats/daily'),
  channels: () => request<any[]>('GET', '/user/stats/channels'),
  recent: () => request<any[]>('GET', '/user/stats/recent'),
}

// ── Push Clients ──

export const pushApi = {
  listClients: () => request<any[]>('GET', '/user/push/clients'),
  deleteClient: (uuid: string) => request<any>('DELETE', `/user/push/clients/${uuid}`),
}

// ── Channels ──

export const channelsApi = {
  list: (type?: string) =>
    request<any[]>('GET', `/admin/channels${type ? `?type=${type}` : ''}`),
  get: (id: string) => request<any>('GET', `/admin/channels/${id}`),
  create: (data: any) => request<any>('POST', '/admin/channels', data),
  update: (id: string, data: any) => request<any>('PUT', `/admin/channels/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/admin/channels/${id}`),
  test: (id: string) => request<{ success: boolean; message: string }>('POST', `/admin/channels/${id}/test`),
  testConfig: (type: string, config: Record<string, unknown>) =>
    request<{ success: boolean; message: string }>('POST', '/admin/channels/test-config', { type, config }),
}

// ── Tokens ──

export const tokensApi = {
  list: () => request<any[]>('GET', '/user/tokens'),
  get: (id: number) => request<any>('GET', `/user/tokens/${id}`),
  create: (data: any) => request<any>('POST', '/user/tokens', data),
  update: (id: number, data: any) => request<any>('PUT', `/user/tokens/${id}`, data),
  delete: (id: number) => request<any>('DELETE', `/user/tokens/${id}`),
  rotate: (id: number) => request<{ token: string }>('POST', `/user/tokens/${id}/rotate`),
  generateClientToken: () => request<{ token: string }>('POST', '/user/tokens/generate-client-token', {}),
}

// ── Templates ──

export const templatesApi = {
  list: (channelType?: string) =>
    request<any[]>('GET', `/admin/templates${channelType ? `?channelType=${channelType}` : ''}`),
  get: (id: string) => request<any>('GET', `/admin/templates/${id}`),
  create: (data: any) => request<any>('POST', '/admin/templates', data),
  update: (id: string, data: any) => request<any>('PUT', `/admin/templates/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/admin/templates/${id}`),
}

// ── Messages ──

export const topicsApi = {
  list: () => request<any[]>('GET', '/user/topics'),
  get: (id: string) => request<any>('GET', `/user/topics/${id}`),
  create: (data: any) => request<any>('POST', '/user/topics', data),
  update: (id: string, data: any) => request<any>('PUT', `/user/topics/${id}`, data),
  delete: (id: string) => request<any>('DELETE', `/user/topics/${id}`),
}

export const messagesApi = {
  list: (params?: { page?: number; pageSize?: number; status?: string; channel?: string }) => {
    const query = new URLSearchParams()
    if (params?.page) query.set('page', String(params.page))
    if (params?.pageSize) query.set('pageSize', String(params.pageSize))
    if (params?.status) query.set('status', params.status)
    if (params?.channel) query.set('channel', params.channel)
    const qs = query.toString()
    return request<any>('GET', `/user/messages${qs ? `?${qs}` : ''}`)
  },
  export: (params?: { status?: string; channel?: string }) => {
    const query = new URLSearchParams()
    if (params?.status) query.set('status', params.status)
    if (params?.channel) query.set('channel', params.channel)
    const qs = query.toString()
    return request<any>('GET', `/admin/messages/export${qs ? `?${qs}` : ''}`)
  },
  get: (id: string) => request<any>('GET', `/user/messages/${id}`),
  retry: (id: string) => request<any>('POST', `/admin/messages/${id}/retry`),
  delete: (id: string) => request<any>('DELETE', `/admin/messages/${id}`),
  deleteAll: () => request<{ deleted_messages: number; deleted_push_messages: number }>('DELETE', '/admin/messages/all'),
}

// ── Users (admin only) ──

export const usersApi = {
  list: () => request<any[]>('GET', '/admin/users'),
  get: (id: number) => request<any>('GET', `/admin/users/${id}`),
  create: (data: { email: string; username: string; password: string; role: string }) =>
    request<any>('POST', '/admin/users', data),
  update: (id: number, data: { email?: string; username?: string; role?: string }) =>
    request<any>('PUT', `/admin/users/${id}`, data),
  delete: (id: number) => request<any>('DELETE', `/admin/users/${id}`),
}

// ── Attachments ──

export const attachmentsApi = {
  list: (page = 1, pageSize = 20) =>
    request<{ items: any[]; total: number; page: number; pageSize: number }>(
      'GET', `/user/attachments?page=${page}&pageSize=${pageSize}`
    ),
  delete: (id: string) => request<void>('DELETE', `/user/attachments/${id}`),
  batchDelete: (ids: string[]) => request<{ deleted: number }>('POST', '/user/attachments/batch-delete', { ids }),
  clearAll: () => request<{ deleted: number }>('POST', '/user/attachments/batch-delete', { all: true }),
  stats: () => request<{ usedBytes: number; maxBytes: number | null; fileCount: number; isAdmin: boolean }>(
    'GET', '/user/attachments/stats'
  ),
  upload: async (file: File) => {
    const token = getToken()
    const formData = new FormData()
    formData.append('file', file)

    const response = await fetch(`${BASE_URL}/v1/upload`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    })

    if (response.status === 401) {
      clearToken()
      window.location.href = '/login'
      return { success: false, error: 'Unauthorized' }
    }

    return await response.json()
  },
}

// ── User Settings ──

export const userSettingsApi = {
  get: () =>
    request<{ attachmentExpiryDays: number; messageExpiryDays: number }>('GET', '/user/settings'),
  update: (data: { attachmentExpiryDays?: number; messageExpiryDays?: number }) =>
    request<void>('PUT', '/user/settings', data),
  getAttachment: () =>
    request<{ attachmentExpiration: number }>('GET', '/user/settings/attachment'),
  updateAttachment: (attachmentExpiration: number) =>
    request<void>('PUT', '/user/settings/attachment', { attachmentExpiration }),
}

// ── System Settings (admin only) ──

export const systemSettingsApi = {
  get: () =>
    request<{ attachmentMaxFileSize: number; attachmentMaxTotalSize: number; maxMessagesPerUser: number; cleanupIntervalMinutes: number }>(
      'GET', '/admin/system-settings'
    ),
  update: (data: { attachmentMaxFileSize?: number; attachmentMaxTotalSize?: number; maxMessagesPerUser?: number; cleanupIntervalMinutes?: number }) =>
    request<void>('PUT', '/admin/system-settings', data),
}

// ── Cleanup Logs (admin only) ──

export const cleanupLogsApi = {
  list: (page = 1, pageSize = 20) =>
    request<{ items: any[]; total: number; page: number; pageSize: number }>(
      'GET', `/admin/cleanup-logs?page=${page}&pageSize=${pageSize}`
    ),
}

// ── App Logs (admin only) ──

export const appLogsApi = {
  list: (page = 1, pageSize = 50, level?: string) => {
    const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) })
    if (level) params.set('level', level)
    return request<{ items: Array<{ id: number; level: string; message: string; source: string | null; createdAt: string }>; total: number; page: number; pageSize: number }>(
      'GET', `/admin/logs?${params}`
    )
  },
  exportUrl: (level?: string, limit = 5000) => {
    const token = getToken()
    const params = new URLSearchParams({ limit: String(limit) })
    if (level) params.set('level', level)
    return `${BASE_URL}/admin/logs/export?${params}`
  },
  getSettings: () =>
    request<{ logLevel: string; logRetentionDays: number }>('GET', '/admin/logs/settings'),
  updateSettings: (data: { logLevel?: string; logRetentionDays?: number }) =>
    request<void>('PUT', '/admin/logs/settings', data),
  streamUrl: () => `${BASE_URL}/admin/logs/stream`,
}
