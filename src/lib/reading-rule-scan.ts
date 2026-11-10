// lib/reading-rule-scan.ts
// Deterministic compliance scan for the SHARED_RULES constraints that are pure
// string facts about the finished prose.
//
// WHY THIS FILE EXISTS
// -------------------
// Before v10.30 the reading pipeline had exactly five deterministic checks on
// generated prose — scoreLength, isTruncated, detectRescuePhrasings,
// detectBannedOpeners and detectBannedPhrasings. Everything else in
// SHARED_RULES was either handed to the LLM evaluator as advisory rubric prose
// or not checked at all. That second group is the problem: it holds the rules
// whose violations a reader notices IMMEDIATELY and which are trivially
// checkable in code —
//
//     "No prescriptions: 'you should', 'work on', 'consider'"
//     "No predictions: 'you will', 'this will bring'"
//     "British spelling throughout"
//     "No bullet points in readings — continuous prose only"
//     "Paragraphs must be 3–4 sentences maximum"
//     "No greetings, no sign-offs"
//     THE SMOKE DETECTOR word list (DOCTRINE.md), against generated prose
//
// None of those had a single line of enforcement. The engineering budget went
// to an LLM judge for the hard, subjective 20% while the trivially automatable
// 80% was left to a prohibition buried ~11,000 tokens upstream of the output.
//
// WHAT THIS IS AND IS NOT
// -----------------------
// Pure functions over a string. No model calls, no I/O, no state. Running the
// whole rule set over a section is microseconds, so it is cheap enough to run
// anywhere — in the eval harness as a per-section column, in CI over fixtures,
// or (unlike the LLM gate) on the hot path before a section is served.
//
// It is a MEASURING INSTRUMENT, not a fixer and not yet a gate. It deliberately
// does not decide whether to cache, repair or veto anything: wiring it into
// gateForCache is a separate decision that wants the eval harness's real
// violation counts first. Nothing here throws.
//
// FALSE POSITIVES ARE THE DESIGN CONSTRAINT
// -----------------------------------------
// Every pattern below is scoped so that ordinary reading prose cannot trip it:
//   · prescriptions/predictions are matched as SECOND-PERSON constructions
//     ("you should", "you will"), never as bare verbs — "consider" alone is
//     ordinary English, "you should consider" is a prescription;
//   · the smoke-detector list is matched only where it describes the
//     INTER-SYSTEM relationship, per DOCTRINE.md's own rule that the grep finds
//     candidates and THE LAW decides — so "Merger" in the conjunction sense and
//     Scorpio's "merger through depth" do not register;
//   · British-spelling checks use a closed list of the exact pairs the prompt
//     names, not a general -ize/-our heuristic, so "size" and "glamour" are safe.
// A finding carries the matched text so a reviewer can confirm it in one glance.

// ── Severity ──────────────────────────────────────────────────────────────────
// `hard`     — an unambiguous breach of a stated rule. No judgment required.
// `doctrine` — a THE SMOKE DETECTOR candidate. Per DOCTRINE.md the grep finds
//              candidates and THE LAW decides, so these are reported for audit
//              rather than asserted as failures.
// `soft`     — a measured property that is a breach only in aggregate (e.g. one
//              over-long paragraph is a slip; six is a pattern).
export type RuleSeverity = 'hard' | 'doctrine' | 'soft'

export interface RuleFinding {
  /** Stable kebab-case id, safe to count and group on across runs. */
  rule:     string
  severity: RuleSeverity
  /** The offending text, trimmed and capped, for eyeball confirmation. */
  match:    string
  /** 1-indexed line within the section, for locating it in saved prose. */
  line:     number
}

const MATCH_CAP = 90
const clip = (t: string): string =>
  t.trim().replace(/\s+/g, ' ').slice(0, MATCH_CAP)

// Collect every match of a global regex. An explicit exec loop rather than
// `for (const m of s.matchAll(re))`: the project's tsconfig target does not
// enable downlevelIteration, so iterating a RegExp match iterator does not
// compile. `lastIndex` is reset first because these regexes are module-level
// consts reused across sections — a stale lastIndex would silently skip
// findings in the next section scanned.
function allMatches(haystack: string, re: RegExp): string[] {
  const found: string[] = []
  re.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(haystack)) !== null) {
    found.push(m[0])
    // A zero-length match would loop forever; none of these patterns can
    // produce one, but advancing defensively costs nothing.
    if (m[0].length === 0) re.lastIndex++
  }
  return found
}

