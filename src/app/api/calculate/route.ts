// app/api/calculate/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { year, month, day, hour, minute, latitude, longitude, timezone } = body

    if (!year || !month || !day || latitude === undefined || longitude === undefined) {
      return NextResponse.json({ error: 'Missing required birth data' }, { status: 400 })
    }

    const y = parseInt(year), mo = parseInt(month), d = parseInt(day)
    const h = parseInt(hour) || 12, mi = parseInt(minute) || 0
    const lat = parseFloat(latitude), lon = parseFloat(longitude)

    if (isNaN(y) || y < 1 || y > 9999)     return NextResponse.json({ error: 'Invalid year' }, { status: 400 })
    if (isNaN(mo) || mo < 1 || mo > 12)    return NextResponse.json({ error: 'Invalid month' }, { status: 400 })
    if (isNaN(d) || d < 1 || d > 31)       return NextResponse.json({ error: 'Invalid day' }, { status: 400 })
    if (isNaN(h) || h < 0 || h > 23)       return NextResponse.json({ error: 'Invalid hour' }, { status: 400 })
    if (isNaN(mi) || mi < 0 || mi > 59)    return NextResponse.json({ error: 'Invalid minute' }, { status: 400 })
    if (isNaN(lat) || lat < -90 || lat > 90)   return NextResponse.json({ error: 'Invalid latitude' }, { status: 400 })
    if (isNaN(lon) || lon < -180 || lon > 180) return NextResponse.json({ error: 'Invalid longitude' }, { status: 400 })

    const birthData: BirthData = {
      year: y, month: mo, day: d, hour: h, minute: mi,
      latitude: lat, longitude: lon,
      timezone: parseFloat(timezone) || 0
    }

    const chartData = calculateDualChart(birthData)
    return NextResponse.json(chartData)
  } catch (error) {
    console.error('Chart calculation error:', error)
    return NextResponse.json({ error: 'Calculation failed' }, { status: 500 })
  }
}
