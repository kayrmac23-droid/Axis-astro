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

    const birthData: BirthData = {
      year: parseInt(year),
      month: parseInt(month),
      day: parseInt(day),
      hour: parseInt(hour) || 12,
      minute: parseInt(minute) || 0,
      latitude: parseFloat(latitude),
      longitude: parseFloat(longitude),
      timezone: parseFloat(timezone) || 0
    }

    const chartData = calculateDualChart(birthData)
    return NextResponse.json(chartData)
  } catch (error) {
    console.error('Chart calculation error:', error)
    return NextResponse.json({ error: 'Calculation failed' }, { status: 500 })
  }
}
