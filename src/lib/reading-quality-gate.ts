// Reading Quality Gate
//
// ON THE REQUEST PATH, AFTER THE RESPONSE — "evaluate-and-recache". /api/reading
// streams the first pass straight to the reader and closes the stream, THEN calls
// gateForCache() below while the invocation is still alive. So the gate never adds
// latency to what the reader waits for, and it decides only one thing: what future
// readers get from the 30-day cache.
//
// The consequence, stated plainly: the FIRST reader of an uncached section sees
// ungated first-pass prose. Everyone after them is served the gated (and, where it
// failed, repaired) text. The gate cannot retroactively fix what already streamed —
// it converts a one-off ungated impression into a cached, gated artifact.
//
// This replaced the earlier synchronous design, which was removed when generation +
// eval breached the then-60s route ceiling on heavy sections. maxDuration is now 120
// and the passes are off the response path entirely, so the ceiling is no longer the
// binding constraint; the wall-clock guards in gateForCache are.
//
// What it does when it runs: scores a generated section against AXIS's elite-reading
// criteria and, on failure, regenerates it once with the evaluator's critique as
// repair instructions. The repair is then re-scored against the same rubric and is
// cached ONLY if it now passes — a repair that merely stopped tripping the
// deterministic scan can regress across the prose criteria, and caching it unverified
// would freeze sub-threshold prose for the 30-day TTL. When there is no wall-clock
// budget left for the re-score, the repair is cached on its deterministic signals
// alone (complete + doctrine-clean), matching the earlier behaviour.
//
// This is the load-bearing check the prompt alone cannot enforce: model output
// is non-deterministic, and a strong prompt can still occasionally produce a
// generic, under-synthesised, or insufficiently chart-grounded section. The
// gate refuses to ship those.
//
// Threshold: average score ≥ MIN_PASS_AVERAGE (3.40, interim — see below) AND no
// individual criterion below 3.
// A single weak criterion fails the section regardless of average. Caching
// only happens after a pass.
//
// The rubric has nine criteria. The ninth — `falsifiability` — enforces the
// prompt's NON-NEGOTIABLE no-Barnum doctrine, which nothing else in the gate
// scored: a section can be interior-framed and behaviourally concrete (strong
// `specificity`) and still be saturated with universally-endorsable claims that
// do comfort work, not astrological work. `falsifiability` scores the inversion
// test ONLY (negate each major claim; if the negation is also broadly
// endorsable, it is Barnum) — it does not re-score chart-anchoring, which stays
// in `chart_evidence`, so the two are never double-counted.
//
// Two of AXIS's three banned rescue moves are enforced here in addition to the
// prompt: resolution-by-hierarchy (divergence -> depth-ranked systems) is folded
// into `synthesis`, and the rescue clause (ease -> hidden strength) into
// `contradiction_handling`, which also owns the compensatory reframe (difficulty
// -> gift). The rescue clause additionally has a deterministic backstop
// (`detectRescuePhrasings`): a literal match on a curated reassurance frame forces
// `contradiction_handling` below the pass bar so the flattery is repaired even
// when the evaluator's own read missed it.

import Anthropic from '@anthropic-ai/sdk'
import { getAnthropicKey } from '@/lib/env'
import { READING_SO_FAR_FOOTER } from '@/lib/reading-thread'
import { logUsage } from '@/lib/usage-log'
import {
  BANNED_BARNUM_LIST,
  BANNED_RESCUE_LIST,
  BANNED_RESCUE_PHRASINGS,
  BANNED_HIERARCHY_LIST,
  BANNED_HIERARCHY_PHRASINGS,
  BANNED_META_LIST,
  BANNED_META_PHRASINGS,
  BANNED_OPENER_LIST,
  BANNED_OPENER_PATTERNS,
  countPlanEvidence,
  detectContextualHierarchy,
  HIERARCHY_CONTEXTUAL_TERMS,
  HIERARCHY_IDENTITY_TOKENS,
  HIERARCHY_PROXIMITY_CHARS,
  openerModeFor,
  wordBandFor,
  WordBand,
} from '@/lib/prompts'
import {
  antithesisVerdict,
  scanSectionRules,
} from '@/lib/reading-rule-scan'
import { checkNumericFacts } from '@/lib/reading-fact-check'

// The evaluator needs discriminating judgment on subtle failure modes
// (pseudo-synthesis, compensatory reframes, under-grounded prose), which is why
// it is not the generator's own model grading its own output.
//
// It was `claude-opus-5` with thinking DISABLED. That pairing was the worst of
// both: Opus input bills at 2.5x Sonnet over roughly the SAME token volume the
// generation call pays (rubric + prior blocks + chart context + the draft), so
// evaluation — not generation — was the larger half of the bill, and the reader
// never sees its benefit (gateForCache runs under after(), so the first reader
// of a section always gets the ungated first pass). Meanwhile the judgment it
// was bought for was switched off: a nine-criterion prose verdict returned as
// strict JSON is exactly the task reasoning helps most, and disabling thinking
// on Opus 5 is also the documented trigger for leaked tags and malformed output
// — which this gate turns into `eval-errored` and caches nothing.
//
// Current generation Sonnet with REASONING ON is both cheaper and a better
// judge. Note `thinking: {type:'disabled'}` is a 400 on this model: the eval
// path therefore has its own thinking config (EVAL_THINKING), separate from the
// repair path, which still runs on the caller's generation model.
export const EVAL_MODEL = 'claude-sonnet-5-5'
// Effort is the depth knob on current models (`budget_tokens` is removed). The
// gate runs off the response path entirely, so thinking costs the reader no
// latency — but it is still a scoring pass, not open-ended reasoning, so this
// sits at `medium` rather than the model default of `high`.
const EVAL_EFFORT: Anthropic.OutputConfig['effort'] = 'medium'
// Adaptive thinking tokens count against max_tokens, so this is no longer sized
// for the JSON alone: the former 1200 was a JSON-only budget and would truncate
// the scores object the moment the model thought at all. Failure-path output is
// still the sizing constraint (scores + critique + falsifiability_inversion);
// extractScoresFromRaw remains the backstop if a critique truncates the JSON,
// so the verdict never fails open regardless.
const EVAL_MAX_TOKENS = 4000
const DOCTRINE_REPAIR_MAX_TOKENS = 500

// Sonnet 5 / Opus 5 REMOVED the sampling params (temperature/top_p/top_k):
// sending `temperature` returns a 400 and fails the call. There is no
// temperature knob on these models; do not re-add one.
//
// REPAIR path only. Repair and doctrine-repair run on the caller's generation
// model (Sonnet 5), which accepts a disabled thinking config, and a repair is a
// constrained rewrite against an explicit critique rather than a judgment call
// — so it keeps the generator's no-thinking shape. The EVALUATOR does not: see
// EVAL_THINKING below.
const THINKING: Anthropic.ThinkingConfigParam = { type: 'disabled' }

// EVALUATION path. Scoring prose on nine criteria and emitting strict JSON is a
// judgment task, and the gate is the last check before a 30-day cache write, so
// the evaluator reasons. Adaptive is also the only legal on-mode here —
// `{type:'disabled'}` returns a 400 on EVAL_MODEL.
const EVAL_THINKING: Anthropic.ThinkingConfigParam = { type: 'adaptive' }

// The worked example the falsifiability criterion is calibrated against, and a
// permanent regression fixture (see reading-quality-gate.test.ts). This claim
// passes `specificity` — it is a concrete interior scene — yet fails
// `falsifiability`: its negation is equally endorsable and it collapses to the
// banned "you want to be understood" line. It exists to prove the two axes are
// orthogonal, so criterion 9 can never be quietly folded back into specificity.
export const FALSIFIABILITY_DIVERGENCE_EXAMPLE =
  'In the middle of an argument you care about, part of you keeps quietly restating your own position — not to win, but because being understood lands as more urgent than being agreed with.'

// The criteria the LLM evaluator scores from the section prose. These nine are
// what the eval prompt requests and what validateScores parses back.
const LLM_CRITERIA = [
  'chart_evidence',
  'specificity',
  'synthesis',
  'contradiction_handling',
  'anti_cliche',
  'psychological_depth',
  'practical_usefulness',
  'voice_quality',
  'falsifiability',
] as const

// The full rubric the pass/fail decision runs over: the nine LLM criteria plus
// `length`, which is scored deterministically in code (word count vs the
// section's typed band) rather than asked of the model. It feeds MIN_INDIVIDUAL
// and MIN_PASS_AVERAGE exactly like every other criterion.
const CRITERIA = [...LLM_CRITERIA, 'length'] as const

// The nine model-scored criteria.
export type LlmScores = Record<typeof LLM_CRITERIA[number], number>

// The full score set the verdict is computed from: the nine LLM scores plus the
// deterministic length score.
export interface GateScores extends LlmScores {
  length: number
}

export interface GateResult {
  pass:     boolean
  // Verdict before deterministic doctrine backstops lower a score. This lets
  // orchestration distinguish an otherwise-approved section needing one local
  // copy edit from prose that genuinely failed the evaluator rubric.
  rubricPass: boolean
  scores:   GateScores | null
  // The nine scores EXACTLY as the evaluator returned them, before any
  // deterministic clamp (opener, antithesis tic, rescue phrasing, numeric fact,
  // hard rule breach) lowered one. `scores` is what the verdict is computed
  // from; this is what the rater actually said. Keeping both separable is what
  // lets a rubric change be measured against the rater's own output rather than
  // against a number a code-side clamp had already decided — the confound that
  // made `specificity` look like a prose problem when a floor was setting it.
  // Null on truncation and on evaluator error, where no rater output exists.
  llmScores: LlmScores | null
  // One short entry per criterion: the span the rater copied to justify a 4 or
  // 5, or the specific absence it named for a 3 or below. The rubric requires it
  // at EVERY point on the scale, which is the point — a one-sided audit
  // obligation creates a floor exactly where the obligation starts, and that is
  // the mechanism behind the old rubric pinning `falsifiability` at 3 in 98% of
  // sections while asking for an inversion only below 3. Diagnostic: it is what
  // tells you whether a low score found something or merely failed to look.
  evidence: Record<string, string> | null
  critique: string
  // Internal — true when the evaluator itself errored and we defaulted to a pass.
  // We never block the user on evaluator failure; we cache the first pass.
  evaluatorErrored: boolean
  // True when the section was truncated (truncation sentinel present, or the
  // prose ends mid-sentence). A truncated section hard-fails before scoring and
  // must never be cached or shown as final.
  truncated: boolean
}