// ── Prose extraction ─────────────────────────────────────────────────────────
// Headings are chart vocabulary ("### Sun in the 4th House"), not prose, and
// several rules would misfire on them (a heading is not a one-sentence
// paragraph). The truncation sentinel is pipeline metadata, never authored text.
const TRUNCATION_SENTINEL = '[AXIS_TRUNCATED]'

function proseLines(text: string): { line: number; text: string }[] {
  return text
    .replace(TRUNCATION_SENTINEL, '')
    .split('\n')
    .map((text, i) => ({ line: i + 1, text }))
    .filter(l => !l.text.trimStart().startsWith('#'))
}

// ── 1. Prescriptions ─────────────────────────────────────────────────────────
// SHARED_RULES: "No prescriptions: 'you should', 'work on', 'consider'".
// Scoped to second-person address: the rule bans telling the reader what to do,
// not the words themselves. "The Saturn return works on the same axis" is
// prose; "you should work on this" is a prescription.
// ⚠ The modal list is split in two. "should"/"ought to" are prescriptive wherever
// they appear. "need to"/"must"/"have to" are ALSO ordinary descriptive English
// inside a subordinate clause that states a CONDITION rather than giving advice:
// "a conversation that gives you room to draft before you have to speak" is a
// temporal clause, and the 2026-11-05 eval run reported it as a hard breach. That
// is the scanner crying wolf, which this file's own design constraint forbids —
// a false positive here sends clean prose through a needless repair and, worse,
// teaches whoever reads the report to stop trusting it.
//
// So the conditional modals do not match when the clause is introduced by a
// subordinating conjunction (before/until/when/while/if/once/unless/after/as/
// whenever/where), optionally with a few words between it and "you".
const SUBORDINATED_YOU = String.raw`(?<!\b(?:before|until|when|whenever|while|if|once|unless|after|as|where|than)\b(?:\s+\w+){0,3}\s+)`

// ⚠ v10.48: the same modals are also descriptive inside a RELATIVE clause —
// "safety [is] something you have to locate", "what you need to hear first".
// The relative head must sit IMMEDIATELY before "you" (no gap): a gap would let
// a fronted clause ("what matters now, you have to…") exempt a main-clause
// directive.
const RELATIVE_HEAD_WORDS = 'something|anything|everything|nothing|someone|anyone|what|whatever|how|who|whom|whoever|which|whichever|case|thing|things|one'
const RELATIVE_HEADS = `(?:${RELATIVE_HEAD_WORDS})`
const RELATIVISED_YOU = String.raw`(?<!\b${RELATIVE_HEADS}\s+)`

// "should have" + past participle is a COUNTERFACTUAL about the past ("the
// argument you should have made first"), not advice. Scoped to participles so
// "you should have a plan" — should + have-as-possession — is still caught.
const COUNTERFACTUAL_HAVE = String.raw`(?!\s+have\s+(?:been|done|made|said|known|seen|told|gone|taken|given|had|felt|kept|left|let|put|thought|got|gotten|chosen|spoken|heard|meant|won|lost|\w+ed)\b)`

