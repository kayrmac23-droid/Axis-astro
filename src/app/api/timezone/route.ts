// app/api/timezone/route.ts
// Server-side lat/lon → IANA timezone lookup (offline, no external dependency).
// Uses tz-lookup which bundles a compact (~400KB) grid-based timezone database.
// Accuracy: correct for the vast majority of populated locations; may misfire
// only for coordinates very close to a timezone border (rare in city lookups).

import { NextRequest, NextResponse } from 'next/server'

// eslint-disable-next-line @typescript-eslint/no-require-imports
const tzlookup = require('tz-lookup') as (lat: number, lon: number) => string

export async function GET(req: NextRequest) {
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
