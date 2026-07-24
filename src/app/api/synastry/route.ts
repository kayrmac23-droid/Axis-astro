import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'
import { buildSynastryData } from '@/lib/synastry-calc'
import { tzNameToOffset, birthToUtcMs, isValidCalendarDate } from '@/lib/tz'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'

export const maxDuration = 30

// 20 synastry calculations per IP per 60-second window (two JPL calls each).
const SYNASTRY_RATE_LIMIT = { max: 20, windowSecs: 60, keyPrefix: 'axis:rl:synastry:' }

// Two birth-data payloads are well under 4 KB; 16 KB is generous headroom.
// Route handlers don't impose a body limit by default, so guard it explicitly.
const MAX_PAYLOAD_BYTES = 16_000

interface RawBirthInput {
  year?: unknown; month?: unknown; day?: unknown
  hour?: unknown; minute?: unknown
  latitude?: unknown; longitude?: unknown
  timezone?: unknown; tzName?: unknown
  birthTimeUnknown?: unknown
}

function parsePerson(raw: RawBirthInput, label: string): { data: BirthData } | { error: string } {
  const y  = parseInt(String(raw.year))
  const mo = parseInt(String(raw.month))
  const d  = parseInt(String(raw.day))
  const _h = parseInt(String(raw.hour))
  const h  = isNaN(_h) ? 12 : _h
  const mi = parseInt(String(raw.minute))  || 0
  const lat = parseFloat(String(raw.latitude))
  const lon = parseFloat(String(raw.longitude))
  const tzName = typeof raw.tzName === 'string' ? raw.tzName : undefined
  const btu = raw.birthTimeUnknown === true || raw.birthTimeUnknown === 'true'

  if (isNaN(y)  || y  < 1 || y  > 9999) return { error: `${label}: invalid year` }
  if (isNaN(mo) || mo < 1 || mo > 12)   return { error: `${label}: invalid month` }
  if (isNaN(d)  || d  < 1 || d  > 31)   return { error: `${label}: invalid day` }
  if (isNaN(h)  || h  < 0 || h  > 23)   return { error: `${label}: invalid hour` }
  if (isNaN(mi) || mi < 0 || mi > 59)   return { error: `${label}: invalid minute` }
  if (isNaN(lat) || lat < -90  || lat > 90)  return { error: `${label}: invalid latitude` }
  if (isNaN(lon) || lon < -180 || lon > 180) return { error: `${label}: invalid longitude` }

  if (!isValidCalendarDate(y, mo, d)) {
    return { error: `${label}: day out of range for month/year` }
  }

  let tzOffset = parseFloat(String(raw.timezone)) || 0
  if (isNaN(tzOffset) || tzOffset < -14 || tzOffset > 14) tzOffset = 0
  if (tzName) {
    const computed = tzNameToOffset(tzName, y, mo, d, h, mi)
    if (computed !== null) tzOffset = computed
  }

  return {
    data: {
      year: y, month: mo, day: d, hour: h, minute: mi,
      latitude: lat, longitude: lon,
      timezone: tzOffset,
      tzName,
      birthTimeUnknown: btu,
    },
  }
}

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

    const rawBody = await req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 400 })
    }
    let body: { personA?: unknown; personB?: unknown }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }
    const { personA: rawA, personB: rawB } = body

    if (!rawA || !rawB) {
      return NextResponse.json({ error: 'Missing personA or personB data' }, { status: 400 })
    }

    const resA = parsePerson(rawA as RawBirthInput, 'Person A')
    if ('error' in resA) return NextResponse.json({ error: resA.error }, { status: 400 })

    const resB = parsePerson(rawB as RawBirthInput, 'Person B')
    if ('error' in resB) return NextResponse.json({ error: resB.error }, { status: 400 })

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