const PRESCRIPTION_RES: readonly RegExp[] = [
  new RegExp(String.raw`\byou (?:should|ought to)\b` + COUNTERFACTUAL_HAVE, 'gi'),
  new RegExp(SUBORDINATED_YOU + RELATIVISED_YOU + String.raw`\byou (?:need to|must|have to)\b`, 'gi'),
  /\byou(?:'| a)?r?e? (?:better off|best served)\b/gi,
  /\b(?:try|work|focus|start|stop|learn) to (?:notice|see|accept|let go)\b/gi,
  /\byou (?:might|may|could) (?:want|wish) to\b/gi,
  /\bwork on (?:your|this|that|it)\b/gi,
  /\bthe (?:work|task|invitation) here is to\b/gi,
  /\bconsider (?:whether|how|what) you\b/gi,
]

// ── 2. Predictions ───────────────────────────────────────────────────────────
// SHARED_RULES: "No predictions: 'you will', 'this will bring'". The chart
// shows pattern and tendency, never a future event. Deliberately NOT matching
// bare "will": "the pattern will often surface" is a tendency claim, and the
// prompt's own qualification rule asks for exactly that hedged form.
//
// ⚠ v10.48: "you will" inside a relative or subordinate clause is not a
// prediction either — "something you will privately resent", "how you will be
// known", "before you'll trust it" describe a standing disposition, and the
// v10.47 prompts (more second person) doubled the hard findings on exactly this
// shape, nearly all false. The introducer must sit IMMEDIATELY before "you":
// allowing a gap would exempt "when this ends you will meet someone", a main
// clause after a fronted subordinate one, which is the prediction itself.
// Bare "that" is deliberately NOT an introducer: a lookbehind cannot tell the
// relative "that" ("the thing that you will resent") from the complementiser
// ("the chart suggests that you will meet someone"), and the second is the
// exact shape this rule exists to catch.
const PREDICTION_INTRODUCERS = String.raw`(?:${RELATIVE_HEAD_WORDS}|before|until|till|once|when|whenever|where|wherever|while|unless|after|than)`
const CLAUSAL_YOU = String.raw`(?<!\b${PREDICTION_INTRODUCERS}\s+)`

const PREDICTION_RES: readonly RegExp[] = [
  new RegExp(CLAUSAL_YOU + String.raw`\byou will\b(?! (?:often|sometimes|usually|tend|typically|generally|recognise|recognize|have (?:already|noticed)))`, 'gi'),
  new RegExp(CLAUSAL_YOU + String.raw`\byou'll\b(?! (?:often|sometimes|usually|tend|typically|generally|recognise|recognize))`, 'gi'),
  /\bthis will bring\b/gi,
  /\b(?:is|are) going to (?:bring|happen|arrive|come)\b/gi,
  /\bin the (?:coming|next) (?:years?|months?|decade)\b/gi,
  /\bby the time you (?:are|reach|turn)\b/gi,
]

// ── 3. British spelling ──────────────────────────────────────────────────────
// A closed list of the pairs SHARED_RULES actually names, plus the -ise/-yse
// verb families it calls out. A general -ize/-our heuristic would flag "size",
// "prize", "glamour" and "hour", so it is not used.
const AMERICAN_SPELLINGS: readonly [RegExp, string][] = [
  [/\bfavor(s|ed|ing|able|ably)?\b/gi,        'favour'],
  [/\bcolor(s|ed|ing|ful)?\b/gi,              'colour'],
  [/\bhonor(s|ed|ing|able)?\b/gi,             'honour'],
  [/\bbehavior(s|al|ally)?\b/gi,              'behaviour'],
  [/\bneighbor(s|ing|hood)?\b/gi,             'neighbour'],
  [/\bcenter(s|ed|ing)?\b/gi,                 'centre'],
  [/\brecogniz(e|es|ed|ing|able)\b/gi,        'recognise'],
  [/\bemphasiz(e|es|ed|ing)\b/gi,             'emphasise'],
  [/\banalyz(e|es|ed|ing)\b/gi,               'analyse'],
  [/\bprioritiz(e|es|ed|ing)\b/gi,            'prioritise'],
  [/\bideal?iz(e|es|ed|ing)\b/gi,             'idealise'],
  [/\bminimiz(e|es|ed|ing)\b/gi,              'minimise'],
  [/\brationaliz(e|es|ed|ing)\b/gi,           'rationalise'],
  [/\bintellectualiz(e|es|ed|ing)\b/gi,       'intellectualise'],
  [/\bdefens(e|es)\b/gi,                      'defence'],
  [/\bfulfill(s|ed|ing|ment)?\b/gi,           'fulfil'],
]

// ── 4. Formatting ────────────────────────────────────────────────────────────
// "No bullet points in readings — continuous prose only" and, as of v10.30,
// "The section's closing paragraph carries NO heading."
const BULLET_RE  = /^\s*(?:[-*•·]|\d+[.)])\s+\S/
const SUMMARY_HEADING_RE =
  /^#{1,6}\s*(?:putting it (?:all )?together|bringing it together|synthesis|in summary|summary|the core|conclusion|takeaway)/i

// ── 5. Greetings and sign-offs ───────────────────────────────────────────────
// "No greetings, no sign-offs. Open mid-thought."
const GREETING_RE = /^(?:hello|hi|welcome|greetings|dear\b)/i
const SIGNOFF_RES: readonly RegExp[] = [
  /\b(?:in closing|to sum up|to summarise|to summarize|in conclusion|all in all)\b/gi,
  /\bI hope (?:this|these)\b/gi,
  /\b(?:good luck|go well|walk gently)\b/gi,
]

