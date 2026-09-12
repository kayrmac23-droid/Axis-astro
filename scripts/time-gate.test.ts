// scripts/time-gate.test.ts
//
// TIMING HARNESS — not a unit test. Measures live-API wall-time for the
// synchronous quality-gate path (generation → eval → repair) on the heaviest
// sections (sun, moon @ their MAX_TOKENS_PER_SECTION value) against the route's
// declared maxDuration ceiling.
//
// WHY A VITEST FILE: the repo's only TS runner is vitest ("test": "vitest run").
// Rather than add tsx/ts-node as a dependency, this rides the existing runner.
// It is GATED behind an env flag so `npm test` never fires live API calls or
// spends money. Run it explicitly:
//
//   $env:RUN_TIME_GATE = "1"
//   $env:ANTHROPIC_API_KEY = "sk-..."      # if not already in shell/.env.local
//   npx vitest run scripts/time-gate.test.ts
//
// It calls the REAL production functions — no reconstructed prompts, no fixtures
// for the eval input. The generated text is fed to the REAL evaluateSection; a
// full-budget repair is then timed directly (option (b): repair wall-time is
// measured regardless of pass/fail, so the failing-path total is always known).
//
// DECISION RULE (write the result against this, do not rationalize after):
//   C            = declared maxDuration (route.ts:14, currently 120)
//   T_happy      = max(gen + eval)              over all runs   — passing section cost
//   T_fail       = max(gen + eval + repair)     over all runs   — failing section cost
//   The gate is launch-safe synchronously ONLY IF T_fail < C.
//     T_fail < C * 0.8  → fits with margin; keep-alive NOT needed
//     C*0.8 ≤ T_fail < C → fits thin; revive keep-alive/heartbeat
//     T_fail ≥ C        → sync does not fit; do NOT write the wiring prompt.
//                          Options in order: Haiku eval, then async, then raise C.
//   NOTE: with maxDuration = 120, T_fail is 3 Sonnet calls (two @ 2500 max_tokens).
//   If you intend to ship at a higher ceiling, BUMP maxDuration FIRST and test
//   against that value — measuring against a stale C while shipping at a higher
//   one is the wrong ceiling. See the console banner, which prints C read from source.

import { describe, it } from 'vitest'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'

// Results are written straight to a file (not just console.log) because
// Vitest's console-log capture does not reliably surface through a piped /
// non-TTY stdout, and this run is too expensive (real paid API calls) to
// risk losing the numbers to a reporter quirk. Read this file after the run.
const RESULTS_FILE = process.env.RUN_TIME_GATE_OUT || join(tmpdir(), 'axis-time-gate-result.json')

// Real production surface — every import is a symbol confirmed exported.
import { evaluateSection, repairSection } from '@/lib/reading-quality-gate'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { TROPICAL_SYSTEM_PROMPT, SHARED_RULES, SECTION_INSTRUCTIONS } from '@/lib/prompts'
import { calculateDualChart, type BirthData } from '@/lib/astro-calc'
import Anthropic from '@anthropic-ai/sdk'

// ── Config pulled from source, not memory ──────────────────────────────────
// These four mirror route.ts exactly. If any drifts from route.ts the number
// lies — so they are asserted against the route's own constants where possible.
const MODEL = 'claude-sonnet-4-6'        // route.ts:17
const TEMPERATURE = 0.2                   // route.ts:18
const SECTION = 'tropical' as const
const HEAVY_PLANET_SECTIONS = ['sun', 'moon'] as const
const RUNS_PER_SECTION = 3                 // fat-tail latency: worst run is what the ceiling cares about

// The route derives maxTokens as MAX_TOKENS_PER_SECTION[planetSection] ?? 2000.
// route.ts:25 sets sun: 2500, moon: 2500 — confirmed against the map body.
const MAX_TOKENS_HEAVY = 2500

// The route's declared ceiling, for the banner. route.ts:14 → maxDuration = 120.
const DECLARED_MAX_DURATION_S = 120

