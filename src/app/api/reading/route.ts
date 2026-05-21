// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SECTION_INSTRUCTIONS } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { makeCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'

export const maxDuration = 60

// ── Model config ───────────────────────────────────────────────────────────────
// Centralised so a single-line change updates all reading requests.
const MODEL        = 'claude-opus-4-5'
const MAX_TOKENS   = 6000
const TEMPERATURE  = 0.2

// ── Payload limits ─────────────────────────────────────────────────────────────
// A real chart payload (DualChartData + section strings) is ~12 KB at most.
// 64 KB is generous headroom; anything larger is almost certainly an abuse attempt.
const MAX_PAYLOAD_BYTES = 64_000

// ── Allow-lists ────────────────────────────────────────────────────────────────
// Explicit sets mirror SECTION_INSTRUCTIONS keys; validation runs before body parse.
const VALID_SECTIONS   = new Set(['tropical', 'sidereal', 'synthesis'])
const VALID_PLANET_SECTIONS: Record<string, Set<string>> = {
  tropical:  new Set(['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'key_aspects']),
  sidereal:  new Set(['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu']),
  synthesis: new Set(['agree', 'diverge', 'tension', 'closing']),
}

// ── In-memory rate limiter ─────────────────────────────────────────────────────
// IMPORTANT: this is a per-process, non-distributed limiter. On multi-instance
// deployments (Vercel serverless functions scale horizontally) each instance
// maintains its own window, so the effective limit is N × window per client
// across N warm instances. For true rate limiting at scale, replace this with a
// Redis/KV-backed solution (e.g. Upstash, Vercel KV). For single-instance or
// low-traffic deployments this provides meaningful abuse protection.
//
// Policy: 20 requests per IP per 60-second sliding window.
const RATE_LIMIT_MAX    = 20
const RATE_LIMIT_WINDOW = 60_000   // ms

type RateRecord = { count: number; windowStart: number }
const _rateMap = new Map<string, RateRecord>()

function checkRateLimit(ip: string): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const rec  = _rateMap.get(ip)
  if (!rec || now - rec.windowStart >= RATE_LIMIT_WINDOW) {
    _rateMap.set(ip, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }
  if (rec.count >= RATE_LIMIT_MAX) {
    const retryAfter = Math.ceil((RATE_LIMIT_WINDOW - (now - rec.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }
  rec.count++
  return { allowed: true, retryAfter: 0 }
}

// Periodically prune stale entries to prevent unbounded map growth.
// This runs at most once per request; the cost is O(map size) but map is bounded
// by the number of unique IPs active in the past window.
function pruneRateMap(): void {
  const cutoff = Date.now() - RATE_LIMIT_WINDOW
  Array.from(_rateMap.entries()).forEach(([ip, rec]) => {
    if (rec.windowStart < cutoff) _rateMap.delete(ip)
  })
}

const SYSTEM_PROMPT_MAP: Record<string, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // ── Rate limiting ──────────────────────────────────────────────────────────
    pruneRateMap()
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0].trim()
              ?? req.headers.get('x-real-ip')
              ?? 'unknown'
    const { allowed, retryAfter } = checkRateLimit(ip)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before generating another reading.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    // ── Payload size guard ─────────────────────────────────────────────────────
    const contentLength = parseInt(req.headers.get('content-length') ?? '0', 10)
    if (contentLength > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 400 })
    }

    // ── Parse body ─────────────────────────────────────────────────────────────
    let body: { chartData?: DualChartData; section?: string; planetSection?: string }
    try {
      body = await req.json()
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { chartData, section, planetSection } = body

    if (!chartData || !section || !planetSection) {
      return NextResponse.json({ error: 'Missing required fields: chartData, section, planetSection' }, { status: 400 })
    }

    // ── Allow-list validation ──────────────────────────────────────────────────
    if (!VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }
    if (!VALID_PLANET_SECTIONS[section].has(planetSection)) {
      return NextResponse.json({ error: 'Invalid planetSection for this section' }, { status: 400 })
    }

    // Safe cast: validated against allow-list above
    const validSection = section as 'tropical' | 'sidereal' | 'synthesis'

    const systemPrompt = SYSTEM_PROMPT_MAP[validSection]
    const sectionInstruction = SECTION_INSTRUCTIONS[validSection]?.[planetSection]
    // These lookups cannot fail after the allow-list checks above, but guard anyway.
    if (!systemPrompt || !sectionInstruction) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 })
    }

    // ── Cache check ────────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey({ birth: chartData.birthData, section: validSection, planetSection })
    const cached = await getCachedReading(cacheKey)
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }

    // ── Build prompt ───────────────────────────────────────────────────────────
    const interpretationContext = buildInterpretationContext(chartData, validSection, planetSection)

    let userContent: string
    if (validSection === 'tropical') {
      const chartBlock = formatEliteChartBlock(chartData.tropical, 'tropical')
      userContent = `${chartBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    } else if (validSection === 'sidereal') {
      const chartBlock = formatEliteChartBlock(chartData.sidereal, 'sidereal')
      userContent = `${chartBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    } else {
      const tropicalBlock = formatEliteChartBlock(chartData.tropical, 'tropical')
      const siderealBlock = formatEliteChartBlock(chartData.sidereal, 'sidereal')
      userContent = `${tropicalBlock}\n\n${siderealBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    }

    // ── Stream generation ──────────────────────────────────────────────────────
    const stream = await anthropic.messages.stream({
      model:       MODEL,
      max_tokens:  MAX_TOKENS,
      temperature: TEMPERATURE,
      system:      systemPrompt,
      messages:    [{ role: 'user', content: userContent }]
    })

    const encoder = new TextEncoder()
    let accumulated  = ''
    let streamErrored = false

    const readable = new ReadableStream({
      async start(controller) {
        let hasFirstToken = false
        const keepAlive = setInterval(() => {
          if (!hasFirstToken) controller.enqueue(encoder.encode(' '))
        }, 5000)
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              hasFirstToken = true
              accumulated += chunk.delta.text
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          streamErrored = true
          // Surface a sanitised sentinel to the client — never leak internal error text.
          try {
            controller.enqueue(encoder.encode('\n\n[AXIS_STREAM_ERROR: generation failed]'))
            controller.close()
          } catch { /* stream already closed or client disconnected */ }
          // Log the real error server-side only.
          console.error('Stream error in /api/reading:', err instanceof Error ? err.message : err)
        } finally {
          clearInterval(keepAlive)
          if (!streamErrored && accumulated.trim()) {
            await setCachedReading(cacheKey, accumulated)
          }
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      }
    })
  } catch (error: unknown) {
    // Do not expose internal error details to the client.
    console.error('Reading generation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: 'READING_FAILED',
      message: "We couldn't generate this reading. Please try again.",
    }, { status: 500 })
  }
}
