// The daily spend counter must bound calls STARTED, not calls finished.
//
// The generation call is reserved before it is made, so concurrent traffic
// cannot run past AXIS_DAILY_READING_CALL_CAP before the cap notices, and a
// failed call that may have billed is still counted.
//
// Since 2026-11-12 that one call is ALL an uncached section costs on the live path:
// the LLM gate is an offline tool (npm run eval -- --gate / rescore). These tests
// also pin that — the first pass is cached directly for the full TTL, no
// evaluator or repair call is made, and only the deterministic vetoes
// (truncated, doctrine scan) keep text out of the cache.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { BANNED_RESCUE_PHRASINGS } from '@/lib/prompts'

// Ordered log of what happened when: 'reserve:N' / 'stream' / 'create'.
const events: string[] = []
// Every cache write: the text and the TTL argument (undefined = the 30-day default).
const cacheWrites: { text: string; ttl: number | undefined }[] = []
const PROSE = 'You hold the room by going quiet first.'
let streamText = PROSE
let stopReason = 'end_turn'
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
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: streamText } }
            if (streamHold) {
              await streamHold
              yield { type: 'content_block_delta', delta: { type: 'text_delta', text: ' MORE.' } }
            }
          },
          finalMessage: async () => ({
            stop_reason: stopReason,
            usage: { input_tokens: 10, output_tokens: 10, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        }
      },
      // Evaluator, repair and re-score were all messages.create. None may run.
      create: async () => { events.push('create'); throw new Error('the live path must not call messages.create') },
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

// after() runs its callback inline so the cache write is observable in-test.
vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: (fn: () => Promise<void> | void) => { void fn() } }
})

vi.mock('@/lib/reading-cache', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/reading-cache')>()
  return {
    ...actual,
    getCachedReading: async () => null,
    setCachedReading: async (_k: string, text: string, ttl?: number) => { cacheWrites.push({ text, ttl }) },
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
  // Pre-flight OFF: the fixtures are stub prose that fails the length floor, so
  // each would also pay a `preflight-rewrite` call. Its accounting is asserted
  // in reading-route-preflight.test.ts.
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key'; process.env.AXIS_PREFLIGHT_ENABLED = 'false' })
  afterAll(() => {
    delete process.env.AXIS_PREFLIGHT_ENABLED
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    events.length = 0; cacheWrites.length = 0
    streamShouldThrow = false; streamHold = null; streamText = PROSE; stopReason = 'end_turn'
    _resetThreadMemoryForTests()
  })

  it('reserves the generation call BEFORE making it', async () => {
    await run('10.1.0.1')
    expect(events.indexOf('reserve:1')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('reserve:1')).toBeLessThan(events.indexOf('stream'))
  })

  it('an uncached section costs exactly ONE model call — no evaluator, no repair', async () => {
    await run('10.1.0.2')
    expect(events.filter(e => e.startsWith('reserve:'))).toEqual(['reserve:1'])
    expect(events.filter(e => e === 'stream')).toHaveLength(1)
    expect(events).not.toContain('create')
  })

  it('caches the first pass as served, for the full TTL', async () => {
    await run('10.1.0.5')
    // No TTL argument: the 30-day default, never the 24h provisional one.
    expect(cacheWrites).toEqual([{ text: PROSE, ttl: undefined }])
  })

  it('never caches truncated output', async () => {
    stopReason = 'max_tokens'
    const res = await run('10.1.0.6')
    expect(cacheWrites).toEqual([])
    expect(events).not.toContain('create')
    expect(res.status).toBe(200)
  })

  it('never caches doctrine-breaching output, and spends nothing trying to fix it', async () => {
    streamText = `${PROSE} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    try {
      await run('10.1.0.7')
      expect(cacheWrites).toEqual([])
      expect(events).not.toContain('create')
      expect(warn.mock.calls.some(c => String(c[0]).includes('[AXIS_DOCTRINE_UNCACHED]'))).toBe(true)
    } finally {
      warn.mockRestore()
    }
  })

  it('the route does not import the LLM gate', () => {
    // The gate is an offline measuring tool. If this fails, someone has put
    // evaluator spend and wording churn back on the live path.
    const src = readFileSync(resolve(__dirname, '../../app/api/reading/route.ts'), 'utf8')
    for (const name of ['gateForCache', 'evaluateSection', 'repairSection', 'repairDoctrineSentences', 'PROVISIONAL_TTL_SECONDS']) {
      expect(src, name).not.toContain(name)
    }
  })

  it('keeps the reservation when the generation call fails', async () => {
    // A call that errors late can still have billed; over-counting is the safe
    // direction, and the old post-hoc path recorded nothing at all here.
    streamShouldThrow = true
    const res = await run('10.1.0.3')
    expect(res.status).toBe(200)   // the failure is in-band, not a status code
    expect(events).toContain('reserve:1')
    expect(cacheWrites).toEqual([])
  })

  it('still caches a paid generation when the reader disconnects while it generates', async () => {
    // Navigating away (or casting another chart) cancels the response body while
    // the model is still generating. The finished text must still reach the
    // cache: it has been billed in full. An unguarded controller.close() threw
    // into the failure path instead — skipping the write and logging a false
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
      await reader.cancel('navigated away')   // gone before a byte is written
      release()                               // the generation then completes
      for (let i = 0; i < 20 && cacheWrites.length === 0; i++) await new Promise(r => setTimeout(r, 0))
      expect(cacheWrites).toEqual([{ text: `${PROSE} MORE.`, ttl: undefined }])
      expect(errors.mock.calls.some(c => String(c[0]).includes('[AXIS_GEN_FAIL]'))).toBe(false)
    } finally {
      errors.mockRestore()
    }
  })
})
