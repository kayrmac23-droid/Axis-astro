// scripts/rescore-bench.harness.ts — re-score the pinned rater bench.
//
// WHAT THIS MEASURES. fixtures/rater-bench/ holds the 21 first-pass natal
// sections of control-chicago-1987 under v10.40 together with the scores
// claude-sonnet-5-5 gave them. The prose is frozen, so re-scoring it isolates
// THE EVALUATOR: any score movement is the rubric and nothing else. That is the
// one experiment on this pipeline with no confound from generation variance,
// and it costs evaluation calls only — no generation.
//
// WHY IT HAS TO EXIST SEPARATELY FROM scripts/eval-readings.mjs. The eval
// harness generates and then scores, so every number it reports mixes the
// writer and the rater. Four consecutive prompt interventions were attributed
// to prose on evidence that could not separate the two.
//
// FAITHFULNESS. The chart context, the band, the cadence allowance and the
// reading-so-far blocks are rebuilt through buildSectionRequest — the same
// builder /api/reading uses — from the chart cast by calculateDualChart out of
// scripts/eval-charts.json. The priors are the bench files themselves, in
// NATAL_SECTION_ORDER, so they are byte-identical to the run that produced
// scores.json. Scoring goes through evaluateSection, not a local copy of the
// request, so the harness cannot drift from production.
//
// RAW vs CLAMPED. evaluateSection applies deterministic clamps (banned opener,
// antithesis tic, rescue phrasing, numeric fact, hard rule breach) after the
// rater returns. Those are code, not rater judgment, and they are constant
// across runs on frozen prose. The harness therefore reports BOTH: `llm` (what
// the rater said) and `final` (what the verdict used). A rubric revision is
// judged on `llm`; `final` is what the gate would actually do.
import { describe, it, expect } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { calculateDualChart, type DualChartData } from '@/lib/astro-calc'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { priorSectionsFor } from '@/lib/reading-order'
import type { PriorSection } from '@/lib/reading-thread'
import {
  evaluateSection, EVAL_MODEL, countWords,
  detectBannedOpeners, detectRescuePhrasings,
  type LlmScores, type GateScores,
} from '@/lib/reading-quality-gate'
import { detectAntithesisTic, scanSectionRules } from '@/lib/reading-rule-scan'
import { antithesisCapFor } from '@/lib/prompts'
import { checkNumericFacts } from '@/lib/reading-fact-check'
import { buildSectionRequest, type NatalFrame } from './eval-readings.request'

const ROOT       = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const BENCH_DIR  = join(ROOT, 'fixtures', 'rater-bench')
const CHARTS     = join(ROOT, 'scripts', 'eval-charts.json')

const LLM_CRITERIA = [
  'chart_evidence', 'specificity', 'synthesis', 'contradiction_handling', 'anti_cliche',
  'psychological_depth', 'practical_usefulness', 'voice_quality', 'falsifiability',
] as const

// MIN_PASS_AVERAGE is module-private in the gate; computePassFromScores is the
// authority on the verdict and the harness uses it for `pass`. This constant is
// for REPORTING a section's average against the bar only.
const PASS_BAR = 3.40

const AUDIT_ONLY  = process.env.RESCORE_AUDIT === '1'
const LABEL       = process.env.RESCORE_LABEL || 'run'
const OUT_DIR     = process.env.RESCORE_OUT   || join(ROOT, 'eval-output', `rescore_${LABEL}`)
const REPEATS     = Number(process.env.RESCORE_REPEATS || '1')
const ONLY        = (process.env.RESCORE_SECTIONS || '').split(',').filter(Boolean)

interface BenchRow {
  file: string
  section: NatalFrame
  planet_section: string
  words: number
  scores_v10_40: GateScores
  length_score: number
  gate_reason: string
}

function benchRows(): BenchRow[] {
  const all = JSON.parse(readFileSync(join(BENCH_DIR, 'scores.json'), 'utf8')).sections as BenchRow[]
  if (ONLY.length === 0) return all
  return all.filter(r => ONLY.includes(`${r.section}/${r.planet_section}`) || ONLY.includes(r.section))
}

function benchText(file: string): string {
  return readFileSync(join(BENCH_DIR, file), 'utf8').trim()
}

function castBenchChart(): DualChartData {
  const charts = JSON.parse(readFileSync(CHARTS, 'utf8')).charts as Array<{ id: string; birth: unknown }>
  const spec = charts.find(c => c.id === 'control-chicago-1987')
  if (!spec) throw new Error('control-chicago-1987 missing from eval-charts.json')
  const parsed = parseBirthDataInput(spec.birth, { label: spec.id })
  if (!parsed.ok) throw new Error(parsed.error)
  return calculateDualChart(parsed.data)
}

