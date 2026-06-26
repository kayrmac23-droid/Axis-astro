// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { makeCacheKey, makeSynastryCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'
import { buildSynastryData, formatSynastryBlock } from '@/lib/synastry-calc'
import { checkRateLimit, getClientIp } from '@/lib/route-rate-limiter'
import { evaluateSection, repairSection } from '@/lib/reading-quality-gate'

export const maxDuration = 60

// ── Model config ───────────────────────────────────────────────────────────────
const MODEL       = 'claude-sonnet-4-6'
const TEMPERATURE = 0.2

// Per-section token budgets. Keyed by planetSection; overlapping names
// (sun, moon, mercury, venus, mars, jupiter_saturn) apply to both tropical
// and sidereal readings. Falls back to 2000 for any unlisted key.
const MAX_TOKENS_PER_SECTION: Record<string, number> = {
  // Tropical + sidereal primaries
  sun: 2500, moon: 2500, ascendant: 2500, lagna: 2000,
  // Secondaries (shared names across systems)
  mercury: 1500, venus: 1500, mars: 1500,
  jupiter_saturn: 1800, rahu_ketu: 1500,
  key_aspects: 1200,
  // Synthesis
  agree: 2500, diverge: 2500, tension: 1800, closing: 2000,
  // Synastry
  luminaries: 2500, venus_mars: 1800, outer_planets: 1800, composite_chart: 2000, integration: 2000, navigation: 2000,
}

// ── Payload limits ─────────────────────────────────────────────────────────────
// A real BirthData payload + section strings is well under 2 KB.
// 16 KB is generous headroom; anything larger is almost certainly abuse.
const MAX_PAYLOAD_BYTES = 16_000

