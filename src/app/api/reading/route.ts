// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData, ChartOverrides } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { makeCacheKey, makeSynastryCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'
import { buildSynastryData, formatSynastryBlock } from '@/lib/synastry-calc'
import { checkRateLimit, getClientIp, checkGlobalDailyBudget } from '@/lib/route-rate-limiter'
import { isValidCalendarDate } from '@/lib/tz'
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
  // The Divergence (legacy 'synthesis' key)
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
const READING_RATE_LIMIT = { max: Number(process.env.AXIS_READING_RATE_LIMIT_MAX ?? 20), windowSecs: 60, keyPrefix: 'axis:rl:reading:' }

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
  // Reject impossible calendar dates (e.g. Feb 31), matching /api/calculate and
  // /api/synastry — a direct POST here must not recompute a chart on a bogus date.
  if (!isValidCalendarDate(y, mo, dy))        return null
  return {
    year: y, month: mo, day: dy, hour: h, minute: mi,
    latitude: lat, longitude: lon, timezone: tz,
    tzName:           typeof d.tzName === 'string' ? d.tzName : undefined,
    birthTimeUnknown: d.birthTimeUnknown === true || d.birthTimeUnknown === 'true',
  }
}

// Build a validated Pluto override from client-supplied hints. The reading route
// stays authoritative: the client may supply the canonical Pluto longitude (the one
// value the server does not recompute in this hot path, to avoid a JPL call), but it
// is range- and enum-validated here before use. If either field fails validation,
// BOTH are dropped and the caller falls through to the local Meeus fallback — we never
// throw and never coerce. Everything else in the chart is computed server-side.
const PLUTO_SOURCE_RE = /^(jpl-horizons-de44[01]|local-meeus)$/
function buildPlutoOverride(lon: unknown, source: unknown): ChartOverrides | undefined {
  const validLon =
    typeof lon === 'number' && Number.isFinite(lon) && lon >= 0 && lon < 360 ? lon : undefined
  const validSource =
    typeof source === 'string' && PLUTO_SOURCE_RE.test(source) ? source : undefined
  return validLon !== undefined && validSource
    ? { plutoLongitude: validLon, plutoSource: validSource }
    : undefined
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured' }, { status: 500 })
    }

    // ── Kill switch ────────────────────────────────────────────────────────────
    // Set AXIS_READINGS_ENABLED=false to disable all AI-backed reading generation
    // without a redeploy (e.g. during a spend incident).
    if (process.env.AXIS_READINGS_ENABLED === 'false') {
      return NextResponse.json(
        { error: 'Readings are temporarily unavailable. Please check back shortly.' },
        { status: 503 }
      )
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
      // Client-supplied canonical Pluto hints (validated below, never trusted wholesale).
      // Natal sections use plutoLongitude/plutoSource; synastry uses the A/B pairs.
      plutoLongitude?: unknown
      plutoSource?: unknown
      plutoLongitudeA?: unknown
      plutoSourceA?: unknown
      plutoLongitudeB?: unknown
      plutoSourceB?: unknown
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

    // ── Canonical Pluto override (validated client hint) ───────────────────────
    // For natal sections a single override applies; for synastry it splits into
    // per-person overrideA / overrideB. Invalid or absent hints yield undefined,
    // so the chart silently falls back to local Meeus.
    const plutoOverride = buildPlutoOverride(body.plutoLongitude, body.plutoSource)
    const overrideA     = buildPlutoOverride(body.plutoLongitudeA, body.plutoSourceA)
    const overrideB     = buildPlutoOverride(body.plutoLongitudeB, body.plutoSourceB)

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
    // MUST run before the global daily budget guard below. The budget counter
    // increments on every request that reaches it, so counting before the per-IP
    // limit would let a single IP exhaust the global daily cap with cheap requests
    // that are themselves rate-limited away from ever reaching the model — a
    // denial-of-service that trips the spend kill switch for every user.
    const ip = getClientIp(req)
    const { allowed, retryAfter } = await checkRateLimit(ip, READING_RATE_LIMIT)
    if (!allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please wait before generating another reading.' },
        { status: 429, headers: { 'Retry-After': String(retryAfter) } }
      )
    }

    // ── Global daily budget guard (only uncached, non-rate-limited requests reach here) ──
    // Hard cap on AI-backed reading calls per day across all instances/IPs.
    const budget = await checkGlobalDailyBudget()
    if (!budget.allowed) {
      console.error(`[AXIS] Daily reading call cap reached: used ${budget.used} of ${budget.cap}`)
      return NextResponse.json(
        { error: "AXIS has reached today's reading limit. Please try again tomorrow." },
        { status: 503 }
      )
    }

    // ── Recalculate chart server-side ──────────────────────────────────────────
    // Pluto: the canonical JPL longitude is consumed from the caller when present
    // and validated (see buildPlutoOverride) so the reading interprets the exact
    // Pluto the user sees; otherwise it falls back to local Meeus (no outbound JPL
    // call in this hot path). Every other planet position, plus angles and houses,
    // is computed server-side from birthData and is never client-supplied.
    let userContent: string
    if (section === 'synastry') {
      const dualA      = calculateDualChart(birthA!, overrideA)
      const dualB      = calculateDualChart(birthB!, overrideB)
      const synData    = buildSynastryData(dualA, dualB)
      const synBlock   = formatSynastryBlock(synData, planetSection)
      // For composite-focused sections, append an elite chart block for the
      // composite so the model has dignity labels, chart ruler, and direction
      // — data the position table in formatSynastryBlock doesn't include.
      if (planetSection === 'composite_chart' || planetSection === 'integration') {
        const compositeEliteBlock = formatEliteChartBlock(synData.composite, 'tropical')
        userContent = `${synBlock}\n\nCOMPOSITE CHART — DIGNITY & CHART RULER:\n${compositeEliteBlock}\n\n---\n\n${sectionInstruction}`
      } else {
        userContent = `${synBlock}\n\n---\n\n${sectionInstruction}`
      }
    } else if (section === 'tropical') {
      const dual       = calculateDualChart(birthData!, plutoOverride)
      const ctxBlock   = buildInterpretationContext(dual, 'tropical', planetSection)
      const chartBlock = formatEliteChartBlock(dual.tropical, 'tropical')
      userContent = `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    } else if (section === 'sidereal') {
      const dual       = calculateDualChart(birthData!, plutoOverride)
      const ctxBlock   = buildInterpretationContext(dual, 'sidereal', planetSection)
      const chartBlock = formatEliteChartBlock(dual.sidereal, 'sidereal')
      userContent = `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    } else {
      // synthesis — needs both chart systems
      const dual          = calculateDualChart(birthData!, plutoOverride)
      const ctxBlock      = buildInterpretationContext(dual, 'synthesis', planetSection)
      const tropicalBlock = formatEliteChartBlock(dual.tropical, 'tropical')
      const siderealBlock = formatEliteChartBlock(dual.sidereal, 'sidereal')
      userContent = `${tropicalBlock}\n\n${siderealBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
    }

    const maxTokens = MAX_TOKENS_PER_SECTION[planetSection] ?? 2000
    // Cache the per-section-type system prompt too: it is stable across every
    // request for a given section, so a second cache breakpoint here shaves
    // time-to-first-token off the streamed first pass.
    const systemBlocks: Anthropic.TextBlockParam[] = [
      SHARED_RULES_BLOCK,
      { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } },
    ]

    // ── Quality-gated generation pipeline ──────────────────────────────────────
    // The first pass streams to the client token-by-token, so prose starts
    // rendering within ~1s instead of after the whole section (plus gate, plus
    // repair) has finished buffering. The quality gate still runs after the
    // stream: if the draft passes it is cached as-is; if it fails and there is
    // wall-clock budget, a repair pass is streamed behind an [AXIS_REPAIRED]
    // marker and the client swaps the visible draft for it. Only validated
    // (passing or repaired) text is ever cached.
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        const startedAt = Date.now()
        // 'streaming' while first-pass tokens are flowing (never inject a ping
        // mid-stream — it would corrupt the prose). 'gating' during the eval /
        // repair gap, where a boundary-only keep-alive space is harmless.
        let phase: 'streaming' | 'gating' | 'done' = 'streaming'
        const keepAlive = setInterval(() => {
          if (phase === 'gating') {
            try { controller.enqueue(encoder.encode(' ')) } catch { /* closed */ }
          }
        }, 5000)

        try {
          // 1. First pass — streamed live.
          const stream = anthropic.messages.stream({
            model:       MODEL,
            max_tokens:  maxTokens,
            temperature: TEMPERATURE,
            system:      systemBlocks,
            messages:    [{ role: 'user', content: userContent }],
          })

          let firstText = ''
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              firstText += event.delta.text
              try { controller.enqueue(encoder.encode(event.delta.text)) } catch { /* closed */ }
            }
          }
          const firstMessage = await stream.finalMessage()
          const truncated = firstMessage.stop_reason === 'max_tokens'

          phase = 'gating'

          // 2. Gate + optional repair. Truncated drafts are never gated — they
          //    ship with the truncation marker so the client can surface it.
          let cacheText = firstText
          let cacheable = !truncated && firstText.trim().length > 0

          if (truncated) {
            controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]'))
          } else if (firstText.trim().length > 0) {
            const gate = await evaluateSection({
              generatedText: firstText,
              chartContext:  userContent,
              section,
              planetSection,
            })

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
                  // Supersede the streamed draft. The client keeps only the text
                  // after the last [AXIS_REPAIRED] marker as the final section.
                  controller.enqueue(encoder.encode('\n\n[AXIS_REPAIRED]\n\n' + repaired))
                  cacheText = repaired
                }
              } catch (repairErr) {
                // Repair failed — the streamed first pass still stands, but a
                // known-failed draft is not cached.
                console.error('Reading quality gate: repair pass failed:', repairErr instanceof Error ? repairErr.message : repairErr)
                cacheable = false
              }
            } else if (!gate.pass && gate.critique && !haveBudget) {
              // Out of budget for a repair — the streamed first pass stands, but
              // is not cached so the next request gets a fresh attempt.
              cacheable = false
              console.warn(`Reading quality gate: skipped repair (elapsed ${elapsedMs}ms ≥ ${REPAIR_SKIP_THRESHOLD_MS}ms threshold) for ${section}/${planetSection}`)
            }
          }

          phase = 'done'
          controller.close()

          if (cacheable && cacheText.trim().length > 0) {
            await setCachedReading(cacheKey, cacheText)
          }
        } catch (err) {
          phase = 'done'
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
