// app/api/reading/route.ts
import { NextRequest, NextResponse, after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData, ChartOverrides } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES, wordBandFor, renderSectionInstruction, countPlanEvidence } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock, currentDashaKey } from '@/lib/interpretation-engine'
import { makeCacheKey, makeSynastryCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'
import { buildSynastryData, formatSynastryBlock } from '@/lib/synastry-calc'
import { checkRateLimit, getClientIp, readGlobalDailyBudget, recordModelCalls } from '@/lib/route-rate-limiter'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { readLimitedJsonBody } from '@/lib/request-security'
import { gateForCache, countWords, countAspectsInContext } from '@/lib/reading-quality-gate'
import { classifyGenerationError } from '@/lib/reading-stream'
import { logUsage } from '@/lib/usage-log'
import { getAnthropicKey, isAnthropicKeyConfigured } from '@/lib/env'
import { MODEL, THINKING, MAX_TOKENS_PER_SECTION } from '@/lib/reading-model-config'
import { unknownTimeAngleNotice } from '@/lib/unknown-time-notice'
import {
  parseThreadId, loadPriorSections, storeThreadSection, priorSectionBlocks, phrasesAlreadyUsedBlock,
  priorDigest, READING_SO_FAR_FOOTER, type ThreadScope, type PriorSection,
} from '@/lib/reading-thread'

export const maxDuration = 120

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
      // Reading-thread id (reading-thread.ts). Optional: without it the section is
      // written as the opening of a reading, exactly as before threading existed.
      threadId?: unknown
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

    // ── Reading thread ─────────────────────────────────────────────────────────
    // Natal sections only: synastry is not threaded. The earlier sections are
    // loaded before the cache check because they are part of the cache key.
    const threadId = section === 'synastry' ? null : parseThreadId(body.threadId)
    const thread: ThreadScope | null = threadId
      ? { threadId, birth: birthData!, plutoSource: plutoOverride?.plutoSource, plutoLongitude: plutoOverride?.plutoLongitude }
      : null
    const prior: PriorSection[] = thread ? await loadPriorSections(thread, section, planetSection) : []
    const remember = async (text: string) => {
      if (thread) await storeThreadSection(thread, section, planetSection, text)
    }

    const systemPrompt = SYSTEM_PROMPT_MAP[section]
    // The instruction itself is rendered below, once the context block exists:
    // its length clause is substituted from the band THIS chart will be scored
    // against (prompts.ts renderSectionInstruction). Only its existence is
    // checked here, before any work is done.
    if (!systemPrompt || !SECTION_INSTRUCTIONS[section]?.[planetSection]) {
      return NextResponse.json({ error: 'Internal configuration error' }, { status: 500 })
    }

    // ── Unknown-birth-time angle guard ─────────────────────────────────────────
    // With no birth time, noon is assumed and the Ascendant/Lagna is essentially
    // uniform across all twelve signs (it moves a full sign roughly every two
    // hours). Generating a confident 450–650-word interpretation of it is the
    // product's worst integrity hole: the caveat block tells the model to hedge
    // while the quality rubric rewards confident anchoring, and the rubric usually
    // wins. So for the dedicated angle section we skip the model entirely and
    // return a short, honest, deterministic explainer. Free (no model call, no
    // rate-limit spend), and it closes the hole regardless of client. Every other
    // section still runs — sign-based placements are accurate without a birth time.
    if (
      section !== 'synastry' &&
      birthData?.birthTimeUnknown === true &&
      (planetSection === 'ascendant' || planetSection === 'lagna')
    ) {
      const notice = unknownTimeAngleNotice(planetSection)
      await remember(notice)
      return new Response(notice, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' },
      })
    }

    // ── Cache check (before rate limiting — cache hits are free) ───────────────
    // plutoSource is part of the key: the cached prose describes whichever Pluto
    // the reading was generated against, and JPL vs the Meeus fallback can differ
    // by enough to change Pluto's sign near a boundary. Keying on it stops a
    // Meeus-era reading being served for 30 days beside a JPL wheel.
    // The natal chart is computed here, ahead of the cache check, because the
    // Sidereal and Divergence keys carry the current dasha period — computed
    // from today's date — so a cached section can never name a period that has
    // since ended. The calculation is pure and fast; it is reused below.
    const dual = section === 'synastry' ? null : calculateDualChart(birthData!, plutoOverride)
    const dasha = dual && (section === 'sidereal' || section === 'synthesis') ? currentDashaKey(dual) : ''
    const cacheKey = section === 'synastry'
      ? makeSynastryCacheKey({
          birthA: birthA!, birthB: birthB!, section, planetSection,
          plutoSourceA: overrideA?.plutoSource, plutoSourceB: overrideB?.plutoSource,
          plutoLongitudeA: overrideA?.plutoLongitude, plutoLongitudeB: overrideB?.plutoLongitude,
        })
      : makeCacheKey({
          birth: birthData!, section, planetSection,
          plutoSource: plutoOverride?.plutoSource, plutoLongitude: plutoOverride?.plutoLongitude,
          priorDigest: priorDigest(prior), dasha,
        })
    const cached = await getCachedReading(cacheKey)
    if (cached) {
      await remember(cached)
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

    // ── Assemble the prompt from the server-side chart ─────────────────────────
    // The natal chart (`dual`, computed above ahead of the cache check) and the
    // synastry charts below are computed server-side from birthData and never
    // client-supplied. Pluto: the canonical JPL longitude is consumed from the
    // caller when present and validated (see buildPlutoOverride) so the reading
    // interprets the exact Pluto the user sees; otherwise it falls back to local
    // Meeus (no outbound JPL call in this hot path).
    //
    // Refrains and verbal tics the reading so far already leans on are named so
    // this section is told not to repeat them (empty for an opening section).
    const repeatBlock = phrasesAlreadyUsedBlock(prior)
    const priorText = prior.map(p => p.text).join('\n\n')

    // The evidence half of the user turn, assembled first and on its own: the
    // section instruction's length clause is rendered FROM it (below), so it has
    // to exist before the instruction does.
    let contextBlock: string
    if (section === 'synastry') {
      const dualA      = calculateDualChart(birthA!, overrideA)
      const dualB      = calculateDualChart(birthB!, overrideB)
      const synData    = buildSynastryData(dualA, dualB)
      const synBlock   = formatSynastryBlock(synData, planetSection)
      // For composite-focused sections, append an elite chart block for the
      // composite so the model has dignity labels, chart ruler, and direction
      // — data the position table in formatSynastryBlock doesn't include.
      contextBlock = planetSection === 'composite_chart' || planetSection === 'central_dynamic'
        ? `${synBlock}\n\nCOMPOSITE CHART — DIGNITY & CHART RULER:\n${formatEliteChartBlock(synData.composite, 'tropical')}`
        : synBlock
    } else if (section === 'synthesis') {
      // The shared plan is deliberately the sole comparison dossier. Appending
      // two full chart blocks here used to reintroduce unreliable houses/angles
      // for unknown birth times and invited two parallel readings rather than a
      // comparison of computed evidence.
      contextBlock = buildInterpretationContext(dual!, 'synthesis', planetSection)
    } else {
      const frame      = section as 'tropical' | 'sidereal'
      const ctxBlock   = buildInterpretationContext(dual!, frame, planetSection, { priorText })
      const chartBlock = formatEliteChartBlock(dual![frame], frame)
      contextBlock = `${chartBlock}\n${ctxBlock}`
    }

    // ── Length band: one number, read by the model AND by the gate ────────────
    // The band is a function of this chart — aspect count for aspect-driven
    // sections, the Divergence plan's own weight line for the two comparative
    // ones. The gate's scoreLength derives it with these exact helpers from the
    // userContent assembled just below, so rendering the instruction's length
    // clause from it here is what makes the target the model is given and the
    // target it is scored against the same number. (Counting on contextBlock
    // rather than the finished userContent is safe and pinned by
    // prompts-length-wiring.test.ts: neither helper's pattern can match prompt
    // prose, so the counts are identical either side of the instruction.)
    const aspectCount   = countAspectsInContext(contextBlock)
    const evidenceCount = countPlanEvidence(contextBlock, planetSection) ?? undefined
    const band          = wordBandFor(section, planetSection, aspectCount, evidenceCount)
    const sectionInstruction = renderSectionInstruction(section, planetSection, { aspectCount, evidenceCount })!

    const userContent = section === 'synastry'
      ? `${contextBlock}\n\n---\n\n${sectionInstruction}`
      : `${contextBlock}\n\n---\n\n${repeatBlock}${sectionInstruction}`

    // The reading so far goes in front of this section's chart context: one block
    // per earlier section (prompt-cache friendly, see priorSectionBlocks), then
    // this section's own context and instruction. The gate is handed the same
    // prior blocks rather than a flattened string, so its evaluator and repair
    // calls read the reading so far from the prompt cache instead of paying full
    // price for it on every section (it judges repetition and repairs in
    // continuity from exactly the same text).
    const priorBlocks = priorSectionBlocks(prior)
    const userBlocks: Anthropic.TextBlockParam[] = [
      ...priorBlocks,
      { type: 'text', text: prior.length > 0 ? `${READING_SO_FAR_FOOTER}\n\n${userContent}` : userContent },
    ]

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
        // evaluate, plus one more when a repair fires. The gate's calls are
        // recorded in the after() below; the generation is reserved up front.
        let gateCalls = 0

        // Reserve the generation call against the daily budget AS it is made.
        // Recording it afterwards — which meant after the gate finished, ~30–60s
        // later — left the counter lagging real spend by the whole gate duration,
        // so concurrent traffic could overshoot the cap by the number of requests
        // in flight. Reserving makes the counter a running total of calls STARTED,
        // which is the number the cap is supposed to bound. A reservation is never
        // refunded if the call then fails: a call that errors late can still have
        // billed, and over-counting is the safe direction (the same reasoning the
        // gate counts its own attempts by).
        //
        // NOT awaited here. This is the reader's critical path and the write is a
        // round trip to Upstash — awaiting it would put that latency in front of
        // every one of the ~21 sequential sections to buy nothing, since the write
        // only has to land before the invocation ends. Both exits below await the
        // promise inside after(), which is what guarantees it is flushed while the
        // platform still holds the instance alive.
        const reservation = recordModelCalls(1).catch(() => { /* best-effort */ })

        try {
          // First pass — the only model call the reader ever waits on.
          const stream = anthropic.messages.stream({
            model:       MODEL,
            max_tokens:  maxTokens,
            thinking:    THINKING,
            system:      systemBlocks,
            messages:    [{ role: 'user', content: userBlocks }],
          })

          let firstText = ''
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              firstText += event.delta.text
              try { controller.enqueue(encoder.encode(event.delta.text)) } catch { /* closed */ }
            }
          }
          const firstMessage = await stream.finalMessage()
          logUsage(`${section}/${planetSection}`, 'generate', MODEL, firstMessage.usage, {
            stop: firstMessage.stop_reason ?? 'none', prior: prior.length,
          })
          const truncated = firstMessage.stop_reason === 'max_tokens'

          // Truncated drafts ship with the marker so the client can surface it.
          if (truncated) {
            controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]'))
          }

          // Into the thread BEFORE close: the client requests the next section
          // the instant this stream ends, and that request must find this text.
          await remember(firstText)

          // The reader has the whole section from here on. Everything below only
          // decides what lands in the 30-day cache.
          controller.close()

          // Post-response work — the quality gate and the spend recording — is
          // registered with after() rather than run inline below the close.
          // after() guarantees the platform keeps the invocation alive until this
          // completes; work left inline after controller.close() can be dropped on
          // a runtime that freezes the instance the moment the response flushes,
          // and with it EVERY cache write and the spend count (the gate would
          // silently never run in production). Nothing here touches the response.
          after(async () => {
            try {
              // ── Length telemetry ───────────────────────────────────────────
              // One greppable line per GENERATED section (cache hits return long
              // before here, so this measures only fresh output). It pairs the
              // finished word count with the band the gate will score it against
              // and the aspect count that scales that band, so a section that ran
              // long because the chart genuinely carried more aspects is
              // distinguishable from one that runs multiples over spec on every
              // chart. It logs the SAME band the instruction's length clause was
              // rendered from — which is the band scoreLength acts on — so prompt,
              // log and gate cannot disagree. (It previously recomputed the band
              // without the evidence count, printing the wrong numbers for exactly
              // the two sections whose bands move most.)
              console.log(
                `[AXIS_LEN] section=${section}/${planetSection} words=${countWords(firstText)} ` +
                `band=${band.fullMin}-${band.fullMax} hardMax=${band.hardMax} ` +
                `aspects=${aspectCount} evidence=${evidenceCount ?? '-'} ` +
                `maxTokens=${maxTokens} stop=${firstMessage.stop_reason} prior=${prior.length}`
              )

              const verdict = await gateForCache({
                firstPassText: firstText,
                truncated,
                chartContext:  userContent,
                priorBlocks,
                section,
                planetSection,
                systemBlocks,
                maxTokens,
                model: MODEL,
                startedAt,
              })
              gateCalls += verdict.modelCalls

              if (verdict.cacheText) {
                await setCachedReading(cacheKey, verdict.cacheText)
              }
            } catch (gateErr) {
              // gateForCache never throws by contract; guard anyway so a stray
              // rejection can never surface as an unhandled promise rejection.
              console.error(
                `[AXIS_GATE] section=${section}/${planetSection} post-response gating failed:`,
                gateErr instanceof Error ? gateErr.message : gateErr
              )
            } finally {
              // Flush the generation reservation fired on the hot path, then record
              // only what gating added (evaluate + any repair + re-score) on top.
              await reservation
              try { await recordModelCalls(gateCalls) } catch { /* best-effort */ }
            }
          })
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
          // Nothing further to record: the generation call was reserved as it was
          // attempted and gating never ran. (This path used to record a post-hoc
          // count, which here was usually zero — a failed call that had already
          // billed went uncounted.) The reservation is still only flushed under
          // after(), for the same reason the success path flushes it there.
          after(async () => { await reservation })
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
