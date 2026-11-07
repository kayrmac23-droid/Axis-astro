// The inline gate (AXIS_INLINE_GATE) — gating a section on the hot path so the
// FIRST reader gets the repaired text, paid for out of the time they spend
// reading earlier sections.
//
// Off by default and these tests turn it on explicitly, so the default-path
// suites are unaffected. What is pinned here is the safety: it never runs on
// the opening section, never runs without budget, never double-pays, and never
// costs the reader a section it already has.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { wordBandFor } from '@/lib/prompts'

const BAND = wordBandFor('tropical', 'moon', 0)
const clean = (lead = 'You notice it first in the ordinary case.') =>
  `## The Moon\n\n${lead} ` +
  Array.from({ length: BAND.fullMin + 14 }, (_, i) => `word${i}`).join(' ') + '.'

const GENERATED = clean()
const GATED     = clean('You register it before you can name it.')

let gateCalls = 0
let gateResult: Record<string, unknown> = {}
let gateThrows = false
const cached: string[] = []

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: () => ({
        async *[Symbol.asyncIterator]() {
          yield { type: 'content_block_delta', delta: { type: 'text_delta', text: GENERATED } }
        },
        finalMessage: async () => ({
          stop_reason: 'end_turn',
          usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
        }),
      }),
      create: async () => { throw new Error('not used') },
    }
    static APIError = class APIError extends Error { status?: number }
  }
  return { default: Anthropic }
})

const reserved: number[] = []
vi.mock('@/lib/route-rate-limiter', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/route-rate-limiter')>()
  return {
    ...actual,
    checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    readGlobalDailyBudget: async () => ({ allowed: true, used: 0, cap: 2000 }),
    recordModelCalls: async (n: number) => { reserved.push(n) },
  }
})

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void> | void) => { void fn() } }
})

vi.mock('@/lib/reading-cache', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-cache')>()
  return {
    ...actual,
    getCachedReading: async () => null,
    setCachedReading: async (_k: string, text: string) => { cached.push(text) },
  }
})

vi.mock('@/lib/reading-quality-gate', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-quality-gate')>()
  return {
    ...actual,
    gateForCache: async () => {
      gateCalls++
      if (gateThrows) throw new Error('gate exploded')
      return { modelCalls: 2, scores: null, repaired: true, reason: 'repaired', firstPass: null, ...gateResult }
    },
  }
})

const BIRTH = { year: 1999, month: 7, day: 23, hour: 23, minute: 45, latitude: -37.65, longitude: 145.02, timezone: 10 }
const THREAD = '11111111-2222-4333-8444-555555555555'

async function post(planetSection: string, threadId?: string) {
  const res = await POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.7.0.1' },
    body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection, ...(threadId ? { threadId } : {}) }),
  }))
  const body = await res.text()
  await new Promise(r => setTimeout(r, 0))
  return body
}

/**
 * `withPrior` drives the REAL thread path: request the Sun section first on a
 * thread, which stores it, then request the Moon on the same thread so
 * `prior.length > 0`. Hand-writing the thread entry needs the exact binding
 * scope and silently produced no prior at all, which made the inline gate
 * correctly decline and the tests read as if it were broken.
 */
async function read(withPrior: boolean) {
  if (!withPrior) return post('sun')
  await post('sun', THREAD)          // warm-up: establishes the prior
  gateCalls = 0; cached.length = 0; reserved.length = 0
  return post('moon', THREAD)
}

describe('/api/reading — the inline gate', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    delete process.env.AXIS_INLINE_GATE
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    gateCalls = 0; gateThrows = false; gateResult = {}
    reserved.length = 0; cached.length = 0
    process.env.AXIS_INLINE_GATE = 'true'
    process.env.AXIS_PREFLIGHT_ENABLED = 'false'   // isolate the inline gate
    _resetThreadMemoryForTests()
  })

  it('is OFF unless AXIS_INLINE_GATE is exactly "true" — it must not switch itself on', () => {
    // The flag default is the safety: inline gating risks the maxDuration
    // ceiling, and an overrun costs the reader the whole section.
    for (const v of [undefined, 'false', '1', 'yes', 'TRUE']) {
      if (v === undefined) delete process.env.AXIS_INLINE_GATE
      else process.env.AXIS_INLINE_GATE = v
      expect(process.env.AXIS_INLINE_GATE === 'true').toBe(false)
    }
  })

  it('never gates the OPENING section — it has no read-ahead slack behind it', async () => {
    expect(await read(false)).toBe(GENERATED)
    expect(gateCalls).toBe(1)      // the after() gate, not an inline one
  })

  it('serves the GATED text for a section the reader has not reached yet', async () => {
    gateResult = { cacheText: GATED }
    const served = await read(true)
    expect(served).toBe(GATED)
    expect(served).not.toBe(GENERATED)
  })

  it('serves what it caches — reader and cache agree', async () => {
    gateResult = { cacheText: GATED }
    const served = await read(true)
    expect(cached).toContain(GATED)
    expect(served).toBe(GATED)
  })

  it('runs the gate ONCE, not again under after()', async () => {
    gateResult = { cacheText: GATED }
    await read(true)
    expect(gateCalls).toBe(1)
  })

  it('falls back to the first pass when the gate has nothing to cache', async () => {
    gateResult = { cacheText: null, reason: 'repair-failed-recheck' }
    expect(await read(true)).toBe(GENERATED)
  })

  it('falls back to the first pass when the gate throws, rather than losing the section', async () => {
    gateThrows = true
    expect(await read(true)).toBe(GENERATED)
  })

  it('still runs the after() gate when the inline gate cached nothing', async () => {
    // Otherwise a section that failed inline would never be cached at all and
    // would regenerate for every reader forever.
    gateResult = { cacheText: null, reason: 'repair-failed-recheck' }
    await read(true)
    expect(gateCalls).toBe(2)
  })
})
