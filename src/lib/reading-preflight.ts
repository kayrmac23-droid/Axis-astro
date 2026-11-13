// lib/reading-preflight.ts
//
// The deterministic checks, run on the HOT PATH — before the reader is shown
// anything — with at most one targeted regeneration when they fail.
//
// ── WHY THIS EXISTS ──────────────────────────────────────────────────────────
//
// The quality gate runs under `after()`, off the response path. That is correct
// for the LLM evaluator and wrong for everything else, and it produces the
// product's oddest property: the FIRST reader of an uncached section sees
// ungated prose, and every reader after them gets the better text. First
// impressions land on the worst version the pipeline produces.
//
// Making the whole gate synchronous was measured and rejected (scripts/
// time-gate.test.ts): generate + evaluate + repair does not reliably fit inside
// maxDuration, and an overrun costs the reader the section entirely.
//
// But the gate is two different things wearing one name. The LLM evaluator is
// slow, expensive and nondeterministic. The rest — `scoreLength`,
// `detectBannedOpeners`, `antithesisVerdict`, `detectRescuePhrasings`,
// `scanSectionRules`, `checkNumericFacts` — is pure, makes no model calls, and
// runs in microseconds. reading-rule-scan.ts says so in its own header: "unlike
// the LLM gate it *could* run on the hot path." Nothing was stopping it except
// that the two had been bundled together.
//
// These checks catch what a reader notices in the first five seconds: a section
// at the wrong length, the banned existential opener, the antithesis tic as a
// template, a fabricated degree, prose that never once addresses them as "you",
// bullet points, a prescription, American spelling, a reintroduced summary
// heading, a placement carried out of the prompt's own worked example.
//
// ── THE COST, STATED PLAINLY ─────────────────────────────────────────────────
//
// Running these before the reader sees the text means the section can no longer
// stream token-by-token: it is buffered, checked, and written at once. That is
// a real loss — roughly 15–25s of blank where tokens used to appear. It is
// affordable for all but the opening section because `ReadingPanel` fires the
// whole chain as fast as the API will serve it, so by the time the reader
// finishes PART 1's Sun section the pipeline is several sections ahead. The
// opening section has no such cover and pays the wait in full.
//
// A regeneration costs one extra generation call, and ONLY on the sections that
// actually trip — which is far cheaper than the gate's one evaluate call on
// every section, trip or not.
import {
  countWords, scoreLength, detectBannedOpeners, detectRescuePhrasings, detectBannedPhrasings, isTruncated, MIN_INDIVIDUAL,
} from '@/lib/reading-quality-gate'
import { scanSectionRules, antithesisVerdict, type RuleFinding } from '@/lib/reading-rule-scan'
import { checkNumericFacts, type FactFinding } from '@/lib/reading-fact-check'
import { openerModeFor, type WordBand } from '@/lib/prompts'

export interface PreflightFinding {
  /** Stable id for the log line and the regeneration instruction. */
  check: string
  /** What tripped, for the instruction and the operator. */
  detail: string
}

export interface PreflightResult {
  findings: PreflightFinding[]
  /** The regeneration instruction, empty when there are no findings. */
  instruction: string
}

/** One greppable line in the `[AXIS_*]` family. */
export function formatPreflightLog(section: string, p: PreflightResult, action: string): string {
  const checks = p.findings.map(f => f.check).join(',')
  return `[AXIS_PREFLIGHT] section=${section} findings=${p.findings.length}${checks ? ` checks=${checks}` : ''} action=${action}`
}

/**
 * Run every deterministic check against a freshly generated section.
 *
 * Pure: no model calls, no I/O, never throws. `frame` is passed through to
 * `scanSectionRules` so `register-drift` stays scoped to the natal frames and
 * fails closed on anything else, exactly as the gate does.
 *
 * ⚠ Truncation is NOT checked here. A section cut at the token ceiling is not
 * fixed by generating it again — it would be cut at the same ceiling — so the
 * route handles that on its own path, with the marker the client reads.
 */