// The bench IS the thread: every section of the reading, in order. Priors are
// read straight off disk, so they are byte-identical to the run scores.json
// came from — the same guarantee eval-readings.mjs's --thread-from gives.
function priorsFor(section: NatalFrame, planetSection: string, rows: BenchRow[]): PriorSection[] {
  const byKey = new Map(rows.map(r => [`${r.section}/${r.planet_section}`, r]))
  return priorSectionsFor(section, planetSection).flatMap(ref => {
    const row = byKey.get(`${ref.section}/${ref.planetSection}`)
    return row ? [{ ...ref, text: benchText(row.file) }] : []
  })
}

function mean(xs: number[]): number { return xs.reduce((a, b) => a + b, 0) / xs.length }
function sd(xs: number[]): number {
  const m = mean(xs)
  return Math.sqrt(xs.reduce((a, b) => a + (b - m) ** 2, 0) / xs.length)
}

describe('rater bench', () => {
  it('re-scores the frozen corpus', async () => {
    // `rows` is what gets scored (RESCORE_SECTIONS may narrow it); `allRows` is
    // the whole reading, which the priors must always come from — a narrowed run
    // still has to see the same reading so far or it is not comparable.
    const rows = benchRows()
    const allRows = JSON.parse(readFileSync(join(BENCH_DIR, 'scores.json'), 'utf8')).sections as BenchRow[]
    const dual = castBenchChart()

    let sha = 'unknown'
    try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore', 'pipe', 'ignore'] }).toString().trim() } catch { /* ignore */ }

    // ── Deterministic audit: which of the pinned low scores were CLAMPS, not
    // the rater? Free, no API call, and it runs in every mode because it tells
    // you which criteria the rubric can even be held responsible for.
    const audit: Array<Record<string, unknown>> = []
    for (const r of rows) {
      const text = benchText(r.file)
      const req  = buildSectionRequest(dual, r.section, r.planet_section, priorsFor(r.section, r.planet_section, allRows))
      const cap  = antithesisCapFor(req.band)
      const tic  = detectAntithesisTic(text)
      const rules = scanSectionRules(text, { frame: r.section, antithesisCap: cap })
      audit.push({
        file: r.file,
        section: `${r.section}/${r.planet_section}`,
        opener_hit:     detectBannedOpeners(text).length,
        antithesis:     tic.length,
        antithesis_cap: cap,
        antithesis_over: tic.length > cap,
        rescue_hit:     detectRescuePhrasings(text).length,
        fact_hard:      checkNumericFacts(text, req.userContent).filter(f => f.severity === 'hard').length,
        rule_hard:      rules.filter(f => f.severity === 'hard').length,
        rule_hard_names: rules.filter(f => f.severity === 'hard').map(f => f.rule).join(','),
        words:          countWords(text),
        band_target:    req.band.target,
      })
    }

    console.log('\n=== DETERMINISTIC CLAMP AUDIT (free, no API) ===')
    console.log('section'.padEnd(30), 'opener', 'antith/cap', 'rescue', 'fact', 'ruleHard')
    for (const a of audit) {
      console.log(
        String(a.section).padEnd(30),
        String(a.opener_hit).padStart(6),
        `${a.antithesis}/${a.antithesis_cap}`.padStart(10) + (a.antithesis_over ? ' OVER' : '     '),
        String(a.rescue_hit).padStart(6),
        String(a.fact_hard).padStart(4),
        String(a.rule_hard).padStart(8), a.rule_hard_names || '',
      )
    }
    const clampCount = (k: string) => audit.filter(a => (k === 'antithesis' ? a.antithesis_over : Number(a[k]) > 0)).length
    console.log(`\nsections clamped: opener ${clampCount('opener_hit')} · antithesis ${clampCount('antithesis')} · rescue ${clampCount('rescue_hit')} · fact ${clampCount('fact_hard')} · rule ${clampCount('rule_hard')} (of ${audit.length})`)

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'clamp-audit.json'), JSON.stringify(audit, null, 2))

    if (AUDIT_ONLY) {
      console.log('\nRESCORE_AUDIT=1 — no evaluator calls made.')
      return
    }

    // ── Re-score.
    const results: Array<Record<string, unknown>> = []
    for (let pass = 1; pass <= REPEATS; pass++) {
      for (const r of rows) {
        const text = benchText(r.file)
        const req  = buildSectionRequest(dual, r.section, r.planet_section, priorsFor(r.section, r.planet_section, allRows))
        const res  = await evaluateSection({
          generatedText: text,
          chartContext:  req.userContent,
          section:       r.section,
          planetSection: r.planet_section,
          priorBlocks:   req.priorBlocks.length ? req.priorBlocks : undefined,
        })
        const llm   = res.llmScores
        const final = res.scores
        const llmAvg   = llm   ? mean(LLM_CRITERIA.map(c => llm[c])) : null
        const finalAvg = final ? mean([...LLM_CRITERIA.map(c => final[c]), final.length]) : null
        results.push({
          repeat: pass,
          file: r.file,
          section: `${r.section}/${r.planet_section}`,
          llm, final,
          llm_avg_9: llmAvg, final_avg_10: finalAvg,
          final_min: final ? Math.min(...LLM_CRITERIA.map(c => final[c]), final.length) : null,
          pass: res.pass,
          evaluatorErrored: res.evaluatorErrored,
          baseline_v10_40: r.scores_v10_40,
          evidence: res.evidence,
          critique: res.critique,
        })
        const d = llm && LLM_CRITERIA.map(c => llm[c] - r.scores_v10_40[c])
        console.log(
          `[${pass}] ${String(r.section + '/' + r.planet_section).padEnd(28)}`,
          'llm', llm ? LLM_CRITERIA.map(c => llm[c]).join('') : '—',
          'base', LLM_CRITERIA.map(c => r.scores_v10_40[c]).join(''),
          'Δ', d ? d.map(x => (x > 0 ? '+' : x < 0 ? '-' : '.')).join('') : '—',
          'avg9', llmAvg?.toFixed(2) ?? '—',
          res.pass ? 'PASS' : '',
        )
      }
    }

    writeFileSync(join(OUT_DIR, 'rescore.json'), JSON.stringify({
      label: LABEL, sha, eval_model: EVAL_MODEL, repeats: REPEATS,
      at: new Date().toISOString(), results,
    }, null, 2))

    // ── Report. Per-criterion mean, sd and modal share, which is the number
    // that exposes a rater emitting a template: sd ≤ ~0.5 on every criterion is
    // an instrument that is not responding to the prose.
    console.log('\n=== PER-CRITERION: baseline v10.40 vs this run (rater output, pre-clamp) ===')
    console.log('criterion'.padEnd(24), 'base', ' new', '  Δ', '  sd', 'modal', ' 5s', ' 4s')
    for (const c of LLM_CRITERIA) {
      const base = mean(allRows.map(r => r.scores_v10_40[c]))
      const got  = results.map(x => (x.llm as LlmScores | null)?.[c]).filter((v): v is number => typeof v === 'number')
      if (!got.length) continue
      const hist = [1, 2, 3, 4, 5].map(k => got.filter(v => v === k).length)
      const mx   = Math.max(...hist)
      console.log(
        c.padEnd(24),
        base.toFixed(2), mean(got).toFixed(2).padStart(4),
        ((mean(got) - base) >= 0 ? '+' : '') + (mean(got) - base).toFixed(2),
        sd(got).toFixed(2).padStart(5),
        `${Math.round(100 * mx / got.length)}%@${hist.indexOf(mx) + 1}`.padStart(6),
        String(hist[4]).padStart(3), String(hist[3]).padStart(3),
      )
    }

    const fives = results.flatMap(x => (x.llm ? LLM_CRITERIA.map(c => (x.llm as LlmScores)[c]) : []))
    console.log(`\n5s awarded: ${fives.filter(v => v === 5).length} / ${fives.length} prose scores · 4s: ${fives.filter(v => v === 4).length}`)
    const passes = results.filter(x => x.pass).length
    console.log(`pass (full gate verdict, post-clamp): ${passes} / ${results.length}`)
    const avgs = results.map(x => x.final_avg_10).filter((v): v is number => typeof v === 'number')
    console.log(`section avg (10 criteria): mean ${mean(avgs).toFixed(3)} · range ${Math.min(...avgs).toFixed(2)}–${Math.max(...avgs).toFixed(2)} · bar ${PASS_BAR}`)

    if (REPEATS > 1) {
      console.log('\n=== RUN-TO-RUN NOISE (same prose, same prompt) ===')
      for (const c of LLM_CRITERIA) {
        const bySec = new Map<string, number[]>()
        for (const x of results) {
          const v = (x.llm as LlmScores | null)?.[c]
          if (typeof v === 'number') bySec.set(String(x.section), [...(bySec.get(String(x.section)) ?? []), v])
        }
        const spreads = Array.from(bySec.values()).filter(v => v.length > 1).map(v => Math.max(...v) - Math.min(...v))
        if (spreads.length) console.log(c.padEnd(24), 'mean within-section spread', mean(spreads).toFixed(2), '· max', Math.max(...spreads))
      }
    }

    console.log(`\nwrote ${join(OUT_DIR, 'rescore.json')}`)
    expect(results.length).toBeGreaterThan(0)
  })
})
