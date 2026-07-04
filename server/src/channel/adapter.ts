import type { ChannelAdapter } from '@notify-hub/shared'

const adapters = new Map<string, ChannelAdapter>()

export function registerAdapter(adapter: ChannelAdapter) {
  adapters.set(`${adapter.type}:${adapter.name}`, adapter)
}

export function getAdapter(type: string, name?: string): ChannelAdapter | undefined {
  if (name) {
    return adapters.get(`${type}:${name}`)
  }
  // Return first adapter for the type
  for (const [key, adapter] of adapters) {
    if (key.startsWith(`${type}:`)) return adapter
  }
  return undefined
}

export function getAdaptersForType(type: string): ChannelAdapter[] {
  const result: ChannelAdapter[] = []
  for (const [key, adapter] of adapters) {
    if (key.startsWith(`${type}:`)) result.push(adapter)
  }
  return result
}