// v10.31: INTERIM 3.40, down from 3.75. Under the v10.30 rubric the evaluator
// never awarded a 5 on any prose criterion (0 of 540 scores in the 2026-11-02
// run), so the best observed average was 3.50 first pass / 3.60 post-repair and
// 3.75 was unreachable — 0 of 62 sections passed. The v10.31 rubric adds 5→1
// anchors to every criterion; this bar sits above the old post-repair mean
// (3.25) so the gate still discriminates while the new anchors are measured.
// ⚠ MEASURED 2026-11-07 — THE STANDING NOTE HERE ("restore 3.75 once an eval
// run shows the rater using 4 and 5") IS RETIRED, AND THIS IS NOT THE BINDING
// PARAMETER. On fixtures/rater-bench/ (21 frozen sections, re-scored twice per
// rubric) the rater awarded 0 of 378 prose scores a 5 under three successive
// rubrics, including one that nearly doubled the 4s — and 43% of those 4s carry
// an `evidence` entry naming no shortfall at all, several asserting the 5
// condition outright. That is end-of-scale avoidance, so 3.75 is not coming
// back by waiting for it.
//
// More importantly, sweeping this constant from 2.90 to 3.40 on that corpus
// moves the pass rate only 14% → 10%, while MIN_INDIVIDUAL decides everything:
// at MIN_INDIVIDUAL 3 every bar in that range gives 4–6 of 42, at 2 it gives 14
// to 41. 36 of 42 sections are blocked by a single sub-3 criterion, and 27 of
// those are blocked ONLY by `specificity` and/or `voice_quality` — the one
// criterion where the prose genuinely has no scene (13 of 21 sections, the
// rater quoting the gestured-at phrase each time) and the one that is mostly
// the deterministic antithesis clamp (7 of 9 twos). So the pass rate is set by
// two real prose defects through MIN_INDIVIDUAL, not by this average. Tune this
// number only with that in hand. Note the gate runs under after(): either
// changes what the cache serves later readers, not the first-pass prose.
const MIN_PASS_AVERAGE = 3.40
export const MIN_INDIVIDUAL   = 3

// The marker the /api/reading route appends when the model stopped on
// max_tokens. Its presence means the section is incomplete.
export const TRUNCATION_SENTINEL = '[AXIS_TRUNCATED]'

// Count words the same way the length band is expressed: whitespace-separated
// tokens of the whole section (the handful of ## headers are negligible).
// Exported for unit testing — pure, no behaviour change.
export function countWords(text: string): number {
  const t = text.trim()
  return t.length === 0 ? 0 : t.split(/\s+/).length
}

// Words past the (aspect-scaled) hard ceiling before length ALONE hard-fails a
// section. Being somewhat over the band costs only partial marks — genuine
// depth on a densely aspected chart is high-variance and lands here, and true
// padding is caught by the prose criteria (cadence, repetition), not the word
// count. Only runaway length beyond this margin is a length hard-fail.
const LENGTH_RUNAWAY_MARGIN = 250

// Score the section's length against its typed band. The gate hard-fails length
// only for genuine under-delivery (below the hard floor) or runaway output
// (far past the ceiling); being a bit outside the band is a partial deduction,
// because padding — not raw length — is what the prose criteria exist to catch.
//   5  inside the full band
//   3  a bit short, or over the band but not yet runaway
//   1  below the hard floor (thinned/skipped material), or runaway length
// Exported for unit testing — pure, no behaviour change.
export function scoreLength(words: number, band: WordBand): number {
  if (words >= band.fullMin && words <= band.fullMax) return 5
  if (words < band.hardMin) return 1
  if (words > band.hardMax + LENGTH_RUNAWAY_MARGIN) return 1
  return 3
}

