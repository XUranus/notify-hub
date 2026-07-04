import { TtlCache } from '../cache.js'

// Cache IP geolocation results for 24 hours (IP→location mapping changes rarely)
const geoCache = new TtlCache<string, string | null>(5000, 24 * 60 * 60 * 1000)

function isPrivateIp(ip: string): boolean {
  if (ip === '127.0.0.1' || ip === '::1' || ip === '::ffff:127.0.0.1') return true
  if (ip.startsWith('192.168.') || ip.startsWith('10.')) return true
  // RFC 1918: 172.16.0.0/12 = 172.16.0.0 – 172.31.255.255
  if (ip.startsWith('172.')) {
    const second = parseInt(ip.split('.')[1], 10)
    if (second >= 16 && second <= 31) return true
  }
  return false
}

/**
 * Lookup IP geolocation using free ip-api.com service.
 * Results are cached in memory for 24 hours.
 * Returns a string like "City, Country" or null on failure.
 */
export async function lookupIpLocation(ip: string): Promise<string | null> {
  if (isPrivateIp(ip)) return 'Local Network'

  // Check cache
  const cached = geoCache.get(ip)
  if (cached !== undefined) return cached

  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=zh-CN`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!resp.ok) {
      geoCache.set(ip, null)
      return null
    }

    const data = await resp.json() as {
      status: string
      country?: string
      regionName?: string
      city?: string
    }

    if (data.status !== 'success') {
      geoCache.set(ip, null)
      return null
    }

    const parts = [data.city, data.regionName, data.country].filter(Boolean)
    const result = parts.length > 0 ? parts.join(', ') : null
    geoCache.set(ip, result)
    return result
  } catch {
    geoCache.set(ip, null)
    return null
  }
}
