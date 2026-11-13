// What an uncached section costs, and what it may leave in the cache.
//
// The generation call is reserved before it is made, so concurrent traffic
// cannot run past AXIS_DAILY_READING_CALL_CAP before the cap notices, and a
// failed call that may have billed is still counted.
//
// There is no LLM gate on the live path (it is an offline tool: npm run eval --
// --gate / rescore). After the stream closes the deterministic scans decide
// what the cache keeps: clean text is cached for the full TTL; a hard or
// doctrine finding earns ONE regeneration written for the cache only; nothing
// else is cached. A refusal is never served whole, threaded or cached.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'
import { BANNED_RESCUE_PHRASINGS, wordBandFor } from '@/lib/prompts'
import { detectStreamError } from '@/lib/reading-stream'

const BAND = wordBandFor('tropical', 'sun', 0)

// In-band, second person, clean of every deterministic check.
const clean = (lead = 'You notice it first in the ordinary case.') =>
  `## The Sun\n\n${lead} ` +
  Array.from({ length: BAND.fullMin + 14 }, (_, i) => `word${i}`).join(' ') + '.'
const PROSE = clean()
const DOCTRINE = clean(`This is ${BANNED_RESCUE_PHRASINGS[0]}.`)
const PREDICTION = clean('You will check the terms first.')