export function preflightSection(opts: {
  text:          string
  chartContext:  string
  section:       string
  planetSection: string
  band:          WordBand
}): PreflightResult {
  const { text, chartContext, section, planetSection, band } = opts
  const findings: PreflightFinding[] = []
  if (!text.trim()) return { findings, instruction: '' }

  // ── Length. Only a HARD miss regenerates. A section that is merely over or
  // under the full band scores 3 and is acceptable prose; regenerating it would
  // spend a call to chase a point the gate itself does not fail on.
  const words = countWords(text)
  if (scoreLength(words, band) < MIN_INDIVIDUAL) {
    const under = words < band.hardMin
    findings.push({
      check: 'length',
      detail: under
        ? `${words} words, under the ${band.hardMin}-word floor (target ${band.target}, band ${band.fullMin}–${band.fullMax}). Required material has been thinned or skipped: work more of the chart, do not pad.`
        : `${words} words, runaway past the ~${band.hardMax}-word ceiling (target ${band.target}, band ${band.fullMin}–${band.fullMax}). Cut padding, repetition and cadence, keeping only substance.`,
    })
  }

  // ── The banned existential opener, first sentence only.
  const openers = detectBannedOpeners(text)
  if (openers.length > 0) {
    const mode = openerModeFor(section, planetSection)
    findings.push({
      check: 'opener',
      detail: `the first sentence opens on the banned existential frame ("${openers[0]}…"). ${
        mode ? `Open instead on ${mode}` : 'Open on the behaviour, the need, or the chart factor itself.'
      } Do not swap in another existential opener.`,
    })
  }

  // ── The antithesis tic, measured as density (v10.45; see reading-rule-scan.ts).
  const antithesis = antithesisVerdict(text)
  if (antithesis.severity !== 'clean') {
    findings.push({
      check: 'antithesis-tic',
      detail: `the contrastive construction is too dense: ${
        antithesis.cause === 'paragraph'
          ? `${antithesis.maxPerParagraph} in one paragraph (${antithesis.hits.length} in the section), where the CADENCE ALLOWANCE permits at most one per paragraph`
          : `${antithesis.hits.length} across ${antithesis.paragraphs} paragraphs, where the CADENCE ALLOWANCE permits ${antithesis.allowance}`
      }. The instances: ${antithesis.hits.map(t => `"${t.match}"`).join(', ')}. Keep the most load-bearing one in each affected paragraph and state every other claim directly. A dash-balanced or "not merely…but" equivalent is the same tic.`,
    })
  }

  // ── The rescue clause, on a literal match only.
  const rescue = detectRescuePhrasings(text)
  if (rescue.length > 0) {
    findings.push({
      check: 'rescue-clause',
      detail: `value-asserting reassurance is appended to a strength instead of naming it plainly: ${rescue.map(r => `"${r}"`).join(', ')}. Apply the deletion test — if removing the clause leaves the astrological claim intact, cut it.`,
    })
  }

  // ── Stated-rule breaches. Hard only.
  const rules: RuleFinding[] = scanSectionRules(text, { frame: section })
    .filter(f => f.severity === 'hard' && f.rule !== 'antithesis-tic')
  for (const r of rules) {
    findings.push({ check: r.rule, detail: `${r.rule} at line ${r.line}: "${r.match}".` })
  }

  // ── Numeric facts and exemplar bleed. Hard only.
  const facts: FactFinding[] = checkNumericFacts(text, chartContext).filter(f => f.severity === 'hard')
  for (const f of facts) {
    findings.push({
      check: f.check,
      detail: f.check === 'exemplar-bleed'
        ? `"${f.match}" is a placement from a different chart and this chart does not contain it: "${f.context}".`
        : `"${f.match}" is a figure the chart context does not state: "${f.context}". Re-derive it from the context, or make the claim without a figure.`,
    })
  }

  return { findings, instruction: findings.length === 0 ? '' : buildInstruction(findings) }
}

