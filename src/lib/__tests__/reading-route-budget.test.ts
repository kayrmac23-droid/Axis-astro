// The daily spend counter must bound calls STARTED, not calls finished.
//
// The route used to record its whole model-call count — generation plus every
// gate call — from inside the after() hook, i.e. once gating had finished, 30–60s
// after the generation call was actually made. Between the check and the record
// the counter understated real spend by every request in flight, so concurrent
// traffic could run well past AXIS_DAILY_READING_CALL_CAP before the cap noticed;
// and on the failure path the post-hoc count was usually zero, so a call that had
// already billed went uncounted entirely.
//
// The generation call is now reserved before it is made. These tests pin the
// ordering and the absence of double counting — both invisible in production
// until a spend incident.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'

// Ordered log of what happened when: 'reserve:N' / 'stream' / 'gate'.
const events: string[] = []
let streamShouldThrow = false
// When set, the mock stream pauses after its first delta until released — so a
// test can disconnect the reader while generation is still running.
let streamHold: Promise<void> | null = null

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: () => {
        events.push('stream')
        if (streamShouldThrow) throw new Error('overloaded_error: upstream is busy')
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: 'PROSE.' } }
            if (streamHold) {
              await streamHold
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' MORE.' } }
            }
          },
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        }
      },
      create: async () => { throw new Error('not used') },
    }
    // classifyGenerationError narrows on Anthropic.APIError, so the mock has to
    // carry one for the failure path to be classifiable at all.
    static APIError = class APIError extends Error { status?: number }
  }
  return { default: Anthropic }
})

vi.mock('@/lib/route-rate-limiter', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/route-rate-limiter')>()
  return {
    ...actual,
    checkRateLimit: async () => ({ allowed: true, retryAfter: 0 }),
    readGlobalDailyBudget: async () => ({ allowed: true, used: 0, cap: 2000 }),
    recordModelCalls: async (n: number) => { events.push(`reserve:${n}`) },
  }
})

// after() runs its callback inline so the gate path is observable in-test.
vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void> | void) => { void fn() } }
})

// The gate is not under test; stand in for it with a fixed call count.
vi.mock('@/lib/reading-quality-gate', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-quality-gate')>()
  return {
    ...actual,
    gateForCache: async () => {
      events.push('gate')
      return { cacheText: null, modelCalls: 2, scores: null, repaired: false, reason: 'test', firstPass: null }
    },
  }
})

const BIRTH = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.02, timezone: 10,
}

async function run(ip: string) {
  const res = await POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
    body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection: 'sun' }),
  }))
  await res.text()          // drain the stream so start() completes
  await new Promise(r => setTimeout(r, 0))  // let the after() callback settle
  return res
}

describe('/api/reading — the daily budget counts calls started', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => { events.length = 0; streamShouldThrow = false; streamHold = null; _resetThreadMemoryForTests() })

  it('reserves the generation call BEFORE making it', async () => {
    await run('10.1.0.1')
    expect(events.indexOf('reserve:1')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('reserve:1')).toBeLessThan(events.indexOf('stream'))
  })

  it('records the gate calls separately, without re-counting the generation', async () => {
    await run('10.1.0.2')
    const recorded = events
      .filter(e => e.startsWith('reserve:'))
      .reduce((n, e) => n + Number(e.split(':')[1]), 0)
    // 1 generation + the 2 the stub gate reported, counted exactly once each.
    expect(recorded).toBe(3)
    expect(events.filter(e => e === 'reserve:1')).toHaveLength(1)
  })

  it('keeps the reservation when the generation call fails', async () => {
    // A call that errors late can still have billed; over-counting is the safe
    // direction, and the old post-hoc path recorded nothing at all here.
    streamShouldThrow = true
    const res = await run('10.1.0.3')
    expect(res.status).toBe(200)   // the failure is in-band, not a status code
    expect(events).toContain('reserve:1')
    expect(events).not.toContain('gate')
  })

  it('still gates and caches a paid generation when the reader disconnects mid-stream', async () => {
    // Navigating away (or casting another chart) cancels the response body while
    // the model is still generating. The finished text must still reach the gate
    // and the cache: it has been billed in full. An unguarded controller.close()
    // threw into the failure path instead — skipping both and logging a false
    // [AXIS_GEN_FAIL].
    let release!: () => void
    streamHold = new Promise<void>(r => { release = r })
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const res = await POST(new NextRequest('https://x/api/reading', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': '10.1.0.4' },
        body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection: 'sun' }),
      }))
      const reader = res.body!.getReader()
      await reader.read()            // first delta arrives
      await reader.cancel('navigated away')
      release()
      for (let i = 0; i < 10 && !events.includes('gate'); i++) await new Promise(r => setTimeout(r, 0))
      expect(events).toContain('gate')
      expect(errors.mock.calls.some(c => String(c[0]).includes('[AXIS_GEN_FAIL]'))).toBe(false)
    } finally {
      errors.mockRestore()
    }
  })
})
