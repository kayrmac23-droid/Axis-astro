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
// repair instructions; the repaired text is what gets cached.
//
// This is the load-bearing check the prompt alone cannot enforce: model output
// is non-deterministic, and a strong prompt can still occasionally produce a
// generic, under-synthesised, or insufficiently chart-grounded section. The
// gate refuses to ship those.
//
// Threshold: average score ≥ 3.75 / 5 AND no individual criterion below 3.
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
import {
  BANNED_BARNUM_LIST,
  BANNED_RESCUE_LIST,
  BANNED_RESCUE_PHRASINGS,
  BANNED_HIERARCHY_LIST,
  BANNED_HIERARCHY_PHRASINGS,
  detectContextualHierarchy,
  wordBandFor,
  WordBand,
} from '@/lib/prompts'

// The semantic doctrine check needs the discriminating judgment that only the
// stronger model reliably delivers: Haiku is fast but too lenient on the subtle
// failure modes the gate exists to catch (pseudo-synthesis, compensatory
// reframes, under-grounded prose). Sonnet's slower, sharper read is worth the
// added latency because the gate is the last line before caching.
const EVAL_MODEL = 'claude-sonnet-4-6'
// Failure-path output is the sizing constraint, not the pass path: a failing
// section emits scores + a repair critique + the falsifiability_inversion
// evidence field. The critique is kept concise and failing-criteria-only (see
// the system prompt), which keeps this comfortably in budget; extractScoresFromRaw
// is the backstop if a critique still truncates the JSON, so the verdict never
// fails open regardless.
const EVAL_MAX_TOKENS = 1200
const EVAL_TEMPERATURE = 0

const REPAIR_TEMPERATURE = 0.2

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
  scores:   GateScores | null
  critique: string
  // Internal — true when the evaluator itself errored and we defaulted to a pass.
  // We never block the user on evaluator failure; we cache the first pass.
  evaluatorErrored: boolean
  // True when the section was truncated (truncation sentinel present, or the
  // prose ends mid-sentence). A truncated section hard-fails before scoring and
  // must never be cached or shown as final.
  truncated: boolean
}

