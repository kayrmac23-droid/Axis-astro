// scripts/eval-readings.harness.ts
//
// The batch evaluation harness itself. Do not run this file directly — run
// `npm run eval` (scripts/eval-readings.mjs), which parses the flags, sets the
// opt-in, and launches it under vitest with scripts/eval-readings.vitest.config.ts.
// Usage and the output format are documented in the header of eval-readings.mjs.
//
// Why vitest: the production modules are TypeScript behind the `@/` alias, and
// astro-calc uses require() — vitest is the repo's only runner that loads them
// as-is (the same reason scripts/time-gate.test.ts rides it). The file is not
// named *.test.ts, so the ordinary `npm test` never collects it, and it skips
// itself unless AXIS_EVAL=1 (set only by the launcher).
//
// Fidelity rules, all mirroring /api/reading:
//   - the request is built by buildSectionRequest (pinned to the route by
//     eval-harness-parity.test.ts) from a chart computed by calculateDualChart on
//     birth data parsed by parseBirthDataInput, exactly as /api/calculate does;
//   - every section in NATAL_SECTION_ORDER, each written after the FIRST-PASS
//     text of every earlier section (priorSectionsFor), never the gate's repair —
//     the thread holds what the reader saw;
//   - unknown birth time: ascendant/lagna are the deterministic notice, no call;
//   - generation is messages.stream + finalMessage with the production MODEL,
//     THINKING and MAX_TOKENS_PER_SECTION (no sampling params);
//   - --gate runs the real gateForCache with the route's inputs, including the
//     wall-clock origin at the start of the section, so its 95s/70s budget guards
//     behave as in production. As in production the gate runs in the background
//     while the next section generates.
// Pluto is the local Meeus fallback (no JPL call): the route only uses JPL when
// the client forwards it, and an offline harness keeps runs reproducible.
import { describe, it, expect, vi } from 'vitest'
import { AsyncLocalStorage } from 'node:async_hooks'
import { appendFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { execSync } from 'node:child_process'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, type DualChartData, type PlanetPosition } from '@/lib/astro-calc'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { isNearStation, cuspNeighbour, currentDashaKey } from '@/lib/interpretation-engine'
import { countPlanEvidence, wordBandFor } from '@/lib/prompts'
import { gateForCache, countWords, countAspectsInContext, scoreLength, type GateScores } from '@/lib/reading-quality-gate'
import { NATAL_SECTION_ORDER, priorSectionsFor } from '@/lib/reading-order'
import type { PriorSection } from '@/lib/reading-thread'
import { READING_PROMPT_VERSION } from '@/lib/reading-cache'
import { classifyGenerationError } from '@/lib/reading-stream'
import { MODEL } from '@/lib/reading-model-config'
import { getAnthropicKey, isAnthropicKeyConfigured } from '@/lib/env'
import { logUsage, type ModelCallKind } from '@/lib/usage-log'
import { unknownTimeAngleNotice } from '@/lib/unknown-time-notice'
import { buildSectionRequest, type NatalFrame } from './eval-readings.request'

// ── Usage capture ─────────────────────────────────────────────────────────────
// Every model call the route makes — the generation and each gate call — goes
// through logUsage with the API's own usage object. Wrapping it is how the harness
// records the gate's calls without reaching inside gateForCache. Each record lands
// in the section that is current in the AsyncLocalStorage context, which follows
// the background gate promise, so concurrent sections never mix their calls.
const usageSink = vi.hoisted(() => ({
  record: null as null | ((call: ModelCallKind, model: string, usage: Anthropic.Usage | null | undefined, extra: Record<string, string | number>) => void),
}))
vi.mock('@/lib/usage-log', async importOriginal => {
  const actual = await importOriginal<typeof import('@/lib/usage-log')>()
  return {
    ...actual,
    logUsage: (...args: Parameters<typeof actual.logUsage>) => {
      usageSink.record?.(args[1], args[2], args[3], args[4] ?? {})
      if (process.env.AXIS_EVAL_VERBOSE === '1') actual.logUsage(...args)
    },
  }
})

// ── Config (from the launcher) ────────────────────────────────────────────────
type Mode = 'generate' | 'gate' | 'dry-run' | 'verify'
const MODE        = (process.env.AXIS_EVAL_MODE ?? 'generate') as Mode
const ROOT        = resolve(__dirname, '..')
const CHARTS_FILE = resolve(ROOT, process.env.AXIS_EVAL_CHARTS_FILE ?? 'scripts/eval-charts.json')
const ONLY        = (process.env.AXIS_EVAL_CHARTS ?? '').split(',').map(s => s.trim()).filter(Boolean)
const THROUGH     = (process.env.AXIS_EVAL_THROUGH ?? 'synthesis') as NatalFrame
const CONCURRENCY = Math.max(1, Number(process.env.AXIS_EVAL_CONCURRENCY ?? 1) || 1)
const SAVE_PROMPTS = process.env.AXIS_EVAL_SAVE_PROMPTS === '1'
const NEEDS_API   = MODE === 'generate' || MODE === 'gate'
// The opt-in. Without it (an ordinary vitest invocation) the suite is skipped;
// with it but without a real key, it fails loudly below rather than skipping —
// a silent skip would read as a clean run.
const ENABLED     = process.env.AXIS_EVAL === '1'

