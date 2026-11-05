// lib/reading-fact-check.ts
// Deterministic numeric fact-checking of generated prose against the chart
// context the model was actually given.
//
// WHY THIS EXISTS. The 2026-11-05 v10.37 eval run produced this sentence, in
// fluent, well-formed, second-person prose:
//
//   "Venus sits in Scorpio, in detriment, half a degree from your Sun and Pluto"
//
// Venus was 18.7° from the Sun. The half-degree pair in that chart is Sun-Pluto.
// The model took a real fact and reassigned it. `chart_evidence` scored that
// section 3-4, `scanSectionRules` saw nothing (it is not a string pattern), and
// the claim reached the reader as confident, specific and false.
//
// That is the worst failure class in the product: FACT DISCIPLINE exists to
// prevent exactly it, and nothing enforced it. It is also, unlike prose quality,
// fully checkable — the context block states every degree and orb the section is
// entitled to use, so a figure in the prose that is nowhere in the context is
// either imported, miscopied or invented.
//
// SCOPE, deliberately narrow. This checks numbers, not claims. It cannot tell
// whether an aspect was interpreted correctly, only whether the figure attached
// to it exists. Both checks are anchored on the context: a figure the context
// states is always allowed, however the prose uses it.
//
// FALSE POSITIVES ARE THE DESIGN CONSTRAINT, as in reading-rule-scan.ts. A
// checker that flags correct prose gets switched off, and this one would be
// flagging the most expensive thing to re-check by hand. So: rounding is
// tolerated, ordinal house numbers and non-degree numerals are ignored entirely,
// and a worded closeness claim is only reported when NO aspect among the planets
// named in its own sentence is anywhere near that close.
//
// Pure, never throws, makes no model calls. A measuring instrument first — it
// does not decide what to cache, repair or veto. Wiring it into the gate is a
// separate decision that wants real violation counts from the eval harness,
// which is the same path reading-rule-scan.ts took.

export type FactSeverity = 'hard' | 'soft'

export interface FactFinding {
  /** Stable id: 'unstated-degree' | 'unsupported-closeness'. */
  check:    string
  severity: FactSeverity
  /** The offending figure or phrase. */
  match:    string
  /** The sentence it appeared in, for the report. */
  context:  string
}

/** Degrees the context block states, as numbers. */
function contextDegrees(chartContext: string): number[] {
  return degreeFigures(chartContext).map(f => f.value)
}

/**
 * Every orb the context states, paired with the bodies named on the same line.
 *
 * ⚠ Line-based and format-agnostic BY NECESSITY. The engine renders an orb in
 * four different shapes, and a regex written against any one of them silently
 * returns NOTHING for the other three — which does not fail loudly, it makes
 * `supported` unreachable, so a TRUE closeness claim about the chart's own
 * tightest aspect gets reported as `unsupported-closeness`:
 *
 *   formatPlanetBlock      • Sextile Saturn (3.6°, close, applying, cooperative) | Saturn H10
 *   formatAscendantBlock   • Ascendant △ Moon (orb 1.3°, tight, harmonising): …
 *   key_aspects            Jupiter △ Pluto (orb 0.4°, tight, applying, supportive)
 *   jupiter_saturn         Square (orb 2.1°, applying): …
 *
 * So: one orb per line, read from the parenthesis that opens it (with or
 * without the `orb` label), paired with every body named on that line. The
 * planet-block form names only the OTHER body — the subject is the block's own
 * planet and implicit — which is why the support test below matches on ANY
 * named body rather than requiring the pair.
 */
