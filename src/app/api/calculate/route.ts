// app/api/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, plutoNeedsJpl } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'
import { birthToUtcMs } from '@/lib/tz'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { readLimitedJsonBody } from '@/lib/request-security'

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

    const parsedBody = await readLimitedJsonBody(req, MAX_PAYLOAD_BYTES)
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status })
    }

    const parsedBirth = parseBirthDataInput(parsedBody.value)
    if (!parsedBirth.ok) {
      return NextResponse.json({ error: parsedBirth.error }, { status: 400 })
    }
    const birthData = parsedBirth.data
    const { year, month, day, hour, minute, timezone } = birthData

    // Pluto from JPL Horizons ONLY outside the span where the local Meeus series
    // is valid (1885–2099; see plutoNeedsJpl). Inside it the local value is
    // within ~2″ of DE440, so the call bought nothing and cost every chart cast
    // an outside dependency with a 5s timeout. Outside it, JPL is the only
    // accurate source; on failure the chart falls back to Meeus and says so.
    const horizonsPluto = plutoNeedsJpl(year)
      ? await getHorizonsEclipticLon('Pluto', new Date(birthToUtcMs(year, month, day, hour, minute, timezone))).catch(() => null)
      : null

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
