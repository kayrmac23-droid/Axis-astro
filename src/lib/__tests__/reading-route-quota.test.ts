// Daily quotas on /api/reading, driven through the route with the SDK, the
// per-minute limiter, and the global budget mocked. The quota counter
// itself is REAL (consumeDailyQuota's in-memory fallback, since no Redis env is
// set), so these pin the wiring the abuse fix depends on: what is counted, what
// is not, what is refused, and the header that tells the client to stop.
//
// Why this exists: with only a per-minute limit in front of the site-wide daily
// cap, one script looping over random birth data exhausted the cap — refusing
// every reader for the rest of the day — from a single IP in ~25 minutes.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { _resetQuotaMemoryForTests } from '@/lib/route-rate-limiter'

let generations = 0
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      // Counts first passes only. The stub prose is far under the length
      // floor, so each request also makes one cache regeneration (two content
      // blocks); those are not what the quota is being asked about.
      stream: (params: { messages: { content: unknown[] }[] }) => {
        if (params.messages[0].content.length === 1) generations++
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: '## The Sun\n\nYou notice it first.' } }
          },
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        }
      },
      create: async () => { throw new Error('not used') },
    }
    static APIError = class APIError extends Error { status?: number }
  }
  return { default: Anthropic }
})

let budgetAllowed = true
vi.mock('@/lib/route-rate-limiter', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/route-rate-limiter')>()
  return {
    ...actual,
    checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    readGlobalDailyBudget: async () => ({ allowed: budgetAllowed, used: 0, cap: 2000, spentUsd: 0, ceilingUsd: 0 }),
    recordModelCalls: async () => {},
    recordModelSpend: async () => {},
  }
})

const cache = new Map<string, string>()
vi.mock('@/lib/reading-cache', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-cache')>()
  return {
    ...actual,
    getCachedReading: async (key: string) => cache.get(key) ?? null,
    setCachedReading: async () => {},
  }
})

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void> | void) => { void fn() } }
})

const birth = (day: number) => ({ year: 1990, month: 3, day, hour: 9, minute: 30, latitude: 51.5, longitude: -0.12, timezone: 0 })

function post(body: Record<string, unknown>, ip = '203.0.113.10') {
  return POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ section: 'tropical', planetSection: 'sun', ...body }),
  }))
}

async function drain(res: Response) { await res.text(); await new Promise(r => setTimeout(r, 0)) }

describe('/api/reading — daily quotas', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    delete process.env.AXIS_READING_DAILY_PER_IP
    delete process.env.AXIS_READING_DAILY_PER_CHART
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    generations = 0; budgetAllowed = true; cache.clear()
    _resetQuotaMemoryForTests(); _resetThreadMemoryForTests()
    process.env.AXIS_READING_DAILY_PER_IP = '3'
    process.env.AXIS_READING_DAILY_PER_CHART = '100'
  })

  it('refuses one IP past its daily quota — the random-chart loop is stopped', async () => {
    for (let d = 1; d <= 3; d++) {
      const res = await post({ birthData: birth(d) })
      expect(res.status).toBe(200)
      await drain(res)
    }
    const refused = await post({ birthData: birth(4) })
    expect(refused.status).toBe(429)
    expect(refused.headers.get('X-Axis-Quota')).toBe('ip')
    expect(generations).toBe(3)   // the refused request never reached the model
  })

  it('does not let one IP spend another IP\'s quota', async () => {
    for (let d = 1; d <= 3; d++) await drain(await post({ birthData: birth(d) }, '203.0.113.11'))
    expect((await post({ birthData: birth(9) }, '203.0.113.12')).status).toBe(200)
  })

  it('counts an IPv6 /64 as ONE source — rotating addresses inside it buys nothing', async () => {
    for (let d = 1; d <= 3; d++) await drain(await post({ birthData: birth(d) }, `2001:db8:1:2::${d}`))
    const refused = await post({ birthData: birth(4) }, '2001:db8:1:2:abcd::99')
    expect(refused.status).toBe(429)
  })

  it('caps a single chart, whatever Pluto hint the client sends', async () => {
    process.env.AXIS_READING_DAILY_PER_IP = '100'
    process.env.AXIS_READING_DAILY_PER_CHART = '2'
    const lons = [100.1, 100.2, 100.3]
    const statuses: number[] = []
    for (const plutoLongitude of lons) {
      const res = await post({ birthData: birth(5), plutoLongitude, plutoSource: 'jpl-horizons-de440' })
      statuses.push(res.status)
      await drain(res)
    }
    expect(statuses).toEqual([200, 200, 429])
  })

  it('never counts a cache hit — re-reading a cached reading is free', async () => {
    process.env.AXIS_READING_DAILY_PER_IP = '1'
    await drain(await post({ birthData: birth(6) }))
    // Every key the route could compute is now "cached" for this test.
    const realGet = cache.get.bind(cache)
    cache.get = () => '## The Sun\n\nCached.'
    try {
      for (let i = 0; i < 5; i++) expect((await post({ birthData: birth(6) })).status).toBe(200)
    } finally {
      cache.get = realGet
    }
  })

  it('marks the site-wide cap too, so the client stops instead of failing every section', async () => {
    budgetAllowed = false
    const res = await post({ birthData: birth(7) })
    expect(res.status).toBe(503)
    expect(res.headers.get('X-Axis-Quota')).toBe('global')
  })
})