const MIN_PASS_AVERAGE = 3.75
const MIN_INDIVIDUAL   = 3

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
//                                       formatAscendantBlock)
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
    if (line.startsWith('ASPECTS (tightest first):')) {
      inBulletBlock = true; inPlainBlock = false; continue
    }
    if (inBulletBlock) {
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

Your job is to score a single generated section of a natal chart reading against AXIS's elite-reading criteria. You return STRICT JSON only — no prose, no markdown, no preamble.

CRITERIA (score each 1–5; 5 = elite, 4 = strong, 3 = adequate, 2 = weak, 1 = unacceptable):

1. chart_evidence — Are major claims traceable to specific placements, houses, aspects, dignity, rulership, dispositors, nodes, dashas, or synthesis factors actually present in the chart context? Generic claims with no chart anchor score low.
2. specificity — Does the section describe recognisable lived patterns (concrete scenes, behavioural moments) from INSIDE the native's experience, rather than abstract trait labels? Score LOW for the observer-frame inversion: insights framed as the audience's verdict on the person ("others experience this as rare", "becomes most visible and most vulnerable", "what people receive from you") instead of the person's own interior — this is a hard fault even when it reads as flattering praise.
3. synthesis — Does the closing/"Putting It Together" name the single live tension the person NAVIGATES and show how they inhabit it, rather than re-listing placements already covered? Score LOW for pseudo-synthesis: a summary that re-states the parts, or a flattening closer that resolves the tension by addition ("carries both simultaneously", "holds both at once", "needs both"). Are cross-references genuinely combined (sign × house × aspect × dignity × ruler chain), and does each subsection advance a DIFFERENT claim rather than re-arriving at one central note in new clothes? Score LOW for RESOLUTION-BY-HIERARCHY in dual-system (sidereal / synthesis) sections: resolving the Tropical/Sidereal divergence by depth-ranking the systems — positioning one as more true, deeper, more essential, or more real than the other (the Sidereal as "what the identity is actually made of underneath" a Tropical "performance", one as essence and the other as mask/surface). Phrasings such as ${BANNED_HIERARCHY_LIST} are the paradigm failures. The two systems are held simultaneously, neither subordinate to the other; ranking one beneath the other flattens the divergence exactly as pseudo-synthesis flattens a tension.
4. contradiction_handling — Does it name paradoxes, compensations, tensions, and mixed expressions? When two placements pull in opposite directions, is the contradiction held open rather than averaged away? Score LOW for the compensatory-reframe compulsion: a hard placement (fall, detriment, debilitation, tight hard aspect) rescued into a virtue in the breath that named it — "fall does not mean broken → genuinely uncommon", "serial destabilisation → a form of resilience". A difficulty is allowed to stand as a cost; a real strength located on its OWN separate placement is fine, but converting the wound just named into its own silver lining is the fault. Score LOW too for the MIRROR move — the RESCUE CLAUSE on a strength (ease → hidden strength): a plain placement or soft aspect described accurately, then followed by a trailing value-assertion that adds no astrological information, only reassurance about how valuable, rare, or underrated it is. Apply the DELETION TEST: if removing the clause leaves the astrological claim fully intact, the clause is flattery and must be flagged. Phrasings such as ${BANNED_RESCUE_LIST} are paradigm failures. A strength is legitimate ONLY as plain function ("the Pluto trine gives access to transformative experience without a hard aspect's destabilisation") or as a load-bearing mechanism against a named difficulty ("the Moon trine is what keeps the identity from fragmenting under the Neptune pressure") — never as an appended reassurance about its worth. Score LOW for the THIRD member of the same family — MANUFACTURED SHADOW: a strength followed by a flaw that is not that strength under stress but an unrelated trait bolted on to make the paragraph look balanced ("Leo warmth, but also secretly anxious" — the anxiety is not the warmth). A genuine shadow is the SAME quality in its distorted or unconscious expression ("Leo warmth hardening into needing to be central"); anything else is an invented claim with no chart behind it and is worse than leaving the shadow unstated. Conversely, score LOW for one-sided praise: a quality presented as if it had no stress-state at all. Where a placement’s distorted expression is genuinely mild, stating it plainly and briefly is correct and must NOT be penalised as thin coverage.
5. anti_cliche — Does it avoid sun-sign clichés (Scorpio = secretive, Virgo = critical, Leo = needing spotlight), vague affirmations ("your sensitivity is a gift"), and horoscope-voice phrasing?
6. psychological_depth — Does it explain defence patterns, relational dynamics, self-perception, blind spots, gifts, and shadow with real psychological grain — or stay at trait-level surface?
7. practical_usefulness — Will the reader leave with clearer self-understanding (a recognisable scene, a named pattern they can now see) rather than just aesthetic prose?
8. voice_quality — Does it sound like AXIS: precise, elegant, unsentimental, warm-but-honest, British spelling (favour/colour/recognised/practise), no mystical fluff, no wellness-industry softness, no predictions, no prescriptions? Score LOW for cadence over content: the weighted aphoristic fragment dropped after a dash to close paragraphs ("…not a consolation, but a fact.", "…it already has it.") used MORE THAN ONCE in the section — a predictable struck-chord rhythm is prose performing depth, not delivering it. Most paragraphs should end on an ordinary, fully-loaded sentence.
9. falsifiability — Apply the INVERSION TEST to each major psychological claim, and ONLY the inversion test. Negate the claim: if the negation would ALSO sound broadly, plausibly true of almost any reader, then the claim excludes no one — it is a Barnum statement doing comfort work, not astrological work — and you deduct. A claim earns its place only if a neighbouring chart could plausibly falsify it. Universal-endorsement phrasings such as ${BANNED_BARNUM_LIST} are the paradigm failures — mirror this list; a section that trades in them scores 2 or below. Do NOT re-score chart-anchoring here — whether a claim is tied to a named placement is criterion 1 (chart_evidence); this criterion asks only whether the claim, however anchored, could be false for someone. SCENE-CRAFT DOES NOT EXEMPT A CLAIM: a statement can be vivid, interior, and behaviourally concrete — scoring well on specificity (criterion 2) — and still be universally endorsable. The two axes are orthogonal. Worked example: "${FALSIFIABILITY_DIVERGENCE_EXAMPLE}" reads as a specific interior scene (it PASSES specificity) yet its negation is equally endorsable and it collapses to the banned "you want to be understood" line (it FAILS falsifiability). Score LOW when major claims survive only because they are too universal to be false.

DECISION RULES:
- Score all nine criteria above. The final pass/fail is computed outside this prompt: your nine scores are combined with a tenth, deterministic length score (word count vs the section's target band), and pass = true ONLY IF the average of all ten is ≥ 3.75 AND no individual score is below 3. Do NOT score or mention length yourself — just score the nine.
- If pass = false, write a CRITIQUE that is a list of concrete, actionable repair instructions. Reference specific chart factors the section ignored, specific clichés to remove, specific contradictions left unnamed, specific voice problems to fix. The critique will be fed back into a regeneration pass — write it for the model that has to rewrite the section, not for a human review committee. Keep it concise: cover ONLY the criteria that scored below 4, do NOT write a paragraph for every criterion, and stay under roughly 150 words.
- AUDITABILITY: if falsifiability scores below 3, set "falsifiability_inversion" to the single most-endorsable claim you found in the section AND its negation, written out so a reviewer can see that BOTH read as broadly true — this is your evidence for the deduction, not a bare integer. When falsifiability is 3 or above, set "falsifiability_inversion" to an empty string.
- If pass = true, critique should be an empty string.

OUTPUT FORMAT (strict JSON, no markdown fence, no surrounding text):
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
  "pass": <true|false>,
  "critique": "<repair instructions or empty string>",
  "falsifiability_inversion": "<constructed claim + negation when falsifiability < 3, else empty string>"
}`

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: getAnthropicKey() ?? undefined })
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
  chartContext:  string
  section:       string
  planetSection: string
}

export async function evaluateSection({
  generatedText, chartContext, section, planetSection,
}: EvaluateInput): Promise<GateResult> {
  // Truncation is a hard, pre-scoring failure: a section that carries the
  // truncation sentinel or ends mid-sentence is incomplete and must never be
  // scored, repaired-in-place, or cached. Caught before spending an eval call.
  if (isTruncated(generatedText)) {
    return {
      pass:     false,
      scores:   null,
      critique: 'Section is truncated — it carries the truncation sentinel or ends mid-sentence. It must be regenerated in full; truncated output must never be cached or shown as final.',
      evaluatorErrored: false,
      truncated: true,
    }
  }

  const evalUserContent = `SECTION TYPE: ${section} → ${planetSection}

──────────── CHART CONTEXT THE SECTION WAS GENERATED FROM ────────────
${chartContext}

──────────── GENERATED SECTION TO EVALUATE ────────────
${generatedText}

Score the generated section against the criteria and return the JSON object specified in the system prompt.`

  try {
    const msg = await getAnthropic().messages.create({
      model:       EVAL_MODEL,
      max_tokens:  EVAL_MAX_TOKENS,
      temperature: EVAL_TEMPERATURE,
      system:      EVAL_SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: evalUserContent }],
    })

    const raw = extractText(msg)

    let parsed: {
      scores?:                   unknown
      pass?:                     unknown
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
      return { pass: true, scores: null, critique: '', evaluatorErrored: true, truncated: false }
    }

    // Merge the deterministic length score against this section's typed band, so
    // an over-long (or thin) section is caught even when the prose is otherwise
    // strong. Length feeds MIN_INDIVIDUAL / MIN_PASS_AVERAGE like any criterion.
    // The band is scaled to how many major aspects this chart actually gives the
    // section, so earned depth on a densely aspected chart is not failed as if
    // it were padding — padding is still caught by the prose criteria and by the
    // (scaled) ceiling a sparse chart would not get.
    const band       = wordBandFor(section, planetSection, countAspectsInContext(chartContext))
    const words      = countWords(generatedText)
    const scores: GateScores = { ...llmScores, length: scoreLength(words, band) }

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

    return {
      pass,
      scores,
      critique: pass ? '' : critique,
      evaluatorErrored: false,
      truncated: false,
    }
  } catch (err) {
    // Never block a user on evaluator failure — fall through to caching the
    // first pass. The prompt's own constraints remain in force; the gate is
    // an additional safety net, not a single point of failure.
    console.error('Reading quality gate evaluator error:', err instanceof Error ? err.message : err)
    return { pass: true, scores: null, critique: '', evaluatorErrored: true, truncated: false }
  }
}

export interface RepairInput {
  // Same content that produced the failed first draft — chart blocks + section instructions.
  originalUserContent: string
  systemBlocks:        Anthropic.TextBlockParam[]
  failedDraft:         string
  critique:            string
  maxTokens:           number
  model:               string
}

export async function repairSection({
  originalUserContent, systemBlocks, failedDraft, critique, maxTokens, model,
}: RepairInput): Promise<string> {
  const repairUserContent = `${originalUserContent}

──────────── QUALITY-GATE REPAIR PASS ────────────
The first draft of this section did not meet the AXIS quality threshold. The evaluator's critique follows. Rewrite the section from scratch, addressing every point in the critique while keeping the same structure, sub-headers, and depth target.

CRITIQUE TO ADDRESS:
${critique}

DO NOT:
- Reference this critique in your output
- Apologise, hedge, or explain that you are rewriting
- Reuse phrasing from the first draft unless it was specifically commended

Produce only the rewritten section. The first character of your reply must be the section's first character (typically the ## heading).

For reference only — the first draft that failed (do NOT quote, echo, or recycle it):
${failedDraft}`

  const msg = await getAnthropic().messages.create({
    model,
    max_tokens:  maxTokens,
    temperature: REPAIR_TEMPERATURE,
    system:      systemBlocks,
    messages:    [{ role: 'user', content: repairUserContent }],
  })

  return extractText(msg)
}

// ── Deterministic doctrine scan ───────────────────────────────────────────────

// NOT a semantic gate — it catches only the high-precision, unambiguous banned
// phrasings that have no legitimate use in a reading. Two passes, because the
// doctrine has two shapes of violation:
//   1. LITERAL    — constructions with no innocent use, matched as substrings.
//   2. CONTEXTUAL — ordinary words ("underneath", "beneath", "the mask") that
//      breach THE LAW only next to identity/system language, matched by
//      proximity rather than bare presence. Keep bare ordinary words OUT of the
//      literal lists: a false positive here makes a section permanently
//      uncacheable, which costs a full model call on every page load.
// Exported for unit testing — pure, no behaviour change.
export function detectBannedPhrasings(text: string): string[] {
  const hay = text.toLowerCase()
  const hits: string[] = []
  for (const phrase of [...BANNED_HIERARCHY_PHRASINGS, ...BANNED_RESCUE_PHRASINGS]) {
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

export interface GateForCacheInput {
  firstPassText: string
  chartContext:  string   // the same user content the first pass was generated from
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
    return { cacheText: null, modelCalls, scores: null, repaired: false, reason: `${reason}+doctrine-hit` }
  }
  return { cacheText: text, modelCalls, scores: null, repaired: false, reason }
}

// Decide what — if anything — this section should leave behind in the cache.
// Called AFTER the response stream has closed, so it never delays the reader.
// Never throws: a gating failure must not surface anywhere near the request.
export async function gateForCache(input: GateForCacheInput): Promise<GateForCacheResult> {
  const {
    firstPassText, chartContext, section, planetSection,
    systemBlocks, maxTokens, model, startedAt, truncated,
  } = input
  const label = `${section}/${planetSection}`

  // Truncated or empty output is never cached, never scored, never repaired in
  // place — it has to be regenerated in full, so spending an eval call on it
  // would buy nothing.
  if (truncated || firstPassText.trim().length === 0 || isTruncated(firstPassText)) {
    return { cacheText: null, modelCalls: 0, scores: null, repaired: false, reason: 'truncated-or-empty' }
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
  const gate = await evaluateSection({
    generatedText: firstPassText,
    chartContext,
    section,
    planetSection,
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
    return { cacheText: firstPassText, modelCalls, scores: gate.scores, repaired: false, reason }
  }

  let critique = gate.critique
  if (bannedHits.length > 0) {
    critique = `DOCTRINE FAILURE — the section uses banned phrasing(s) with no legitimate use in an AXIS reading: ${bannedHits.map(p => `"${p}"`).join(', ')}. Remove each one. Do not substitute a synonym for the same move: a difficulty stays a difficulty, a strength is named as plain function, and the two systems are held simultaneously with neither ranked beneath the other.\n\n${critique}`.trim()
  }

  if (Date.now() - startedAt > REPAIR_SKIP_AFTER_MS) {
    console.warn(`[AXIS_GATE] section=${label} repair skipped — ${Date.now() - startedAt}ms elapsed`)
    logGateOutcome(label, 'failed-repair-skipped-budget', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'failed-repair-skipped-budget' }
  }

  let repaired: string
  try {
    modelCalls++  // count the attempt: a call that throws late can still have billed
    repaired = await repairSection({
      originalUserContent: chartContext,
      systemBlocks,
      failedDraft: firstPassText,
      critique,
      maxTokens,
      model,
    })
  } catch (err) {
    console.error(`[AXIS_GATE] section=${label} repair pass failed:`, err instanceof Error ? err.message : err)
    logGateOutcome(label, 'failed-repair-errored', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'failed-repair-errored' }
  }

  // The repair is re-checked deterministically but NOT re-scored by the evaluator:
  // a second eval call per repair is not worth the spend, and a repair that still
  // trips the scan is simply not cached. So the cache holds either a rubric-passing
  // first pass or a repair that is at minimum complete and doctrine-clean.
  if (repaired.trim().length === 0 || isTruncated(repaired)) {
    logGateOutcome(label, 'repair-truncated-or-empty', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'repair-truncated-or-empty' }
  }
  const repairedHits = detectBannedPhrasings(repaired)
  if (repairedHits.length > 0) {
    console.warn(`[AXIS_DOCTRINE_UNCACHED] section=${label} hits=${repairedHits.join('|')} (after repair)`)
    logGateOutcome(label, 'repair-doctrine-hit', gate.scores)
    return { cacheText: null, modelCalls, scores: gate.scores, repaired: false, reason: 'repair-doctrine-hit' }
  }

  logGateOutcome(label, 'repaired', gate.scores)
  return { cacheText: repaired, modelCalls, scores: gate.scores, repaired: true, reason: 'repaired' }
}
