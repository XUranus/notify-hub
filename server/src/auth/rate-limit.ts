/**
 * Simple in-memory sliding window rate limiter.
 * Tracks request counts per token per 1-minute window.
 */

interface RateLimitEntry {
  count: number
  windowStart: number
}

const buckets = new Map<string, RateLimitEntry>()

// Clean up stale entries every 5 minutes
setInterval(() => {
  const cutoff = Date.now() - 120_000 // 2 minutes ago
  for (const [key, entry] of buckets) {
    if (entry.windowStart < cutoff) {
      buckets.delete(key)
    }
  }
}, 300_000).unref()

/**
 * Check if a request is within the rate limit for the given token.
 * Returns { allowed: true } or { allowed: false, retryAfter }.
 */
export function checkRateLimit(
  tokenId: number,
  rateLimit: number
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now()
  const windowMs = 60_000 // 1 minute
  const key = String(tokenId)

  let entry = buckets.get(key)
  if (!entry || now - entry.windowStart >= windowMs) {
    // New window
    entry = { count: 1, windowStart: now }
    buckets.set(key, entry)
    return { allowed: true }
  }

  entry.count++

  if (entry.count > rateLimit) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000)
    return { allowed: false, retryAfter }
  }

  return { allowed: true }
}

/**
 * IP-based rate limiter for registration.
 * Limits to maxAttempts per IP per windowMs (default: 5 per hour).
 */
const registrationBuckets = new Map<string, RateLimitEntry>()

setInterval(() => {
  const cutoff = Date.now() - 7_200_000 // 2 hours ago
  for (const [key, entry] of registrationBuckets) {
    if (entry.windowStart < cutoff) {
      registrationBuckets.delete(key)
    }
  }
}, 300_000).unref()

export function checkRegistrationRateLimit(
  ip: string,
  maxAttempts = 5,
  windowMs = 3_600_000 // 1 hour
): { allowed: true } | { allowed: false; retryAfter: number } {
  const now = Date.now()
  const key = `reg:${ip}`

  let entry = registrationBuckets.get(key)
  if (!entry || now - entry.windowStart >= windowMs) {
    entry = { count: 1, windowStart: now }
    registrationBuckets.set(key, entry)
    return { allowed: true }
  }

  entry.count++

  if (entry.count > maxAttempts) {
    const retryAfter = Math.ceil((entry.windowStart + windowMs - now) / 1000)
    return { allowed: false, retryAfter }
  }

  return { allowed: true }
}