// Count the major aspects the section was built to work through, by reading the
// aspect blocks the interpretation engine emits into the chart context. Multiple
// blocks — e.g. Jupiter + Saturn, or the Ascendant's own — are summed. Used to
// scale the length band so a densely aspected chart is allowed the earned length
// a sparse one is not.
//
// Two block shapes exist and both must be counted:
//   • "ASPECTS (tightest first):"     — bullet lines (formatPlanetBlock,
//                                       formatAscendantBlock); the Sidereal
//     "GRAHA RELATIONSHIPS RECEIVED" block uses the same bullet shape
//   • "ALL MAJOR ASPECTS (tightest first):" — the key_aspects section, whose
//     entries are NOT bullet-prefixed. Matching only the bulleted header form
//     silently returned 0 for that section.
// Returns 0 when no such block is present (→ base band, unchanged behaviour).
// Exported for unit testing — pure, no behaviour change.
const ASPECT_ENTRY_RE = /^[A-Z][A-Za-z]* [^ ] [A-Z][A-Za-z]* \(orb /

export function countAspectsInContext(chartContext: string): number {
  let count = 0
  let inBulletBlock = false
  let inPlainBlock  = false
  for (const line of chartContext.split('\n')) {
    if (line.startsWith('ALL MAJOR ASPECTS (tightest first):')) {
      inPlainBlock = true; inBulletBlock = false; continue
    }
    // The Sidereal frame's equivalent: Jyotish drishti and same-sign
    // conjunctions received (interpretation-engine.ts GRAHA_RELATIONS_HEADER).
    if (line.startsWith('ASPECTS (tightest first):') || line.startsWith('GRAHA RELATIONSHIPS RECEIVED')) {
      inBulletBlock = true; inPlainBlock = false; continue
    }
    if (inBulletBlock) {
      // "• None …" states an absence; it is not an aspect to work.
      if (line.trimStart().startsWith('• None')) continue
      if (line.trimStart().startsWith('•')) count++
      else inBulletBlock = false // blank line or a new header ends the block
    } else if (inPlainBlock) {
      // "Sun ☌ Moon (orb 3.2°, applying, intensifying)". Indented continuation
      // lines and blanks are skipped; a new non-indented header ends the block.
      if (ASPECT_ENTRY_RE.test(line)) count++
      else if (line.length > 0 && !line.startsWith(' ')) inPlainBlock = false
    }
  }
  return count
}

// Deterministic backstop for the rescue-clause move (ease → hidden strength):
// a trailing value-assertion appended to a placement description that adds no
// astrological information, only reassurance about the strength's worth. Scans
// the generated prose for the curated high-precision BANNED_RESCUE_PHRASINGS —
// every one is a reassurance frame that is almost never a load-bearing mechanism,
// so a literal (case-insensitive) match is a reliable flag. Returns the matched
// phrases (deduped, in list order). The LLM `contradiction_handling` criterion
// catches the softer, context-dependent cases this list deliberately omits.
// Exported for unit testing — pure, no behaviour change.
export function detectRescuePhrasings(text: string): string[] {
  const hay = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of BANNED_RESCUE_PHRASINGS) {
    if (hay.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return hits
}

// Deterministic backstop for the convergent opener: every personal-planet
// section independently opening on "There is a particular kind of…". Scans ONLY
// the section's first sentence — leading "#"-heading lines and blank lines are
// stripped — because "there is a" mid-paragraph is ordinary English. Returns the
// matched opening text (at most one entry per pattern). A hit forces
// `specificity` below the pass bar in evaluateSection, the same mechanism as the
// rescue-clause backstop.
// Exported for unit testing — pure, no behaviour change.
export function detectBannedOpeners(text: string): string[] {
  const lines = text.split('\n')
  let i = 0
  while (i < lines.length && (lines[i].trim() === '' || lines[i].trimStart().startsWith('#'))) i++
  const opening = lines.slice(i).join('\n').trimStart().replace(/^["'“‘]+/, '')
  const hits: string[] = []
  for (const { pattern } of BANNED_OPENER_PATTERNS) {
    const m = opening.match(pattern)
    if (m) hits.push(m[0])
  }
  return hits
}

// A section is truncated if it carries the truncation sentinel or its prose ends
// mid-sentence — the final non-whitespace character is not terminal punctuation.
// Truncated sections hard-fail the gate and must never be cached.
// Exported for unit testing — pure, no behaviour change.
export function isTruncated(text: string): boolean {
  if (text.includes(TRUNCATION_SENTINEL)) return true
  const trimmed = text.replace(/\s+$/, '')
  if (trimmed.length === 0) return true
  const last = trimmed[trimmed.length - 1]
  // Terminal punctuation that legitimately ends a section of prose, including
  // closing quotes/brackets and the ellipsis character.
  return !/[.!?…"'”’)\]]/.test(last)
}

// Exported for the doctrine-parity tests, which assert the gate mirrors the
// banned moves stated in prompts.ts. Not used outside this module at runtime.
export const EVAL_SYSTEM_PROMPT = `You are the AXIS reading quality evaluator.

Your job is to score one generated section of an AXIS reading (natal or synastry) against AXIS's elite-reading criteria. The user turn carries the section inside <section_under_review>, the chart data it was written from inside <chart_context>, and the section's cadence allowance inside <section_meta>. Score <section_under_review> and nothing else; never claim to have inspected other sections or a complete dossier unless it is actually present. You return STRICT JSON only — no prose, no markdown, no preamble.

When THE READING SO FAR precedes the chart context, it is the earlier sections the reader has already read, verbatim. Do not score those sections — score only the generated section. Use them to judge REPETITION ACROSS THE READING: a section that re-explains what the reading so far already established (the same trait, defence pattern, scene, ruler chain or aspect, re-derived rather than referred to and built on), or that repeats an earlier section's opening or closing shape, is padding however well written — score it LOW on synthesis (each part must advance a claim the reader has not already been given) and on voice_quality. A brief, specific reference back that the section then builds on is correct and must not be penalised. Score LOW on contradiction_handling for a behavioural claim that flatly contradicts one the reading so far made (e.g. "anger passes fast" earlier, "frustration compresses and waits" here) without naming the condition under which each holds. Chart facts still come only from the chart context, never from the earlier prose.

THE SCORING PROCEDURE — this is not advice about attitude, it is the order of operations. Follow it for every criterion, one criterion at a time.

Each criterion below gives you an AWARD TEST (a specific feature to go and find in the text) and a list of faults (specific things to go and find). Both are things you LOCATE, not impressions you form. For each criterion, in this order:

STEP 1 — Run the AWARD TEST. Search the section for the feature it names. If the feature is there, copy the shortest span of the section that shows it.
STEP 2 — Run the fault list. Search the section for each fault the criterion names. If one is there, copy the span that shows it.
STEP 3 — Score from what you found, not from how the section felt:
  · feature found, no fault found → 5
  · feature found but thin in one respect, or one fault found → 4
  · feature not found, requirement met plainly anyway → 3
  · feature not found and a listed fault present → 2
  · the criterion's own 1 anchor describes the section → 1

Then write the \`evidence\` entry for that criterion: at 4 or 5, the span you copied in STEP 1; at 3 or below, the specific thing you searched for and did not find, or the fault span from STEP 2. Keep it under about fifteen words.

THE EVIDENCE ENTRY IS NOT OPTIONAL AND IT IS THE CHECK ON THE SCORE. Every score costs the same to justify, in both directions:
- If you scored 4 or 5 and cannot copy a span that shows the feature, you have not found it — the score is 3 or below.
- If you scored 3 or below and cannot name the specific thing that is absent, you did not search — go back to STEP 1. "Adequate", "competent", "could be stronger" and "lacks depth" are not absences; they are the absence of a search.

A 3 is a finding, not a resting place. It costs exactly as much to justify as a 5, and it is correct only when you can say what the section would have had to contain to score higher.

Two further rules:
- Score each criterion INDEPENDENTLY, on its own anchors and its own AWARD TEST. A section can be 5 on chart_evidence and 2 on specificity. Do not let a weakness on one criterion pull the others down, and do not average your overall impression across the row.
- Absence of a listed fault is not a deduction; it is the ordinary case. A section with no fault on a criterion and the feature present is a 5 on that criterion, and a rubric on which nothing ever scores 5 is measuring nothing.

WHAT COUNTS AS A SHORTFALL — read this with the anchors below, which are written in its terms.

The anchors ask whether the criterion's feature is present and whether it is doing the section's work. They do NOT ask you to verify a property of every sentence. A shortfall is LOAD-BEARING when it touches one of the section's major claims — the two or three claims the section is actually built on. It is INCIDENTAL when it touches a passing clause the section would survive losing.

- Incidental shortfalls do not move a score. A section whose feature is present and worked is a 5 even though some minor clause somewhere could have been tighter. There is always such a clause; requiring that there be none would make the top of this scale unreachable by construction, and a scale with an unreachable top measures nothing.
- One load-bearing shortfall is the 4.
- The feature absent, or two or more load-bearing shortfalls, is the 3 or below per the anchors.

Length is part of this judgement. These sections range from about 230 words to about 1000, and a longer section contains proportionally more passing clauses — so the same NUMBER of small blemishes is a lower density in a 1000-word section than in a 230-word one. Judge the density of load-bearing shortfalls, not the raw count, exactly as you are told to for the cadence allowance. Do not let a long section accumulate deductions simply by being long enough to contain more sentences.

CRITERIA (score each 1–5):

1. chart_evidence — Are major claims traceable to specific placements, houses, aspects, dignity, rulership, dispositors, nodes, dashas, or synthesis factors actually present in the chart context?
   5 = the section's major claims are each tied to a named chart factor, and the factors are WORKED rather than merely cited — dignity, the dispositor's condition or the orb class visibly drives an argument. Passing clauses that carry no factor are incidental and do not cost the 5.
   4 = the major claims are anchored, but one of them rests on a factor that is named without being worked.
   3 = one major claim is unanchored, or the anchoring throughout is citation beside a claim rather than a factor doing work.
   2 = anchoring is decorative — placements are named beside claims they do not actually support, or most of the section would read the same for a different chart.
   1 = unanchored, or built on a factor the chart does not contain.
   AWARD TEST: find a passage where a named chart factor is WORKED — the dignity, the dispositor's condition, or the orb class is used to drive the claim, not just cited beside it. Copy that passage.
   Score LOW for a factual claim the context contradicts: a superlative the context does not state ("the tightest aspect in the chart"), a house restated as a distance, a Sidereal shift called "forward", a wide (>6°) aspect given "real force" or made a recurring theme, a nakshatra's deity called its ruler, or Western aspects re-walked in a Sidereal section. Where the context carries a ⚠ BIRTH TIME UNKNOWN notice, score LOW for any house placement, Midheaven or dasha-timing claim stated as fact rather than marked conditional — and equally for a house claim made by describing its arena without the number ("how they are known professionally" is a 10th-house claim).

2. specificity — Does the section describe recognisable lived patterns from INSIDE the native's experience, rather than abstract trait labels?
   5 = at least one concrete recurring moment is drawn with its trigger, the action, and what the person registers afterwards, and it is the vehicle for the claim rather than an illustration appended to it. The reader could recognise the situation next week.
   4 = a real scene is present and specific, but thin in one respect — the trigger is named without the aftermath, or the moment is told once and not returned to.
   3 = situational language is present but generic: a described tendency with a gestured-at setting rather than a moment ("in relationships, you tend to…").
   2 = trait labels and abstraction throughout, with no situation the reader could place.
   1 = unanchored abstraction, or an invented specific the chart does not support (a fabricated duration, count, job or circumstance is worse than an abstraction and caps this criterion at 1).
   AWARD TEST: find the concrete moment and locate its THREE parts — the trigger, the action, and what the person registers afterwards. Copy the aftermath clause specifically, since that is the part most often missing. All three present and carrying the claim is a 5; the moment present with the aftermath missing is the 4.
   Score LOW for opening on what other people notice first, and for measuring the native against other people ("the gap that plagues so many people"). Score LOW too for opening the section on the existential frame (${BANNED_OPENER_LIST}): it announces that a quality exists instead of naming it. Score LOW for the observer-frame inversion: insights framed as the audience's verdict on the person ("others experience this as rare", "becomes most visible and most vulnerable", "what people receive from you") instead of the person's own interior — this is a hard fault even when it reads as flattering praise.

3. synthesis — Does the closing paragraph name the single live tension the person NAVIGATES and show how they inhabit it, and does each subsection advance a DIFFERENT claim?
   5 = the close names one live tension, leaves it open, and shows what inhabiting it costs; the subsections advance different claims, and at least one cross-reference (sign × house × aspect × dignity × ruler chain) is genuinely combined rather than listed. A subsection that briefly touches a neighbour's ground is incidental.
   4 = the tension is named and held open, but one of: a subsection re-arrives at another's central claim, or the close states the tension without showing it being lived.
   3 = the close is a competent wrap that neither re-lists the parts nor names a live tension — it ends, rather than resolving.
   2 = the close re-lists placements already covered, or two or more subsections re-arrive at the same central note in new clothes.
   1 = a summary with a summary heading, or a tension flattened into addition.
   AWARD TEST: find the closing paragraph and locate the one live tension it names and the cost of inhabiting it. Copy the clause that states the cost. Then check that no two subsections arrive at the same claim.
   The closing paragraph is unheaded: a section that heads it "Putting It Together", "Synthesis", "In Summary" or any variant has broken FORMATTING — score that LOW here. Score LOW for pseudo-synthesis: a summary that re-states the parts, or a flattening closer that resolves the tension by addition ("carries both simultaneously", "holds both at once", "needs both"). Score LOW for RESOLUTION-BY-HIERARCHY in dual-system (sidereal / synthesis) sections: resolving the Tropical/Sidereal divergence by depth-ranking the systems — positioning one as more true, deeper, more essential, more authentic, or more real than the other (the Sidereal as "what the identity is actually made of underneath" a Tropical "performance", one as essence and the other as mask/surface). Phrasings such as ${BANNED_HIERARCHY_LIST} are the paradigm failures. The same breach made with STACKING language counts identically: one frame built "on top of" the other, one as the "core", "engine" or "foundation", one as what the person "actually" wants, one as a defence against the other. The two systems are held simultaneously, neither subordinate to the other; ranking one beneath the other flattens the divergence exactly as pseudo-synthesis flattens a tension. Score LOW too for a claimed conflict the supplied evidence does not earn — a changed placement is a divergence, not proof of conflict, suffering, or a coping history — and for counting one unchanged angular relationship twice as if both frameworks produced it independently. Concordance is consistency across frameworks, not independent psychological proof. A divergence the chart shows as narrow, named at that size and left open, is correct: score that as accurate, not thin. Inflating it into drama and resolving it away are both failures.

4. contradiction_handling — Does it name paradoxes, compensations, tensions and mixed expressions, and hold them open rather than averaging them away?
   5 = at least one difficulty stands as an uncompensated cost, and the section's strengths are given plain function or a load-bearing mechanism rather than appended reassurance. Where a shadow is named it is the same quality under stress. A single slightly warm phrasing on a minor strength is incidental.
   4 = the contradictions are held, with one load-bearing soft edge — a major strength carrying reassurance, or a named shadow not followed through.
   3 = both sides appear but the tension is stated rather than inhabited; nothing is rescued and nothing is manufactured.
   2 = a difficulty is rescued into a virtue, OR a strength carries a trailing reassurance that fails the deletion test, OR a shadow is bolted on that is not that quality under stress.
   1 = the section systematically redeems what it names, or every quality arrives one-sided.
   AWARD TEST: find a difficulty that is left standing as a cost with nothing appended to redeem it. Copy the sentence where it is left standing. A section that leaves one such cost uncompensated and rescues nothing has met the 5 anchor's main requirement.
   Score LOW for the compensatory-reframe compulsion: a hard placement (fall, detriment, debilitation, tight hard aspect) rescued into a virtue in the breath that named it — "fall does not mean broken → genuinely uncommon", "serial destabilisation → a form of resilience". A difficulty is allowed to stand as a cost; a real strength located on its OWN separate placement is fine, but converting the wound just named into its own silver lining is the fault. Score LOW too for the MIRROR move — the RESCUE CLAUSE on a strength (ease → hidden strength): a plain placement or soft aspect described accurately, then followed by a trailing value-assertion that adds no astrological information, only reassurance about how valuable, rare, or underrated it is. Apply the DELETION TEST: if removing the clause leaves the astrological claim fully intact, the clause is flattery and must be flagged. Phrasings such as ${BANNED_RESCUE_LIST} are paradigm failures. A strength is legitimate ONLY as plain function ("the Pluto trine gives access to transformative experience without a hard aspect's destabilisation") or as a load-bearing mechanism against a named difficulty ("the Moon trine is what keeps the identity from fragmenting under the Neptune pressure") — never as an appended reassurance about its worth. Score LOW for the THIRD member of the same family — MANUFACTURED SHADOW: a strength followed by a flaw that is not that strength under stress but an unrelated trait bolted on to make the paragraph look balanced ("Leo warmth, but also secretly anxious" — the anxiety is not the warmth). A genuine shadow is the SAME quality in its distorted or unconscious expression ("Leo warmth hardening into needing to be central"); anything else is an invented claim with no chart behind it and is worse than leaving the shadow unstated. Conversely, score LOW for one-sided praise: a quality presented as if it had no stress-state at all. Where a placement's distorted expression is genuinely mild, stating it plainly and briefly is correct and must NOT be penalised as thin coverage.

5. anti_cliche — Does it avoid sun-sign clichés (Scorpio = secretive, Virgo = critical, Leo = needing spotlight), vague affirmations ("your sensitivity is a gift"), and horoscope-voice phrasing?
   5 = the section could not be reassembled from sign keywords: its characterisations are produced by this chart's particular combination of factors.
   4 = clean of cliché, with one load-bearing characterisation leaning on the archetype more than the placement.
   3 = no outright cliché, but the sign descriptions would broadly fit any chart with that sign.
   2 = one or more listed clichés, or a vague affirmation.
   1 = horoscope voice throughout.
   AWARD TEST: find a characterisation that could NOT be produced from the sign's keywords alone — one that needs this chart's particular combination of factors. Copy it. If the section's characterisations all require the combination, it is a 5.

6. psychological_depth — Does it explain defence patterns, relational dynamics, self-perception, blind spots, gifts and shadow with real psychological grain, or stay at trait-level surface?
   5 = the section explains a mechanism — why this pattern formed, what it protects against, what the person believes about it that is not accurate — and the explanation is specific to these placements.
   4 = real grain, with one pattern named at the level of behaviour rather than mechanism.
   3 = accurate description of behaviour without an account of what drives it.
   2 = trait-level throughout; the section describes what the person is like, not how they work.
   1 = restates placement keywords as psychology.
   AWARD TEST: find the mechanism — a passage saying why the pattern formed, what it protects against, or what the person believes about it that is not accurate. Copy it. Behaviour described without any such account is the 3.

7. practical_usefulness — Will the reader leave with clearer self-understanding — a recognisable pattern they can now see — rather than just aesthetic prose?
   5 = the section hands the reader something they can use: a named pattern plus the situations in which it fires, such that they would recognise it next time it happened.
   4 = the pattern is clear and recognisable but the reader is left to locate it themselves.
   3 = the reader finishes better informed about the chart than about themselves.
   2 = accurate but inert — nothing the reader could notice happening.
   1 = decorative.
   This criterion asks what the reader can DO with the section, not whether it gives advice. Advice is banned: do not reward a prescription, and do not penalise its absence.
   AWARD TEST: find a named pattern together with the situations in which it fires. Copy the clause naming the situation. If the reader could watch for it next week, that is the 5.

8. voice_quality — Does it sound like AXIS: precise, elegant, unsentimental, warm-but-honest, British spelling (favour/colour/recognised/practise), no mystical fluff, no wellness-industry softness, no predictions, no prescriptions?
   5 = the register holds, sentence shapes vary, and the prose is dense rather than ornamental — no construction has become a rhythm. One ornamental sentence in a long section is incidental; a shape that recurs is not.
   4 = the register holds, with one load-bearing lapse: a borrowed phrase, or one construction used as a rhythm.
   3 = correct register, flat execution — the prose is competent and uniform in shape.
   2 = a recurring tic: the struck fragment used more than once, the antithesis past its cap, or spelling slips.
   1 = wrong register — mystical, wellness, prescriptive, or predictive.
   AWARD TEST: read the last sentence of each paragraph in turn and check that they do not share one shape, then check that sentence lengths vary within a paragraph. Copy two paragraph-final sentences of genuinely different shape. Varied cadence with the register holding is a 5; correct register in uniform shapes is the 3.
   Score LOW for cadence over content: the weighted aphoristic fragment dropped after a dash to close paragraphs ("…not a consolation, but a fact.", "…it already has it.") used MORE THAN ONCE in the section — a predictable struck-chord rhythm is prose performing depth, not delivering it. Most paragraphs should end on an ordinary, fully-loaded sentence. Score LOW for the ANTITHESIS TIC: "X rather than Y", and its variants "not X but Y" / "less X than Y", used more often than the CADENCE ALLOWANCE stated for this section in the user turn. That allowance is scaled to the section's length, because the fault is density — do not judge against a fixed number of your own. Count the occurrences: one over the allowance is a deduction, and two or more over it caps this criterion at 2. Score LOW too for META-NARRATION — the prose announcing its own compliance with AXIS rules to a reader who has never seen them ("the cost is real rather than a secretly deeper form of love", "these are not mask and face", "this does not resolve into a hidden virtue"); paradigm phrasings: ${BANNED_META_LIST}. And score LOW for phrasing lifted from the reading so far or from the context's knowledge-base wording and repeated as a refrain.

9. falsifiability — Apply the INVERSION TEST to each major psychological claim, and ONLY the inversion test. Negate the claim: if the negation would ALSO sound broadly, plausibly true of almost any reader, then the claim excludes no one — it is a Barnum statement doing comfort work, not astrological work — and you deduct. A claim earns its place only if a neighbouring chart could plausibly falsify it.
   5 = the section's major claims each fail their own inversion — negate one and the negation reads as false for this chart. The section would be wrong about a neighbouring chart, which is what makes it worth asserting about this one. Judge the MAJOR claims, as this criterion's opening sentence says: broadly-endorsable phrasing in passing supporting clauses is incidental and does not cost the 5, because any section of this length contains some.
   4 = the major claims invert, but one of them does so only weakly — its negation is arguable rather than false for this chart.
   3 = the central claim inverts and a second major claim does not — it would be endorsed by almost any reader.
   2 = most major claims survive their inversion — the section would flatter most readers.
   1 = the section is built on universal endorsement.
   AWARD TEST: take the section's single biggest psychological claim and write its negation. If the negation reads as FALSE for this chart, the claim has earned its place — copy the claim. A section whose major claims all invert this way is a 5, and scoring 3 here means you found a central claim that inverts but several supporting claims that do not: name one of them in the evidence entry.
   Universal-endorsement phrasings such as ${BANNED_BARNUM_LIST} are the paradigm failures — mirror this list; a section that trades in them scores 2 or below. Do NOT re-score chart-anchoring here — whether a claim is tied to a named placement is criterion 1 (chart_evidence); this criterion asks only whether the claim, however anchored, could be false for someone. SCENE-CRAFT DOES NOT EXEMPT A CLAIM: a statement can be vivid, interior, and behaviourally concrete — scoring well on specificity (criterion 2) — and still be universally endorsable. The two axes are orthogonal. Worked example: "${FALSIFIABILITY_DIVERGENCE_EXAMPLE}" reads as a specific interior scene (it PASSES specificity) yet its negation is equally endorsable and it collapses to the banned "you want to be understood" line (it FAILS falsifiability). Score LOW when major claims survive only because they are too universal to be false.

DECISION RULES:
- Score all nine criteria above by running each one's AWARD TEST and fault list, in that order. A tenth criterion, length, is scored deterministically outside this prompt from the section's word count against its band: do NOT score or mention length.
- The pass/fail verdict is computed outside this prompt from all ten scores. You do not return a verdict, and you must not aim at one. Do not reason about whether the section is ready to ship, whether it would pass, or what a threshold might be: a judgement about shippability made alongside the scores contaminates them, because a section you have decided is not ready will not be given the 5s its individual criteria have earned. Score the nine criteria on their own evidence and stop there.
- Every score needs its \`evidence\` entry, at every point on the scale. Write them as you go, one per criterion, in the same order as the scores.
- If ANY criterion scores below 4, write a CRITIQUE that is a list of concrete, actionable repair instructions. Reference specific chart factors the section ignored, specific clichés to remove, specific contradictions left unnamed, specific voice problems to fix. The critique will be fed back into a regeneration pass — write it for the model that has to rewrite the section, not for a human review committee. Keep it concise: cover ONLY the criteria that scored below 4, do NOT write a paragraph for every criterion, and stay under roughly 150 words.
- A repair must not cost the section what it already has. Where you ask for a change, say what to leave intact — the criteria currently scoring 4 or 5 are what the rewrite has to preserve. Name them in one clause.
- AUDITABILITY: if falsifiability scores below 4, set "falsifiability_inversion" to the single most-endorsable claim you found in the section AND its negation, written out so a reviewer can see that BOTH read as broadly true — this is the expanded form of that criterion's evidence entry, and it is what justifies awarding less than full marks. When falsifiability is 4 or 5, set "falsifiability_inversion" to an empty string.
- If every criterion scores 4 or 5, critique should be an empty string.

OUTPUT FORMAT (strict JSON, no markdown fence, no surrounding text). "scores" comes first and must be complete; "evidence" carries one entry per criterion, under about fifteen words each — the span you copied at 4 or 5, the specific absence at 3 or below:
{
  "scores": {
    "chart_evidence": <1-5>,
    "specificity": <1-5>,
    "synthesis": <1-5>,
    "contradiction_handling": <1-5>,
    "anti_cliche": <1-5>,
    "psychological_depth": <1-5>,
    "practical_usefulness": <1-5>,
    "voice_quality": <1-5>,
    "falsifiability": <1-5>
  },
  "evidence": {
    "chart_evidence": "<span found, or the specific absence>",
    "specificity": "<span found, or the specific absence>",
    "synthesis": "<span found, or the specific absence>",
    "contradiction_handling": "<span found, or the specific absence>",
    "anti_cliche": "<span found, or the specific absence>",
    "psychological_depth": "<span found, or the specific absence>",
    "practical_usefulness": "<span found, or the specific absence>",
    "voice_quality": "<span found, or the specific absence>",
    "falsifiability": "<span found, or the specific absence>"
  },
  "critique": "<repair instructions or empty string>",
  "falsifiability_inversion": "<constructed claim + negation when falsifiability < 4, else empty string>"
}`

// One client per instance, created on first use: a fresh client per call threw
// away its keep-alive connection pool, so every eval/repair paid a new TLS
// handshake. Lazy so a module import never reads the key.
let anthropicClient: Anthropic | null = null
function getAnthropic(): Anthropic {
  anthropicClient ??= new Anthropic({ apiKey: getAnthropicKey() ?? undefined })
  return anthropicClient
}

// The evaluator's system prompt is identical on every call, so it is sent as a
// cached block: a natal reading evaluates ~21 sections within minutes of each
// other, and only the first should pay full price for it.
const EVAL_SYSTEM_BLOCKS: Anthropic.TextBlockParam[] = [
  { type: 'text', text: EVAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
]

// The user turn for an evaluator or repair call. With no reading so far it is
// the plain string the gate has always sent. With one, the earlier sections go
// first as the SAME blocks the generation request sent (priorSectionBlocks, cache
// breakpoint on the last), so the reading so far — the bulk of the input by the
// later sections — is a cache read rather than full-price input on every call.
function userTurn(priorBlocks: Anthropic.TextBlockParam[] | undefined, ...texts: string[]): string | Anthropic.TextBlockParam[] {
  if (!priorBlocks || priorBlocks.length === 0) return texts.join('\n\n')
  const [first, ...rest] = texts
  return [
    ...priorBlocks,
    { type: 'text', text: `${READING_SO_FAR_FOOTER}\n\n${first}` },
    ...rest.map((text): Anthropic.TextBlockParam => ({ type: 'text', text })),
  ]
}

// Per-call request options. A gate call is only worth making if it can finish
// inside the invocation: after() shares the route's maxDuration, and the SDK's
// own default (a 10-minute timeout, two retries) would let a slow call run past
// the platform kill — losing the cache write AND the spend record for a call
// that billed. `timeoutMs` comes from gateForCache's remaining budget.
function requestOptions(timeoutMs?: number): Anthropic.RequestOptions | undefined {
  return timeoutMs == null ? undefined : { timeout: Math.max(1000, Math.floor(timeoutMs)), maxRetries: 0 }
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// Strip optional ```json fences and leading whitespace so JSON.parse succeeds
// even when the model adds a markdown wrapper despite instructions.
// Exported for unit testing — pure, no behaviour change.
export function stripJsonFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return s
}

// Validate the nine model-scored criteria from the evaluator's JSON. `length`
// is not among them — it is computed in code and merged in evaluateSection.
// Exported for unit testing — pure, no behaviour change.
export function validateScores(obj: unknown): LlmScores | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const result = {} as LlmScores
  for (const key of LLM_CRITERIA) {
    const v = o[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 5) return null
    result[key] = v
  }
  return result
}

// Salvage the scores object from a raw evaluator response whose trailing
// critique truncated the JSON (stop_reason: max_tokens). The scores object is
// small, has no nested objects, and is emitted first, so a non-greedy match up
// to the first closing brace recovers it even when the rest of the payload is
// unterminated. Returns null when no complete, valid scores object is present.
// Exported for unit testing — pure, no behaviour change.
export function extractScoresFromRaw(raw: string): LlmScores | null {
  const s = stripJsonFence(raw)
  const m = s.match(/"scores"\s*:\s*(\{[^{}]*\})/)
  if (!m) return null
  try {
    return validateScores(JSON.parse(m[1]))
  } catch {
    return null
  }
}

// Deterministic critique used only when the model's own critique was lost to
// truncation. Names the criteria that scored below the pass bar so the repair
// pass still has direction. Exported for unit testing — pure, no behaviour change.
export function buildFallbackCritique(scores: GateScores): string {
  const weak = CRITERIA.filter(k => scores[k] < 4).map(k => `${k} (scored ${scores[k]})`)
  if (weak.length === 0) return ''
  return `The section fell short on: ${weak.join(', ')}. Rewrite to raise every one of these: anchor each major claim to a specific chart factor, name the contradictions the section averaged away, cut clichés and universally-endorsable (Barnum) statements, and deepen the psychological and situational detail.`
}

// Exported for unit testing — pure, no behaviour change.
export function computePassFromScores(scores: GateScores): boolean {
  const values = CRITERIA.map(k => scores[k])
  const min    = Math.min(...values)
  const avg    = values.reduce((a, b) => a + b, 0) / values.length
  return avg >= MIN_PASS_AVERAGE && min >= MIN_INDIVIDUAL
}

export interface EvaluateInput {
  generatedText: string
  // This section's own chart context and instruction. When priorBlocks is set it
  // must NOT also carry the reading so far — that travels in priorBlocks.
  chartContext:  string
  section:       string
  planetSection: string
  // The reading so far as cacheable blocks (priorSectionBlocks). Optional: an
  // opening section, or a caller with no thread, sends none.
  priorBlocks?:  Anthropic.TextBlockParam[]
  // How this call is labelled in the [AXIS_USAGE] log: the first-pass score or
  // the re-score of a repair.
  usageCall?:    'evaluate' | 'recheck'
  // Hard per-call timeout (ms). Omitted: the SDK default applies.
  timeoutMs?:    number
}

export async function evaluateSection({
  generatedText, chartContext, section, planetSection, priorBlocks, usageCall = 'evaluate', timeoutMs,
}: EvaluateInput): Promise<GateResult> {
  // Truncation is a hard, pre-scoring failure: a section that carries the
  // truncation sentinel or ends mid-sentence is incomplete and must never be
  // scored, repaired-in-place, or cached. Caught before spending an eval call.
  if (isTruncated(generatedText)) {
    return {
      pass:     false,
      rubricPass: false,
      scores:   null,
      llmScores: null,
      evidence: null,
      critique: 'Section is truncated — it carries the truncation sentinel or ends mid-sentence. It must be regenerated in full; truncated output must never be cached or shown as final.',
      evaluatorErrored: false,
      truncated: true,
    }
  }

  // Hoisted above the eval call: the band decides BOTH the deterministic
  // `length` score below and this section's cadence allowance, and the
  // allowance has to be in the evaluator's user turn. One computation, so the
  // number the evaluator is told and the number the clamp enforces cannot
  // differ. The band is aspect/evidence-scaled, so a densely aspected placement
  // that earned the extra words earns the room to vary its cadence across them.
  const band = wordBandFor(
    section,
    planetSection,
    countAspectsInContext(chartContext),
    countPlanEvidence(chartContext, planetSection) ?? undefined,
  )

  // Three bodies of text the evaluator must keep apart — earlier sections, the
  // chart context, and the section under review — were separated only by
  // visually identical rule lines, one of them followed by model-generated
  // prose free to contain anything. Tags make "score only this section"
  // referable instead of merely stated.
  const evalUserContent = `<section_meta>
type: ${section} → ${planetSection}
cadence_allowance: the contrastive construction ("X rather than Y", "not X but Y", "less a X than Y") is limited by DENSITY, not by a total for the section — at most once in any one paragraph, and across the section no more often than once every two paragraphs. Twice in one paragraph is a fault; three times in one paragraph is a failure. Judge the ANTITHESIS TIC against that and against no number of your own.
</section_meta>

<chart_context>
${chartContext}
</chart_context>

<section_under_review>
${generatedText}
</section_under_review>

Score <section_under_review> against the nine criteria. Chart facts come from <chart_context>. Earlier sections, where present, are evidence of repetition only. Return the JSON object the system prompt specifies.`

  try {
    const msg = await getAnthropic().messages.create({
      model:         EVAL_MODEL,
      max_tokens:    EVAL_MAX_TOKENS,
      thinking:      EVAL_THINKING,
      output_config: { effort: EVAL_EFFORT },
      system:        EVAL_SYSTEM_BLOCKS,
      messages:    [{ role: 'user', content: userTurn(priorBlocks, evalUserContent) }],
    }, requestOptions(timeoutMs))
    logUsage(`${section}/${planetSection}`, usageCall, EVAL_MODEL, msg.usage, { stop: msg.stop_reason ?? 'none' })

    const raw = extractText(msg)

    let parsed: {
      scores?:                   unknown
      evidence?:                 unknown
      critique?:                 unknown
      falsifiability_inversion?: unknown
    } | null
    try {
      parsed = JSON.parse(stripJsonFence(raw))
    } catch {
      // A long critique can hit max_tokens and truncate the JSON mid-string.
      // Don't fail open on that — the scores are recoverable (see below).
      parsed = null
    }

    // Verdict integrity over critique completeness. The scores object is small
    // and emitted first, so recover it directly when the trailing critique
    // truncated the JSON. Failing open here would ship exactly the Barnum-
    // saturated sections the gate exists to catch.
    const llmScores = (parsed && validateScores(parsed.scores)) || extractScoresFromRaw(raw)
    if (!llmScores) {
      console.error('Reading quality gate: invalid scores object in evaluator output')
      return { pass: true, rubricPass: true, scores: null, llmScores: null, evidence: null, critique: '', evaluatorErrored: true, truncated: false }
    }

    // Merge the deterministic length score against this section's typed band, so
    // an over-long (or thin) section is caught even when the prose is otherwise
    // strong. Length feeds MIN_INDIVIDUAL / MIN_PASS_AVERAGE like any criterion.
    // The band is scaled to how many major aspects this chart actually gives the
    // section, so earned depth on a densely aspected chart is not failed as if
    // it were padding — padding is still caught by the prose criteria and by the
    // (scaled) ceiling a sparse chart would not get.
    const words      = countWords(generatedText)
    const scores: GateScores = { ...llmScores, length: scoreLength(words, band) }

    // Deterministic opener backstop. Applied BEFORE rubricPass, unlike the
    // rescue clamp below: rubricPass is what routes a doctrine-only failure to
    // the surgical sentence edit, and that edit cannot fix an opening. Left
    // after, a section with both a doctrine hit and a banned opener would be
    // spliced, pass the scan, and be cached with the opener intact.
    const openerHits = detectBannedOpeners(generatedText)
    if (openerHits.length > 0) {
      scores.specificity = Math.min(scores.specificity, MIN_INDIVIDUAL - 1)
    }

    // Deterministic antithesis backstop (PART 4's one-per-section cap, and the
    // cadence half of PROSE FAILURE MODES #1). Applied BEFORE rubricPass for the
    // same reason as the opener: the doctrine-only route splices individual
    // sentences, and a construction repeated across the whole section is not a
    // sentence-level fault, so a spliced section would be cached with the tic
    // intact. Clamps voice_quality, the criterion the tic actually degrades.
    //
    // Why deterministic: on the 2026-11-03 eval run the evaluator cited this tic
    // in 11 of 21 critiques unprompted, and the scan independently counted 15
    // instances — but the scan's finding was `soft` and fed nothing, so it only
    // reached the repair as free text the rater happened to write, and the
    // sections where it said nothing shipped the tic. The count is a string fact
    // about the output; it should not depend on a judgment call.
    //
    // GRADUATED, matching the rubric prose the evaluator is handed verbatim
    // ("two is a deduction and four or more caps this criterion at 2"). Clamping
    // below the bar on the second instance — what v10.34 shipped — made a
    // two-instance cadence slip a hard failure for every section class, which on
    // the scan's own numbers is 39 of 63 sections. Each of those takes a full
    // repair, and a repair that lands on two again (near-native cadence for this
    // model) fails its re-score and caches provisionally for 24h, so the section
    // is regenerated for every reader every day. Over the cap now clamps TO the
    // bar — a real deduction, since it drags MIN_PASS_AVERAGE and still earns the
    // critique below — and only ANTITHESIS_HARD_THRESHOLD, where the construction
    // has become the section's default sentence shape, clamps beneath it.
    //
    // ⚠ v10.45 — WHAT IS COUNTED IS DENSITY IN A PARAGRAPH, not a total against
    // a band-derived cap. The per-section cap did not hold (10 of 21 frozen
    // sections breached it, 6 hard) and was not tracking density: see the long
    // note in reading-rule-scan.ts. Holding the rater's pre-clamp scores fixed
    // on that corpus so only this clamp moves, the first-pass pass rate goes
    // 2 of 21 -> 4 of 21, and the two sections still failed are the two worst by
    // density. The graduation is unchanged.
    const antithesis = antithesisVerdict(generatedText)
    const antithesisHits = antithesis.hits
    const antithesisOverCap = antithesis.severity !== 'clean'
    if (antithesisOverCap) {
      scores.voice_quality = Math.min(
        scores.voice_quality,
        antithesis.severity === 'hard' ? MIN_INDIVIDUAL - 1 : MIN_INDIVIDUAL,
      )
    }
    // ── Deterministic FACT backstop (reading-fact-check.ts).
    //
    // WHY THIS IS NOW A CLAMP. checkNumericFacts was calibrated against 84 real
    // sections and produced 0 false positives on `hard`, which makes it the
    // best-validated signal in this pipeline — better calibrated than the LLM
    // evaluator's own `chart_evidence`, which scored the "half a degree from
    // your Sun" fabrication 3-4. It fed a log line and nothing else, because
    // the only options considered were "veto the cache" (a false positive makes
    // a section uncacheable forever: a model call on every page load) and "do
    // nothing". There is a third, and the opener and antithesis backstops
    // already use it: clamp the criterion and name the fault in the critique.
    // A false positive then costs one repair pass, not permanent uncacheability.
    //
    // chart_evidence is the criterion, and the clamp goes BELOW the bar rather
    // than to it: a confident, specific, false claim about this person's chart
    // is the worst output this product can produce, so it earns a repair on its
    // own. Applied BEFORE rubricPass, like the opener, because the doctrine-only
    // route splices sentences for a doctrine breach and cannot correct a fact.
    //
    // Inside evaluateSection, so the repair's re-score (usageCall 'recheck')
    // runs the same check — a repair that introduces a fabricated degree was
    // previously cacheable for the full 30-day TTL.
    const factHits = checkNumericFacts(generatedText, chartContext).filter(f => f.severity === 'hard')
    if (factHits.length > 0) {
      scores.chart_evidence = Math.min(scores.chart_evidence, MIN_INDIVIDUAL - 1)
    }

    // ── Deterministic STATED-RULE backstop (reading-rule-scan.ts).
    //
    // `hard` findings are unambiguous breaches of a rule SHARED_RULES states:
    // second-person prescriptions and predictions, bullet points, greetings and
    // sign-offs, American spelling, a reintroduced summary heading, a natal
    // section with no second-person address at all. The reader notices every
    // one of them immediately and each is a string fact about the output.
    //
    // Clamped TO the bar, not below it, which is the graduated treatment the
    // antithesis tic got in v10.39: a real deduction that drags
    // MIN_PASS_AVERAGE and earns the critique, without making a single slip an
    // automatic repair. The scan carries more rules than the fact check and its
    // false-positive budget has not been measured in production, so it gets the
    // more conservative clamp of the two.
    //
    // `doctrine` and `soft` findings still feed nothing: DOCTRINE.md is explicit
    // that the grep finds candidates and THE LAW decides, and a soft finding is
    // a breach only in aggregate.
    const ruleHits = scanSectionRules(generatedText, { frame: section })
      .filter(f => f.severity === 'hard')
    if (ruleHits.length > 0) {
      scores.voice_quality = Math.min(scores.voice_quality, MIN_INDIVIDUAL)
    }

    const rubricPass = computePassFromScores(scores)

    // Deterministic rescue-clause backstop (ease → hidden strength). A literal
    // match on a curated reassurance frame forces contradiction_handling below
    // the pass bar, so the section is repaired even when the evaluator's own
    // read of criterion 4 missed the appended flattery.
    const rescueHits = detectRescuePhrasings(generatedText)
    if (rescueHits.length > 0) {
      scores.contradiction_handling = Math.min(scores.contradiction_handling, MIN_INDIVIDUAL - 1)
    }

    // Trust the scores over the model's pass field — recompute deterministically.
    const pass = computePassFromScores(scores)
    let critique = (parsed && typeof parsed.critique === 'string') ? parsed.critique.trim() : ''
    // If the JSON truncated before the critique was captured, synthesise an
    // actionable one from the criteria that scored below the pass bar so the
    // repair pass still has direction.
    if (!pass && !critique) {
      critique = buildFallbackCritique(scores)
    }

    // When length is the (or a) failing criterion, make the target explicit in
    // the critique so the repair pass rewrites to the band rather than guessing.
    if (!pass && scores.length < MIN_INDIVIDUAL) {
      const runaway = words > band.hardMax
      console.warn(`Reading quality gate: length=${scores.length} — ${words} words for ${section}/${planetSection} (band ${band.fullMin}–${band.fullMax}, hard cap ${band.hardMax})`)
      critique = `LENGTH FAILURE — the section is ${words} words, ${runaway ? `runaway length far past the ~${band.hardMax}-word ceiling for a chart of this complexity` : `under the ${band.hardMin}-word floor`} (target ${band.target}, full band ${band.fullMin}–${band.fullMax}). ${runaway ? 'This is beyond what even a densely aspected chart earns — cut padding, repetition, and cadence tics (PROSE FAILURE MODES) hard, keeping only substance.' : 'Develop the required material — more chart worked through — to reach the band.'}\n\n${critique}`.trim()
    }

    // When the rescue-clause backstop fired, name the exact phrasing(s) and the
    // deletion test in the critique so the repair pass cuts the flattery rather
    // than guessing which sentence tripped the deduction.
    if (!pass && rescueHits.length > 0) {
      console.warn(`Reading quality gate: rescue-clause phrasing(s) detected for ${section}/${planetSection}: ${rescueHits.join('; ')}`)
      critique = `RESCUE-CLAUSE FAILURE — the section appends value-asserting reassurance to a strength instead of naming it plainly. The following phrasing(s) add no astrological information: ${rescueHits.map(p => `"${p}"`).join(', ')}. Apply the deletion test: if removing the clause leaves the astrological claim intact, cut it. Replace each with either the strength's plain function or the load-bearing mechanism it performs against a named difficulty — never reassurance about how rare, valuable, or underrated it is.\n\n${critique}`.trim()
    }

    // Name the opener and the opening this section was given, so the repair
    // rewrites the first sentence to its mode instead of swapping in a synonym
    // for the same frame.
    if (!pass && openerHits.length > 0) {
      console.warn(`Reading quality gate: banned opener detected for ${section}/${planetSection}: ${openerHits.join('; ')}`)
      const mode = openerModeFor(section, planetSection)
      const instead = mode
        ? `Rewrite the opening to this section's OPENING MODE: open on ${mode}`
        : 'Open instead on a named chart factor or the concrete moment it produces.'
      critique = `OPENER FAILURE — the section's first sentence opens on the banned existential frame ("${openerHits[0]}…"). It announces that a quality exists instead of naming it, and every section reaching for it makes the assembled reading open the same way repeatedly. Do not substitute another existential opener (${BANNED_OPENER_LIST}). ${instead}\n\n${critique}`.trim()
    }

    // Name every instance and the cap, so the repair cuts to one rather than
    // guessing which constructions the deduction was for. The count leads: the
    // breach is the repetition, not any single use.
    if (!pass && antithesisOverCap) {
      console.warn(`Reading quality gate: antithesis tic x${antithesisHits.length} for ${section}/${planetSection}: ${antithesisHits.map(h => h.match).join('; ')}`)
      critique = `ANTITHESIS-TIC FAILURE \u2014 the contrastive "X rather than Y" construction (and its variants "not X but Y", "less a X than Y") is too DENSE. ${antithesis.cause === 'paragraph' ? `One paragraph carries ${antithesis.maxPerParagraph} of them (${antithesisHits.length} in the section); the CADENCE ALLOWANCE permits at most one per paragraph.` : `The section carries ${antithesisHits.length} across ${antithesis.paragraphs} paragraphs; the CADENCE ALLOWANCE permits at most one every two paragraphs, so ${antithesis.allowance} here.`} The instances: ${antithesisHits.map(h => `"${h.match}"`).join(', ')}. Keep the most load-bearing one in each affected paragraph and rewrite the rest as direct statements \u2014 say what the placement does, not what it does instead of. Do not swap in another antithesis frame or a dash-balanced equivalent; this is the cadence half of PROSE FAILURE MODES #1, so varying the wording while keeping the shape does not fix it.\n\n${critique}`.trim()
    }

    // Name the figure and the sentence, so the repair corrects the claim rather
    // than rewriting prose that was accurate. The instruction is to re-derive
    // from the context, never to delete the number: a section that drops every
    // figure to clear the check has lost the anchoring criterion 1 rewards.
    if (!pass && factHits.length > 0) {
      console.warn(`Reading quality gate: numeric fact error(s) for ${section}/${planetSection}: ${factHits.map(f => f.match).join('; ')}`)
      const items = factHits.map(f => `· "${f.match}" in: ${f.context}`).join('\n')
      critique = `FACT FAILURE \u2014 the section states ${factHits.length === 1 ? 'a figure' : 'figures'} the chart context does not support. Each of these is either invented or copied onto the wrong pair of bodies:\n${items}\nRe-derive every figure from the chart context, which states each degree and orb the section is entitled to use. Where the context gives no figure for a claim, make the claim without one \u2014 do not approximate and do not strip the surrounding anchoring, which criterion 1 scores.\n\n${critique}`.trim()
    }

    // One line per breached rule, with the matched text, so the repair fixes the
    // specific construction instead of re-reading 11,000 tokens of rules.
    if (!pass && ruleHits.length > 0) {
      console.warn(`Reading quality gate: ${ruleHits.length} hard rule breach(es) for ${section}/${planetSection}: ${ruleHits.map(f => f.rule).join('; ')}`)
      const items = ruleHits.map(f => `· ${f.rule} (line ${f.line}): "${f.match}"`).join('\n')
      critique = `STATED-RULE BREACH \u2014 the section breaks ${ruleHits.length === 1 ? 'a rule' : 'rules'} SHARED_RULES states outright:\n${items}\nFix each at the construction named. A \`prescription\` or \`prediction\` finding is repaired by stating what the pattern DOES in the present tense, not by hedging the advice; \`register-drift\` is repaired by making the reader the grammatical subject throughout (PART 4); \`summary-heading\` is repaired by deleting the heading and letting the closing paragraph run on from the last sub-section (PART 8).\n\n${critique}`.trim()
    }

    // Auditability for the Barnum axis: when falsifiability failed, the rater
    // must have emitted the constructed claim + negation it deducted on. Surface
    // that reasoning — log it, and prepend it to the critique so the repair pass
    // sees exactly which universally-endorsable claim to anchor or cut, rather
    // than a bare integer.
    const inversion = (parsed && typeof parsed.falsifiability_inversion === 'string')
      ? parsed.falsifiability_inversion.trim()
      : ''
    if (!pass && scores.falsifiability < MIN_INDIVIDUAL && inversion) {
      console.warn(`Reading quality gate: falsifiability=${scores.falsifiability} — Barnum inversion: ${inversion}`)
      critique = `BARNUM / FALSIFIABILITY FAILURE — the following claim is universally endorsable (its negation reads as equally true) and must be anchored to a named chart factor or cut:\n${inversion}\n\n${critique}`.trim()
    }

    // ⚠ The critique is returned whether or not the section passed. The rubric
    // instructs the evaluator to write one "whenever any criterion is below 4",
    // i.e. for a section that passes with real weaknesses — and dropping it on
    // pass threw exactly those away. The repair path is gated on `pass`, not on
    // this string, so nothing downstream rewrites a passing section because of
    // it; what the text IS used for is measurement. The eval harness's `scene`
    // metric reads these critiques, and with the critique blanked on pass its
    // numerator could only ever come from failing sections, so the metric moved
    // the wrong way as the pass rate improved.
    // Strings only, and only for real criteria — the field is model output and
    // is used for diagnosis, never for the verdict.
    const rawEvidence = parsed && typeof parsed.evidence === 'object' && parsed.evidence !== null
      ? parsed.evidence as Record<string, unknown>
      : null
    const evidence = rawEvidence
      ? Object.fromEntries(
          LLM_CRITERIA
            .filter(c => typeof rawEvidence[c] === 'string')
            .map(c => [c, (rawEvidence[c] as string).trim()]),
        )
      : null

    return {
      pass,
      rubricPass,
      scores,
      llmScores,
      evidence,
      critique,
      evaluatorErrored: false,
      truncated: false,
    }
  } catch (err) {
    // Never block a user on evaluator failure — fall through to caching the
    // first pass. The prompt's own constraints remain in force; the gate is
    // an additional safety net, not a single point of failure.
    console.error('Reading quality gate evaluator error:', err instanceof Error ? err.message : err)
    return { pass: true, rubricPass: true, scores: null, llmScores: null, evidence: null, critique: '', evaluatorErrored: true, truncated: false }
  }
}

export interface RepairInput {
  // Same content that produced the failed first draft — chart blocks + section instructions.
  originalUserContent: string
  // The reading so far, exactly as the generation request sent it. Passing the
  // same blocks lets the repair read the generation's prompt cache.
  priorBlocks?:        Anthropic.TextBlockParam[]
  systemBlocks:        Anthropic.TextBlockParam[]
  failedDraft:         string
  critique:            string
  maxTokens:           number
  model:               string
  label?:              string   // section/planetSection, for the [AXIS_USAGE] log
  timeoutMs?:          number   // hard per-call timeout; omitted → SDK default
}

export async function repairSection({
  originalUserContent, priorBlocks, systemBlocks, failedDraft, critique, maxTokens, model, label = 'unknown', timeoutMs,
}: RepairInput): Promise<string> {
  // The failed draft sits ABOVE the instruction, not below it. Sent last it
  // occupied the strongest recency position in the prompt with the prose the
  // rewrite is supposed to discard, which is the likeliest contributor to
  // `repair-failed-recheck` — a repair that fails its re-score caches
  // provisionally for 24h and is then regenerated for every reader, daily.
  // Tagged for the same reason the exemplar is: quoted material must not be
  // formatted identically to the output the model is about to produce.
  const repairInstruction = `──────────── QUALITY-GATE REPAIR PASS ────────────
A first draft of this section fell below the AXIS quality threshold. It appears below inside <failed_draft>, for diagnosis only. Its wording is spent: a phrase that appears in it does not appear in your rewrite unless the critique specifically commended it.

<failed_draft>
${failedDraft}
</failed_draft>

<critique>
${critique}
</critique>

Write the section again, in full, from the chart context and the rules. Keep the structure, the sub-headers and the depth target. Address every point in the critique, and preserve what the critique names as already working.

Your reply is the section and nothing else. Its first character is the section's first character — typically the ## heading. The critique is invisible to the reader, so the prose never mentions a rewrite, a first draft, or a correction.`

  const msg = await getAnthropic().messages.create({
    model,
    max_tokens:  maxTokens,
    thinking:    THINKING,
    system:      systemBlocks,
    messages:    [{ role: 'user', content: userTurn(priorBlocks, originalUserContent, repairInstruction) }],
  }, requestOptions(timeoutMs))
  logUsage(label, 'repair', model, msg.usage, { stop: msg.stop_reason ?? 'none' })

  return extractText(msg)
}

interface TextSpan {
  start: number
  end:   number
  text:  string
}

// Identify only the sentences that contain a deterministic doctrine hit. The
// segmenter's indices let us splice replacements back into the original draft;
// every byte outside these spans therefore remains unchanged.
function doctrineRepairTargets(draft: string, hits: string[]): TextSpan[] {
  const needles = hits.map(hit => hit.toLowerCase())
  const segmenter = new Intl.Segmenter('en', { granularity: 'sentence' })
  const segments = Array.from(segmenter.segment(draft)).map(seg => ({
    start: seg.index,
    end:   seg.index + seg.segment.length,
    text:  seg.segment,
  }))
  const targets: TextSpan[] = []
  const taken = new Set<number>()

  // A CONTEXTUAL term breaches THE LAW only near identity/system language, so
  // only those occurrences are at fault. A literal phrasing is at fault wherever
  // it appears.
  const contextual = new Set(HIERARCHY_CONTEXTUAL_TERMS.map(t => t.toLowerCase()))
  const identity = new RegExp(`(?:${HIERARCHY_IDENTITY_TOKENS.join('|')})`, 'gi')
  const lower = draft.toLowerCase()
  const identityAt: number[] = []
  for (const m of Array.from(draft.matchAll(identity))) if (m.index != null) identityAt.push(m.index)
  const nearIdentity = (start: number, end: number) =>
    identityAt.some(i => i <= end + HIERARCHY_PROXIMITY_CHARS && i + HIERARCHY_PROXIMITY_CHARS >= start)

  for (const needle of needles) {
    // Find every occurrence of this hit in the draft and take the sentence(s)
    // it actually falls in. Matching on offsets rather than per-sentence
    // substring matters twice over:
    //   1. A CONTEXTUAL hit is a bare ordinary word ("underneath") flagged by
    //      PROXIMITY to identity language somewhere in the section. Rewriting
    //      every sentence containing that word — including the innocent ones
    //      far from any identity claim — edits prose that was never at fault.
    //   2. A literal phrase can straddle a sentence boundary, in which case a
    //      per-sentence substring search finds nothing at all, the repair throws,
    //      and the section is left permanently uncached — regenerating on every
    //      page load, which is the exact hole the gate exists to close.
    let from = 0
    for (;;) {
      const at = lower.indexOf(needle, from)
      if (at < 0) break
      const hitEnd = at + needle.length
      if (contextual.has(needle) && !nearIdentity(at, hitEnd)) { from = at + Math.max(1, needle.length); continue }
      for (let i = 0; i < segments.length; i++) {
        if (segments[i].end > at && segments[i].start < hitEnd && !taken.has(i)) {
          taken.add(i)
          targets.push(segments[i])
        }
      }
      from = at + Math.max(1, needle.length)
    }
  }
  return targets.sort((a, b) => a.start - b.start)
}

// A doctrine-only failure does not justify regenerating an otherwise passing
// 650-word section. Ask for replacements for the offending sentences alone,
// then splice them into the draft so unrelated passages cannot regress.
export async function repairDoctrineSentences(
  draft: string,
  hits: string[],
  model: string,
  label = 'unknown',   // section/planetSection, for the [AXIS_USAGE] log
  timeoutMs?: number,
): Promise<string> {
  const targets = doctrineRepairTargets(draft, hits)
  // A hit the segmenter cannot localise (or one whose text has already been
  // edited out) leaves nothing to splice. Fall back to the caller's full-repair
  // path rather than caching nothing: an uncached section costs a model call on
  // every subsequent page load.
  if (targets.length === 0) throw new Error('No sentence found for doctrine hit')

  const numbered = targets.map((target, index) => `${index + 1}. ${target.text.trim()}`).join('\n')
  const msg = await getAnthropic().messages.create({
    model,
    max_tokens: DOCTRINE_REPAIR_MAX_TOKENS,
    thinking: THINKING,
    system: `You make surgical copy edits. Rewrite only the supplied sentences to remove the named AXIS doctrine violations. Preserve each sentence's concrete astrological meaning, tone, and approximate length. Do not add reassurance, rank Tropical above Sidereal or vice versa, or describe one frame as deeper, truer, masked, underneath, built on top of, or the core of another. Where a sentence only announces the reading's own compliance (that a cost will not be redeemed, that two frames are not being ranked), replace it with the plain claim it was guarding, or with a sentence carrying the next piece of chart evidence. Return only a JSON array of replacement sentence strings, in the same order and with exactly the same number of items.`,
    messages: [{
      role: 'user',
      content: `Banned phrasing or hierarchy terms: ${hits.map(hit => `"${hit}"`).join(', ')}\n\nSentences:\n${numbered}`,
    }],
  }, requestOptions(timeoutMs))
  logUsage(label, 'doctrine-repair', model, msg.usage, { stop: msg.stop_reason ?? 'none' })

  const raw = extractText(msg).trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '')
  const replacements: unknown = JSON.parse(raw)
  if (!Array.isArray(replacements) || replacements.length !== targets.length ||
      replacements.some(item => typeof item !== 'string' || item.trim().length === 0)) {
    throw new Error('Invalid doctrine repair response')
  }

  let repaired = draft
  for (let i = targets.length - 1; i >= 0; i--) {
    const target = targets[i]
    const original = target.text
    const leading = original.match(/^\s*/)?.[0] ?? ''
    const trailing = original.match(/\s*$/)?.[0] ?? ''
    repaired = repaired.slice(0, target.start) + leading + (replacements[i] as string).trim() + trailing + repaired.slice(target.end)
  }
  return repaired
}

// ── Deterministic doctrine scan ───────────────────────────────────────────────

// NOT a semantic gate — it catches only the high-precision, unambiguous banned
// phrasings that have no legitimate use in a reading. Two passes, because the
// doctrine has two shapes of violation:
//   1. LITERAL    — constructions with no innocent use, matched as substrings.
//   2. CONTEXTUAL — ordinary words ("underneath", "beneath", "the mask") that
//      breach THE LAW only next to identity/system language, matched by
//      proximity rather than bare presence. Keep bare ordinary words OUT of the
//      literal lists: a false positive still spends an unnecessary surgical repair
//      call and changes prose that did not need editing.
// Exported for unit testing — pure, no behaviour change.
export function detectBannedPhrasings(text: string): string[] {
  const hay = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of [...BANNED_HIERARCHY_PHRASINGS, ...BANNED_RESCUE_PHRASINGS, ...BANNED_META_PHRASINGS]) {
    if (hay.includes(phrase.toLowerCase())) hits.push(phrase)
  }
  return [...hits, ...detectContextualHierarchy(text)]
}

// ── Evaluate-and-recache orchestration ────────────────────────────────────────

// Wall-clock guards, measured from the START of the request so that a slow first
// pass correctly shrinks what is left for gating. All of this runs after the
// response has been delivered, so overrunning costs the cache write — never the
// reader's section. The route's maxDuration is 120s; these leave room for the
// slowest observed pass of each kind plus the Redis write.
const EVAL_SKIP_AFTER_MS   = 95_000  // an eval is ~5–15s
const REPAIR_SKIP_AFTER_MS = 70_000  // a repair is a full regeneration, ~20–45s
// The skip guards above bound when a call STARTS. This bounds when it must END:
// every gate call is given a request timeout that expires here, leaving the
// route's 120s maxDuration a few seconds for the Redis write and spend record.
const GATE_HARD_DEADLINE_MS = 112_000

export interface GateForCacheInput {
  firstPassText: string
  // The same user content the first pass was generated from — its final block
  // when priorBlocks is set (the reading so far is NOT repeated in here).
  chartContext:  string
  // The reading so far, exactly as the first pass was sent it (priorSectionBlocks).
  priorBlocks?:  Anthropic.TextBlockParam[]
  section:       string
  planetSection: string
  systemBlocks:  Anthropic.TextBlockParam[]
  maxTokens:     number
  model:         string
  startedAt:     number   // Date.now() at the top of the request handler
  // The generation's own stop_reason === 'max_tokens'. Authoritative where
  // isTruncated()'s heuristic is not: a section cut off at the token ceiling can
  // still happen to end on a full stop, which the end-of-prose check would pass.
  truncated:     boolean
  // Called the moment each billable gate call is made, so the caller can record
  // spend per call. Recording only a total at the end lost every call made
  // before the platform killed an overrunning invocation.
  onModelCall?:  () => void
}

export interface GateForCacheResult {
  // The text to cache, or null when nothing should be cached — a failing,
  // unrepairable, or doctrine-breaching section is left uncached so the next
  // request gets a fresh attempt rather than a frozen bad one.
  cacheText:  string | null
  modelCalls: number   // billable calls this gating pass made, for the daily budget
  scores:     GateScores | null
  repaired:   boolean
  reason:     string
  // The evaluator's verdict on the FIRST PASS, before any repair — null when no
  // evaluation ran (truncated, gate disabled, out of budget). `scores` above is
  // the repair's re-score on the repaired / repair-failed-recheck paths, so this
  // is the only record of how the first pass itself scored. Read by the batch
  // eval harness (scripts/eval-readings.mjs); the route ignores it.
  firstPass:  GateResult | null
  // When cacheText is null because the gate could not confirm the section (as
  // opposed to it being truncated or doctrine-breaching), the doctrine-clean
  // first pass, for the caller to cache with a SHORT TTL. Leaving such a section
  // uncached made every later view of the chart regenerate and re-gate it — ~4
  // model calls per view, indefinitely.
  provisionalText?: string | null
}

// One greppable line per gated section. This is the only place gate scores are
// observable in production — `[AXIS_GATE]` in the logs answers "what fraction of
// sections fail, and on which criterion".
function logGateOutcome(label: string, reason: string, scores: GateScores | null): void {
  const scoreStr = scores
    ? CRITERIA.map(k => `${k}=${scores[k]}`).join(' ')
    : 'scores=none'
  console.log(`[AXIS_GATE] section=${label} reason=${reason} ${scoreStr}`)
}

// Cache the text only if the deterministic scan is clean. Used on the paths that
// skip the LLM gate entirely (gate disabled, out of wall-clock budget), which
// keeps them at exactly the pre-gate behaviour rather than a weaker one.
function cacheIfClean(text: string, reason: string, label: string, modelCalls: number): GateForCacheResult {
  const hits = detectBannedPhrasings(text)
  if (hits.length > 0) {
    console.warn(`[AXIS_DOCTRINE_UNCACHED] section=${label} hits=${hits.join('|')}`)
    return { cacheText: null, modelCalls, scores: null, repaired: false, reason: `${reason}+doctrine-hit`, firstPass: null }
  }
  return { cacheText: text, modelCalls, scores: null, repaired: false, reason, firstPass: null }
}

// Decide what — if anything — this section should leave behind in the cache.
// Called AFTER the response stream has closed, so it never delays the reader.
// Never throws: a gating failure must not surface anywhere near the request.
export async function gateForCache(input: GateForCacheInput): Promise<GateForCacheResult> {
  const {
    firstPassText, chartContext, priorBlocks, section, planetSection,
    systemBlocks, maxTokens, model, startedAt, truncated, onModelCall,
  } = input
  const label = `${section}/${planetSection}`
  const remainingMs = () => startedAt + GATE_HARD_DEADLINE_MS - Date.now()
  const noteCall = () => { try { onModelCall?.() } catch { /* best-effort */ } }
  // The first pass, if it is safe to serve for a short while. Never a truncated
  // or doctrine-breaching text — those stay uncached exactly as before.
  const provisional = detectBannedPhrasings(firstPassText).length === 0 ? firstPassText : null

  // Truncated or empty output is never cached, never scored, never repaired in
  // place — it has to be regenerated in full, so spending an eval call on it
  // would buy nothing.
  if (truncated || firstPassText.trim().length === 0 || isTruncated(firstPassText)) {
    return { cacheText: null, modelCalls: 0, scores: null, repaired: false, reason: 'truncated-or-empty', firstPass: null }
  }

  // Kill switch, mirroring AXIS_READINGS_ENABLED: gating roughly doubles the model
  // calls an uncached section costs (triples it when a repair fires), so it must be
  // possible to stop that during a spend incident without a redeploy.
  if (process.env.AXIS_GATE_ENABLED === 'false') {
    return cacheIfClean(firstPassText, 'gate-disabled', label, 0)
  }

  if (Date.now() - startedAt > EVAL_SKIP_AFTER_MS) {
    console.warn(`[AXIS_GATE] section=${label} eval skipped — ${Date.now() - startedAt}ms elapsed`)
    return cacheIfClean(firstPassText, 'eval-skipped-budget', label, 0)
  }

  // evaluateSection swallows its own errors (returning evaluatorErrored), so this
  // resolves either way. Count the call regardless: a response that failed to parse
  // still billed tokens, and over-counting spend is the safe direction.
  noteCall()
  const gate = await evaluateSection({
    generatedText: firstPassText,
    chartContext,
    priorBlocks,
    section,
    planetSection,
    timeoutMs: remainingMs(),
  })
  let modelCalls = 1

  // The deterministic scan is folded in as a failure condition, not just a cache
  // veto. Pre-gate, a doctrine hit meant "never cache" — so the section regenerated
  // on every single page load, burning a model call each time and usually
  // re-violating. Routing it through the repair pass is what closes that hole.
  const bannedHits = detectBannedPhrasings(firstPassText)
  const needsRepair = !gate.pass || bannedHits.length > 0

  if (!needsRepair) {
    const reason = gate.evaluatorErrored ? 'passed-evaluator-errored' : 'passed'
    logGateOutcome(label, reason, gate.scores)
    return { cacheText: firstPassText, modelCalls, scores: gate.scores, repaired: false, reason, firstPass: gate }
  }

  // If the rubric passes and only the deterministic doctrine scan objects, edit
  // only the offending sentence(s). A full regeneration spends far more tokens
  // and creates fresh regression risk in prose the evaluator already approved.
  //
  // Only on a verdict the evaluator actually produced: when it errored we
  // defaulted `rubricPass` to true to fail open on the prose criteria, and that
  // default is not evidence the rest of the section is sound.
  if (gate.rubricPass && !gate.evaluatorErrored && gate.scores != null && bannedHits.length > 0) {
    if (Date.now() - startedAt > REPAIR_SKIP_AFTER_MS) {
      logGateOutcome(label, 'failed-doctrine-repair-skipped-budget', gate.scores)
      return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'failed-doctrine-repair-skipped-budget', firstPass: gate }
    }
    try {
      modelCalls++
      noteCall()
      const repaired = await repairDoctrineSentences(firstPassText, bannedHits, model, label, remainingMs())
      const remainingHits = detectBannedPhrasings(repaired)
      if (remainingHits.length === 0 && !isTruncated(repaired)) {
        logGateOutcome(label, 'doctrine-repaired', gate.scores)
        return { cacheText: repaired, modelCalls, scores: gate.scores, repaired: true, reason: 'doctrine-repaired', firstPass: gate }
      }
      console.warn(`[AXIS_GATE] section=${label} surgical repair did not clear the scan — falling back to full repair`)
    } catch (err) {
      console.error(`[AXIS_GATE] section=${label} surgical doctrine repair failed:`, err instanceof Error ? err.message : err)
    }
    // Fall through to the full repair below rather than returning uncached. A
    // null here means the section is regenerated from scratch on EVERY
    // subsequent page load — a permanent model call against the daily cap, for
    // a section the ordinary repair path can still fix. The surgical pass is an
    // optimisation; when it does not land, pay for the full repair once.
  }

  let critique = gate.critique
  if (bannedHits.length > 0) {
    critique = `DOCTRINE FAILURE — the section uses banned phrasing(s) with no legitimate use in an AXIS reading: ${bannedHits.map(p => `"${p}"`).join(', ')}. Remove each one. Do not substitute a synonym for the same move: a difficulty stays a difficulty, a strength is named as plain function, and the two systems are held simultaneously with neither ranked beneath the other.\n\n${critique}`.trim()
  }

  if (Date.now() - startedAt > REPAIR_SKIP_AFTER_MS) {
    console.warn(`[AXIS_GATE] section=${label} repair skipped — ${Date.now() - startedAt}ms elapsed`)
    logGateOutcome(label, 'failed-repair-skipped-budget', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'failed-repair-skipped-budget', firstPass: gate, provisionalText: provisional }
  }

  let repaired: string
  try {
    modelCalls++  // count the attempt: a call that throws late can still have billed
    noteCall()
    repaired = await repairSection({
      originalUserContent: chartContext,
      priorBlocks,
      systemBlocks,
      failedDraft: firstPassText,
      critique,
      maxTokens,
      model,
      label,
      timeoutMs: remainingMs(),
    })
  } catch (err) {
    console.error(`[AXIS_GATE] section=${label} repair pass failed:`, err instanceof Error ? err.message : err)
    logGateOutcome(label, 'failed-repair-errored', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'failed-repair-errored', firstPass: gate, provisionalText: provisional }
  }

  // First, the cheap deterministic gates on the repair — a repair that came back
  // truncated or doctrine-breaching is never cached, and neither is worth an eval
  // call to confirm.
  if (repaired.trim().length === 0 || isTruncated(repaired)) {
    logGateOutcome(label, 'repair-truncated-or-empty', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'repair-truncated-or-empty', firstPass: gate, provisionalText: provisional }
  }
  const repairedHits = detectBannedPhrasings(repaired)
  if (repairedHits.length > 0) {
    console.warn(`[AXIS_DOCTRINE_UNCACHED] section=${label} hits=${repairedHits.join('|')} (after repair)`)
    logGateOutcome(label, 'repair-doctrine-hit', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'repair-doctrine-hit', firstPass: gate, provisionalText: provisional }
  }

  // Then re-score the repair against the full rubric before caching it. A repair
  // that merely stopped tripping the deterministic scan is NOT necessarily better
  // than the first pass it replaced — it can regress across the prose criteria and
  // still be complete and doctrine-clean. Caching it unverified freezes
  // sub-threshold prose for the 30-day TTL, which is worse than caching nothing
  // (the next request just regenerates). The re-eval costs one more model call, but
  // only on the minority of sections that reached repair, and only when there is
  // wall-clock budget for it. Out of budget → fall back to the prior behaviour and
  // cache on the deterministic signals alone.
  if (Date.now() - startedAt > EVAL_SKIP_AFTER_MS) {
    logGateOutcome(label, 'repaired-recheck-skipped-budget', gate.scores)
    return { cacheText: repaired, modelCalls, scores: gate.scores, repaired: true, reason: 'repaired-recheck-skipped-budget', firstPass: gate }
  }

  noteCall()
  const recheck = await evaluateSection({
    generatedText: repaired,
    chartContext,
    priorBlocks,
    section,
    planetSection,
    usageCall: 'recheck',
    timeoutMs: remainingMs(),
  })
  modelCalls++

  // Evaluator failure never blocks caching — the repair is complete and
  // doctrine-clean, and the prompt's own constraints still held during the repair.
  if (recheck.evaluatorErrored) {
    logGateOutcome(label, 'repaired-recheck-errored', gate.scores)
    return { cacheText: repaired, modelCalls, scores: gate.scores, repaired: true, reason: 'repaired-recheck-errored', firstPass: gate }
  }

  // The repair still fails the rubric — do not cache it. Leaving it uncached lets
  // the next reader's request regenerate from scratch rather than serving prose the
  // gate could not confirm for 30 days.
  if (!recheck.pass) {
    logGateOutcome(label, 'repair-failed-recheck', recheck.scores)
    return { cacheText: null, modelCalls, scores: recheck.scores, repaired: false, reason: 'repair-failed-recheck', firstPass: gate, provisionalText: provisional }
  }

  // The repair passes the rubric on its own re-score — cache it, and report the
  // repair's own scores, not the failed first pass's.
  logGateOutcome(label, 'repaired', recheck.scores)
  return { cacheText: repaired, modelCalls, scores: recheck.scores, repaired: true, reason: 'repaired', firstPass: gate }
}