// ── 6. THE SMOKE DETECTOR (DOCTRINE.md) ──────────────────────────────────────
// The banned words are banned FOR THE INTER-SYSTEM RELATIONSHIP only. DOCTRINE
// is explicit that a hit means "audit the sentence against THE LAW", not an
// automatic failure — and that ordinary astrological use is fine ("Merger" is
// the conjunction's definition; Scorpio's core need is "merger"). So a term
// registers only inside a sentence that also names both frames or the
// divergence itself, and the finding is `doctrine` severity for audit.
const SMOKE_TERMS: readonly RegExp[] = [
  /\bsynthesis\b/gi, /\bsynthesi[sz]e[sd]?\b/gi, /\bintegrat(?:e|es|ed|ing|ion)\b/gi,
  /\bmerge[sd]?\b/gi, /\breconcil(?:e|es|ed|ing|iation)\b/gi, /\bresolv(?:e|es|ed|ing)\b/gi,
  /\bunif(?:y|ies|ied)\b/gi, /\bblend(?:s|ed|ing)?\b/gi,
  /\bharmoni[sz]e[sd]?\b/gi, /\bbridge[sd]?\b/gi, /\bboth truths meet\b/gi,
]
const INTER_SYSTEM_RE =
  /\b(?:tropical|sidereal|both (?:systems|charts|frames|readings)|the two (?:systems|charts|frames|readings)|divergence|ayanamsa|frame shift)\b/i

// Claim-level LAW failures that contain none of the banned words — DOCTRINE's
// own examples of copy that passes any grep and still fails THE LAW.
const LAW_CLAIM_RES: readonly RegExp[] = [
  /\bthe (?:complete|whole|full|entire) picture\b/gi,
  /\bthe full story of who you are\b/gi,
  /\bone truth\b/gi,
  /\byour (?:real|true|actual) (?:truth|self|chart)\b/gi,
  /\bdiscover your truth\b/gi,
  /\bthe two (?:systems|charts|frames) (?:become|are) one\b/gi,
  /\b(?:single|one) coherent (?:picture|self|identity|answer)\b/gi,
]

// ── 7. Paragraph length ──────────────────────────────────────────────────────
// "Paragraphs must be 3–4 sentences maximum for mobile readability."
// Reported `soft`: one long paragraph is a slip, a section full of them is the
// dense-block accumulation the rule exists to prevent. The threshold is 5 — one
// over the stated maximum — so a borderline four-sentence paragraph with an
// abbreviation in it does not register.
const PARAGRAPH_SENTENCE_LIMIT = 5

export function countSentences(paragraph: string): number {
  // Protect the abbreviations and decimals that appear in chart prose before
  // splitting, so "3.2°" and "e.g." are not sentence boundaries.
  const guarded = paragraph
    .replace(/\b(?:e\.g|i\.e|etc|vs|cf|Dr|Mr|Mrs|Ms|St)\./gi, m => m.replace(/\./g, '\u0000'))
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
  return (guarded.match(/[.!?](?=\s|$)/g) ?? []).length
}

// ── 8. The antithesis tic ────────────────────────────────────────────────────
// SHARED_RULES PART 4: "X rather than Y" and its near variants may appear AT
// MOST ONCE per section. Measured before the rule existed: 141 occurrences across
// the 63 sections of the 2026-11-02 eval run, 39 sections at two or more. Reported
// `soft`, like `long-paragraph`: one is a sentence, four is a template.
//
// Scoped tightly to the contrastive construction, the same false-positive
// discipline as the prescription and spelling scans:
//   · bare "rather" ("would rather", "rather good") stays silent;
//   · "not X but Y" counts only with X at most two words, never "not only…but"
//     (additive, not contrastive), and never when "but" opens a fresh clause
//     with a pronoun subject ("you may not say so, but it is…" is a concession);
//   · "less X than Y" counts only as "less a/an X than" or "less about X than",
//     never an ordinary comparative ("less often than", "less time than").
const ANTITHESIS_RES: readonly RegExp[] = [
  /\brather than\b/gi,
  /\bnot\s+(?!only\b)(?:(?:a|an|the)\s+)?\w+(?:\s+\w+)?,?\s+but\s+(?!(?:it|you|they|he|she|we|i|this|that|there)\b)\w+/gi,
  /\bless\s+(?:(?:a|an)\s+\w+|about\s+[^.!?]{1,40}?)\s+than\b/gi,
]