// A real, fixed birth used for every run so the payload is stable and comparable.
const BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: -37.8136, longitude: 144.9631, timezone: 10, // Melbourne
  tzName: 'Australia/Melbourne', birthTimeUnknown: false,
}

// Build the exact user content the route builds for a tropical section.
// Mirrors route.ts:  `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
function buildUserContent(planetSection: string): string {
  const dual = calculateDualChart(BIRTH, undefined) // route passes plutoOverride; undefined = local Meeus fallback, fine for timing
  const ctxBlock = buildInterpretationContext(dual, 'tropical', planetSection)
  const chartBlock = formatEliteChartBlock(dual.tropical, 'tropical')
  const sectionInstruction = SECTION_INSTRUCTIONS[SECTION]?.[planetSection]
  if (!sectionInstruction) throw new Error(`no SECTION_INSTRUCTIONS[${SECTION}][${planetSection}]`)
  return `${chartBlock}\n${ctxBlock}\n\n---\n\n${sectionInstruction}`
}

// The exact system blocks the route builds (route.ts:314–317).
// NOTE: SHARED_RULES_BLOCK carries NO cache_control in the route; only the
// section prompt does. Mirrored here so cache behaviour matches production.
function buildSystemBlocks(): Anthropic.TextBlockParam[] {
  return [
    { type: 'text', text: SHARED_RULES },
    { type: 'text', text: TROPICAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
  ]
}

// The chartContext evaluateSection expects is the same context block the reading
// was generated from. The route builds userContent = chart + ctx + instruction;
// eval wants the CHART CONTEXT specifically — confirmed against
// reading-quality-gate.ts's countAspectsInContext, which scans for the
// "ASPECTS (tightest first):" line that formatEliteChartBlock emits. Passing
// chart+ctx (no instruction) is exactly what evaluateSection is built to score.
function buildChartContext(planetSection: string): string {
  const dual = calculateDualChart(BIRTH, undefined)
  const ctxBlock = buildInterpretationContext(dual, 'tropical', planetSection)
  const chartBlock = formatEliteChartBlock(dual.tropical, 'tropical')
  return `${chartBlock}\n${ctxBlock}`
}

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

// One streamed first-pass generation, timed. Mirrors route.ts generation call.
async function timeGeneration(planetSection: string): Promise<{ ms: number; text: string; truncated: boolean; cacheRead: number }> {
  const userContent = buildUserContent(planetSection)
  const systemBlocks = buildSystemBlocks()
  const t0 = performance.now()
  const stream = anthropic.messages.stream({
    model: MODEL,
    max_tokens: MAX_TOKENS_HEAVY,
    temperature: TEMPERATURE,
    system: systemBlocks,
    messages: [{ role: 'user', content: userContent }],
  })
  let text = ''
  for await (const event of stream) {
    if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
      text += event.delta.text
    }
  }
  const final = await stream.finalMessage()
  const ms = performance.now() - t0
  const truncated = final.stop_reason === 'max_tokens'
  // cache_read_input_tokens tells us whether the prefix was warm. 0 = cold.
  const cacheRead = final.usage.cache_read_input_tokens ?? 0
  return { ms, text, truncated, cacheRead }
}

// Time the real evaluateSection on real generated text.
async function timeEval(planetSection: string, generatedText: string) {
  const chartContext = buildChartContext(planetSection)
  const t0 = performance.now()
  const result = await evaluateSection({
    generatedText,
    chartContext,
    section: SECTION,
    planetSection,
  })
  const ms = performance.now() - t0
  return { ms, result }
}

// Time a full-budget repair directly (option b): always run it, so repair
// wall-time is known regardless of whether eval passed. Uses a fixed critique.
async function timeRepair(planetSection: string, failedDraft: string) {
  const systemBlocks = buildSystemBlocks()
  const originalUserContent = buildUserContent(planetSection)
  const critique =
    'Timing-harness critique: tighten chart-grounding, remove any generic phrasing, ' +
    'name the specific dignities and aspects in the context, and sharpen the voice. ' +
    'This critique exists to exercise the repair path for measurement; regenerate fully.'
  const t0 = performance.now()
  const repaired = await repairSection({
    originalUserContent,
    systemBlocks,
    failedDraft,
    critique,
    maxTokens: MAX_TOKENS_HEAVY,
    model: MODEL,
  })
  const ms = performance.now() - t0
  return { ms, len: repaired?.length ?? 0 }
}

