import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'
import { buildSynastryData } from '@/lib/synastry-calc'
import { birthToUtcMs } from '@/lib/tz'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { readLimitedJsonBody } from '@/lib/request-security'

export const maxDuration = 30

// 20 synastry calculations per IP per 60-second window (two JPL calls each).
const SYNASTRY_RATE_LIMIT = { max: 20, windowSecs: 60, keyPrefix: 'axis:rl:synastry:' }

// Two birth-data payloads are well under 4 KB; 16 KB is generous headroom.
// Route handlers don't impose a body limit by default, so guard it explicitly.
const MAX_PAYLOAD_BYTES = 16_000

export async function POST(req: NextRequest) {
  try {
    // ── Rate limiting ──────────────────────────────────────────────────────────
    const ip = getClientIp(req)
    const { allowed, retryAfter } = await checkRateLimit(ip, SYNASTRY_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before calculating another synastry.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    const parsedBody = await readLimitedJsonBody(req, MAX_PAYLOAD_BYTES)
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status })
    }
    if (!parsedBody.value || typeof parsedBody.value !== 'object' || Array.isArray(parsedBody.value)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 })
    }
    const { personA: rawA, personB: rawB } = parsedBody.value as { personA?: unknown; personB?: unknown }

    if (!rawA || !rawB) {
      return NextResponse.json({ error: 'Missing personA or personB data' }, { status: 400 })
    }

    const resA = parseBirthDataInput(rawA, { label: 'Person A' })
    if (!resA.ok) return NextResponse.json({ error: resA.error }, { status: 400 })

    const resB = parseBirthDataInput(rawB, { label: 'Person B' })
    if (!resB.ok) return NextResponse.json({ error: resB.error }, { status: 400 })

    const { data: birthA } = resA
    const { data: birthB } = resB

    // Fetch Pluto for both charts concurrently
    const utcA = new Date(birthToUtcMs(birthA.year, birthA.month, birthA.day, birthA.hour, birthA.minute, birthA.timezone))
    const utcB = new Date(birthToUtcMs(birthB.year, birthB.month, birthB.day, birthB.hour, birthB.minute, birthB.timezone))

    const [plutoA, plutoB] = await Promise.all([
      getHorizonsEclipticLon('Pluto', utcA).catch(() => null),
      getHorizonsEclipticLon('Pluto', utcB).catch(() => null),
    ])

    const chartA = calculateDualChart(birthA, {
      plutoLongitude: plutoA?.longitude,
      plutoSource: plutoA ? `jpl-horizons-${plutoA.ephemeris.toLowerCase()}` : 'local-meeus',
    })
    const chartB = calculateDualChart(birthB, {
      plutoLongitude: plutoB?.longitude,
      plutoSource: plutoB ? `jpl-horizons-${plutoB.ephemeris.toLowerCase()}` : 'local-meeus',
    })

    const synastryData = buildSynastryData(chartA, chartB)
    return NextResponse.json(synastryData)
  } catch (error) {
    console.error('Synastry calculation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: 'CALCULATION_FAILED',
      message: "Synastry calculation failed. Please check both sets of birth data and try again.",
    }, { status: 500 })
  }
}
