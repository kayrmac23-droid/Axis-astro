// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData, ChartOverrides } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES, wordBandFor } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { makeCacheKey, makeSynastryCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'
import { buildSynastryData, formatSynastryBlock } from '@/lib/synastry-calc'
import { checkRateLimit, getClientIp, readGlobalDailyBudget, recordModelCalls } from '@/lib/route-rate-limiter'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { readLimitedJsonBody } from '@/lib/request-security'
import { gateForCache, countWords, countAspectsInContext } from '@/lib/reading-quality-gate'
import { classifyGenerationError } from '@/lib/reading-stream'
import { getAnthropicKey, isAnthropicKeyConfigured } from '@/lib/env'

export const maxDuration = 120

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
  luminaries: 2500, venus_mars: 1800, outer_planets: 1800, composite_chart: 2000, central_dynamic: 2000, navigation: 2000,
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
  synastry:  new Set(['luminaries', 'venus_mars', 'outer_planets', 'composite_chart', 'central_dynamic', 'navigation']),
}

// ── Rate limiting ──────────────────────────────────────────────────────────────
// 20 AI-backed requests per IP per 60-second window. Cache hits bypass this.
const READING_RATE_LIMIT = { max: Number(process.env.AXIS_READING_RATE_LIMIT_MAX ?? 20), windowSecs: 60, keyPrefix: 'axis:rl:reading:' }

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
  apiKey: getAnthropicKey() ?? undefined
})

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
  // Wall-clock origin for the post-response gating budget (see gateForCache).
  const startedAt = Date.now()
  try {
    if (!isAnthropicKeyConfigured()) {
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

    // ── Payload size guard + parse ─────────────────────────────────────────────
    // Streams the body with a hard byte cap (see readLimitedJsonBody) — the
    // Content-Length header is advisory only and can be omitted or spoofed.
    const parsedBody = await readLimitedJsonBody(req, MAX_PAYLOAD_BYTES)
    if (!parsedBody.ok) {
      return NextResponse.json({ error: parsedBody.error }, { status: parsedBody.status })
    }
    if (!parsedBody.value || typeof parsedBody.value !== 'object' || Array.isArray(parsedBody.value)) {
      return NextResponse.json({ error: 'JSON body must be an object' }, { status: 400 })
    }

    const body = parsedBody.value as {
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

    // resolveTzName: false — the offset was already resolved by /api/calculate and
    // is part of the reading cache key, so it must be used exactly as sent.
    if (section === 'synastry') {
      const parsedA = parseBirthDataInput(body.birthA, { label: 'birthA', resolveTzName: false })
      if (!parsedA.ok) return NextResponse.json({ error: parsedA.error }, { status: 400 })
      const parsedB = parseBirthDataInput(body.birthB, { label: 'birthB', resolveTzName: false })
      if (!parsedB.ok) return NextResponse.json({ error: parsedB.error }, { status: 400 })
      birthA = parsedA.data
      birthB = parsedB.data
    } else {
      const parsed = parseBirthDataInput(body.birthData, { label: 'birthData', resolveTzName: false })
      if (!parsed.ok) return NextResponse.json({ error: parsed.error }, { status: 400 })
      birthData = parsed.data
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
    // plutoSource is part of the key: the cached prose describes whichever Pluto
    // the reading was generated against, and JPL vs the Meeus fallback can differ
    // by enough to change Pluto's sign near a boundary. Keying on it stops a
    // Meeus-era reading being served for 30 days beside a JPL wheel.
    const cacheKey = section === 'synastry'
      ? makeSynastryCacheKey({
          birthA: birthA!, birthB: birthB!, section, planetSection,
          plutoSourceA: overrideA?.plutoSource, plutoSourceB: overrideB?.plutoSource,
        })
      : makeCacheKey({ birth: birthData!, section, planetSection, plutoSource: plutoOverride?.plutoSource })
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
    const budget = await readGlobalDailyBudget()
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
      if (planetSection === 'composite_chart' || planetSection === 'central_dynamic') {
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

    // ── Generation pipeline (evaluate-and-recache) ─────────────────────────────
    // The first pass streams to the client token-by-token, so prose starts
    // rendering within ~1s, and the stream closes the moment generation finishes.
    // The quality gate then runs AFTER close, while the invocation is still alive:
    // it adds no latency to what the reader waits for and decides only what future
    // readers get from the cache. A passing first pass is cached as-is; a failing
    // one is repaired once and the repair is cached; truncated, unrepairable, or
    // doctrine-breaching output is not cached at all, so the next request retries.
    // The first reader of an uncached section therefore sees ungated prose —
    // everyone after them is served the gated text.
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        // An uncached section costs one Sonnet call to generate, plus one to
        // evaluate, plus one more when a repair fires. Counted as they happen and
        // recorded once in the finally path regardless of outcome.
        let modelCalls = 0

        try {
          // First pass — the only model call the reader ever waits on.
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
          modelCalls = 1  // first-pass generation completed; gating adds its own below
          const truncated = firstMessage.stop_reason === 'max_tokens'

          // Truncated drafts ship with the marker so the client can surface it.
          if (truncated) {
            controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]'))
          }

          // The reader has the whole section from here on. Everything below only
          // decides what lands in the 30-day cache.
          controller.close()

          // ── Length telemetry ───────────────────────────────────────────────
          // One greppable line per GENERATED section (cache hits return long
          // before here, so this measures only fresh output). It pairs the
          // finished word count with the band the gate will score it against
          // and the aspect count that scales that band, so a section that ran
          // long because the chart genuinely carried more aspects is
          // distinguishable from one that runs multiples over spec on every
          // chart. There is no other way to see this: a truncated section
          // short-circuits before evaluateSection and therefore never emits an
          // [AXIS_GATE] line to read instead. countWords and wordBandFor are
          // the gate's own helpers, so the number logged here is exactly the
          // number scoreLength acts on — the log cannot drift from the scorer.
          // Sits below controller.close() so it stays off the response path.
          const lenAspects = countAspectsInContext(userContent)
          const lenBand    = wordBandFor(section, planetSection, lenAspects)
          console.log(
            `[AXIS_LEN] section=${section}/${planetSection} words=${countWords(firstText)} ` +
            `band=${lenBand.fullMin}-${lenBand.fullMax} hardMax=${lenBand.hardMax} ` +
            `aspects=${lenAspects} maxTokens=${maxTokens} stop=${firstMessage.stop_reason}`
          )

          const verdict = await gateForCache({
            firstPassText: firstText,
            truncated,
            chartContext:  userContent,
            section,
            planetSection,
            systemBlocks,
            maxTokens,
            model: MODEL,
            startedAt,
          })
          modelCalls += verdict.modelCalls

          if (verdict.cacheText) {
            await setCachedReading(cacheKey, verdict.cacheText)
          }
        } catch (err) {
          // Tell the client WHICH kind of failure this was. A fatal one (billing,
          // auth) means every remaining section will fail the same way, so the
          // client stops the run instead of retrying into a wall; the historic
          // 'generation failed' wording is kept verbatim for the transient case so
          // an older client still behaves exactly as before.
          const { fatal, code } = classifyGenerationError(err)
          try {
            controller.enqueue(encoder.encode(
              fatal
                ? `\n\n[AXIS_STREAM_ERROR: unavailable:${code}]`
                : '\n\n[AXIS_STREAM_ERROR: generation failed]'
            ))
            controller.close()
          } catch { /* already closed */ }
          // One greppable line per failure, carrying the classification, so a
          // billing outage is distinguishable from model trouble in the logs
          // without reading the message text of every entry.
          console.error(
            `[AXIS_GEN_FAIL] section=${section}/${planetSection} fatal=${fatal} code=${code} —`,
            err instanceof Error ? err.message : err
          )
        } finally {
          // Record the true model-call count for this request against the global
          // daily budget. Best-effort: recordModelCalls never throws, but guard
          // anyway so a rejection can never surface to the client.
          try {
            await recordModelCalls(modelCalls)
          } catch { /* spend recording is best-effort */ }
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
