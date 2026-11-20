// The paywall cut (lib/paywall.ts) and its enforcement in /api/reading.
//
// What these pin: the free tier is a prefix of the reading order; with the flag
// off nothing changes; with it on a locked section is refused BEFORE the cache
// is consulted — the cache is keyed on birth data, so a hit would otherwise
// serve a paid section to anyone who sent the same birth data.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach, afterEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { _resetQuotaMemoryForTests } from '@/lib/route-rate-limiter'
import {
  FREE_SECTIONS, natalReadingOrder, isFreeSection, sectionLocked, lockedCounts,
  isPaywallResponse, PAYWALL_HEADER,
} from '@/lib/paywall'

let generations = 0
vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
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

vi.mock('@/lib/route-rate-limiter', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/route-rate-limiter')>()
  return {
    ...actual,
    checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    readGlobalDailyBudget: async () => ({ allowed: true, used: 0, cap: 2000, spentUsd: 0, ceilingUsd: 0 }),
    recordModelCalls: async () => {},
    recordModelSpend: async () => {},
  }
})

let cacheReads = 0
vi.mock('@/lib/reading-cache', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-cache')>()
  return {
    ...actual,
    // Every key is a hit: if the route reaches the cache, it serves the section.
    getCachedReading: async () => { cacheReads++; return '## Cached\n\nYou have read this before.' },
    setCachedReading: async () => {},
  }
})

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void> | void) => { void fn() } }
})

const birthData = { year: 1990, month: 3, day: 4, hour: 9, minute: 30, latitude: 51.5, longitude: -0.12, timezone: 0 }

function post(section: string, planetSection: string, extra: Record<string, unknown> = { birthData }) {
  return POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '203.0.113.40' },
    body: JSON.stringify({ section, planetSection, ...extra }),
  }))
}

describe('paywall — the cut', () => {
  afterEach(() => { delete process.env.AXIS_PAYWALL_ENABLED })

  it('the free tier is a prefix of the reading order', () => {
    const head = natalReadingOrder().slice(0, FREE_SECTIONS.length)
    expect(head).toEqual([...FREE_SECTIONS])
  })

  it('counts what is behind the wall from the order table', () => {
    expect(lockedCounts()).toEqual({ tropical: 5, sidereal: 8, synthesis: 4 })
  })

  it('locks nothing while the flag is off or mistyped', () => {
    expect(sectionLocked('synthesis', 'diverge')).toBe(false)
    process.env.AXIS_PAYWALL_ENABLED = '1'
    expect(sectionLocked('synthesis', 'diverge')).toBe(false)
  })

  it('with the flag on, locks every natal section after the prefix and never synastry', () => {
    process.env.AXIS_PAYWALL_ENABLED = 'true'
    for (const { section, planetSection } of natalReadingOrder()) {
      expect(sectionLocked(section, planetSection)).toBe(!isFreeSection(section, planetSection))
    }
    // Same planet name, different frame: the Sidereal Sun is not the free Sun.
    expect(sectionLocked('sidereal', 'sun')).toBe(true)
    expect(sectionLocked('synastry', 'luminaries')).toBe(false)
  })

  it('recognises the wall by status and header together', () => {
    const res = (status: number, value: string | null) => ({ status, headers: { get: () => value } })
    expect(isPaywallResponse(res(402, 'locked'))).toBe(true)
    expect(isPaywallResponse(res(402, null))).toBe(false)
    expect(isPaywallResponse(res(429, 'locked'))).toBe(false)
  })
})

describe('/api/reading — paywall', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    generations = 0; cacheReads = 0
    _resetQuotaMemoryForTests(); _resetThreadMemoryForTests()
  })
  afterEach(() => { delete process.env.AXIS_PAYWALL_ENABLED })

  it('flag off: a later section is served as before', async () => {
    const res = await post('synthesis', 'diverge')
    expect(res.status).toBe(200)
    expect(res.headers.get(PAYWALL_HEADER)).toBeNull()
  })

  it('flag on: a locked section is refused before the cache is read, with no model call', async () => {
    process.env.AXIS_PAYWALL_ENABLED = 'true'
    const res = await post('tropical', 'mercury')
    expect(res.status).toBe(402)
    expect(res.headers.get(PAYWALL_HEADER)).toBe('locked')
    expect(cacheReads).toBe(0)
    expect(generations).toBe(0)
  })

  it('flag on: the free sections are still served', async () => {
    process.env.AXIS_PAYWALL_ENABLED = 'true'
    for (const { section, planetSection } of FREE_SECTIONS) {
      const res = await post(section, planetSection)
      expect(res.status).toBe(200)
    }
  })

  it('flag on: synastry is untouched', async () => {
    process.env.AXIS_PAYWALL_ENABLED = 'true'
    const res = await post('synastry', 'luminaries', { birthA: birthData, birthB: { ...birthData, day: 9 } })
    expect(res.status).toBe(200)
  })
})