const FRAMES: NatalFrame[] = ['tropical', 'sidereal', 'synthesis']

// List prices, USD per million tokens (Anthropic first-party API, 2026-10). Every
// cache_control in the pipeline is the default 5-minute ephemeral breakpoint:
// cache writes bill at 1.25× input, cache reads at 0.1× input. A model missing
// from this table reports usd: null rather than a guessed number — add it here.
const PRICES: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5': { input: 2, output: 10 },
  'claude-opus-5':   { input: 5, output: 25 },
}

// ── Types ─────────────────────────────────────────────────────────────────────
interface ChartSpec {
  id:       string
  axis:     string
  birth:    Record<string, unknown>
  expect?:  Expectations
  verified?: string
}
interface Expectations {
  birthTimeUnknown?:   boolean
  sunWithinDegOfCusp?: number
  stellium?:           { frame: 'tropical' | 'sidereal'; sign: string; min: number }
  absLatitudeAtLeast?: number
  absLatitudeAtMost?:  number
  minRetrograde?:      number
  nearStation?:        string
  yearBefore?:         number
}

interface CallRecord {
  run_id: string; chart_id: string; section: string; planet_section: string
  call: ModelCallKind; model: string
  input: number; cache_read: number; cache_write: number; output: number
  stop: string; usd: number | null
}

interface TokenTotals { calls: number; input: number; cache_read: number; cache_write: number; output: number; usd: number | null }

interface SectionRecord {
  run_id: string; mode: Mode; chart_id: string; axis: string
  order: number; section: NatalFrame; planet_section: string; prior_sections: number
  kind: 'model' | 'deterministic' | 'dry-run' | 'error'
  // Length, scored exactly as the gate scores it.
  words: number | null; band_min: number; band_max: number; hard_min: number; hard_max: number
  aspects: number; plan_evidence: number | null
  length_score: number | null; length_status: 'under-hard' | 'under' | 'in' | 'over' | 'runaway' | null
  // Generation.
  max_tokens: number | null; stop_reason: string | null; truncated: boolean | null
  gen_ms: number | null; error: string | null; error_fatal: boolean | null
  prompt_chars: number | null
  // Gate (--gate only; all null otherwise).
  gate_reason: string | null
  first_pass_clean: boolean | null      // passed the gate with no repair (reason === 'passed')
  first_pass_rubric_pass: boolean | null
  first_pass_scores: GateScores | null
  first_pass_critique: string | null
  final_scores: GateScores | null
  repair_attempted: boolean | null
  repaired: boolean | null
  cached: boolean | null
  repair_failed: boolean | null          // a repair was attempted and nothing was cached
  gate_model_calls: number | null
  gate_ms: number | null
  // Every model call this section made, by model.
  tokens: Record<string, TokenTotals>
  usd: number | null
}

interface SectionScope { calls: CallRecord[]; chartId: string; section: string; planetSection: string }
const scope = new AsyncLocalStorage<SectionScope>()

// ── Helpers ───────────────────────────────────────────────────────────────────
function priceOf(model: string, u: { input: number; cache_read: number; cache_write: number; output: number }): number | null {
  const p = PRICES[model]
  if (!p) return null
  return (u.input * p.input + u.cache_write * p.input * 1.25 + u.cache_read * p.input * 0.1 + u.output * p.output) / 1e6
}

function addTotals(into: Record<string, TokenTotals>, calls: CallRecord[]): void {
  for (const c of calls) {
    const t = into[c.model] ??= { calls: 0, input: 0, cache_read: 0, cache_write: 0, output: 0, usd: 0 }
    t.calls++; t.input += c.input; t.cache_read += c.cache_read; t.cache_write += c.cache_write; t.output += c.output
    t.usd = t.usd == null || c.usd == null ? null : t.usd + c.usd
  }
}

function sumUsd(totals: Record<string, TokenTotals>): number | null {
  let usd = 0
  for (const t of Object.values(totals)) { if (t.usd == null) return null; usd += t.usd }
  return usd
}

function lengthStatus(words: number, band: ReturnType<typeof wordBandFor>, score: number): SectionRecord['length_status'] {
  if (words >= band.fullMin && words <= band.fullMax) return 'in'
  if (words < band.hardMin) return 'under-hard'
  if (words < band.fullMin) return 'under'
  return score === 1 ? 'runaway' : 'over'
}

function say(line: string): void { process.stdout.write(`${line}\n`) }

