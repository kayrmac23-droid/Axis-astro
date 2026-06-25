// app/api/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'
import { tzNameToOffset } from '@/lib/tz'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'

// Allow up to 30s for this route — needed for the Horizons API call (~300ms typical,
// 5s timeout, plus chart computation time).
export const maxDuration = 30

// 30 chart calculations per IP per 60-second window.
const CALC_RATE_LIMIT = { max: 30, windowSecs: 60, keyPrefix: 'axis:rl:calc:' }

// A real birth-data payload is well under 2 KB; 16 KB is generous headroom.
// Anything larger is almost certainly abuse. Route handlers don't impose a body
// limit by default, so guard it explicitly.
const MAX_PAYLOAD_BYTES = 16_000

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting ──────────────────────────────────────────────────────────
    const ip = getClientIp(req)
    const { allowed, retryAfter } = await checkRateLimit(ip, CALC_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before calculating another chart.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const rawBody = await req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 400 })
    }
    let body: Record<string, unknown>
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { year, month, day, hour, minute, latitude, longitude, timezone, tzName, birthTimeUnknown } = body

    if (!year || !month || !day || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Missing required birth data' }, { status: 400 })
    }

    const y  = parseInt(String(year))
    const mo = parseInt(String(month))
    const d  = parseInt(String(day))
    const hRaw = parseInt(String(hour))
    const h  = isNaN(hRaw) ? 12 : hRaw
    const mi = parseInt(String(minute)) || 0
    const lat = parseFloat(String(latitude))
    const lon = parseFloat(String(longitude))

    if (isNaN(y)  || y  < 1    || y  > 9999) return NextResponse.json({ error: 'Invalid year'      }, { status: 400 })
    if (isNaN(mo) || mo < 1    || mo > 12)   return NextResponse.json({ error: 'Invalid month'     }, { status: 400 })
    if (isNaN(d)  || d  < 1    || d  > 31)   return NextResponse.json({ error: 'Invalid day'       }, { status: 400 })
    if (isNaN(h)  || h  < 0    || h  > 23)   return NextResponse.json({ error: 'Invalid hour'      }, { status: 400 })
    if (isNaN(mi) || mi < 0    || mi > 59)   return NextResponse.json({ error: 'Invalid minute'    }, { status: 400 })
    if (isNaN(lat) || lat < -90  || lat > 90)  return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
    if (isNaN(lon) || lon < -180 || lon > 180) return NextResponse.json({ error: 'Invalid longitude'}, { status: 400 })

    // Reject impossible calendar dates (e.g. Feb 31, Apr 31)
    const testDate = new Date(y, mo - 1, d)
    if (testDate.getFullYear() !== y || testDate.getMonth() !== mo - 1 || testDate.getDate() !== d) {
      return NextResponse.json({ error: 'Invalid date: day out of range for given month/year' }, { status: 400 })
    }

    // Timezone resolution priority:
    // 1. Server-side DST lookup from IANA name (most accurate)
    // 2. Numeric UTC offset supplied by client (already DST-aware if from /api/timezone)
    // 3. Fallback: 0 (UTC)
    let tzOffset: number = parseFloat(String(timezone)) || 0
    if (isNaN(tzOffset) || tzOffset < -14 || tzOffset > 14) tzOffset = 0
    if (tzName && typeof tzName === 'string' && tzName.length > 0) {
      const computed = tzNameToOffset(tzName, y, mo, d, h, mi)
      if (computed !== null) tzOffset = computed
    }

    const birthData: BirthData = {
      year: y, month: mo, day: d, hour: h, minute: mi,
      latitude: lat, longitude: lon,
      timezone: tzOffset,
      tzName: typeof tzName === 'string' ? tzName : undefined,
      birthTimeUnknown: birthTimeUnknown === true || birthTimeUnknown === 'true',
    }

    // Attempt JPL Horizons DE440 lookup for Pluto. Falls back to local Meeus (~0.3°)
    // silently if Horizons is unavailable. The chart is still valid in either case.
    const utcMs   = Date.UTC(y, mo - 1, d, h, mi, 0) - tzOffset * 3_600_000
    const utcDate = new Date(utcMs)
    const horizonsPluto = await getHorizonsEclipticLon('Pluto', utcDate).catch(() => null)

    const chartData = calculateDualChart(birthData, {
      plutoLongitude: horizonsPluto?.longitude,
      plutoSource:    horizonsPluto
        ? `jpl-horizons-${horizonsPluto.ephemeris.toLowerCase()}`
        : 'local-meeus',
    })
    return NextResponse.json(chartData)
  } catch (error) {
    console.error('Chart calculation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: 'CALCULATION_FAILED',
      message: "We couldn't calculate your chart. This usually means the birth data, location lookup, or ephemeris service failed. Please check the details and try again.",
    }, { status: 500 })
  }
}
