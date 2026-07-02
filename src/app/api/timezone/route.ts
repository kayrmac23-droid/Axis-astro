// app/api/timezone/route.ts
// Server-side lat/lon → IANA timezone lookup (offline, no external dependency).
// Uses tz-lookup which bundles a compact (~400KB) grid-based timezone database.
// Accuracy: correct for the vast majority of populated locations; may misfire
// only for coordinates very close to a timezone border (rare in city lookups).

import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tzlookup = require('tz-lookup') as (lat: number, lon: number) => string

// 60 lookups per IP per 60-second window. The lookup itself is offline and cheap,
// but a per-IP ceiling keeps the endpoint from being used as an unbounded compute
// or scraping surface — consistent with the other API routes.
const TZ_RATE_LIMIT = { max: 60, windowSecs: 60, keyPrefix: 'axis:rl:tz:' }

export async function GET(req: NextRequest) {
  const ip = getClientIp(req)
  const { allowed, retryAfter } = await checkRateLimit(ip, TZ_RATE_LIMIT)
  if (!allowed) {
    return NextResponse.json(
      { error: 'Too many requests' },
      { status: 429, headers: { 'Retry-After': String(retryAfter) } }
    )
  }

  const { searchParams } = new URL(req.url)
  const latStr = searchParams.get('lat')
  const lonStr = searchParams.get('lon')

  if (!latStr || !lonStr) {
    return NextResponse.json({ error: 'Missing lat or lon' }, { status: 400 })
  }

  const lat = parseFloat(latStr)
  const lon = parseFloat(lonStr)

  if (isNaN(lat) || isNaN(lon) || lat < -90 || lat > 90 || lon < -180 || lon > 180) {
    return NextResponse.json({ error: 'Invalid coordinates' }, { status: 400 })
  }

  try {
    const tzName: string = tzlookup(lat, lon)
    return NextResponse.json({ tzName })
  } catch {
    return NextResponse.json({ error: 'Timezone lookup failed' }, { status: 500 })
  }
}
