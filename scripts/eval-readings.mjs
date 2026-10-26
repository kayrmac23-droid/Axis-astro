#!/usr/bin/env node
// scripts/eval-readings.mjs — batch evaluation harness for the reading pipeline.
//
// Generates full natal readings for every chart in scripts/eval-charts.json with
// the exact request /api/reading sends (same prompts, model, thinking config,
// token budgets, reading thread), and records per-section quality and cost, so
// first-pass quality can be measured across many charts instead of one.
//
// ── RUN ──────────────────────────────────────────────────────────────────────
//   Put ANTHROPIC_API_KEY in .env.local (read automatically) or the shell, then:
//
//     npm run eval                   generate-only: Sonnet generation, no gate (cheap)
//     npm run eval -- --gate         also runs gateForCache per section (Opus eval +
//                                    any repair/re-score) — the real cost of a reading
//     npm run eval -- --verify       no API: recompute every chart and check it still
//                                    hits its axis (run after editing eval-charts.json)
//     npm run eval -- --dry-run      no API: build every section's real request with
//                                    placeholder prose, to prove the run end to end
//
//   Options:
//     --charts=id1,id2     only these chart ids (default: all)
//     --through=FRAME      stop after tropical | sidereal | synthesis (default
//                          synthesis). Later frames are written after earlier ones,
//                          so a frame can only be dropped from the end.
//     --concurrency=N      charts read in parallel (default 1; sections within a
//                          chart are always sequential, as in production)
//     --out=DIR            output root (default eval-output/, gitignored)
//     --save-prompts       also write each section's full request as .prompt.txt
//     --verbose            echo the production [AXIS_USAGE] / [AXIS_GATE] log lines
//
//   Opt-in: the harness only runs with AXIS_EVAL=1, which this launcher sets.
//   It is not a *.test.ts file and has its own vitest config, so `npm test` and
//   CI never collect it; and generate/gate modes refuse to start without a real
//   ANTHROPIC_API_KEY. Do not set AXIS_GATE_ENABLED=false with --gate.
//
//   Cost: generate-only is ~21 Sonnet calls per chart. --gate adds one Opus
//   evaluation per generated section, plus a repair (Sonnet) and an Opus re-score
//   wherever a repair fires. The printed summary prices every call at list price.
//   Start with --charts=<one id> to see one chart's cost before running all 12.
//
// ── OUTPUT ─────────── eval-output/<timestamp>_<mode>/ ────────────────────────
//   run.json          git sha (+dirty), prompt version, model, chart list, prices
//   sections.jsonl    one row per section (the record to aggregate), CSV twin in
//   sections.csv      sections.csv. Key fields:
//                       words, band_min/band_max/hard_max   word count vs the band
//                         the gate scores against (aspect/evidence-scaled)
//                       length_status   in | over | runaway | under | under-hard
//                       stop_reason, truncated          max_tokens = truncated
//                       gate_reason      gateForCache's reason (passed, repaired,
//                         repair-failed-recheck, doctrine-repaired, …)
//                       first_pass_clean  passed with no repair (reason=passed)
//                       first_pass_scores / first_pass_critique  the evaluator's
//                         verdict on the FIRST pass (CSV: fp_<criterion>)
//                       final_scores     the repair's re-score where one ran
//                       repair_attempted, repaired, cached, repair_failed
//                       tokens{model: calls,input,cache_read,cache_write,output}, usd
//   calls.jsonl       one row per model call: call (generate | evaluate | repair |
//                       recheck | doctrine-repair), model, input, cache_read,
//                       cache_write, output, stop, usd — from the API's own usage
//   summary.json      overall / per_chart / per_section aggregates:
//                       gate.first_pass_pass_rate   passed with no repair ÷ gated
//                       gate.repair_rate            repair attempted ÷ gated
//                       gate.repair_failed_rate     repair attempted, nothing
//                         cached ÷ repairs (repair_failed_of_gated: ÷ gated)
//                       gate.first_pass_criteria    mean and #<3 per criterion
//                       truncated_rate, length.over_band_rate, tokens per model
//   <chart>/NN-<frame>-<section>.md          first-pass prose (what the reader
//                                            saw; the thread the next section got)
//   <chart>/NN-<frame>-<section>.cached.md   what the gate would cache, where it
//                                            differs from the first pass
//   The same summary is printed at the end of the run.
//
//   Pluto uses the local Meeus fallback (no JPL call), so runs are offline-
//   reproducible; production uses JPL when the client forwards it.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