// ⚠ v10.45 — THE RULE IS DENSITY IN A SPAN, NOT A COUNT PER SECTION.
//
// v10.39 scaled a per-SECTION cap to the band (`antithesisCapFor`, one use per
// 450 words of target, min 1) and it did not hold: on the 21 frozen sections of
// fixtures/rater-bench, 10 breached it and 6 breached it hard. Measured before
// changing it, the cap was not tracking density at all. Two sections at the
// IDENTICAL rate got opposite verdicts — `tropical/moon` (4 uses in 1056 words,
// 3.8 per 1000) was a hard failure while `synthesis/closing` (1 in 265, also
// 3.8 per 1000) was clean — because `Math.max(1, Math.round(target / 450))`
// quantises to an integer and then floors at one. The allowance that integer
// actually buys ranges from 2.0 uses per 1000 words at the 490-word Ascendant
// band to 4.4 at the 230-word closing band, a 2.1x spread with no rule behind
// it: the 420- and 440-word bands are the harshest purely because round(0.93)
// and round(0.98) both snap down to 1. So the LONGER a section, the tighter its
// real allowance — the opposite of what v10.39 set out to do.
//
// It was also measuring the wrong thing. Reading all 43 occurrences in that
// corpus: the overwhelming majority are ordinary descriptive English carrying a
// real distinction ("public standing rides into House 6 on the back of
// emotional instinct rather than ambition", "fused rather than cast from
// outside" — a conjunction against a drishti). In a domain whose subject IS
// contrast, "rather than" is the natural construction for naming where a thing
// operates and where it does not, and a cap that fires on two of them across
// 500 words is fighting the domain. What a reader genuinely registers as a tic
// is ADJACENT repetition: `sidereal/moon` puts three in one paragraph, and
// `sidereal/mars` runs six in 441 words. Those are the two sections a reader
// would notice, and the old cap ranked them alongside seven that read cleanly.
//
// So the verdict is now a property of the text and needs no band, no word
// constant and no per-section cap:
//   · ANTITHESIS_PARAGRAPH_HARD (3) in ONE paragraph is the failure — at three
//     the construction has become that paragraph's default sentence shape;
//   · ANTITHESIS_PARAGRAPH_DEDUCT (2) in one paragraph is a deduction;
//   · and across the section, more than one per TWO paragraphs is a deduction,
//     which catches the diffuse case the paragraph rule cannot see.
//
// The backstop is stated in paragraphs rather than words deliberately: PART 8
// already fixes a paragraph at three or four sentences, so "one per two
// paragraphs" is derived from a rule the prompt already states instead of being
// a threshold fitted to one chart's numbers.
//
// Measured on the same frozen corpus, holding the rater's pre-clamp scores
// fixed so only the clamp moves: first-pass pass rate 2 of 21 -> 4 of 21. The
// two sections still failed are `sidereal/moon` and `sidereal/mars`, the two
// worst by density (8.4 and 13.6 per 1000 words), which is the rule working.
export const ANTITHESIS_PARAGRAPH_DEDUCT = 2
export const ANTITHESIS_PARAGRAPH_HARD   = 3

/**
 * Every antithesis construction in `text`, in document order.
 *
 * Exported so the quality gate clamps `voice_quality` on the SAME detector the
 * scan reports — the 2026-11-03 eval run had this tic cited in 11 of 21
 * evaluator critiques (15 scan findings) while the scan's own finding was
 * `soft` and fed nothing, so a second copy of these regexes in the gate would
 * be the one thing guaranteed to drift. Pure; never throws.
 *
 * Returns ALL occurrences, including the one the rule permits: the caller
 * decides the threshold: `antithesisVerdict` applies the density rule, and both
 * the scan and the gate read their verdict from it.
 */
export function detectAntithesisTic(text: string): { match: string; line: number }[] {
  const hits: { match: string; line: number }[] = []
  for (const { line, text: raw } of proseLines(text))
    for (const re of ANTITHESIS_RES)
      for (const m of allMatches(raw, re)) hits.push({ match: m.replace(/\s+/g, ' '), line })
  return hits.sort((a, b) => a.line - b.line)
}

