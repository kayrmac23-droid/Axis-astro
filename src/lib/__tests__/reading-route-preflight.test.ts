// The hot-path pre-flight, driven through /api/reading with the SDK, the rate
// limiter and the gate all mocked.
//
// What these pin is the thing the feature exists for: the reader is shown the
// CHECKED text, not the first thing the model produced. Kept in its own file so
// the "pre-flight off" scoping the other route suites need cannot leak in here,
// and so the SDK mock can serve a different section per attempt.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { wordBandFor } from '@/lib/prompts'

const BAND = wordBandFor('tropical', 'sun', 0)

// In-band, second person, clean of every deterministic check.
const clean = (lead = 'You notice it first in the ordinary case.') =>
  `## The Sun\n\n${lead} ` +
  Array.from({ length: BAND.fullMin + 14 }, (_, i) => `word${i}`).join(' ') + '.'

// Each attempt's text, in order. The mock pops one per stream() call.
let attempts: string[] = []
const sentTurns: number[] = []

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: (params: { messages: { content: unknown[] }[] }) => {
        sentTurns.push(params.messages[0].content.length)
        const text = attempts.shift() ?? ''
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
          },
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        }
      },
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

vi.mock('@/lib/reading-quality-gate', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-quality-gate')>()
  return {
    ...actual,
    gateForCache: async () => ({ cacheText: null, modelCalls: 0, scores: null, repaired: false, reason: 'test', firstPass: null }),
  }
})

const BIRTH = { year: 1999, month: 7, day: 23, hour: 23, minute: 45, latitude: -37.65, longitude: 145.02, timezone: 10 }

async function read(): Promise<string> {
  const res = await POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.0.1' },
    body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection: 'sun' }),
  }))
  const body = await res.text()
  await new Promise(r => setTimeout(r, 0))
  return body
}

describe('/api/reading — the reader is served the pre-flighted text', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    attempts = []; sentTurns.length = 0; reserved.length = 0
    process.env.AXIS_PREFLIGHT_ENABLED = 'true'   // OFF by default since v10.41; these tests are about it
    _resetThreadMemoryForTests()
  })

  it('serves a clean first pass unchanged, with no second call', async () => {
    const text = clean()
    attempts = [text]
    expect(await read()).toBe(text)
    expect(sentTurns).toHaveLength(1)
    expect(reserved).toEqual([1])
  })

  it('REGENERATES a breaching first pass and serves the rewrite — the reader never sees the breach', async () => {
    // This is the whole feature: before, the banned opener streamed to the
    // reader and only the NEXT reader got the repaired text.
    const bad  = clean('There is a particular kind of restlessness here.')
    const good = clean()
    attempts = [bad, good]
    const served = await read()
    expect(served).toBe(good)
    expect(served).not.toContain('There is a particular kind of')
    expect(sentTurns).toHaveLength(2)
  })

  it('sends the faults as an extra turn, leaving the cached prefix byte-identical', async () => {
    // The rewrite appends one block. Everything before it is the same request,
    // so the prompt cache still serves the whole system prompt and the chart
    // context — the rewrite pays for its own instruction and nothing else.
    attempts = [clean('There is something restless here.'), clean()]
    await read()
    expect(sentTurns[1]).toBe(sentTurns[0] + 1)
  })

  it('reserves the rewrite against the daily budget, like any other call', async () => {
    attempts = [clean('There is something restless here.'), clean()]
    await read()
    expect(reserved).toEqual([1, 1])
  })

  it('keeps the FIRST pass when the rewrite is no cleaner', async () => {
    const bad     = clean('There is a particular kind of restlessness here.')
    const noBetter = clean('There is something else entirely here.')
    attempts = [bad, noBetter]
    expect(await read()).toBe(bad)
  })

  it('serves the first pass when the rewrite call fails, rather than losing the section', async () => {
    const bad = clean('There is a particular kind of restlessness here.')
    attempts = [bad]            // second stream() gets '' → treated as a failed rewrite
    const served = await read()
    expect(served).toBe(bad)
  })

  it('does nothing unless AXIS_PREFLIGHT_ENABLED is exactly "true" — it is OFF by default', async () => {
    // Flipped to opt-in in v10.41: the measured catch rate (3 of 21 sections)
    // did not justify making every reader lose streaming.
    delete process.env.AXIS_PREFLIGHT_ENABLED
    const bad = clean('There is a particular kind of restlessness here.')
    attempts = [bad, clean()]
    expect(await read()).toBe(bad)
    expect(sentTurns).toHaveLength(1)
  })

  it('writes the section in ONE piece, not as deltas', async () => {
    // Buffering is what lets the checks run before the reader sees anything.
    // If this ever streams again, the pre-flight is decorative.
    const text = clean()
    attempts = [text]
    const res = await POST(new NextRequest('https://x/api/reading', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.9.0.2' },
      body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection: 'sun' }),
    }))
    const reader = res.body!.getReader()
    const first = await reader.read()
    expect(new TextDecoder().decode(first.value)).toBe(text)
    await reader.cancel()
  })
})
