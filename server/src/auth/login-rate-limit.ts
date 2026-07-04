/**
 * Login rate limiting with escalating lockout.
 * Tracks failed attempts per email address.
 *
 * Lockout tiers:
 *   3 failures → 5 min
 *   6 failures → 1 hour
 *   9 failures → 12 hours
 *   12+ failures → 24 hours (max)
 */

interface LoginAttempt {
  failures: number
  lockedUntil: number | null // timestamp in ms, null = not locked
}

const attempts = new Map<string, LoginAttempt>()

// Lockout tiers: [threshold, durationMs]
const LOCKOUT_TIERS: [number, number][] = [
  [3,  5 * 60 * 1000],       // 5 min
  [6,  60 * 60 * 1000],      // 1 hour
  [9,  12 * 60 * 60 * 1000], // 12 hours
  [12, 24 * 60 * 60 * 1000], // 24 hours
]

function getLockoutDuration(failures: number): number {
  let duration = 0
  for (const [threshold, ms] of LOCKOUT_TIERS) {
    if (failures >= threshold) duration = ms
  }
  return duration
}

/** Check if an email is currently locked out. Returns remaining seconds or 0. */
export function getLoginLockoutRemaining(email: string): number {
  const entry = attempts.get(email.toLowerCase())
  if (!entry?.lockedUntil) return 0
  const remaining = entry.lockedUntil - Date.now()
  return remaining > 0 ? Math.ceil(remaining / 1000) : 0
}

/** Record a failed login attempt. May trigger a lockout. */
export function recordLoginFailure(email: string): void {
  const key = email.toLowerCase()
  const entry = attempts.get(key) || { failures: 0, lockedUntil: null }
  entry.failures++
  const duration = getLockoutDuration(entry.failures)
  if (duration > 0) {
    entry.lockedUntil = Date.now() + duration
  }
  attempts.set(key, entry)
}

/** Clear failed attempts on successful login. */
export function clearLoginFailures(email: string): void {
  attempts.delete(email.toLowerCase())
}
