// app/api/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { getHorizonsEclipticLon } from '@/lib/jpl-horizons'

// Allow up to 30s for this route — needed for the Horizons API call (~300ms typical,
// 5s timeout, plus chart computation time).
export const maxDuration = 30

// Derive UTC offset from an IANA timezone name and a calendar date/time.
// The calendar values are treated as wall-clock time in the target timezone;
// the returned offset is the UTC offset (hours) active at that moment.
function tzNameToOffset(
  tzName: string,
  year: number, month: number, day: number,
  hour: number, minute: number
): number | null {
  try {
    // Build a UTC timestamp whose clock reading equals the birth wall-clock time.
    // This is approximate (±1h near DST transitions) but is immediately corrected
    // by the Intl round-trip below.
    const isoStr = `${year}-${String(month).padStart(2,'0')}-${String(day).padStart(2,'0')}T${String(hour).padStart(2,'0')}:${String(minute).padStart(2,'0')}:00Z`
    const date = new Date(isoStr)

    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      timeZoneName: 'longOffset'
    }).formatToParts(date)

    const offsetStr = parts.find(p => p.type === 'timeZoneName')?.value ?? ''
    if (offsetStr === 'GMT') return 0

    const m = offsetStr.match(/GMT([+-])(\d{1,2})(?::(\d{2}))?/)
    if (m) {
      const sign    = m[1] === '+' ? 1 : -1
      const hours   = parseInt(m[2])
      const minutes = parseInt(m[3] ?? '0')
      return sign * (hours + minutes / 60)
    }
  } catch { /* unknown timezone identifier */ }
  return null
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { year, month, day, hour, minute, latitude, longitude, timezone, tzName, birthTimeUnknown } = body

    if (!year || !month || !day || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Missing required birth data' }, { status: 400 })
    }

    const y  = parseInt(year)
    const mo = parseInt(month)
    const d  = parseInt(day)
    const h  = parseInt(hour) || 12
    const mi = parseInt(minute) || 0
    const lat = parseFloat(latitude)
    const lon = parseFloat(longitude)

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
    let tzOffset: number = parseFloat(timezone) || 0
    if (isNaN(tzOffset) || tzOffset < -14 || tzOffset > 14) tzOffset = 0
    if (tzName && typeof tzName === 'string' && tzName.length > 0) {
      const computed = tzNameToOffset(tzName, y, mo, d, h, mi)
      if (computed !== null) tzOffset = computed
    }

    const birthData: BirthData = {
      year: y, month: mo, day: d, hour: h, minute: mi,
      latitude: lat, longitude: lon,
      timezone: tzOffset,
      tzName: tzName || undefined,
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