export type AntithesisSeverity = 'clean' | 'deduct' | 'hard'

export interface AntithesisVerdict {
  hits: { match: string; line: number }[]
  /** Occurrences in the worst single paragraph. */
  maxPerParagraph: number
  /** Prose paragraphs in the section (headings and blanks excluded). */
  paragraphs: number
  /** The section-wide backstop: more than one use per two paragraphs. */
  allowance: number
  severity: AntithesisSeverity
  /** Which rule fired, for the critique. Null when clean. */
  cause: 'paragraph' | 'section' | null
}

/**
 * The antithesis verdict for a finished section. Pure; never throws.
 *
 * `hard` clamps `voice_quality` BELOW the pass bar and forces a repair;
 * `deduct` clamps it TO the bar, which still drags the average and still earns
 * a critique. The graduation is unchanged from v10.39 and is load-bearing for
 * the same reason: clamping below the bar on a two-instance slip sent most
 * sections into a full repair, and a repair that lands on two again fails its
 * re-score, returns `repair-failed-recheck` and caches provisionally for 24h —
 * so that section is regenerated for every reader, every day. A cadence tic is
 * not worth that. What changed in v10.45 is only WHAT IS COUNTED: density in a
 * paragraph rather than a total against a band-derived cap (see above).
 */
export function antithesisVerdict(text: string): AntithesisVerdict {
  const hits = detectAntithesisTic(text)
  const paragraphs = proseLines(text).filter(l => l.text.trim().length > 0).length

  const perLine = new Map<number, number>()
  for (const h of hits) perLine.set(h.line, (perLine.get(h.line) ?? 0) + 1)
  let maxPerParagraph = 0
  perLine.forEach(n => { if (n > maxPerParagraph) maxPerParagraph = n })

  // One use per two paragraphs, at least one: a section of a single paragraph
  // is still allowed the construction once, as the prompt's own worked example
  // uses it.
  const allowance = Math.max(1, Math.ceil(paragraphs / 2))

  const severity: AntithesisSeverity =
    maxPerParagraph >= ANTITHESIS_PARAGRAPH_HARD      ? 'hard'
    : maxPerParagraph >= ANTITHESIS_PARAGRAPH_DEDUCT  ? 'deduct'
    : hits.length > allowance                          ? 'deduct'
    : 'clean'

  const cause =
    severity === 'clean' ? null
    : maxPerParagraph >= ANTITHESIS_PARAGRAPH_DEDUCT ? 'paragraph' as const
    : 'section' as const

  return { hits, maxPerParagraph, paragraphs, allowance, severity, cause }
}

/**
 * The antithesis hits when the section is over the rule, else null. The gate's
 * clamp predicate; `detectAntithesisTic` is the raw count and
 * `antithesisVerdict` carries the severity the gate needs to pick its clamp.
 */
export function antithesisTicExceeded(text: string): { match: string; line: number }[] | null {
  const v = antithesisVerdict(text)
  return v.severity === 'clean' ? null : v.hits
}

// ── 9. Register drift ────────────────────────────────────────────────────────
// SHARED_RULES PART 4: a natal section addresses the reader as "you", present
// tense. Measured on the 2026-11-03 eval run: 10 of the 17 natal sections
// contained ZERO second-person address, and only one was robustly in register.
// The model's default is the third person about a placement ("this Mercury",
// "this mind", "the native"), which is the register of essentially every
// astrology text, and a single bullet ~11,000 tokens upstream does not hold
// against that prior.
//
// Scoped to what is unambiguous: the rule is breached when a section that must
// use second person contains NO second-person pronoun at all. A section with
// some address is not scored on density — that is a judgment call and belongs
// to the LLM criterion, not here.
//
// Frame-aware, because two registers are legitimate: THE DIVERGENCE is third
// person by its own instruction and synastry is second person plural, so both
// are exempt. A caller that does not say which frame it is scanning gets no
// register finding, so the check can never fire on text it cannot classify.
const SECOND_PERSON_RE = /\b(?:you|your|yours|yourself)\b/i
const GENDERED_PRONOUN_RE = /\b(?:he|him|his|himself|she|her|hers|herself)\b/i
// A person other than the reader whom a Divergence scene could give a pronoun.
const THIRD_PARTY_RE = /\b(?:mother|father|mum|mom|dad|parents?|partner|husband|wife|spouse|boyfriend|girlfriend|lover|sister|brother|sibling|son|daughter|child|friend|colleague|boss|manager|teacher|grandmother|grandfather|aunt|uncle)s?\b/i