describe('AXIS gate timing harness', () => {
  const run = process.env.RUN_TIME_GATE === '1'

  it.runIf(run)(
    'measures gen + eval + repair wall-time on heavy sections',
    async () => {
      if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set')

      console.log(
        `\n=== AXIS TIME GATE ===\n` +
        `model=${MODEL} temp=${TEMPERATURE} genMaxTokens=${MAX_TOKENS_HEAVY}\n` +
        `declared maxDuration C = ${DECLARED_MAX_DURATION_S}s (route.ts:14)\n` +
        `runs/section=${RUNS_PER_SECTION}\n`
      )

      type Row = { section: string; run: number; gen: number; evalMs: number; repair: number; happy: number; fail: number; pass: boolean; cacheRead: number }
      const rows: Row[] = []

      for (const planetSection of HEAVY_PLANET_SECTIONS) {
        for (let r = 1; r <= RUNS_PER_SECTION; r++) {
          const g = await timeGeneration(planetSection)
          const e = await timeEval(planetSection, g.text)
          const rep = await timeRepair(planetSection, g.text)
          const happy = g.ms + e.ms
          const fail = g.ms + e.ms + rep.ms
          rows.push({
            section: planetSection, run: r,
            gen: Math.round(g.ms), evalMs: Math.round(e.ms), repair: Math.round(rep.ms),
            happy: Math.round(happy), fail: Math.round(fail),
            pass: e.result.pass,
            cacheRead: g.cacheRead,
          })
          console.log(
            `${planetSection} run ${r}: gen=${Math.round(g.ms)}ms eval=${Math.round(e.ms)}ms ` +
            `repair=${Math.round(rep.ms)}ms | happy(gen+eval)=${Math.round(happy)}ms ` +
            `fail(+repair)=${Math.round(fail)}ms | pass=${e.result.pass} ` +
            `truncated=${g.truncated} cacheReadTokens=${g.cacheRead}`
          )
        }
      }

      const maxHappy = Math.max(...rows.map(r => r.happy))
      const maxFail = Math.max(...rows.map(r => r.fail))
      const C = DECLARED_MAX_DURATION_S * 1000

      const verdict =
        maxFail >= C ? 'FAIL: sync does NOT fit — do not wire. Try Haiku eval, then async, then raise C.' :
        maxFail >= C * 0.8 ? 'THIN: fits but revive keep-alive/heartbeat; no margin for spikes.' :
        'FITS with margin: sync viable, keep-alive not needed on this evidence.'

      console.log(
        `\n=== RESULT ===\n` +
        `T_happy (max gen+eval)        = ${maxHappy}ms\n` +
        `T_fail  (max gen+eval+repair) = ${maxFail}ms\n` +
        `C       (maxDuration)         = ${C}ms\n` +
        `C*0.8                         = ${Math.round(C * 0.8)}ms\n` +
        `VERDICT: ${verdict}\n` +
        `(Decision rule keys off T_fail, the failing-path worst case — a section\n` +
        ` fails the gate precisely when it is pathological, and that is a real\n` +
        ` request a paying reader is waiting on.)\n`
      )

      writeFileSync(
        RESULTS_FILE,
        JSON.stringify(
          {
            model: MODEL, temperature: TEMPERATURE, genMaxTokens: MAX_TOKENS_HEAVY,
            declaredMaxDurationS: DECLARED_MAX_DURATION_S, runsPerSection: RUNS_PER_SECTION,
            rows, maxHappyMs: maxHappy, maxFailMs: maxFail, ceilingMs: C, verdict,
          },
          null,
          2
        )
      )
      console.log(`\nResults written to ${RESULTS_FILE}\n`)
    },
    600_000 // 10-min vitest timeout: 2 sections × 3 runs × 3 sequential Sonnet calls
  )
})
