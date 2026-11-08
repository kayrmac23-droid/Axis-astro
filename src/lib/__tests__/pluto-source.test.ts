// JPL Horizons is consulted for Pluto ONLY outside the span where the local
// Meeus series is valid (1885–2099). Inside it the local value agrees with
// DE440 to ~2″, so the call bought nothing and put an outside dependency with
// a 5s timeout in front of every chart cast. Outside it, Meeus drifts fast
// (measured: 20′ off in 1850, 5′ in 2110) and JPL is the only accurate source.
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { plutoNeedsJpl, MEEUS_PLUTO_VALID_YEARS } from '@/lib/astro-calc'

const jplCalls: Date[] = []
vi.mock('@/lib/jpl-horizons', () => ({
  getHorizonsEclipticLon: async (_body: string, when: Date) => {
    jplCalls.push(when)
    return { longitude: 123.456, latitude: 0, ephemeris: 'DE440' }
  },
}))
vi.mock('@/lib/route-rate-limiter', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/route-rate-limiter')>()
  return { ...actual, checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }) }
})

import { POST as calculatePOST } from '@/app/api/calculate/route'
import { POST as synastryPOST } from '@/app/api/synastry/route'

const birth = (year: number) => ({ year, month: 6, day: 1, hour: 12, minute: 0, latitude: 40, longitude: -74, timezone: -5 })
const post = (url: string, body: unknown) => new NextRequest(url, {
  method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body),
})

describe('Pluto source', () => {
  beforeEach(() => { jplCalls.length = 0 })

  it('states the Meeus span once, inclusive at both ends', () => {
    expect(MEEUS_PLUTO_VALID_YEARS).toEqual({ from: 1885, to: 2099 })
    expect([1884, 1885, 1990, 2099, 2100].map(plutoNeedsJpl)).toEqual([true, false, false, false, true])
  })

  it('does not call JPL for a birth inside the span — the chart says local Meeus', async () => {
    const data = await (await calculatePOST(post('https://x/api/calculate', birth(1990)))).json()
    expect(jplCalls).toHaveLength(0)
    expect(data.plutoSource).toBe('local-meeus')
  })

  it('calls JPL for a birth outside the span, and uses its value', async () => {
    const data = await (await calculatePOST(post('https://x/api/calculate', birth(1850)))).json()
    expect(jplCalls).toHaveLength(1)
    expect(data.plutoSource).toBe('jpl-horizons-de440')
    expect(data.plutoLongitude).toBeCloseTo(123.456, 3)
  })

  it('applies the same rule per person in synastry', async () => {
    const res = await synastryPOST(post('https://x/api/synastry', { personA: birth(1990), personB: birth(1850) }))
    expect(res.status).toBe(200)
    expect(jplCalls).toHaveLength(1)
    expect(jplCalls[0].getUTCFullYear()).toBe(1850)
  })
})
