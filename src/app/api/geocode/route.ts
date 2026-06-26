import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'

// 30 geocode requests per IP per 60-second window. Uses the shared Redis-backed
// limiter (with a bounded in-memory fallback) so the per-IP state cannot grow
// unbounded across instances or during a Redis outage.
const GEO_RATE_LIMIT = { max: 30, windowSecs: 60, keyPrefix: 'axis:rl:geo:' }

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
    return NextResponse.json(safe)
  } catch {
    return NextResponse.json([], { status: 500 })
  }
}