const FLAGS = new Set(['gate', 'dry-run', 'verify', 'save-prompts', 'verbose', 'help'])
const OPTIONS = new Set(['charts', 'through', 'concurrency', 'out'])

function fail(msg) {
  console.error(`eval-readings: ${msg}\nRun \`npm run eval -- --help\` for usage.`)
  process.exit(2)
}

const flags = new Set()
const opts = {}
for (const arg of process.argv.slice(2)) {
  const m = arg.match(/^--([a-z-]+)(?:=(.*))?$/)
  if (!m) fail(`unrecognised argument "${arg}"`)
  const [, name, value] = m
  if (FLAGS.has(name) && value === undefined) flags.add(name)
  else if (OPTIONS.has(name) && value) opts[name] = value
  else fail(`unknown or malformed option "${arg}"`)
}

if (flags.has('help')) {
  // The usage block is the header of this file.
  const header = readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0]
  console.log(header.split('\n').slice(1).map(l => l.replace(/^\/\/ ?/, '')).join('\n'))
  process.exit(0)
}

const modes = ['gate', 'dry-run', 'verify'].filter(f => flags.has(f))
if (modes.length > 1) fail(`--${modes.join(' and --')} are mutually exclusive`)
const mode = modes[0] ?? 'generate'
if (opts.through && !['tropical', 'sidereal', 'synthesis'].includes(opts.through)) fail('--through must be tropical, sidereal or synthesis')
if (opts.concurrency && !/^[1-9]\d*$/.test(opts.concurrency)) fail('--concurrency must be a positive integer')

// .env.local then .env, as Next reads them — without overriding the shell.
for (const file of ['.env.local', '.env']) {
  const path = join(ROOT, file)
  if (!existsSync(path)) continue
  for (const [k, v] of Object.entries(parseEnv(readFileSync(path, 'utf8')))) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

if ((mode === 'generate' || mode === 'gate') && !process.env.ANTHROPIC_API_KEY?.trim()) {
  fail('ANTHROPIC_API_KEY is not set (shell or .env.local). --dry-run and --verify need no key.')
}

const env = {
  ...process.env,
  AXIS_EVAL: '1',
  AXIS_EVAL_MODE: mode,
  ...(opts.charts && { AXIS_EVAL_CHARTS: opts.charts }),
  ...(opts.through && { AXIS_EVAL_THROUGH: opts.through }),
  ...(opts.concurrency && { AXIS_EVAL_CONCURRENCY: opts.concurrency }),
  ...(opts.out && { AXIS_EVAL_OUT: resolve(process.cwd(), opts.out) }),
  ...(flags.has('save-prompts') && { AXIS_EVAL_SAVE_PROMPTS: '1' }),
  ...(flags.has('verbose') && { AXIS_EVAL_VERBOSE: '1' }),
  // Vitest's own deprecation notice about the CJS-loaded config; not ours.
  VITE_CONFIG_NATIVE_IGNORE_WARNING: 'true',
}

const require = createRequire(import.meta.url)
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const child = spawn(
  process.execPath,
  [vitest, 'run', '--config', join(ROOT, 'scripts', 'eval-readings.vitest.config.ts')],
  { cwd: ROOT, env, stdio: 'inherit' },
)
child.on('exit', (code, signal) => process.exit(signal ? 1 : code ?? 1))
