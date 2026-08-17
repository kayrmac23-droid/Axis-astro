import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import type { NextRequest } from 'next/server'
import { checkRateLimit, getClientIp, checkGlobalDailyBudget } from '../route-rate-limiter'

// With no Upstash/KV env vars set, getRedis() returns null and every helper
// falls back to its in-memory / fail-open path. Ensure that's the case so these
// tests exercise the fallback deterministically rather than hitting a real Redis.
beforeEach(() => {
  delete process.env.UPSTASH_REDIS_REST_URL
  delete process.env.UPSTASH_REDIS_REST_TOKEN
  delete process.env.KV_REST_API_URL
  delete process.env.KV_REST_API_TOKEN
})

// Minimal NextRequest stand-in exposing only the header lookups getClientIp uses.
function reqWithHeaders(headers: Record<string, string>): NextRequest {
  return {
    headers: { get: (k: string) => headers[k.toLowerCase()] ?? null },
  } as unknown as NextRequest
}

describe('getClientIp', () => {
  it('takes the first entry of x-forwarded-for', () => {
    const req = reqWithHeaders({ 'x-forwarded-for': '1.2.3.4, 5.6.7.8' })
    expect(getClientIp(req)).toBe('1.2.3.4')
  })

  it('trims whitespace around the forwarded ip', () => {
    const req = reqWithHeaders({ 'x-forwarded-for': '  9.9.9.9  , 5.6.7.8' })
    expect(getClientIp(req)).toBe('9.9.9.9')
  })

  it('falls back to x-real-ip when x-forwarded-for is absent', () => {
    const req = reqWithHeaders({ 'x-real-ip': '10.0.0.1' })
    expect(getClientIp(req)).toBe('10.0.0.1')
  })

  it('returns "direct" when no client-ip headers are present', () => {
    expect(getClientIp(reqWithHeaders({}))).toBe('direct')
  })
})

describe('checkRateLimit (in-memory fallback)', () => {
  const cfg = (keyPrefix: string) => ({ max: 3, windowSecs: 60, keyPrefix })

  it('allows up to max requests then blocks with a positive retryAfter', async () => {
    const config = cfg('test:rl:basic:')
    const ip = 'ip-basic'
    for (let i = 0; i < 3; i++) {
      expect((await checkRateLimit(ip, config)).allowed).toBe(true)
    }
    const blocked = await checkRateLimit(ip, config)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfter).toBeGreaterThan(0)
  })

  it('keeps separate counters per keyPrefix', async () => {
    const ip = 'ip-shared'
    const a = cfg('test:rl:prefixA:')
    const b = cfg('test:rl:prefixB:')
    for (let i = 0; i < 3; i++) await checkRateLimit(ip, a) // exhaust A
    expect((await checkRateLimit(ip, a)).allowed).toBe(false)
    // Same ip under a different prefix is unaffected.
    expect((await checkRateLimit(ip, b)).allowed).toBe(true)
  })

  it('resets the window after windowSecs elapse', async () => {
    vi.useFakeTimers()
    try {
      vi.setSystemTime(new Date('2026-01-01T00:00:00Z'))
      const config = cfg('test:rl:window:')
      const ip = 'ip-window'
      for (let i = 0; i < 3; i++) await checkRateLimit(ip, config)
      expect((await checkRateLimit(ip, config)).allowed).toBe(false)

      // Advance past the 60s window — the counter should reset.
      vi.setSystemTime(new Date('2026-01-01T00:01:01Z'))
      expect((await checkRateLimit(ip, config)).allowed).toBe(true)
    } finally {
      vi.useRealTimers()
    }
  })
})

describe('checkGlobalDailyBudget (fail-open without Redis)', () => {
  // Snapshot and clear the cap override before each test so a value already
  // present in the runner/shell can't make the default-cap assertion flaky;
  // restore the original afterwards.
  const savedCap = process.env.AXIS_DAILY_READING_CALL_CAP
  beforeEach(() => {
    delete process.env.AXIS_DAILY_READING_CALL_CAP
  })
  afterEach(() => {
    if (savedCap === undefined) delete process.env.AXIS_DAILY_READING_CALL_CAP
    else process.env.AXIS_DAILY_READING_CALL_CAP = savedCap
  })

  it('allows and reports the default cap when Redis is unconfigured', async () => {
    const res = await checkGlobalDailyBudget()
    expect(res.allowed).toBe(true)
    expect(res.used).toBe(0)
    expect(res.cap).toBe(2000)
  })

  it('reflects a configured cap override', async () => {
    process.env.AXIS_DAILY_READING_CALL_CAP = '5'
    const res = await checkGlobalDailyBudget()
    expect(res.allowed).toBe(true)
    expect(res.cap).toBe(5)
  })
})