// Ordered log of what happened when: 'reserve:N' / 'stream' / 'create'.
const events: string[] = []
// Every cache write: the text and the TTL argument (undefined = the 30-day default).
const cacheWrites: { text: string; ttl: number | undefined }[] = []
const spend: number[] = []
// Each attempt's text and stop reason, in order; the mock shifts one per stream().
let attempts: { text: string; stop?: string }[] = []
const sentTurns: number[] = []
const requestOptions: ({ timeout?: number; maxRetries?: number } | undefined)[] = []
let streamShouldThrow = false
// When set, the mock stream pauses after its first delta until released — so a
// test can disconnect the reader while generation is still running.
let streamHold: Promise<void> | null = null

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: (params: { messages: { content: unknown[] }[] }, opts?: { timeout?: number; maxRetries?: number }) => {
        events.push('stream')
        sentTurns.push(params.messages[0].content.length)
        requestOptions.push(opts)
        if (streamShouldThrow) throw new Error('overloaded_error: upstream is busy')
        const attempt = attempts.shift() ?? { text: '' }
        const mid = Math.floor(attempt.text.length / 2)
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: attempt.text.slice(0, mid) } }
            if (streamHold) await streamHold
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text: attempt.text.slice(mid) } }
          },
          finalMessage: async () => ({
            stop_reason: attempt.stop ?? 'end_turn',
            usage: { input_tokens: 1000, output_tokens: 1000, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
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
    readGlobalDailyBudget: async () => ({ allowed: true, used: 0, cap: 2000, spentUsd: 0, ceilingUsd: 0 }),
    recordModelCalls: async (n: number) => { events.push(`reserve:${n}`) },
    recordModelSpend: async (micro: number) => { spend.push(micro) },
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

const request = (ip: string) => new NextRequest('https://x/api/reading', {
  method: 'POST',
  headers: { 'content-type': 'application/json', 'x-forwarded-for': ip },
  body: JSON.stringify({ birthData: BIRTH, section: 'tropical', planetSection: 'sun' }),
})

// Let the after() callback (and any regeneration inside it) settle.
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setTimeout(r, 0)) }

async function run(ip: string) {
  const res = await POST(request(ip))
  const body = await res.text()   // drain the stream so start() completes
  await settle()
  return { res, body }
}

describe('/api/reading — spend, and what the cache keeps', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key'; process.env.AXIS_PREFLIGHT_ENABLED = 'false' })
  afterAll(() => {
    delete process.env.AXIS_PREFLIGHT_ENABLED
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => {
    events.length = 0; cacheWrites.length = 0; spend.length = 0; sentTurns.length = 0; requestOptions.length = 0
    attempts = [{ text: PROSE }]
    streamShouldThrow = false; streamHold = null
    _resetThreadMemoryForTests()
    vi.spyOn(console, 'log').mockImplementation(() => {})
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  it('reserves the generation call BEFORE making it', async () => {
    await run('10.1.0.1')
    expect(events.indexOf('reserve:1')).toBeGreaterThanOrEqual(0)
    expect(events.indexOf('reserve:1')).toBeLessThan(events.indexOf('stream'))
  })

  it('a clean section costs exactly ONE model call — no evaluator, no repair', async () => {
    const { body } = await run('10.1.0.2')
    expect(body).toBe(PROSE)
    expect(events.filter(e => e.startsWith('reserve:'))).toEqual(['reserve:1'])
    expect(events.filter(e => e === 'stream')).toHaveLength(1)
    expect(events).not.toContain('create')
  })

  it('caches a clean first pass as served, for the full TTL', async () => {
    await run('10.1.0.5')
    expect(cacheWrites).toEqual([{ text: PROSE, ttl: undefined }])
  })

  it('records what each call cost in dollars, from the API usage', async () => {
    await run('10.1.0.8')
    // 1000 in × $4/MTok + 1000 out × $20/MTok = $0.024 on the generator.
    expect(spend).toEqual([24_000])
  })

  it('bounds every generation call: a deadline inside maxDuration, one SDK retry', async () => {
    await run('10.1.0.9')
    expect(requestOptions[0]?.maxRetries).toBe(1)
    expect(requestOptions[0]?.timeout).toBeGreaterThan(5_000)
    expect(requestOptions[0]?.timeout).toBeLessThanOrEqual(112_000)
  })

  it('never caches truncated output, and does not regenerate it', async () => {
    attempts = [{ text: PROSE, stop: 'max_tokens' }]
    const { res } = await run('10.1.0.6')
    expect(res.status).toBe(200)
    expect(cacheWrites).toEqual([])
    expect(events.filter(e => e === 'stream')).toHaveLength(1)
  })

  it('on a doctrine finding: the reader keeps the first pass, ONE regeneration is cached if clean', async () => {
    attempts = [{ text: DOCTRINE }, { text: PROSE }]
    const { body } = await run('10.1.0.7')
    expect(body).toBe(DOCTRINE)                       // streamed as now
    expect(events.filter(e => e === 'stream')).toHaveLength(2)
    expect(sentTurns).toEqual([1, 2])                 // the regeneration names the fault in an extra turn
    expect(events.filter(e => e.startsWith('reserve:'))).toEqual(['reserve:1', 'reserve:1'])
    expect(cacheWrites).toEqual([{ text: PROSE, ttl: undefined }])
    expect(events).not.toContain('create')
  })

  it('on a hard rule finding (a prediction): the same single regeneration', async () => {
    attempts = [{ text: PREDICTION }, { text: PROSE }]
    await run('10.1.0.10')
    expect(events.filter(e => e === 'stream')).toHaveLength(2)
    expect(cacheWrites).toEqual([{ text: PROSE, ttl: undefined }])
  })

  it('caches NOTHING when the regeneration is not clean either — and tries only once', async () => {
    attempts = [{ text: DOCTRINE }, { text: PREDICTION }, { text: PROSE }]
    await run('10.1.0.11')
    expect(events.filter(e => e === 'stream')).toHaveLength(2)
    expect(cacheWrites).toEqual([])
  })

  it('a refused first pass is never served as prose, threaded or cached', async () => {
    attempts = [{ text: 'I cannot help with that.', stop: 'refusal' }]
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { body } = await run('10.1.0.12')
      expect(body).toContain('[AXIS_STREAM_ERROR: refused]')
      // The client discards the whole body of a section that carries a sentinel.
      expect(detectStreamError(body)).toMatchObject({ fatal: false, code: 'refused' })
      expect(cacheWrites).toEqual([])
      // Not threaded: the next section is sent no earlier section.
      attempts = [{ text: PROSE }]
      sentTurns.length = 0
      await run('10.1.0.12')
      expect(sentTurns[0]).toBe(1)
    } finally {
      errors.mockRestore()
    }
  })

  it('a refused regeneration is not cached', async () => {
    attempts = [{ text: DOCTRINE }, { text: PROSE, stop: 'refusal' }]
    await run('10.1.0.13')
    expect(cacheWrites).toEqual([])
  })

  it('the route does not import the LLM gate', () => {
    // The gate is an offline measuring tool. If this fails, someone has put
    // evaluator spend and wording churn back on the live path.
    const src = readFileSync(resolve(__dirname, '../../app/api/reading/route.ts'), 'utf8')
    for (const name of ['gateForCache', 'evaluateSection', 'repairSection', 'repairDoctrineSentences']) {
      expect(src, name).not.toContain(name)
    }
  })

  it('keeps the reservation when the generation call fails', async () => {
    // A call that errors late can still have billed; over-counting is the safe
    // direction. It is priced at the fallback, since no usage came back.
    streamShouldThrow = true
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {})
    try {
      const { res } = await run('10.1.0.3')
      expect(res.status).toBe(200)   // the failure is in-band, not a status code
      expect(events).toContain('reserve:1')
      expect(cacheWrites).toEqual([])
      expect(spend).toEqual([150_000])
    } finally {
      errors.mockRestore()
    }
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
      const res = await POST(request('10.1.0.4'))
      const reader = res.body!.getReader()
      await reader.cancel('navigated away')
      release()                               // the generation then completes
      await settle()
      expect(cacheWrites).toEqual([{ text: PROSE, ttl: undefined }])
      expect(errors.mock.calls.some(c => String(c[0]).includes('[AXIS_GEN_FAIL]'))).toBe(false)
    } finally {
      errors.mockRestore()
    }
  })
})
