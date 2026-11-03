import { createHash } from 'crypto'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'
import { getRedis } from '@/lib/reading-cache'

// 30 geocode requests per IP per 60-second window. Uses the shared Redis-backed
// limiter (with a bounded in-memory fallback) so the per-IP state cannot grow
// unbounded across instances or during a Redis outage.
const GEO_RATE_LIMIT = { max: 30, windowSecs: 60, keyPrefix: 'axis:rl:geo:' }

// Nominatim's usage policy: at most 1 request per second for the WHOLE
// application, no autocomplete, and results cached on our side. The client
// searches only on an explicit action (BirthForm); this enforces the rest. The
// per-second gate is shared across instances through Redis (per-instance when
// Redis is absent), keyed on a constant so every caller shares one bucket.
const NOMINATIM_GLOBAL_LIMIT = { max: 1, windowSecs: 1, keyPrefix: 'axis:rl:nominatim:' }
const GEO_CACHE_TTL_SECONDS = 30 * 24 * 60 * 60

function geoCacheKey(query: string): string {
  const normalised = query.trim().toLowerCase().replace(/\s+/g, ' ')
  return 'axis:geo:' + createHash('sha256').update(normalised).digest('hex').slice(0, 40)
}

type SafeResult = { lat: string; lon: string; display_name: string }

async function readGeoCache(key: string): Promise<SafeResult[] | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    const hit = await redis.get<SafeResult[]>(key)
    return Array.isArray(hit) ? hit : null
  } catch { return null }
}

async function writeGeoCache(key: string, value: SafeResult[]): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try { await redis.set(key, value, { ex: GEO_CACHE_TTL_SECONDS }) } catch { /* best-effort */ }
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query || query.length > 200) return NextResponse.json([], { status: 400 })

  const ip = getClientIp(req)
  const { allowed } = await checkRateLimit(ip, GEO_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json([], { status: 429 })
  }

  const cacheKey = geoCacheKey(query)
  const cached = await readGeoCache(cacheKey)
  if (cached) return NextResponse.json(cached)

  const slot = await checkRateLimit('global', NOMINATIM_GLOBAL_LIMIT)
  if (!slot.allowed) {
    return NextResponse.json([], { status: 429, headers: { 'Retry-After': '1' } })
  }

  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&format=json&limit=4`,
      {
        signal: AbortSignal.timeout(5000),
        headers: {
          'Accept-Language': 'en',
          'User-Agent': 'AXIS-Astro/1.0 (axis-astro.vercel.app)'
        }
      }
    )
    if (!res.ok) return NextResponse.json([], { status: 500 })

    const data = await res.json() as NominatimResult[]
    // Whitelist only the fields the client needs — never forward raw Nominatim output.
    const safe = Array.isArray(data)
      ? data.map(r => ({ lat: r.lat, lon: r.lon, display_name: r.display_name }))
      : []
    if (safe.length > 0) await writeGeoCache(cacheKey, safe)
    return NextResponse.json(safe)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
