import { beforeEach, describe, expect, it } from 'vitest'
import type { NextRequest } from 'next/server'
import { parseBirthDataInput } from '../birth-data-validation'
import { readLimitedJsonBody } from '../request-security'
import { checkRateLimit, getClientIp } from '../route-rate-limiter'
import { makeCacheKey, makeSynastryCacheKey } from '../reading-cache'
import type { BirthData } from '../astro-calc'

function post(body: string, headers: Record<string, string> = {}): NextRequest {
  return new Request('https://axis.example/api/test', {
    method: 'POST',
    body,
    headers,
  }) as unknown as NextRequest
}

describe('parseBirthDataInput', () => {
  const valid = {
    year: 2000, month: 2, day: 29, hour: 12, minute: 30,
    latitude: -33.87, longitude: 151.21, timezone: 11,
  }

  it('accepts a valid leap-day payload', () => {
    expect(parseBirthDataInput(valid).ok).toBe(true)
  })

  it('accepts numeric strings, as sent by form inputs', () => {
    const result = parseBirthDataInput({ ...valid, year: '2000', month: '02', latitude: '-33.87' })
    expect(result).toMatchObject({ ok: true, data: { year: 2000, month: 2, latitude: -33.87 } })
  })

  it('rejects impossible dates', () => {
    const result = parseBirthDataInput({ ...valid, year: 1900, day: 29 })
    expect(result).toEqual({ ok: false, error: 'Birth data: day out of range for month/year' })
  })

  it('rejects junk-suffixed numbers and fractional calendar fields', () => {
    expect(parseBirthDataInput({ ...valid, year: '2000junk' }).ok).toBe(false)
    expect(parseBirthDataInput({ ...valid, month: 2.5 }).ok).toBe(false)
    expect(parseBirthDataInput({ ...valid, hour: '1e1' }).ok).toBe(false)
  })

  it('defaults a blank hour/minute to noon', () => {
    const result = parseBirthDataInput({ ...valid, hour: null, minute: '' })
    expect(result).toMatchObject({ ok: true, data: { hour: 12, minute: 0 } })
  })

  it('rejects an out-of-range offset and a non-string timezone name', () => {
    expect(parseBirthDataInput({ ...valid, timezone: 20 }).ok).toBe(false)
    expect(parseBirthDataInput({ ...valid, tzName: 42 }).ok).toBe(false)
    expect(parseBirthDataInput({ ...valid, tzName: 'x'.repeat(101) }).ok).toBe(false)
  })

  it('resolves the offset from tzName (DST-aware) by default', () => {
    // Sydney is UTC+11 in February (daylight time); send a wrong offset to prove it is overridden.
    const result = parseBirthDataInput({ ...valid, timezone: 0, tzName: 'Australia/Sydney' })
    expect(result).toMatchObject({ ok: true, data: { timezone: 11 } })
  })

  it('keeps the supplied offset when resolveTzName is false', () => {
    const result = parseBirthDataInput({ ...valid, timezone: 0, tzName: 'Australia/Sydney' }, { resolveTzName: false })
    expect(result).toMatchObject({ ok: true, data: { timezone: 0, tzName: 'Australia/Sydney' } })
  })

  it('falls back to the supplied offset for an unrecognised tzName', () => {
    const result = parseBirthDataInput({ ...valid, tzName: 'Not/A_Timezone' })
    expect(result).toMatchObject({ ok: true, data: { timezone: 11 } })
  })

  it('prefixes errors with the label', () => {
    expect(parseBirthDataInput(null, { label: 'Person A' })).toEqual({ ok: false, error: 'Person A: expected an object' })
  })
})

describe('readLimitedJsonBody', () => {
  it('requires a JSON media type', async () => {
    const result = await readLimitedJsonBody(post('{}', { 'content-type': 'text/plain' }), 100)
    expect(result).toMatchObject({ ok: false, status: 415 })
  })

  it('counts UTF-8 bytes rather than JavaScript characters', async () => {
    const body = JSON.stringify({ value: '😀😀' })
    const result = await readLimitedJsonBody(post(body, { 'content-type': 'application/json' }), body.length)
    expect(result).toMatchObject({ ok: false, status: 413 })
  })

  it('rejects an oversized Content-Length before reading', async () => {
    const result = await readLimitedJsonBody(
      post('{}', { 'content-type': 'application/json', 'content-length': '999999' }),
      100,
    )
    expect(result).toMatchObject({ ok: false, status: 413 })
  })

  it('400s on invalid JSON', async () => {
    const result = await readLimitedJsonBody(post('{not json', { 'content-type': 'application/json' }), 100)
    expect(result).toMatchObject({ ok: false, status: 400 })
  })

  it('parses a valid bounded JSON request', async () => {
    const result = await readLimitedJsonBody(
      post('{"ok":true}', { 'content-type': 'application/json; charset=utf-8' }),
      100,
    )
    expect(result).toEqual({ ok: true, value: { ok: true } })
  })
})