/**
 * What the CACHE may keep. Run after the stream has closed, on text the reader
 * already has: every hard finding of `preflightSection`, plus the doctrine scan
 * (`detectBannedPhrasings`), which the pre-flight leaves to the cache because
 * THE LAW is a veto on what is stored and replayed for 30 days.
 *
 * `clean` is the only state that may be cached. `truncated` is not worth a
 * regeneration (it would be cut at the same ceiling); anything else earns ONE,
 * with `instruction` as its extra turn. Pure: no model call, no I/O.
 */
export interface CacheScan {
  state: 'clean' | 'truncated' | 'findings'
  findings: PreflightFinding[]
  instruction: string
}

export function cacheScan(opts: {
  text:          string
  truncated:     boolean
  chartContext:  string
  section:       string
  planetSection: string
  band:          WordBand
}): CacheScan {
  const { text, truncated } = opts
  if (truncated || !text.trim() || isTruncated(text)) return { state: 'truncated', findings: [], instruction: '' }

  const findings = [...preflightSection(opts).findings]
  const doctrine = detectBannedPhrasings(text)
  if (doctrine.length > 0) {
    findings.push({
      check: 'doctrine',
      detail: `phrasing with no legitimate use in an AXIS reading: ${doctrine.map(p => `"${p}"`).join(', ')}. Remove each one and do not substitute a synonym for the same move: a difficulty stays a difficulty, a strength is named as plain function, and the two systems are held side by side with neither placed beneath the other.`,
    })
  }
  return findings.length === 0
    ? { state: 'clean', findings, instruction: '' }
    : { state: 'findings', findings, instruction: buildInstruction(findings) }
}

/** One greppable line per generated section: what the cache did with it. */
export function formatCacheLog(section: string, outcome: string, first: CacheScan, second?: CacheScan): string {
  const checks = (s: CacheScan) => s.findings.map(f => f.check).join(',') || '-'
  return `[AXIS_CACHE] section=${section} outcome=${outcome} first=${first.state} checks=${checks(first)}` +
    (second ? ` regen=${second.state} regen_checks=${checks(second)}` : '')
}

/**
 * The regeneration turn.
 *
 * Unlike the gate's repair this carries no failed draft at all. The faults are
 * deterministic string facts, so naming them is enough — and sending the draft
 * would put the prose the rewrite must discard in the strongest position in the
 * prompt, which is the mistake the v10.40 repair rewrite was fixing.
 */
function buildInstruction(findings: PreflightFinding[]): string {
  const items = findings.map(f => `· ${f.detail}`).join('\n')
  return `──────────── REWRITE REQUIRED ────────────
Your previous attempt at this section broke ${findings.length === 1 ? 'a rule' : 'rules'} stated above. ${findings.length === 1 ? 'It is' : 'They are'} a plain fact about the text, not a matter of judgement:

${items}

Write the section again, in full, from the chart context and the rules, keeping everything the previous attempt got right. Fix the ${findings.length === 1 ? 'fault' : 'faults'} named above and introduce no new ones.

Your reply is the section and nothing else. Its first character is the section's first character — typically the ## heading. The reader never sees this instruction, so the prose never mentions a rewrite, a previous attempt, or a correction.`
}

/**
 * Which of two attempts to serve.
 *
 * The rewrite is kept only when it is genuinely cleaner. A regeneration that
 * trades one breach for another is not an improvement, and on a tie the FIRST
 * attempt wins: it was written without a correction hanging over it, and the
 * rewrite has had its attention pulled onto a list of faults.
 */
export function pickBetter(
  first: { text: string; findings: PreflightFinding[] },
  second: { text: string; findings: PreflightFinding[] },
): { text: string; kept: 'first' | 'second' } {
  // Blank text has nothing to find, so without this guard an empty or failed
  // rewrite scores zero findings, wins outright, and the reader is served
  // nothing at all. The route also screens for this; belt and braces, because
  // this function decides what a person reads.
  if (!second.text.trim()) return { text: first.text, kept: 'first' }
  return second.findings.length < first.findings.length
    ? { text: second.text, kept: 'second' }
    : { text: first.text, kept: 'first' }
}

export { antithesisVerdict }
