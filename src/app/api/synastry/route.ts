import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'
import { buildSynastryData } from '@/lib/synastry-calc'

export const maxDuration = 30

function tzNameToOffset(
  tzName: string,
  year: number, month: number, day: number,
  hour: number, minute: number,
): number | null {
  try {
    const isoStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`
    const date = new Date(isoStr)
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, timeZoneName: 'longOffset',
    }).formatToParts(date)
    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
    if (offsetStr === 'GMT') return 0
    const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (m) {
      const sign = m[1] === '+' ? 1 : -1
      return sign * (parseInt(m[2]) + parseInt(m[3] ?? '0') / 60)
    }
  } catch { /* unknown tz */ }
  return null
}

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

  const testDate = new Date(y, mo - 1, d)
  if (testDate.getFullYear() !== y || testDate.getMonth() !== mo - 1 || testDate.getDate() !== d) {
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
    const body = await req.json()
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
    const utcA = new Date(Date.UTC(birthA.year, birthA.month - 1, birthA.day, birthA.hour, birthA.minute) - birthA.timezone * 3_600_000)
    const utcB = new Date(Date.UTC(birthB.year, birthB.month - 1, birthB.day, birthB.hour, birthB.minute) - birthB.timezone * 3_600_000)

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
