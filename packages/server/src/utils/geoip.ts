/**
 * Lookup IP geolocation using free ip-api.com service.
 * Returns a string like "City, Country" or null on failure.
 */
export async function lookupIpLocation(ip: string): Promise<string | null> {
  // Skip private/local IPs
  if (
    ip === '127.0.0.1' ||
    ip === '::1' ||
    ip === '::ffff:127.0.0.1' ||
    ip.startsWith('192.168.') ||
    ip.startsWith('10.') ||
    ip.startsWith('172.')
  ) {
    return 'Local Network'
  }

  try {
    const resp = await fetch(`http://ip-api.com/json/${ip}?fields=status,country,regionName,city&lang=zh-CN`, {
      signal: AbortSignal.timeout(3000),
    })

    if (!resp.ok) return null

    const data = await resp.json() as {
      status: string
      country?: string
      regionName?: string
      city?: string
    }

    if (data.status !== 'success') return null

    const parts = [data.city, data.regionName, data.country].filter(Boolean)
    return parts.length > 0 ? parts.join(', ') : null
  } catch {
    return null
  }
}
