import { Monitor, Smartphone } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { toDate } from '@/lib/utils'

export interface PushClient {
  id: string
  uuid: string
  name: string | null
  os: string
  arch: string | null
  desktop: string | null
  appVersion: string | null
  connectionMode: string | null  // 'sse' | 'ws' | 'poll' | null
  lastSeenAt: string | null
  registeredAt: string
}

export const osIcons: Record<string, LucideIcon> = {
  linux: Monitor,
  windows: Monitor,
  macos: Monitor,
  android: Smartphone,
}

export const osLabels: Record<string, string> = {
  linux: 'Linux',
  windows: 'Windows',
  macos: 'macOS',
  android: 'Android',
}

export function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false
  return Date.now() - toDate(lastSeenAt).getTime() < 5 * 60 * 1000
}
