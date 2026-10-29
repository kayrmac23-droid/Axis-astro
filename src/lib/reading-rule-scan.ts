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
const PRESCRIPTION_RES: readonly RegExp[] = [
  /\byou (?:should|ought to|need to|must|have to)\b/gi,
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
const PREDICTION_RES: readonly RegExp[] = [
  /\byou will\b(?! (?:often|sometimes|usually|tend|typically|generally|recognise|recognize|have (?:already|noticed)))/gi,
  /\byou'll\b(?! (?:often|sometimes|usually|tend|typically|generally|recognise|recognize))/gi,
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
  [/\bjudgement\b/gi,                         'judgment'],
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

// ── Scanner ──────────────────────────────────────────────────────────────────

/**
 * Scan one generated section against the deterministic SHARED_RULES / DOCTRINE
 * constraints. Pure; never throws. Returns findings in document order.
 */
export function scanSectionRules(text: string): RuleFinding[] {
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
export function summariseRuleScan(text: string): RuleScanSummary {
  const findings = scanSectionRules(text)
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
