// app/api/reading/route.ts
import { NextRequest, NextResponse, after } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData, ChartOverrides } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES, wordBandFor, renderSectionInstruction, countPlanEvidence } from '@/lib/prompts'
import { buildSectionRequest, type NatalFrame } from '@/lib/reading-request'
import { formatEliteChartBlock, currentDashaKey } from '@/lib/interpretation-engine'
import { makeCacheKey, makeSynastryCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'
import { buildSynastryData, formatSynastryBlock, synastryTimeUnknown } from '@/lib/synastry-calc'
import { checkRateLimit, getClientIp, readGlobalDailyBudget, recordModelCalls, consumeDailyQuota } from '@/lib/route-rate-limiter'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { readLimitedJsonBody } from '@/lib/request-security'
import { firstPassCacheVerdict, countWords, countAspectsInContext } from '@/lib/reading-quality-gate'
import { classifyGenerationError } from '@/lib/reading-stream'
import { preflightSection, pickBetter, formatPreflightLog } from '@/lib/reading-preflight'
import { logUsage } from '@/lib/usage-log'
import { getAnthropicKey, isAnthropicKeyConfigured, intEnv } from '@/lib/env'
import { MODEL, THINKING, OUTPUT_CONFIG, maxTokensFor } from '@/lib/reading-model-config'
import { unknownTimeAngleNotice } from '@/lib/unknown-time-notice'
import {
  parseThreadId, loadPriorSections, storeThreadSection, priorDigest, type ThreadScope, type PriorSection,
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
const READING_RATE_LIMIT = { max: intEnv('AXIS_READING_RATE_LIMIT_MAX', 20, 1), windowSecs: 60, keyPrefix: 'axis:rl:reading:' }

// ── Daily quotas (uncached requests only) ──────────────────────────────────────
// The per-minute limit alone let one IP exhaust the site-wide daily cap — and so
// refuse every reader for the rest of the day — in about 25 minutes, by looping
// over random birth data. These bound what any single source can take.
//
// Per IP (IPv6 bucketed by /64, see getClientIp): one full natal reading is ~21
// uncached requests plus retries, so 120 is roughly five complete readings a
// day from one connection — generous for a person, small against the cap.
// Per chart: skipping sections changes the prior digest and therefore the cache
// key, so one chart could otherwise generate unbounded variants. 40 is a whole
// reading with every section retried once. Both are env-tunable, no redeploy.
const DAILY_PER_IP    = () => intEnv('AXIS_READING_DAILY_PER_IP', 120, 1)
const DAILY_PER_CHART = () => intEnv('AXIS_READING_DAILY_PER_CHART', 40, 1)

const SYSTEM_PROMPT_MAP: Record<string, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
  synastry:  SYNASTRY_SYSTEM_PROMPT,
}

// SHARED_RULES is the same across all system prompt types and is the largest
// block (~42 KB, ~10k tokens, as of v10.31). Marking it as the cached prefix means every request hits the
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
  // ── Hot-path pre-flight ──────────────────────────────────────────────────────
// ⚠ OFF by default, on the 2026-11-07 gated eval of control-chicago-1987.
//
// The checks themselves are free, but running them requires BUFFERING the
// section, which costs every reader token-by-token streaming. That price is
// paid on 100% of sections, and the measured catch rate was 3 of 21 — four
// hard findings, all `prediction`. Fourteen percent of sections get cleaner
// and the other 86% lose streaming for nothing.
//
// What the same run showed is where the prose actually fails: `specificity`
// 2.43 with 12 of 21 below the bar, `voice_quality` 2.57 with 9 below, a 5%
// first-pass pass rate. None of that is a string fact, so no deterministic
// check can see it. The pre-flight was built to fix the first impression and
// it addresses the wrong fault.
//
// Kept, not deleted, because the catch rate is one chart's and the machinery
// is already paid for: `AXIS_PREFLIGHT_ENABLED=true` turns it on without a
// redeploy the moment a wider sample, or a prompt fix that leaves
// deterministic breaches as the residue, justifies the buffering.
const PREFLIGHT_ENABLED = process.env.AXIS_PREFLIGHT_ENABLED === 'true'

// No rewrite starts after this many ms from the top of the handler. A
// regeneration is a full section (~15-25s) and maxDuration is 120s, so the
// deadline leaves room for it to finish and for the thread and cache writes.
const PREFLIGHT_REWRITE_DEADLINE_MS = 55_000

// Wall-clock origin for the pre-flight rewrite deadline.
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

    // ── Daily quotas: per chart, then per IP ──────────────────────────────────
    // Before the global budget for the same reason the per-minute limit is: the
    // global cap is shared by everyone, so a source over its own allowance must
    // be stopped before it can count against it. The chart fingerprint ignores
    // the client-supplied Pluto hint on purpose — varying it would otherwise
    // mint a fresh chart per request. X-Axis-Quota tells the client this is not
    // worth retrying, so it stops the run instead of failing ~21 sections in turn.
    const chartId = section === 'synastry'
      ? makeSynastryCacheKey({ birthA: birthA!, birthB: birthB!, section: '_quota', planetSection: '_' })
      : makeCacheKey({ birth: birthData!, section: '_quota', planetSection: '_' })
    const chartQuota = await consumeDailyQuota('chart', chartId, DAILY_PER_CHART())
    const ipQuota    = chartQuota.allowed
      ? await consumeDailyQuota('ip', ip, DAILY_PER_IP())
      : null
    if (!chartQuota.allowed || (ipQuota && !ipQuota.allowed)) {
      const which = !chartQuota.allowed ? 'chart' : 'ip'
      console.warn(`[AXIS_QUOTA] refused scope=${which} section=${section}/${planetSection} ` +
        `chart=${chartQuota.used}/${chartQuota.max} ip=${ipQuota ? `${ipQuota.used}/${ipQuota.max}` : '-'}`)
      return NextResponse.json(
        {
          error: 'DAILY_QUOTA',
          message: which === 'chart'
            ? 'This chart has reached its reading limit for today. Anything already generated is saved — come back tomorrow for the rest.'
            : "You've reached today's reading limit from this connection. Anything already generated is saved — come back tomorrow for the rest.",
        },
        { status: 429, headers: { 'Retry-After': '3600', 'X-Axis-Quota': which } }
      )
    }

    // ── Global daily budget guard (only uncached, non-rate-limited requests reach here) ──
    // Hard cap on AI-backed reading calls per day across all instances/IPs.
    const budget = await readGlobalDailyBudget()
    if (!budget.allowed) {
      console.error(`[AXIS] Daily reading call cap reached: used ${budget.used} of ${budget.cap}`)
      return NextResponse.json(
        { error: "AXIS has reached today's reading limit. Please try again tomorrow." },
        { status: 503, headers: { 'X-Axis-Quota': 'global' } }
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
    // The natal request is assembled by the same builder the eval harness uses
    // (lib/reading-request.ts): chart block + context, the length clause rendered
    // from the band THIS chart is scored against, the repeated-phrase block, and
    // the reading so far as one cached block per earlier section. Synastry has no
    // thread and its own context block, so it is assembled here.
    let userContent:   string
    let userBlocks:    Anthropic.TextBlockParam[]
    let systemBlocks:  Anthropic.TextBlockParam[]
    let maxTokens:     number
    let band:          ReturnType<typeof wordBandFor>
    let aspectCount:   number
    let evidenceCount: number | undefined

    if (section === 'synastry') {
      const dualA      = calculateDualChart(birthA!, overrideA)
      const dualB      = calculateDualChart(birthB!, overrideB)
      const synData    = buildSynastryData(dualA, dualB)
      const synBlock   = formatSynastryBlock(synData, planetSection)
      // For composite-focused sections, append an elite chart block for the
      // composite so the model has dignity labels, chart ruler, and direction
      // — data the position table in formatSynastryBlock doesn't include.
      // Not when either birth time is unknown: that block leads with the
      // composite Ascendant, houses and chart ruler, which are then midpoints of
      // a noon placeholder — exactly what formatSynastryBlock withholds.
      const anglesKnown = !synastryTimeUnknown(synData).composite
      const contextBlock = anglesKnown && (planetSection === 'composite_chart' || planetSection === 'central_dynamic')
        ? `${synBlock}\n\nCOMPOSITE CHART — DIGNITY & CHART RULER:\n${formatEliteChartBlock(synData.composite, 'tropical')}`
        : synBlock
      aspectCount   = countAspectsInContext(contextBlock)
      evidenceCount = countPlanEvidence(contextBlock, planetSection) ?? undefined
      band          = wordBandFor(section, planetSection, aspectCount, evidenceCount)
      userContent   = `${contextBlock}\n\n---\n\n${renderSectionInstruction(section, planetSection, { aspectCount, evidenceCount })!}`
      userBlocks    = [{ type: 'text', text: userContent }]
      maxTokens     = maxTokensFor(planetSection)
      // Cache the per-section-type system prompt too: it is stable across every
      // request for a given section.
      systemBlocks  = [SHARED_RULES_BLOCK, { type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }]
    } else {
      const req = buildSectionRequest(dual!, section as NatalFrame, planetSection, prior)
      userContent   = req.userContent
      userBlocks    = req.params.messages[0].content
      systemBlocks  = req.params.system
      maxTokens     = req.params.max_tokens
      band          = req.band
      aspectCount   = req.aspectCount
      evidenceCount = req.evidenceCount
    }

    // ── Delivery mode ──────────────────────────────────────────────────────────
    // A section is BUFFERED only when something will actually inspect it before
    // the reader sees it — the deterministic pre-flight. Otherwise it STREAMS
    // token by token. The two must stay coupled: buffer ⇔ a check runs.
    //
    // The decision is made here, before the Response is returned, so it can be
    // sent as a header the client reads the instant fetch() resolves.
    const streamLive = !PREFLIGHT_ENABLED

    // ── Generation pipeline ────────────────────────────────────────────────────
    // One generation call per uncached section. There is NO LLM gate on this
    // path: the first pass is what the reader sees and what the cache keeps for
    // the full TTL, so a returning reader finds the same words. The only vetoes
    // are deterministic and free (firstPassCacheVerdict): truncated or
    // doctrine-breaching text is left uncached and regenerated next time.
    // The evaluator lives on offline, in `npm run eval -- --gate` / `rescore`.
    const encoder = new TextEncoder()

    const readable = new ReadableStream({
      async start(controller) {
        // Spend records for calls beyond the generation (a pre-flight rewrite).
        const extraRecords: Promise<void>[] = []

        // Reserve the generation call against the daily budget AS it is made.
        // Recording it afterwards left the counter lagging real spend, so
        // concurrent traffic could overshoot the cap by the number of requests
        // in flight. Reserving makes the counter a running total of calls STARTED,
        // which is the number the cap is supposed to bound. A reservation is never
        // refunded if the call then fails: a call that errors late can still have
        // billed, and over-counting is the safe direction.
        //
        // NOT awaited here. This is the reader's critical path and the write is a
        // round trip to Upstash — awaiting it would put that latency in front of
        // every one of the ~21 sequential sections to buy nothing, since the write
        // only has to land before the invocation ends. Both exits below await the
        // promise inside after(), which is what guarantees it is flushed while the
        // platform still holds the instance alive.
        const reservation = recordModelCalls(1).catch(() => { /* best-effort */ })

        // One generation attempt. With `live`, each delta is enqueued as it
        // arrives; otherwise the section is buffered so a pre-serve check can see
        // all of it before the reader sees any of it. A pre-flight rewrite is
        // never live — it only runs in buffered mode.
        const generate = async (extraTurn?: string, live = false) => {
          const content = extraTurn
            ? [...userBlocks, { type: 'text' as const, text: extraTurn }]
            : userBlocks
          const stream = anthropic.messages.stream({
            model:       MODEL,
            max_tokens:    maxTokens,
            thinking:      THINKING,
            output_config: OUTPUT_CONFIG,
            system:      systemBlocks,
            messages:    [{ role: 'user', content }],
          })
          let text = ''
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
              text += event.delta.text
              // Guarded: a reader who navigated away has closed the controller,
              // and the generation (already billed) must still finish, be
              // threaded, and reach the cache.
              if (live) {
                try { controller.enqueue(encoder.encode(event.delta.text)) } catch { /* closed */ }
              }
            }
          }
          const message = await stream.finalMessage()
          logUsage(`${section}/${planetSection}`, extraTurn ? 'preflight-rewrite' : 'generate', MODEL, message.usage, {
            stop: message.stop_reason ?? 'none', prior: prior.length,
          })
          return { text, message }
        }

        try {
          // First pass.
          let { text: firstText, message: firstMessage } = await generate(undefined, streamLive)
          let truncated = firstMessage.stop_reason === 'max_tokens'

          // ── DETERMINISTIC PRE-FLIGHT ─────────────────────────────────────
          // The reader has not seen a character yet, so a fault caught here is
          // a fault they never meet. Pure checks, microseconds, no model call.
          // At most ONE targeted regeneration, and only when something hard
          // tripped — so the extra call is paid on the sections that need it
          // rather than on all of them, which is what makes this cheaper than
          // the evaluator it sits in front of.
          //
          // Truncated output is excluded: regenerating hits the same token
          // ceiling, so it ships with its marker as before.
          if (PREFLIGHT_ENABLED && !truncated && firstText.trim()) {
            const first = preflightSection({ text: firstText, chartContext: userContent, section, planetSection, band })
            if (first.findings.length === 0) {
              console.log(formatPreflightLog(`${section}/${planetSection}`, first, 'clean'))
            } else if (Date.now() - startedAt > PREFLIGHT_REWRITE_DEADLINE_MS) {
              // No room to rewrite and still finish inside maxDuration. Serving
              // the first pass late beats serving nothing.
              console.log(formatPreflightLog(`${section}/${planetSection}`, first, 'skipped-no-budget'))
            } else {
              // Reserved as the call is made, exactly once.
              extraRecords.push(recordModelCalls(1).catch(() => { /* best-effort */ }))
              try {
                const retry = await generate(first.instruction)
                if (!retry.text.trim()) {
                  // An empty rewrite has no findings, so it would otherwise win
                  // `pickBetter` outright and the reader would be served nothing
                  // at all. Treated as a failed call: keep what we have.
                  console.log(formatPreflightLog(`${section}/${planetSection}`, first, 'rewrite-empty-kept-first'))
                } else if (retry.message.stop_reason === 'max_tokens') {
                  // The rewrite ran long. Keep the first pass, which did not.
                  console.log(formatPreflightLog(`${section}/${planetSection}`, first, 'rewrite-truncated-kept-first'))
                } else {
                  const second = preflightSection({ text: retry.text, chartContext: userContent, section, planetSection, band })
                  const chosen = pickBetter(
                    { text: firstText,  findings: first.findings },
                    { text: retry.text, findings: second.findings },
                  )
                  if (chosen.kept === 'second') {
                    firstText    = retry.text
                    firstMessage = retry.message
                    truncated    = false
                  }
                  console.log(formatPreflightLog(
                    `${section}/${planetSection}`, first,
                    `rewrote-${first.findings.length}to${second.findings.length}-kept-${chosen.kept}`,
                  ))
                }
              } catch (rewriteErr) {
                // A failed rewrite must never cost the reader the section they
                // already have. Serve the first pass and move on.
                console.error(`[AXIS_PREFLIGHT] section=${section}/${planetSection} rewrite failed:`, rewriteErr)
              }
            }
          }

          const generatedWords = countWords(firstText)

          // Buffered mode: the whole section at once, now that it has been
          // checked. (Live mode already sent every delta as it arrived.)
          if (!streamLive) {
            try { controller.enqueue(encoder.encode(firstText)) } catch { /* closed */ }
          }

          // Truncated drafts ship with the marker so the client can surface it.
          // Guarded like the deltas above: if the reader has gone (navigated
          // away, cast another chart) the controller is already closed, and an
          // unguarded enqueue/close throws into the catch below — which logged a
          // false [AXIS_GEN_FAIL] and, worse, skipped the cache write for a
          // generation that had already been paid for in full.
          if (truncated) {
            try { controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]')) } catch { /* closed */ }
          }

          // Into the thread BEFORE close: the client requests the next section
          // the instant this stream ends, and that request must find this text.
          await remember(firstText)

          // The reader has the whole section from here on. Everything below only
          // decides what lands in the 30-day cache.
          try { controller.close() } catch { /* reader disconnected — still cache */ }

          // Post-response work — the cache write and the spend recording — is
          // registered with after() rather than run inline below the close.
          // after() guarantees the platform keeps the invocation alive until this
          // completes; work left inline after controller.close() can be dropped on
          // a runtime that freezes the instance the moment the response flushes.
          after(async () => {
            try {
              // ── Length telemetry ───────────────────────────────────────────
              // One greppable line per GENERATED section (cache hits return long
              // before here). It logs the SAME band the instruction's length
              // clause was rendered from, and the aspect / evidence counts that
              // scale it, so a section that ran long because the chart carried
              // more is distinguishable from one that overruns on every chart.
              console.log(
                `[AXIS_LEN] section=${section}/${planetSection} words=${generatedWords} ` +
                `band=${band.fullMin}-${band.fullMax} hardMax=${band.hardMax} ` +
                `aspects=${aspectCount} evidence=${evidenceCount ?? '-'} ` +
                `maxTokens=${maxTokens} stop=${firstMessage.stop_reason} prior=${prior.length}`
              )

              // Cache what the reader saw, unless a deterministic check vetoes it.
              const verdict = firstPassCacheVerdict(firstText, truncated)
              if (verdict.cache) {
                await setCachedReading(cacheKey, firstText)
              } else if (verdict.reason === 'doctrine-hit') {
                console.warn(`[AXIS_DOCTRINE_UNCACHED] section=${section}/${planetSection} hits=${verdict.hits.join('|')}`)
              }
            } catch (cacheErr) {
              console.error(
                `[AXIS_CACHE] section=${section}/${planetSection} post-response caching failed:`,
                cacheErr instanceof Error ? cacheErr.message : cacheErr
              )
            } finally {
              // Flush the spend records fired on the hot path.
              await reservation
              await Promise.all(extraRecords)
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
          // Nothing further to record: every call was reserved as it was
          // attempted. The reservations are still only flushed under after(),
          // for the same reason the success path flushes them there.
          after(async () => { await reservation; await Promise.all(extraRecords) })
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
        // Read by ReadingPanel the moment fetch() resolves, so it explains the
        // wait only on a section that really is held back for checking.
        'X-Axis-Delivery': streamLive ? 'stream' : 'buffered',
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
