/**
 * Simple in-memory TTL cache with LRU-like eviction.
 * Uses a Map (insertion-order) for O(1) get/set with TTL expiration.
 */

interface CacheEntry<T> {
  value: T
  expiresAt: number
}

export class TtlCache<K, V> {
  private store = new Map<K, CacheEntry<V>>()
  private readonly maxEntries: number
  private readonly defaultTtlMs: number

  /**
   * @param maxEntries - Maximum entries before oldest is evicted (default 500)
   * @param defaultTtlMs - Default TTL in milliseconds (default 30s)
   */
  constructor(maxEntries = 500, defaultTtlMs = 30_000) {
    this.maxEntries = maxEntries
    this.defaultTtlMs = defaultTtlMs
  }

  get(key: K): V | undefined {
    const entry = this.store.get(key)
    if (!entry) return undefined
    if (Date.now() > entry.expiresAt) {
      this.store.delete(key)
      return undefined
    }
    // Move to end (most recently accessed) for LRU behavior
    this.store.delete(key)
    this.store.set(key, entry)
    return entry.value
  }

  set(key: K, value: V, ttlMs?: number): void {
    if (this.store.size >= this.maxEntries) {
      // Evict oldest entry (first in Map)
      const firstKey = this.store.keys().next().value
      if (firstKey !== undefined) {
        this.store.delete(firstKey)
      }
    }
    this.store.set(key, {
      value,
      expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs),
    })
  }

  delete(key: K): void {
    this.store.delete(key)
  }

  /** Delete all entries matching a predicate */
  invalidateWhere(predicate: (key: K, value: V) => boolean): void {
    for (const [key, entry] of this.store) {
      if (predicate(key, entry.value)) {
        this.store.delete(key)
      }
    }
  }

  clear(): void {
    this.store.clear()
  }

  get size(): number {
    return this.store.size
  }
}

// ── Singleton cache instances ──

/** API token cache: token string → token record. TTL 30s. */
export const apiTokenCache = new TtlCache<string, any>(200, 30_000)

/** Channel cache: "type:isDefault" or channel name → channel record. TTL 60s. */
export const channelCache = new TtlCache<string, any>(50, 60_000)

/** Template cache: "name:channelType" → template record. TTL 60s. */
export const templateCache = new TtlCache<string, any>(100, 60_000)

/** System settings cache: key → value string. TTL 5min. */
export const systemSettingsCache = new TtlCache<string, string>(50, 300_000)

/** User settings cache: userId → settings record. TTL 5min. */
export const userSettingsCache = new TtlCache<number, any>(200, 300_000)