function gitInfo(): { sha: string | null; dirty: boolean | null } {
  try {
    const sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim()
    const dirty = execSync('git status --porcelain', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim().length > 0
    return { sha, dirty }
  } catch { return { sha: null, dirty: null } }
}

function loadCharts(): ChartSpec[] {
  const all = (JSON.parse(readFileSync(CHARTS_FILE, 'utf8')) as { charts: ChartSpec[] }).charts
  if (ONLY.length === 0) return all
  const unknown = ONLY.filter(id => !all.some(c => c.id === id))
  if (unknown.length) throw new Error(`Unknown chart id(s): ${unknown.join(', ')}. Known: ${all.map(c => c.id).join(', ')}`)
  return all.filter(c => ONLY.includes(c.id))
}

function castChart(spec: ChartSpec): DualChartData {
  // Same parser and tz resolution as /api/calculate (resolveTzName defaults on).
  const parsed = parseBirthDataInput(spec.birth, { label: spec.id })
  if (!parsed.ok) throw new Error(parsed.error)
  return calculateDualChart(parsed.data)
}

const pad = (n: number) => String(n).padStart(2, '0')
const fmt = (deg: number) => `${Math.floor(deg)}°${pad(Math.floor((deg % 1) * 60))}′`

// ── --verify: does each chart still hit its axis? ─────────────────────────────
const NODES = new Set(['Rahu', 'Ketu'])

function cuspDistance(p: { degree: number }): number { return Math.min(p.degree, 30 - p.degree) }

function verifyChart(spec: ChartSpec, dual: DualChartData): string[] {
  const t = dual.tropical
  const failures: string[] = []
  const e = spec.expect ?? {}
  const sun = t.planets.find(p => p.name === 'Sun')!
  const planets = t.planets.filter(p => !NODES.has(p.name))
  const retro = planets.filter(p => p.retrograde)
  const lat = Number(spec.birth.latitude)

  if (e.birthTimeUnknown !== undefined && dual.birthData.birthTimeUnknown !== e.birthTimeUnknown) failures.push(`birthTimeUnknown is ${dual.birthData.birthTimeUnknown}`)
  if (e.sunWithinDegOfCusp !== undefined && cuspDistance(sun) > e.sunWithinDegOfCusp) failures.push(`Sun is ${cuspDistance(sun).toFixed(2)}° from a cusp`)
  if (e.stellium) {
    const n = dual[e.stellium.frame].planets.filter(p => !NODES.has(p.name) && p.sign === e.stellium!.sign).length
    if (n < e.stellium.min) failures.push(`${n} planets in ${e.stellium.frame} ${e.stellium.sign}, wanted ≥${e.stellium.min}`)
  }
  if (e.absLatitudeAtLeast !== undefined && Math.abs(lat) < e.absLatitudeAtLeast) failures.push(`|lat| ${Math.abs(lat)} < ${e.absLatitudeAtLeast}`)
  if (e.absLatitudeAtMost !== undefined && Math.abs(lat) > e.absLatitudeAtMost) failures.push(`|lat| ${Math.abs(lat)} > ${e.absLatitudeAtMost}`)
  if (e.minRetrograde !== undefined && retro.length < e.minRetrograde) failures.push(`${retro.length} retrograde planets, wanted ≥${e.minRetrograde}`)
  if (e.nearStation !== undefined && !t.planets.some(p => p.name === e.nearStation && isNearStation(p))) failures.push(`${e.nearStation} is not near station`)
  if (e.yearBefore !== undefined && dual.birthData.year >= e.yearBefore) failures.push(`year ${dual.birthData.year} ≥ ${e.yearBefore}`)

  const row = (p: PlanetPosition) => `${p.name} ${p.sign} ${fmt(p.degree)}${p.retrograde ? ' R' : ''}${isNearStation(p) ? ' STATION' : ''}`
  say(`\n■ ${spec.id} — ${spec.axis}`)
  say(`  tz ${dual.birthData.timezone} (${dual.birthData.tzName ?? 'no tzName'}) · Pluto ${dual.plutoSource} · ayanamsa ${dual.ayanamsa.toFixed(2)}° · dasha ${currentDashaKey(dual) || 'n/a'}`)
  say(`  TROPICAL  ASC ${t.ascendantSign} ${fmt(t.ascendantDegree)} · MC ${t.midheavenSign} ${fmt(t.midheavenDegree)}`)
  say(`            ${t.planets.map(row).join(' | ')}`)
  say(`  SIDEREAL  Lagna ${dual.sidereal.ascendantSign} ${fmt(dual.sidereal.ascendantDegree)} · ${dual.sidereal.planets.filter(p => ['Sun', 'Moon'].includes(p.name)).map(row).join(' | ')}`)

  // Incidental features, for every chart, so one axis can be told from another.
  const notes: string[] = []
  const cusps = t.planets.filter(p => cuspNeighbour(p.sign, p.degree)).map(p => p.name)
  if (cusps.length) notes.push(`within 3° of a cusp: ${cusps.join(', ')}`)
  if (retro.length) notes.push(`${retro.length} retrograde: ${retro.map(p => p.name).join(', ')}`)
  const stations = t.planets.filter(isNearStation).map(p => p.name)
  if (stations.length) notes.push(`near station: ${stations.join(', ')}`)
  const bySign = new Map<string, number>()
  for (const p of planets) bySign.set(p.sign, (bySign.get(p.sign) ?? 0) + 1)
  for (const [sign, n] of Array.from(bySign)) if (n >= 4) notes.push(`${n} planets in ${sign}`)
  // The MC normally falls in whole-sign house 9–11 (ASC ~60–120° past it).
  // Inside the polar circles the computed angles can leave that range entirely.
  const ascPastMc = (t.ascendant - t.midheaven + 360) % 360
  const mcWholeSign = ((Math.floor(t.midheaven / 30) - Math.floor(t.ascendant / 30) + 12) % 12) + 1
  if (mcWholeSign < 9) notes.push(`MC in whole-sign house ${mcWholeSign} (ASC ${ascPastMc.toFixed(0)}° past the MC)`)
  if (dual.birthData.birthTimeUnknown) {
    const moon = t.planets.find(p => p.name === 'Moon')!
    const halfDay = Math.abs(moon.dailyMotion) / 2
    if (cuspDistance(moon) < halfDay) notes.push(`Moon ${cuspDistance(moon).toFixed(2)}° from a cusp but moves ±${halfDay.toFixed(1)}° across the day — Moon sign unresolved without a birth time`)
  }
  if (notes.length) say(`  also: ${notes.join(' · ')}`)
  say(`  axis check: ${failures.length ? `FAIL — ${failures.join('; ')}` : Object.keys(e).length ? 'ok' : 'none (control)'}`)
  return failures
}

// ── One chart, read end to end ───────────────────────────────────────────────
interface RunCtx {
  runId: string
  outDir: string
  anthropic: Anthropic | null
  aborted: { reason: string | null }
}

async function readChart(ctx: RunCtx, spec: ChartSpec): Promise<SectionRecord[]> {
  const dual = castChart(spec)
  const unknownTime = dual.birthData.birthTimeUnknown === true
  const chartDir = join(ctx.outDir, spec.id)
  mkdirSync(chartDir, { recursive: true })

  // The reading thread: what the reader has read, keyed frame/planetSection.
  const thread = new Map<string, string>()
  const records: SectionRecord[] = []
  const scopes = new Map<SectionRecord, SectionScope>()
  const pendingGates: Promise<void>[] = []
  let order = 0

  const frames = FRAMES.slice(0, FRAMES.indexOf(THROUGH) + 1)
  for (const section of frames) {
    for (const planetSection of NATAL_SECTION_ORDER[section] as readonly string[]) {
      if (ctx.aborted.reason) break
      order++
      const label = `${section}/${planetSection}`
      const fileStem = join(chartDir, `${pad(order)}-${section}-${planetSection}`)

      const prior: PriorSection[] = priorSectionsFor(section, planetSection).flatMap(ref => {
        const text = thread.get(`${ref.section}/${ref.planetSection}`)
        return text && text.trim() ? [{ ...ref, text }] : []
      })

      const rec: SectionRecord = {
        run_id: ctx.runId, mode: MODE, chart_id: spec.id, axis: spec.axis,
        order, section, planet_section: planetSection, prior_sections: prior.length,
        kind: 'model', words: null, band_min: 0, band_max: 0, hard_min: 0, hard_max: 0,
        aspects: 0, plan_evidence: null, length_score: null, length_status: null,
        max_tokens: null, stop_reason: null, truncated: null, gen_ms: null, error: null, error_fatal: null,
        prompt_chars: null,
        gate_reason: null, first_pass_clean: null, first_pass_rubric_pass: null, first_pass_scores: null,
        first_pass_critique: null, final_scores: null, repair_attempted: null, repaired: null, cached: null,
        repair_failed: null, gate_model_calls: null, gate_ms: null, tokens: {}, usd: null,
      }

      // Unknown birth time: the route returns the deterministic notice, no model call.
      if (unknownTime && (planetSection === 'ascendant' || planetSection === 'lagna')) {
        const notice = unknownTimeAngleNotice(planetSection)
        thread.set(label, notice)
        writeFileSync(`${fileStem}.md`, notice)
        Object.assign(rec, { kind: 'deterministic', words: countWords(notice), usd: 0 })
        records.push(rec)
        say(`[${spec.id}] ${label.padEnd(26)} deterministic unknown-time notice`)
        continue
      }

      const req = buildSectionRequest(dual, section, planetSection, prior)
      const aspects  = countAspectsInContext(req.userContent)
      const evidence = countPlanEvidence(req.userContent, planetSection)
      const band     = wordBandFor(section, planetSection, aspects, evidence ?? undefined)
      Object.assign(rec, {
        aspects, plan_evidence: evidence, band_min: band.fullMin, band_max: band.fullMax,
        hard_min: band.hardMin, hard_max: band.hardMax, max_tokens: req.params.max_tokens,
        prompt_chars: [...req.params.system, ...req.params.messages[0].content].reduce((n, b) => n + b.text.length, 0),
      })
      if (SAVE_PROMPTS) {
        const dump = [
          ...req.params.system.map((b, i) => `════ SYSTEM ${i + 1}${b.cache_control ? ' [cache]' : ''} ════\n${b.text}`),
          ...req.params.messages[0].content.map((b, i) => `════ USER ${i + 1}${b.cache_control ? ' [cache]' : ''} ════\n${b.text}`),
        ].join('\n\n')
        writeFileSync(`${fileStem}.prompt.txt`, dump)
      }

      const sectionScope: SectionScope = { calls: [], chartId: spec.id, section, planetSection }
      await scope.run(sectionScope, async () => {
        if (MODE === 'dry-run') {
          const text = `## ${label}\n\n[dry-run placeholder — no model call was made for this section.]`
          thread.set(label, text)
          rec.kind = 'dry-run'
          say(`[${spec.id}] ${label.padEnd(26)} dry-run · prior=${prior.length} · prompt ${rec.prompt_chars} chars · band ${band.fullMin}–${band.fullMax} · aspects=${aspects}`)
          return
        }

        // ── Generation: the call the reader waits on ─────────────────────────
        const startedAt = Date.now()
        let firstText = ''
        let finalMessage: Anthropic.Message
        try {
          const stream = ctx.anthropic!.messages.stream(req.params)
          for await (const event of stream) {
            if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') firstText += event.delta.text
          }
          finalMessage = await stream.finalMessage()
        } catch (err) {
          const { fatal, code } = classifyGenerationError(err)
          Object.assign(rec, {
            kind: 'error', gen_ms: Date.now() - startedAt, error_fatal: fatal,
            error: `${code}: ${err instanceof Error ? err.message : String(err)}`,
          })
          // Production leaves a failed section out of the thread; so does this.
          if (fatal) ctx.aborted.reason = `fatal generation error on ${spec.id} ${label} (${code}) — every later call would fail the same way`
          say(`[${spec.id}] ${label.padEnd(26)} GENERATION FAILED fatal=${fatal} ${rec.error}`)
          return
        }
        logUsage(label, 'generate', MODEL, finalMessage.usage, { stop: finalMessage.stop_reason ?? 'none', prior: prior.length })
        const truncated = finalMessage.stop_reason === 'max_tokens'
        thread.set(label, firstText)

        const words = countWords(firstText)
        const lengthScore = scoreLength(words, band)
        Object.assign(rec, {
          words, length_score: lengthScore, length_status: lengthStatus(words, band, lengthScore),
          stop_reason: finalMessage.stop_reason, truncated, gen_ms: Date.now() - startedAt,
        })
        writeFileSync(`${fileStem}.md`, truncated ? `${firstText}\n\n[AXIS_TRUNCATED]` : firstText)
        say(`[${spec.id}] ${label.padEnd(26)} ${String(words).padStart(5)}w band ${band.fullMin}–${band.fullMax} (${rec.length_status}) stop=${finalMessage.stop_reason} ${(rec.gen_ms! / 1000).toFixed(1)}s`)

        if (MODE !== 'gate') return

        // ── Gate: in the background, as after() runs it in production ────────
        pendingGates.push((async () => {
          const gateStart = Date.now()
          const verdict = await gateForCache({
            firstPassText: firstText,
            truncated,
            chartContext:  req.userContent,
            priorBlocks:   req.priorBlocks,
            section,
            planetSection,
            systemBlocks:  req.params.system,
            maxTokens:     req.params.max_tokens,
            model:         MODEL,
            startedAt,
          })
          const repairAttempted = sectionScope.calls.some(c => c.call === 'repair' || c.call === 'doctrine-repair')
          Object.assign(rec, {
            gate_reason: verdict.reason,
            first_pass_clean: verdict.reason === 'passed',
            first_pass_rubric_pass: verdict.firstPass ? verdict.firstPass.rubricPass && !verdict.firstPass.evaluatorErrored : null,
            first_pass_scores: verdict.firstPass?.scores ?? null,
            first_pass_critique: verdict.firstPass?.critique || null,
            final_scores: verdict.scores,
            repair_attempted: repairAttempted,
            repaired: verdict.repaired,
            cached: verdict.cacheText !== null,
            repair_failed: repairAttempted && verdict.cacheText === null,
            gate_model_calls: verdict.modelCalls,
            gate_ms: Date.now() - gateStart,
          })
          if (verdict.cacheText !== null && verdict.cacheText !== firstText) writeFileSync(`${fileStem}.cached.md`, verdict.cacheText)
          say(`[${spec.id}] ${label.padEnd(26)} gate=${verdict.reason}${repairAttempted ? ' (repair attempted)' : ''} calls=${verdict.modelCalls} ${(rec.gate_ms! / 1000).toFixed(1)}s`)
        })())
      })

      // Token totals are filled in once the section's gate (if any) settles.
      records.push(rec)
      scopes.set(rec, sectionScope)
    }
  }

  await Promise.all(pendingGates)

  // Appended per chart, so a run that dies part-way keeps every finished chart.
  for (const rec of records) {
    const s = scopes.get(rec)
    if (s) {
      addTotals(rec.tokens, s.calls)
      rec.usd = sumUsd(rec.tokens)
      for (const c of s.calls) appendFileSync(join(ctx.outDir, 'calls.jsonl'), JSON.stringify(c) + '\n')
    }
    appendFileSync(join(ctx.outDir, 'sections.jsonl'), JSON.stringify(rec) + '\n')
  }
  return records
}

// ── Aggregation ───────────────────────────────────────────────────────────────
function rate(n: number, d: number): number | null { return d === 0 ? null : Math.round((n / d) * 1000) / 1000 }

function aggregate(records: SectionRecord[]) {
  const generated = records.filter(r => r.kind === 'model')
  const gated     = generated.filter(r => r.gate_reason !== null)
  const repairs   = gated.filter(r => r.repair_attempted)
  const reasons: Record<string, number> = {}
  for (const r of gated) reasons[r.gate_reason!] = (reasons[r.gate_reason!] ?? 0) + 1

  // Per-criterion first-pass distribution: which criterion is doing the failing.
  const criteria: Record<string, { n: number; mean: number; below_3: number }> = {}
  for (const r of gated) {
    if (!r.first_pass_scores) continue
    for (const [k, v] of Object.entries(r.first_pass_scores)) {
      const c = criteria[k] ??= { n: 0, mean: 0, below_3: 0 }
      c.mean = (c.mean * c.n + v) / (c.n + 1); c.n++
      if (v < 3) c.below_3++
    }
  }
  for (const c of Object.values(criteria)) c.mean = Math.round(c.mean * 100) / 100

  const tokens: Record<string, TokenTotals> = {}
  for (const r of records) for (const [model, t] of Object.entries(r.tokens)) {
    const into = tokens[model] ??= { calls: 0, input: 0, cache_read: 0, cache_write: 0, output: 0, usd: 0 }
    into.calls += t.calls; into.input += t.input; into.cache_read += t.cache_read; into.cache_write += t.cache_write; into.output += t.output
    into.usd = into.usd == null || t.usd == null ? null : into.usd + t.usd
  }

  const withWords = generated.filter(r => r.words != null)
  return {
    sections:           records.length,
    generated:          generated.length,
    deterministic:      records.filter(r => r.kind === 'deterministic').length,
    generation_errors:  records.filter(r => r.kind === 'error').length,
    truncated:          generated.filter(r => r.truncated).length,
    truncated_rate:     rate(generated.filter(r => r.truncated).length, generated.length),
    length: {
      in_band_rate:     rate(withWords.filter(r => r.length_status === 'in').length, withWords.length),
      over_band_rate:   rate(withWords.filter(r => r.length_status === 'over' || r.length_status === 'runaway').length, withWords.length),
      runaway_rate:     rate(withWords.filter(r => r.length_status === 'runaway').length, withWords.length),
      under_band_rate:  rate(withWords.filter(r => r.length_status === 'under' || r.length_status === 'under-hard').length, withWords.length),
      mean_words_over_band_max: withWords.length
        ? Math.round(withWords.reduce((n, r) => n + r.words! / r.band_max, 0) / withWords.length * 100) / 100 : null,
    },
    gate: gated.length === 0 ? null : {
      gated:                     gated.length,
      first_pass_pass_rate:      rate(gated.filter(r => r.first_pass_clean).length, gated.length),
      first_pass_rubric_pass_rate: rate(gated.filter(r => r.first_pass_rubric_pass).length, gated.length),
      evaluator_errored:         gated.filter(r => r.gate_reason === 'passed-evaluator-errored').length,
      repair_rate:               rate(repairs.length, gated.length),
      repair_failed_rate:        rate(repairs.filter(r => r.repair_failed).length, repairs.length),
      repair_failed_of_gated:    rate(repairs.filter(r => r.repair_failed).length, gated.length),
      uncached_rate:             rate(gated.filter(r => !r.cached).length, gated.length),
      reasons,
      first_pass_criteria:       criteria,
    },
    tokens,
    usd: sumUsd(tokens),
  }
}

function groupBy(records: SectionRecord[], key: (r: SectionRecord) => string) {
  const groups = new Map<string, SectionRecord[]>()
  for (const r of records) groups.set(key(r), [...(groups.get(key(r)) ?? []), r])
  return Object.fromEntries(Array.from(groups).map(([k, rs]) => [k, aggregate(rs)]))
}

const CSV_COLUMNS: (keyof SectionRecord)[] = [
  'run_id', 'mode', 'chart_id', 'axis', 'order', 'section', 'planet_section', 'prior_sections', 'kind',
  'words', 'band_min', 'band_max', 'hard_min', 'hard_max', 'aspects', 'plan_evidence', 'length_score', 'length_status',
  'max_tokens', 'stop_reason', 'truncated', 'gen_ms', 'error', 'prompt_chars',
  'gate_reason', 'first_pass_clean', 'first_pass_rubric_pass', 'repair_attempted', 'repaired', 'cached', 'repair_failed',
  'gate_model_calls', 'gate_ms', 'usd',
]

function writeCsv(path: string, records: SectionRecord[]): void {
  const criteria = Array.from(new Set(records.flatMap(r => Object.keys(r.first_pass_scores ?? {}))))
  const models   = Array.from(new Set(records.flatMap(r => Object.keys(r.tokens))))
  const header = [
    ...CSV_COLUMNS,
    ...criteria.map(c => `fp_${c}`), ...criteria.map(c => `final_${c}`),
    ...models.flatMap(m => ['calls', 'input', 'cache_read', 'cache_write', 'output'].map(f => `${m}_${f}`)),
  ]
  const cell = (v: unknown) => {
    if (v === null || v === undefined) return ''
    const s = String(v)
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
  }
  const rows = records.map(r => [
    ...CSV_COLUMNS.map(k => r[k]),
    ...criteria.map(c => r.first_pass_scores?.[c as keyof GateScores]),
    ...criteria.map(c => r.final_scores?.[c as keyof GateScores]),
    ...models.flatMap((m): unknown[] => { const t = r.tokens[m]; return t ? [t.calls, t.input, t.cache_read, t.cache_write, t.output] : ['', '', '', '', ''] }),
  ].map(cell).join(','))
  writeFileSync(path, [header.join(','), ...rows].join('\n') + '\n')
}

function printSummary(summary: ReturnType<typeof aggregate>, perChart: Record<string, ReturnType<typeof aggregate>>, bySection: Record<string, ReturnType<typeof aggregate>>): void {
  const pct = (v: number | null | undefined) => v == null ? '  —  ' : `${(v * 100).toFixed(0).padStart(3)}%`
  say('\n══════════ SUMMARY ══════════')
  say(`sections ${summary.sections} · generated ${summary.generated} · deterministic ${summary.deterministic} · errors ${summary.generation_errors} · truncated ${summary.truncated} (${pct(summary.truncated_rate)})`)
  say(`length: in band ${pct(summary.length.in_band_rate)} · over ${pct(summary.length.over_band_rate)} (runaway ${pct(summary.length.runaway_rate)}) · under ${pct(summary.length.under_band_rate)} · mean words/band-max ${summary.length.mean_words_over_band_max ?? '—'}`)
  if (summary.gate) {
    const g = summary.gate
    say(`gate: first-pass pass ${pct(g.first_pass_pass_rate)} · repair ${pct(g.repair_rate)} · repair-failed ${pct(g.repair_failed_rate)} of repairs (${pct(g.repair_failed_of_gated)} of gated) · uncached ${pct(g.uncached_rate)} · evaluator errored ${g.evaluator_errored}`)
    say(`reasons: ${Object.entries(g.reasons).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k}=${v}`).join(' ')}`)
    say(`first-pass criteria (mean / #<3): ${Object.entries(g.first_pass_criteria).map(([k, c]) => `${k} ${c.mean}/${c.below_3}`).join(' · ')}`)
  }
  for (const [model, t] of Object.entries(summary.tokens)) {
    say(`tokens ${model}: ${t.calls} calls · in ${t.input} · cache_read ${t.cache_read} · cache_write ${t.cache_write} · out ${t.output}${t.usd == null ? '' : ` · $${t.usd.toFixed(2)}`}`)
  }
  if (summary.usd != null) say(`total ≈ $${summary.usd.toFixed(2)} at list price`)
  say('\nper chart:')
  for (const [id, a] of Object.entries(perChart)) {
    say(`  ${id.padEnd(30)} trunc ${pct(a.truncated_rate)} · over-band ${pct(a.length.over_band_rate)}${a.gate ? ` · first-pass ${pct(a.gate.first_pass_pass_rate)} · repair ${pct(a.gate.repair_rate)} · repair-failed ${pct(a.gate.repair_failed_rate)}` : ''}${a.usd != null ? ` · $${a.usd.toFixed(2)}` : ''}`)
  }
  say('\nper section (across charts):')
  for (const [key, a] of Object.entries(bySection)) {
    say(`  ${key.padEnd(26)} trunc ${pct(a.truncated_rate)} · over-band ${pct(a.length.over_band_rate)} · words/max ${a.length.mean_words_over_band_max ?? '—'}${a.gate ? ` · first-pass ${pct(a.gate.first_pass_pass_rate)} · repair-failed ${pct(a.gate.repair_failed_of_gated)} of gated` : ''}`)
  }
}

// ── Entry ─────────────────────────────────────────────────────────────────────
describe.skipIf(!ENABLED)('AXIS batch reading evaluation', () => {
  it(`${MODE}`, async () => {
    if (NEEDS_API && !isAnthropicKeyConfigured()) {
      throw new Error('ANTHROPIC_API_KEY is not set (or is a docs placeholder). Set a real key, or use --dry-run / --verify, which make no API calls.')
    }
    const charts = loadCharts()

    if (MODE === 'verify') {
      const failed = charts.filter(spec => verifyChart(spec, castChart(spec)).length > 0)
      say(`\n${charts.length - failed.length}/${charts.length} charts hit their axis${failed.length ? ` — FAILED: ${failed.map(c => c.id).join(', ')}` : ''}`)
      expect(failed.map(c => c.id)).toEqual([])
      return
    }

    if (MODE === 'gate' && process.env.AXIS_GATE_ENABLED === 'false') {
      throw new Error('AXIS_GATE_ENABLED=false is set: gateForCache would skip evaluation and the run would measure nothing. Unset it.')
    }

    const stamp = new Date().toISOString().replace(/[:.]/g, '-').replace('T', '_').slice(0, 19)
    const runId = `${stamp}_${MODE}`
    const outDir = resolve(ROOT, process.env.AXIS_EVAL_OUT ?? 'eval-output', runId)
    mkdirSync(outDir, { recursive: true })
    writeFileSync(join(outDir, 'sections.jsonl'), '')
    writeFileSync(join(outDir, 'calls.jsonl'), '')

    const startedAt = new Date().toISOString()
    const run = {
      run_id: runId, mode: MODE, started_at: startedAt, through: THROUGH, concurrency: CONCURRENCY,
      prompt_version: READING_PROMPT_VERSION, generation_model: MODEL, git: gitInfo(),
      charts: charts.map(c => ({ id: c.id, axis: c.axis })), prices_usd_per_mtok: PRICES,
    }
    writeFileSync(join(outDir, 'run.json'), JSON.stringify(run, null, 2))
    say(`AXIS eval ${runId} · ${charts.length} chart(s) · through ${THROUGH} · prompts ${READING_PROMPT_VERSION} · ${MODEL} · → ${outDir}`)

    const ctx: RunCtx = {
      runId, outDir, aborted: { reason: null },
      anthropic: NEEDS_API ? new Anthropic({ apiKey: getAnthropicKey() ?? undefined }) : null,
    }
    usageSink.record = (call, model, usage, extra) => {
      const s = scope.getStore()
      if (!s || !usage) return
      const u = {
        input: usage.input_tokens ?? 0, cache_read: usage.cache_read_input_tokens ?? 0,
        cache_write: usage.cache_creation_input_tokens ?? 0, output: usage.output_tokens ?? 0,
      }
      s.calls.push({
        run_id: runId, chart_id: s.chartId, section: s.section, planet_section: s.planetSection,
        call, model, ...u, stop: String(extra.stop ?? ''), usd: priceOf(model, u),
      })
    }

    // Charts in parallel up to CONCURRENCY; sections within a chart are sequential.
    const queue = [...charts]
    const records: SectionRecord[] = []
    const failures: string[] = []
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      for (let spec = queue.shift(); spec; spec = queue.shift()) {
        if (ctx.aborted.reason) break
        try {
          records.push(...await readChart(ctx, spec))
        } catch (err) {
          failures.push(`${spec.id}: ${err instanceof Error ? err.message : String(err)}`)
          say(`[${spec.id}] CHART FAILED — ${failures[failures.length - 1]}`)
        }
      }
    }))
    usageSink.record = null

    records.sort((a, b) => a.chart_id.localeCompare(b.chart_id) || a.order - b.order)
    const overall   = aggregate(records)
    const perChart  = groupBy(records, r => r.chart_id)
    const bySection = groupBy(records, r => `${r.section}/${r.planet_section}`)
    writeCsv(join(outDir, 'sections.csv'), records)
    writeFileSync(join(outDir, 'summary.json'), JSON.stringify({
      ...run, finished_at: new Date().toISOString(), aborted: ctx.aborted.reason, chart_failures: failures,
      overall, per_chart: perChart, per_section: bySection,
    }, null, 2))
    printSummary(overall, perChart, bySection)
    say(`\nwrote ${outDir}`)
    if (ctx.aborted.reason) say(`ABORTED: ${ctx.aborted.reason}`)
    expect(ctx.aborted.reason).toBeNull()
    expect(failures).toEqual([])
  })
})