/** Which register a section is written under. `natal` is the only one checked. */
export type SectionRegister = 'natal' | 'synthesis' | 'synastry' | 'unknown'

/**
 * The register a section belongs to, from the frame the route/harness already
 * has. `synthesis` is The Divergence (third person by instruction); `synastry`
 * is second person plural. Anything unrecognised is `unknown` and exempt.
 */
export function registerFor(frame: string | undefined): SectionRegister {
  switch (frame) {
    case 'tropical':
    case 'sidereal':  return 'natal'
    case 'synthesis': return 'synthesis'
    case 'synastry':  return 'synastry'
    default:          return 'unknown'
  }
}

/**
 * True when `text` must address the reader as "you" and does not do so once.
 * Pure. Returns false for any register that is not `natal`.
 */
export function hasRegisterDrift(text: string, register: SectionRegister): boolean {
  if (register !== 'natal') return false
  return !SECOND_PERSON_RE.test(proseLines(text).map(l => l.text).join(' '))
}

// ── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan one generated section against the deterministic SHARED_RULES / DOCTRINE
 * constraints. Pure; never throws. Returns findings in document order.
 */
export interface RuleScanOptions {
  /**
   * The frame this section was generated for ('tropical' | 'sidereal' |
   * 'synthesis' | 'synastry'). Required for the `register-drift` rule, which is
   * skipped entirely when it is absent — the two legitimate non-second-person
   * registers cannot be told from the prose alone, so an unclassified section
   * is never reported.
   */
  frame?: string
}

