import { NextRequest, NextResponse } from 'next/server'

// Simple in-memory rate limit for geocode: 30 requests per IP per 60 seconds.
type RateRecord = { count: number; windowStart: number }
const _ratemap = new Map<string, RateRecord>()
const GEO_RATE_MAX    = 30
const GEO_RATE_WINDOW = 60_000  // ms

function checkGeoRateLimit(ip: string): boolean {
  const now = Date.now()
  const rec = _ratemap.get(ip)
  if (!rec || now - rec.windowStart >= GEO_RATE_WINDOW) {
    _ratemap.set(ip, { count: 1, windowStart: now })
    return true
  }
  if (rec.count >= GEO_RATE_MAX) return false
  rec.count++
  return true
}

interface NominatimResult {
  lat: string
  lon: string
  display_name: string
}

export async function GET(req: NextRequest) {
  const query = req.nextUrl.searchParams.get('q')
  if (!query || query.length > 200) return NextResponse.json([], { status: 400 })

  const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'direct'
  if (!checkGeoRateLimit(ip)) {
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