// ── Allow-lists ────────────────────────────────────────────────────────────────
const VALID_SECTIONS   = new Set(['tropical', 'sidereal', 'synthesis', 'synastry'])
const VALID_PLANET_SECTIONS: Record<string, Set<string>> = {
  tropical:  new Set(['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'key_aspects', 'rahu_ketu']),
  sidereal:  new Set(['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu']),
  synthesis: new Set(['agree', 'diverge', 'tension', 'closing']),
  synastry:  new Set(['luminaries', 'venus_mars', 'outer_planets', 'composite_chart', 'integration', 'navigation']),
}

// ── Rate limiting ──────────────────────────────────────────────────────────────
// 20 AI-backed requests per IP per 60-second window. Cache hits bypass this.
const READING_RATE_LIMIT = { max: 20, windowSecs: 60, keyPrefix: 'axis:rl:reading:' }

// ── Quality-gate budget ────────────────────────────────────────────────────────
// Wall-clock budget after first pass + eval beyond which we skip the repair pass
// to stay under maxDuration. Tunable; conservative for the 60s ceiling.
const REPAIR_SKIP_THRESHOLD_MS = 42_000

const SYSTEM_PROMPT_MAP: Record<string, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
  synastry:  SYNASTRY_SYSTEM_PROMPT,
}

// SHARED_RULES is the same across all system prompt types and is the largest
// block (~7 KB). Marking it as the cached prefix means every request hits the
// same cache entry regardless of which section type is being streamed.
const SHARED_RULES_BLOCK: Anthropic.TextBlockParam = {
  type: 'text',
  text: SHARED_RULES,
  cache_control: { type: 'ephemeral' },
}

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// Parse and validate a BirthData object from unknown user input.
// Returns null if any required field is missing or out of range.
function parseBirthData(raw: unknown): BirthData | null {
  if (!raw || typeof raw !== 'object') return null
  const d   = raw as Record<string, unknown>
  const y   = Number(d.year)
  const mo  = Number(d.month)
  const dy  = Number(d.day)
  const hRaw = Number(d.hour)
  const h   = isNaN(hRaw) ? 12 : hRaw
  const mi  = Number(d.minute) || 0
  const lat = Number(d.latitude)
  const lon = Number(d.longitude)
  const tzRaw = Number(d.timezone)
  const tz  = (isNaN(tzRaw) || tzRaw < -14 || tzRaw > 14) ? 0 : tzRaw
  if (isNaN(y)   || y   < 1    || y   > 9999) return null
  if (isNaN(mo)  || mo  < 1    || mo  > 12)   return null
  if (isNaN(dy)  || dy  < 1    || dy  > 31)   return null
  if (isNaN(h)   || h   < 0    || h   > 23)   return null
  if (isNaN(mi)  || mi  < 0    || mi  > 59)   return null
  if (isNaN(lat) || lat < -90  || lat > 90)   return null
  if (isNaN(lon) || lon < -180 || lon > 180)  return null
  return {
    year: y, month: mo, day: dy, hour: h, minute: mi,
    latitude: lat, longitude: lon, timezone: tz,
    tzName:           typeof d.tzName === 'string' ? d.tzName : undefined,
    birthTimeUnknown: d.birthTimeUnknown === true || d.birthTimeUnknown === 'true',
  }
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // ── Payload size guard ─────────────────────────────────────────────────────
    // Read the actual body bytes — the Content-Length header is advisory only
    // and can be omitted or spoofed by the client.
    const rawBody = await req.text()
    if (rawBody.length > MAX_PAYLOAD_BYTES) {
      return NextResponse.json({ error: 'Request payload too large' }, { status: 400 })
    }

    // ── Parse body ─────────────────────────────────────────────────────────────
    let body: {
      birthData?: unknown
      birthA?: unknown
      birthB?: unknown
      section?: string
      planetSection?: string
    }
    try {
      body = JSON.parse(rawBody)
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
    }

    const { section, planetSection } = body

    if (!section || !planetSection) {
      return NextResponse.json({ error: 'Missing required fields: section, planetSection' }, { status: 400 })
    }

    // ── Allow-list validation ──────────────────────────────────────────────────
    if (!VALID_SECTIONS.has(section)) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }
    if (!VALID_PLANET_SECTIONS[section].has(planetSection)) {
      return NextResponse.json({ error: 'Invalid planetSection for this section' }, { status: 400 })
    }

    // ── Validate birth data ────────────────────────────────────────────────────
    // Accept BirthData instead of pre-computed DualChartData/SynastryData.
    // Chart positions are recalculated server-side from the validated birth data,
    // preventing cache poisoning via client-supplied fake planet positions.
    let birthData: BirthData | null = null
    let birthA:    BirthData | null = null
    let birthB:    BirthData | null = null

    if (section === 'synastry') {
      birthA = parseBirthData(body.birthA)
      birthB = parseBirthData(body.birthB)
      if (!birthA || !birthB) {
        return NextResponse.json({ error: 'Invalid or missing birthA / birthB for synastry section' }, { status: 400 })
      }
    } else {
      birthData = parseBirthData(body.birthData)
      if (!birthData) {
        return NextResponse.json({ error: 'Invalid or missing birthData for natal section' }, { status: 400 })
      }
    }

    const systemPrompt      = SYSTEM_PROMPT_MAP[section]
    const sectionInstruction = SECTION_INSTRUCTIONS[section]?.[planetSection]
    if (!systemPrompt || !sectionInstruction) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 })
    }

    // ── Cache check (before rate limiting — cache hits are free) ───────────────
    const cacheKey = section === 'synastry'
      ? makeSynastryCacheKey({ birthA: birthA!, birthB: birthB!, section, planetSection })
      : makeCacheKey({ birth: birthData!, section, planetSection })
    const cached = await getCachedReading(cacheKey)
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }

    // ── Rate limiting (only uncached AI requests reach here) ──────────────────
    const ip = getClientIp(req)
    const { allowed, retryAfter } = await checkRateLimit(ip, READING_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before generating another reading.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    // ── Recalculate chart server-side ──────────────────────────────────────────
    // Uses local Meeus for Pluto (no outbound JPL call in this hot path).
    // Planet positions in the prompt are authoritative — not client-supplied.
    let userContent: string
    if (section === 'synastry') {
      const dualA      = calculateDualChart(birthA!)
      const dualB      = calculateDualChart(birthB!)
      const synData    = buildSynastryData(dualA, dualB)
      const synBlock   = formatSynastryBlock(synData, planetSection)
      userContent = `${synBlock}\n\n---\n\n${sectionInstruction}`
    } else if (section === 'tropical') {
      const dual       = calculateDualChart(birthData!)
      const ctxBlock   = buildInterpretationContext(dual, 'tropical', planetSection)
      const chartBlock = formatEliteChartBlock(dual.tropical, 'tropical')
      userContent = `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    } else if (section === 'sidereal') {
      const dual       = calculateDualChart(birthData!)
      const ctxBlock   = buildInterpretationContext(dual, 'sidereal', planetSection)
      const chartBlock = formatEliteChartBlock(dual.sidereal, 'sidereal')
      userContent = `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    } else {
      // synthesis — needs both chart systems
      const dual          = calculateDualChart(birthData!)
      const ctxBlock      = buildInterpretationContext(dual, 'synthesis', planetSection)
      const tropicalBlock = formatEliteChartBlock(dual.tropical, 'tropical')
      const siderealBlock = formatEliteChartBlock(dual.sidereal, 'sidereal')
      userContent = `${tropicalBlock}\n\n${siderealBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    }

    const maxTokens = MAX_TOKENS_PER_SECTION[planetSection] ?? 2000
    const systemBlocks: Anthropic.TextBlockParam[] = [
      SHARED_RULES_BLOCK,
      { type: 'text', text: systemPrompt },
    ]

    // ── Quality-gated generation pipeline ──────────────────────────────────────
    // Wraps first-pass + evaluator + optional repair in a streaming response so
    // the connection stays warm via 5s whitespace pings, but no text reaches the
    // client until the validated (or repaired) version is ready. Caching only
    // happens after the gate passes — failed first drafts are never persisted.
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        const startedAt = Date.now()
        let pipelineDone = false
        const keepAlive = setInterval(() => {
          if (!pipelineDone) {
            try { controller.enqueue(encoder.encode(' ')) } catch { /* closed */ }
          }
        }, 5000)

        try {
          // 1. First pass — full non-streaming generation.
          const firstPass = await anthropic.messages.create({
            model:       MODEL,
            max_tokens:  maxTokens,
            temperature: TEMPERATURE,
            system:      systemBlocks,
            messages:    [{ role: 'user', content: userContent }],
          })
          const firstText = extractText(firstPass)
          const truncated = firstPass.stop_reason === 'max_tokens'

          // 2. Evaluate. Truncated drafts are never gated — they get returned
          //    with the truncation marker so the client can surface it.
          let finalText = firstText
          let cacheable = !truncated && firstText.trim().length > 0

          if (!truncated && firstText.trim().length > 0) {
            const gate = await evaluateSection({
              generatedText: firstText,
              chartContext:  userContent,
              section,
              planetSection,
            })

            // 3. Repair once if the gate fails AND we have budget for it.
            const elapsedMs = Date.now() - startedAt
            const haveBudget = elapsedMs < REPAIR_SKIP_THRESHOLD_MS

            if (!gate.pass && gate.critique && haveBudget) {
              try {
                const repaired = await repairSection({
                  originalUserContent: userContent,
                  systemBlocks,
                  failedDraft:         firstText,
                  critique:            gate.critique,
                  maxTokens,
                  model:               MODEL,
                })
                if (repaired.trim().length > 0) {
                  finalText = repaired
                }
              } catch (repairErr) {
                // Repair failed — fall back to the first pass. Log but don't
                // break the user-facing response.
                console.error('Reading quality gate: repair pass failed:', repairErr instanceof Error ? repairErr.message : repairErr)
                // First pass still ships, but don't cache a known-failed draft.
                cacheable = false
              }
            } else if (!gate.pass && gate.critique && !haveBudget) {
              // Out of budget for a repair — ship the first pass but don't
              // cache it, so the next request gets a fresh attempt.
              cacheable = false
              console.warn(`Reading quality gate: skipped repair (elapsed ${elapsedMs}ms ≥ ${REPAIR_SKIP_THRESHOLD_MS}ms threshold) for ${section}/${planetSection}`)
            }
          }

          // 4. Emit final text (and truncation marker if present), then cache
          //    only the validated, complete version.
          pipelineDone = true
          controller.enqueue(encoder.encode(finalText))
          if (truncated) {
            controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]'))
          }
          controller.close()

          if (cacheable && finalText.trim().length > 0) {
            await setCachedReading(cacheKey, finalText)
          }
        } catch (err) {
          pipelineDone = true
          try {
            controller.enqueue(encoder.encode('\n\n[AXIS_STREAM_ERROR: generation failed]'))
            controller.close()
          } catch { /* already closed */ }
          console.error('Reading generation error:', err instanceof Error ? err.message : err)
        } finally {
          clearInterval(keepAlive)
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
    console.error('Reading generation error:', error instanceof Error ? error.message : error)
    return NextResponse.json({
      error: 'READING_FAILED',
      message: "We couldn't generate this reading. Please try again.",
    }, { status: 500 })
  }
}
