// Route-level validation tests. These exercise the security-relevant rejection
// branches that run BEFORE any outbound network call (JPL Horizons, Nominatim),
// so no network access is needed. Rate limiting falls back to per-instance memory
// when Redis env vars are absent (the case under test), so the first request per
// input always passes the limiter and reaches validation.
import { describe, it, expect } from 'vitest'
import { NextRequest } from 'next/server'
import { GET as timezoneGET } from '@/app/api/timezone/route'
import { GET as geocodeGET } from '@/app/api/geocode/route'
import { POST as calculatePOST } from '@/app/api/calculate/route'

function jsonPost(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
}

const VALID_BIRTH = {
  year: 1990, month: 6, day: 15, hour: 12, minute: 0,
  latitude: 51.5, longitude: -0.12, timezone: 0,
}

describe('/api/timezone (offline lookup)', () => {
  it('400s when lat/lon are missing', async () => {
    const res = await timezoneGET(new NextRequest('https://x/api/timezone'))
    expect(res.status).toBe(400)
  })

  it('400s on out-of-range coordinates', async () => {
    const res = await timezoneGET(new NextRequest('https://x/api/timezone?lat=200&lon=0'))
    expect(res.status).toBe(400)
  })

  it('resolves a valid coordinate to an IANA name', async () => {
    const res = await timezoneGET(new NextRequest('https://x/api/timezone?lat=40.71&lon=-74.0'))
    expect(res.status).toBe(200)
    const body = await res.json()
    expect(body.tzName).toBe('America/New_York')
  })
})

describe('/api/geocode (validates before proxying to Nominatim)', () => {
  it('400s on a missing query', async () => {
    const res = await geocodeGET(new NextRequest('https://x/api/geocode'))
    expect(res.status).toBe(400)
  })

  it('400s on an over-length query (>200 chars) before any fetch', async () => {
    const q = 'a'.repeat(201)
    const res = await geocodeGET(new NextRequest(`https://x/api/geocode?q=${q}`))
    expect(res.status).toBe(400)
  })
})

describe('/api/calculate (validates before the JPL Horizons call)', () => {
  it('400s on invalid JSON', async () => {
    const req = new NextRequest('https://x/api/calculate', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: '{not json',
    })
    const res = await calculatePOST(req)
    expect(res.status).toBe(400)
  })

  it('400s when required birth fields are missing', async () => {
    const res = await calculatePOST(jsonPost('https://x/api/calculate', { year: 1990 }))
    expect(res.status).toBe(400)
  })

  it('400s on an out-of-range month', async () => {
    const res = await calculatePOST(jsonPost('https://x/api/calculate', { ...VALID_BIRTH, month: 13 }))
    expect(res.status).toBe(400)
  })

  it('400s on an out-of-range latitude', async () => {
    const res = await calculatePOST(jsonPost('https://x/api/calculate', { ...VALID_BIRTH, latitude: 100 }))
    expect(res.status).toBe(400)
  })

  it('400s on an impossible calendar date (Feb 31)', async () => {
    const res = await calculatePOST(jsonPost('https://x/api/calculate', { ...VALID_BIRTH, month: 2, day: 31 }))
    expect(res.status).toBe(400)
  })

  it('400s on an over-size payload before parsing', async () => {
    const big = { ...VALID_BIRTH, junk: 'x'.repeat(17_000) }
    const res = await calculatePOST(jsonPost('https://x/api/calculate', big))
    expect(res.status).toBe(400)
  })
})