describe('rate limiter hardening', () => {
  beforeEach(() => {
    delete process.env.UPSTASH_REDIS_REST_URL
    delete process.env.UPSTASH_REDIS_REST_TOKEN
    delete process.env.KV_REST_API_URL
    delete process.env.KV_REST_API_TOKEN
  })

  it("prefers Vercel's platform-set client IP header", () => {
    const req = post('{}', {
      'x-vercel-forwarded-for': '192.0.2.4',
      'x-forwarded-for': '198.51.100.9',
    })
    expect(getClientIp(req)).toBe('192.0.2.4')
  })

  it('keeps the in-memory fallback bounded when every entry is still live', async () => {
    const config = { max: 1, windowSecs: 3600, keyPrefix: 'test:bounded-fallback:' }

    // 501 distinct identities: the 501st must evict the oldest live record.
    for (let i = 0; i <= 500; i++) {
      expect((await checkRateLimit(`198.51.${Math.floor(i / 250)}.${i % 250}`, config)).allowed).toBe(true)
    }

    // The first identity was evicted, so it starts a fresh window instead of being blocked.
    expect((await checkRateLimit('198.51.0.0', config)).allowed).toBe(true)
  })
})

// ── Cache-key integrity for the one client-supplied position ─────────────────
// /api/reading recomputes the whole chart server-side EXCEPT Pluto, whose
// canonical longitude it accepts as a client hint (so the prose interprets the
// exact Pluto the wheel shows without a JPL call in the hot path) and only
// range-checks. While the key carried plutoSource but not the value, any caller
// could pair a valid-looking source with an arbitrary 0–360 longitude and write
// prose about a fabricated Pluto into the row every honest client then read for
// the full 30-day TTL. Keyed on, a bad hint can only poison its own key.
describe('reading cache key — client-supplied Pluto cannot poison a shared row', () => {
  const BIRTH: BirthData = {
    year: 1990, month: 6, day: 15, hour: 14, minute: 30,
    latitude: 51.5074, longitude: -0.1278, timezone: 1,
  }
  const base = { birth: BIRTH, section: 'tropical', planetSection: 'sun' } as const

  it('a different longitude under the same source is a different key', () => {
    const honest = makeCacheKey({ ...base, plutoSource: 'jpl-horizons-de440', plutoLongitude: 272.31 })
    const forged = makeCacheKey({ ...base, plutoSource: 'jpl-horizons-de440', plutoLongitude: 15.0 })
    expect(honest).not.toBe(forged)
  })

  it('an absent hint is distinct from any supplied longitude', () => {
    expect(makeCacheKey({ ...base }))
      .not.toBe(makeCacheKey({ ...base, plutoLongitude: 272.31 }))
  })

  it('rounds to 0.01° so float noise does not fragment the cache', () => {
    expect(makeCacheKey({ ...base, plutoLongitude: 272.311 }))
      .toBe(makeCacheKey({ ...base, plutoLongitude: 272.314 }))
  })

  it('synastry keys the hint per person', () => {
    const syn = (a?: number, b?: number) => makeSynastryCacheKey({
      birthA: BIRTH, birthB: { ...BIRTH, year: 1992 },
      section: 'synastry', planetSection: 'luminaries',
      plutoSourceA: 'jpl-horizons-de440', plutoSourceB: 'jpl-horizons-de440',
      plutoLongitudeA: a, plutoLongitudeB: b,
    })
    expect(syn(272.31, 280.00)).not.toBe(syn(15.0, 280.00))
    expect(syn(272.31, 280.00)).not.toBe(syn(272.31, 15.0))
    expect(syn(272.31, 280.00)).toBe(syn(272.31, 280.00))
  })
})