export function scanSectionRules(text: string, opts: RuleScanOptions = {}): RuleFinding[] {
  const out: RuleFinding[] = []
  const push = (rule: string, severity: RuleSeverity, match: string, line: number) =>
    out.push({ rule, severity, match: clip(match), line })

  const lines = proseLines(text)

  for (const { line, text: raw } of lines) {
    if (raw.trim().length === 0) continue

    for (const re of PRESCRIPTION_RES)
      for (const m of allMatches(raw, re)) push('prescription', 'hard', m, line)

    for (const re of PREDICTION_RES)
      for (const m of allMatches(raw, re)) push('prediction', 'hard', m, line)

    for (const [re, british] of AMERICAN_SPELLINGS)
      for (const m of allMatches(raw, re))
        push('american-spelling', 'hard', `${m} → ${british}`, line)

    if (BULLET_RE.test(raw)) push('bullet-list', 'hard', raw, line)
    if (GREETING_RE.test(raw.trim())) push('greeting', 'hard', raw, line)

    for (const re of SIGNOFF_RES)
      for (const m of allMatches(raw, re)) push('sign-off', 'hard', m, line)

    for (const re of LAW_CLAIM_RES)
      for (const m of allMatches(raw, re)) push('law-claim', 'doctrine', m, line)

    // Smoke-detector terms, sentence-scoped so the inter-system test is applied
    // to the clause that actually carries the term.
    for (const sentence of raw.split(/(?<=[.!?])\s+/)) {
      if (!INTER_SYSTEM_RE.test(sentence)) continue
      for (const re of SMOKE_TERMS)
        for (const m of allMatches(sentence, re))
          push('smoke-detector', 'doctrine', `${m} — in: ${sentence}`, line)
    }
  }

  // Headings: the v10.30 unheaded-close rule.
  text.split('\n').forEach((raw, i) => {
    if (SUMMARY_HEADING_RE.test(raw.trim())) push('summary-heading', 'hard', raw, i + 1)
  })

  // Paragraphs: blank-line separated, headings stripped.
  const paragraphs = lines
    .map(l => l.text)
    .join('\n')
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(Boolean)
  for (const para of paragraphs) {
    const sentences = countSentences(para)
    if (sentences >= PARAGRAPH_SENTENCE_LIMIT) {
      const line = (lines.find(l => para.startsWith(l.text.trim()) && l.text.trim())?.line) ?? 0
      push('long-paragraph', 'soft', `${sentences} sentences: ${para}`, line)
    }
  }

  // The antithesis tic. One finding for the section, not one per hit: the
  // breach is the DENSITY, and n separate findings would swamp `soft` and bury
  // long-paragraph.
  const antithesis = antithesisVerdict(text)
  if (antithesis.severity !== 'clean') {
    out.push({
      rule:     'antithesis-tic',
      severity: 'soft',
      // Not clipped to MATCH_CAP: the measurement leads, and the matches after
      // it are what a reviewer needs to confirm it is real.
      match:    antithesis.cause === 'paragraph'
        ? `${antithesis.maxPerParagraph} occurrences in one paragraph (${antithesis.hits.length} in the section): ${antithesis.hits.map(a => a.match).join(' | ')}`
        : `${antithesis.hits.length} occurrences across ${antithesis.paragraphs} paragraphs (allowance ${antithesis.allowance}): ${antithesis.hits.map(a => a.match).join(' | ')}`,
      line:     antithesis.hits[0]?.line ?? 0,
    })
  }

  // Register drift. `hard`: PART 4 states it as a constraint, and a section
  // with no second-person address anywhere is a breach a reader notices in the
  // first sentence. Reported once for the section, with no line, since the
  // breach is the absence of something rather than the presence of a match.
  if (hasRegisterDrift(text, registerFor(opts.frame))) {
    out.push({
      rule:     'register-drift',
      severity: 'hard',
      match:    'no second-person address in a natal section (PART 4: "you are", "you tend to", "you find")',
      line:     0,
    })
  }

  // Gendered pronouns in The Divergence. It is written in the third person
  // about the reader, whose gender the chart does not state: on Kay's own
  // reading (2026-11-10) it called her "he" and "him" throughout. The reader is
  // the only person in the prose unless a scene names someone else, so a
  // gendered pronoun is `hard` by default and `soft` only when the section
  // names a third party it could belong to ("their mother ... she"). Natal
  // sections are not checked: they may give a third party a pronoun. One
  // finding for the section, at the first instance.
  if (registerFor(opts.frame) === 'synthesis') {
    const hit = lines.find(l => GENDERED_PRONOUN_RE.test(l.text))
    if (hit) {
      const all = lines.flatMap(l => l.text.match(new RegExp(GENDERED_PRONOUN_RE.source, 'gi')) ?? [])
      const words = Array.from(new Set(all.map(w => w.toLowerCase()))).join(', ')
      const thirdParty = text.match(THIRD_PARTY_RE)?.[0]
      push('gendered-pronoun', thirdParty ? 'soft' : 'hard',
        thirdParty
          ? `${all.length} gendered pronoun(s) (${words}); the section names a third party ("${thirdParty}"), so check each refers to them and not the reader`
          : `${all.length} gendered pronoun(s) for the reader (${words}): use "they", "them", "their"`,
        hit.line)
    }
  }

  return out.sort((a, b) => a.line - b.line)
}

export interface RuleScanSummary {
  total:      number
  hard:       number
  doctrine:   number
  soft:       number
  /** Finding count keyed by rule id — the column the eval harness reports. */
  byRule:     Record<string, number>
  findings:   RuleFinding[]
}

/** Aggregate a section's findings into the shape the eval harness records. */
export function summariseRuleScan(text: string, opts: RuleScanOptions = {}): RuleScanSummary {
  const findings = scanSectionRules(text, opts)
  const byRule: Record<string, number> = {}
  for (const f of findings) byRule[f.rule] = (byRule[f.rule] ?? 0) + 1
  return {
    total:    findings.length,
    hard:     findings.filter(f => f.severity === 'hard').length,
    doctrine: findings.filter(f => f.severity === 'doctrine').length,
    soft:     findings.filter(f => f.severity === 'soft').length,
    byRule,
    findings,
  }
}

/** One greppable log line per scanned section, matching the [AXIS_*] family. */
export function formatRuleScanLog(label: string, s: RuleScanSummary): string {
  const rules = Object.entries(s.byRule).sort((a, b) => b[1] - a[1])
    .map(([r, c]) => `${r}=${c}`).join(' ')
  return `[AXIS_RULES] section=${label} hard=${s.hard} doctrine=${s.doctrine} soft=${s.soft}${rules ? ' ' + rules : ''}`
}