function contextAspectOrbs(chartContext: string): { bodies: string[]; orb: number }[] {
  const out: { bodies: string[]; orb: number }[] = []
  for (const line of chartContext.split('\n')) {
    // An aspect line states its orb inside parentheses, as "(3.6°" or
    // "(orb 3.6°". Anchoring on the parenthesis is what keeps an ordinary
    // position line ("Venus 14.2° Scorpio") out of the orb table.
    const m = /\((?:orb\s+)?(\d+(?:\.\d+)?)\s*°/.exec(line)
    if (!m) continue
    const bodies = Array.from(new Set(line.match(BODY_RE) ?? []))
    if (bodies.length > 0) out.push({ bodies, orb: Number(m[1]) })
  }
  return out
}

const BODY_RE = /\b(Sun|Moon|Mercury|Venus|Mars|Jupiter|Saturn|Uranus|Neptune|Pluto|Rahu|Ketu|Ascendant|Lagna|Midheaven|MC)\b/g

/** Sentence split that keeps "3.6°" and "e.g." intact. */
function sentences(text: string): string[] {
  const guarded = text
    .replace(/\b(?:e\.g|i\.e|etc|vs|cf)\./gi, s => s.replace(/\./g, '\u0000'))
    .replace(/(\d)\.(\d)/g, '$1\u0000$2')
  return guarded.split(/(?<=[.!?])\s+/).map(s => s.replace(/\u0000/g, '.')).filter(Boolean)
}

/** Prose with markdown headings stripped, so a heading's text is never checked. */
function proseOnly(text: string): string {
  return text.split('\n').filter(l => !/^\s*#{1,6}\s/.test(l)).join('\n')
}

/** Worded claims that two things are within about a degree of each other. */
// ⚠ "to the degree" is deliberately NOT here. It is overwhelmingly the
// intensifier ("fixed to the degree") or the idiom ("to the degree that…"), and
// it produced the one false positive in the 84-section replay that calibrated
// this file. Precision over recall: a checker that flags correct prose about the
// person's own chart is worse than one that misses a case, because the thing it
// costs is trust in every other line it reports.
const CLOSENESS_RE =
  /\b(?:half a degree|a half degree|within (?:half )?a degree|less than a degree|under a degree|a degree apart|exact(?:ly)? conjunct|partile)\b/i

/**
 * Spelled-out numerals, so a worded figure is checked like a glyphed one.
 *
 * ⚠ WHY: the check that motivated this file matched only the `°` glyph, and the
 * prose it was built to catch does not always use it — "twelve degrees from your
 * Sun" is the same invented figure as "12° from your Sun", stated in the
 * register the prompt actually asks for, and it passed BOTH checks. A worded
 * figure is the likelier form, not the rarer one.
 *
 * Bare "a"/"half" are deliberately absent: "half a degree" and "a degree apart"
 * are closeness CLAIMS, handled by CLOSENESS_RE, and counting them here would
 * report the same sentence twice under two checks.
 */
const NUMERAL_WORDS: Record<string, number> = {
  one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
  eleven: 11, twelve: 12, thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17,
  eighteen: 18, nineteen: 19, twenty: 20, 'twenty-one': 21, 'twenty-two': 22, 'twenty-three': 23,
  'twenty-four': 24, 'twenty-five': 25, 'twenty-six': 26, 'twenty-seven': 27, 'twenty-eight': 28,
  'twenty-nine': 29, thirty: 30,
}

const NUMERAL_WORD_ALT = Object.keys(NUMERAL_WORDS).sort((a, b) => b.length - a.length).join('|')

/** `12°` and `12.5 °`. */
const GLYPH_DEGREE_RE = /\d+(?:\.\d+)?(?=\s*°)/g

/**
 * `12 degrees`, `twelve degrees`, `12 degree`. Requires an explicit figure, so
 * "a few degrees", "several degrees", "to varying degrees" and "degrees of
 * separation" stay silent — none of them asserts a number, and a checker that
 * flags them costs trust in every line it reports.
 */
const WORDED_DEGREE_RE = new RegExp(
  String.raw`\b(\d+(?:\.\d+)?|` + NUMERAL_WORD_ALT + String.raw`)\s+degrees?\b`,
  'gi',
)

/** Every degree figure in `text`, as `{ raw, value }`, glyphed or worded. */
function degreeFigures(text: string): { raw: string; value: number }[] {
  const out: { raw: string; value: number }[] = []
  for (const raw of text.match(GLYPH_DEGREE_RE) ?? []) out.push({ raw: `${raw}°`, value: Number(raw) })
  // An exec loop with lastIndex reset, not matchAll: the regex is module-level
  // and reused across every section of every chart, so a stale lastIndex would
  // silently skip findings in the next section scanned — the failure
  // reading-rule-scan.test.ts pins for its own regexes.
  WORDED_DEGREE_RE.lastIndex = 0
  let m: RegExpExecArray | null
  while ((m = WORDED_DEGREE_RE.exec(text)) !== null) {
    const token = m[1].toLowerCase()
    const value = token in NUMERAL_WORDS ? NUMERAL_WORDS[token] : Number(token)
    if (Number.isFinite(value)) out.push({ raw: m[0], value })
    if (m[0].length === 0) WORDED_DEGREE_RE.lastIndex++
  }
  return out
}

/** How close an aspect must be for a worded sub-degree claim to be supported. */
const CLOSENESS_LIMIT_DEG = 1.5

/** Rounding slack when matching a prose figure to a context figure. */
const DEGREE_TOLERANCE = 0.55

/**
 * Check `text` against the `chartContext` it was generated from.
 *
 * - `unstated-degree` (**hard**): a degree figure in the prose that the context
 *   does not state, glyphed (`12°`) or worded (`twelve degrees`). Either
 *   invented or miscopied; both are FACT DISCIPLINE breaches and a reader
 *   cannot tell them apart. Both spellings are checked because the prompt asks
 *   for prose, so the worded form is the likelier one, not the rarer one.
 * - `unsupported-closeness` (**soft**): a worded sub-degree claim ("half a
 *   degree", "exactly conjunct") where no aspect among the bodies named in that
 *   sentence is within CLOSENESS_LIMIT_DEG. Soft because the claim may be about
 *   a pair the section's own context block does not carry aspects for, which is
 *   a reporting gap rather than certainly a false claim.
 */
export function checkNumericFacts(text: string, chartContext: string): FactFinding[] {
  const out: FactFinding[] = []
  if (!text || !chartContext) return out

  const allowed = contextDegrees(chartContext)
  const orbs    = contextAspectOrbs(chartContext)
  const prose   = proseOnly(text)

  for (const sentence of sentences(prose)) {
    // ── 1. Degree figures the context never states.
    for (const fig of degreeFigures(sentence)) {
      if (!allowed.some(a => Math.abs(a - fig.value) <= DEGREE_TOLERANCE)) {
        out.push({
          check: 'unstated-degree',
          severity: 'hard',
          match: fig.raw,
          context: sentence.trim(),
        })
      }
    }

    // ── 2. Worded closeness with nothing in the context to support it.
    const worded = sentence.match(CLOSENESS_RE)
    if (worded) {
      const named = Array.from(new Set(sentence.match(BODY_RE) ?? []))
      const supported = named.some(b => orbs.some(o => o.bodies.includes(b) && o.orb <= CLOSENESS_LIMIT_DEG))
      // TWO bodies, not one: closeness is a relation, so a sentence naming a
      // single body is making some other kind of claim ("fixed to the degree")
      // and is none of this check's business.
      if (named.length >= 2 && !supported) {
        out.push({
          check: 'unsupported-closeness',
          severity: 'soft',
          match: `${worded[0]} — ${named.join('/')}`,
          context: sentence.trim(),
        })
      }
    }
  }

  return out
}

/** One greppable line in the `[AXIS_*]` family. */
export function formatFactCheckLog(section: string, findings: FactFinding[]): string {
  const hard = findings.filter(f => f.severity === 'hard').length
  const soft = findings.filter(f => f.severity === 'soft').length
  const by = findings.map(f => f.check).reduce<Record<string, number>>((a, c) => ((a[c] = (a[c] ?? 0) + 1), a), {})
  const detail = Object.entries(by).map(([k, v]) => `${k}=${v}`).join(' ')
  return `[AXIS_FACTS] section=${section} hard=${hard} soft=${soft}${detail ? ' ' + detail : ''}`
}
