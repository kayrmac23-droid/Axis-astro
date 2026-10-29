import { describe, it, expect } from 'vitest'
import {
  computePassFromScores,
  validateScores,
  stripJsonFence,
  extractScoresFromRaw,
  buildFallbackCritique,
  countWords,
  scoreLength,
  isTruncated,
  countAspectsInContext,
  detectRescuePhrasings,
  detectBannedOpeners,
  evaluateSection,
  TRUNCATION_SENTINEL,
  FALSIFIABILITY_DIVERGENCE_EXAMPLE,
  EVAL_SYSTEM_PROMPT,
  GateScores,
  LlmScores,
} from '../reading-quality-gate'
import {
  BANNED_BARNUM_PHRASINGS,
  BANNED_BARNUM_LIST,
  BANNED_RESCUE_PHRASINGS,
  BANNED_RESCUE_LIST,
  BANNED_HIERARCHY_PHRASINGS,
  BANNED_HIERARCHY_LIST,
  HIERARCHY_CONTEXTUAL_TERMS,
  detectContextualHierarchy,
  SHARED_RULES,
  SHADOW_RULES,
  SECTION_INSTRUCTIONS,
  BANNED_OPENER_PATTERNS,
  BANNED_OPENER_LIST,
  OPENER_MODES,
  CLOSER_MODES,
  PERSONAL_PLANET_SECTIONS,
  openerModeFor,
  wordBandFor,
  scaleBand,
} from '../prompts'

// The nine model-scored criteria, all equal to `v`.
function allLlm(v: number): LlmScores {
  return {
    chart_evidence:         v,
    specificity:            v,
    synthesis:              v,
    contradiction_handling: v,
    anti_cliche:            v,
    psychological_depth:    v,
    practical_usefulness:   v,
    voice_quality:          v,
    falsifiability:         v,
  }
}

// The full ten-criterion score set the verdict runs over (LLM nine + length).
function allScores(v: number): GateScores {
  return { ...allLlm(v), length: v }
}

describe('computePassFromScores', () => {
  // Pass requires average ≥ 3.75 over all TEN criteria AND no individual below 3.
  it('passes when every score is strong', () => {
    expect(computePassFromScores(allScores(4))).toBe(true)
  })

  it('fails when the average is below 3.75 even with no sub-3 score', () => {
    expect(computePassFromScores(allScores(3))).toBe(false)
  })

  it('fails when a single criterion is below 3 despite a high average', () => {
    const scores = allScores(5)
    scores.voice_quality = 2 // avg = (9*5 + 2)/10 = 4.7, but min < 3
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('fails on a sub-3 falsifiability score regardless of a high average', () => {
    const scores = allScores(5)
    scores.falsifiability = 2
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('fails on a sub-3 length score regardless of a high average', () => {
    // Length is wired into the aggregate like every other criterion: an
    // out-of-band section trips MIN_INDIVIDUAL even when the prose is elite.
    const scores = allScores(5)
    scores.length = 1
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('passes just above the 3.75 boundary with min ≥ 3', () => {
    // Eight 4s and two 3s → (32 + 6)/10 = 3.8, min 3.
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    expect(computePassFromScores(scores)).toBe(true)
  })

  it('fails just below the 3.75 boundary', () => {
    // Seven 4s and three 3s → (28 + 9)/10 = 3.7, min 3.
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    scores.synthesis = 3
    expect(computePassFromScores(scores)).toBe(false)
  })
})

describe('validateScores', () => {
  // validateScores parses only the nine model-scored criteria; length is not
  // among them (it is computed in code and merged in evaluateSection).
  it('returns the scores object when all nine criteria are valid', () => {
    const valid = allLlm(4)
    expect(validateScores(valid)).toEqual(valid)
  })

  it('ignores an extra length key rather than requiring it', () => {
    // The LLM never emits length; a stray one must not break parsing.
    expect(validateScores(allScores(4))).toEqual(allLlm(4))
  })

  it('rejects an object missing a criterion', () => {
    const partial: Record<string, number> = { ...allLlm(4) }
    delete partial.voice_quality
    expect(validateScores(partial)).toBeNull()
  })

  it('rejects an object missing the falsifiability criterion', () => {
    const partial: Record<string, number> = { ...allLlm(4) }
    delete partial.falsifiability
    expect(validateScores(partial)).toBeNull()
  })

  it('rejects out-of-range scores', () => {
    expect(validateScores({ ...allLlm(4), synthesis: 6 })).toBeNull()
    expect(validateScores({ ...allLlm(4), synthesis: 0 })).toBeNull()
  })

  it('rejects non-numeric scores and non-objects', () => {
    const stringScore = { ...allLlm(4), synthesis: '5' as unknown as number }
    expect(validateScores(stringScore)).toBeNull()
    expect(validateScores(null)).toBeNull()
    expect(validateScores('not an object')).toBeNull()
  })
})

describe('stripJsonFence', () => {
  it('strips a ```json fenced block', () => {
    expect(stripJsonFence('```json\n{"pass": true}\n```')).toBe('{"pass": true}')
  })

  it('strips a bare ``` fenced block', () => {
    expect(stripJsonFence('```\n{"pass": false}\n```')).toBe('{"pass": false}')
  })

  it('leaves unfenced JSON untouched (aside from trimming)', () => {
    expect(stripJsonFence('  {"pass": true}  ')).toBe('{"pass": true}')
  })

  it('produces JSON.parse-able output for a fenced payload', () => {
    const raw = '```json\n{"scores":{},"pass":true,"critique":""}\n```'
    expect(() => JSON.parse(stripJsonFence(raw))).not.toThrow()
  })
})

describe('extractScoresFromRaw — verdict integrity on truncated output', () => {
  const scoresJson = JSON.stringify(allLlm(1))

  it('recovers scores when a long critique truncated the JSON mid-string', () => {
    const truncated = `{"scores": ${scoresJson}, "pass": false, "critique": "1. CHART EVIDENCE: not a single placement is used and the section keeps going`
    expect(() => JSON.parse(stripJsonFence(truncated))).toThrow()
    expect(extractScoresFromRaw(truncated)).toEqual(allLlm(1))
  })

  it('recovers scores from a fenced, truncated payload', () => {
    const truncated = '```json\n{"scores": ' + scoresJson + ', "critique": "unterminated…'
    expect(extractScoresFromRaw(truncated)).toEqual(allLlm(1))
  })

  it('returns null when no scores object is present', () => {
    expect(extractScoresFromRaw('{"pass": false, "critique": "no scores here"}')).toBeNull()
  })

  it('returns null when the recovered scores object is invalid', () => {
    expect(extractScoresFromRaw('{"scores": {"chart_evidence": 9}, "critique": "…')).toBeNull()
  })
})

describe('buildFallbackCritique — direction when the critique was lost', () => {
  it('returns an empty string when every criterion is at or above the pass bar', () => {
    expect(buildFallbackCritique(allScores(4))).toBe('')
  })

  it('names each sub-4 criterion with its score, including length', () => {
    const scores = allScores(4)
    scores.falsifiability = 1
    scores.length = 2
    const critique = buildFallbackCritique(scores)
    expect(critique).toContain('falsifiability (scored 1)')
    expect(critique).toContain('length (scored 2)')
    expect(critique).not.toContain('specificity')
  })
})

describe('countWords', () => {
  it('counts whitespace-separated tokens', () => {
    expect(countWords('alpha beta gamma')).toBe(3)
  })
  it('returns 0 for blank text', () => {
    expect(countWords('   \n  ')).toBe(0)
  })
})

describe('scoreLength — deterministic length criterion', () => {
  // Derived from the band rather than hardcoded. These assertions are about
  // scoreLength's SHAPE (full marks inside, partial in the margin, 1 only for
  // under-delivery or runaway), not about any particular band's numbers — the
  // v10.30 length reset broke the hardcoded form of every case below while the
  // function itself was unchanged, which is a test asserting the wrong thing.
  const band = wordBandFor('tropical', 'sun') // BAND_MAJOR

  it('full marks inside the band', () => {
    expect(scoreLength(band.target, band)).toBe(5)
    expect(scoreLength(band.fullMin, band)).toBe(5)
    expect(scoreLength(band.fullMax, band)).toBe(5)
  })
  it('partial when a bit short, or over the band but not yet runaway', () => {
    expect(scoreLength(band.fullMin - 20, band)).toBe(3)  // inside the hard floor, short of full marks
    expect(scoreLength(band.fullMax + 20, band)).toBe(3)  // just over the full max
    expect(scoreLength(band.hardMax + 100, band)).toBe(3) // past the cap, inside the runaway margin
  })
  it('hard-fails only genuine under-delivery or runaway length', () => {
    expect(scoreLength(band.hardMin - 20, band)).toBe(1)  // below the hard floor
    expect(scoreLength(band.hardMax + 251, band)).toBe(1) // beyond cap + the 250 runaway margin
  })

  it('an 1800-word Sun section fails the aggregate as runaway', () => {
    // Elite on every prose axis but far past even the runaway margin ⇒ length 1.
    const scores = allScores(5)
    scores.length = scoreLength(1800, band)
    expect(scores.length).toBe(1)
    expect(computePassFromScores(scores)).toBe(false)
  })
})

describe('countAspectsInContext', () => {
  const ctx = [
    'SUN',
    'DISPOSITOR / RULERSHIP CHAIN:',
    'Sun in Leo → ruled by Sun',
    '',
    'ASPECTS (tightest first):',
    '• Opposition Neptune (2.8°, applying, polarizing) | Neptune H11',
    '• Square Jupiter (3°, applying, tense) | Jupiter H2',
    '• Trine Moon (5.1°, separating, flowing) | Moon H9',
    '',
    'SITUATIONAL FRAME (when/where this shows up):',
    '• Arena: House 5',
    '• Trigger — Opposition Neptune',
  ].join('\n')

  it('counts only the ASPECTS block bullets, not other bulleted blocks', () => {
    expect(countAspectsInContext(ctx)).toBe(3)
  })

  it('sums multiple ASPECTS blocks (e.g. Jupiter + Saturn)', () => {
    const two = ctx + '\n\nASPECTS (tightest first):\n• Conjunction Saturn (1°, applying, tense) | Saturn H2\n'
    expect(countAspectsInContext(two)).toBe(4)
  })

  it('returns 0 when there is no ASPECTS block', () => {
    expect(countAspectsInContext('no aspects here')).toBe(0)
  })
})

describe('scaleBand — earned depth on densely aspected charts', () => {
  it('leaves the band unchanged at or below the baseline aspect count', () => {
    const base = wordBandFor('tropical', 'sun')
    expect(scaleBand(base, base.aspectBaseline!)).toEqual(base)
    expect(scaleBand(base, base.aspectBaseline! - 1)).toEqual(base)
  })

  it('widens the ceiling and floor for aspect counts above the baseline', () => {
    const base   = wordBandFor('tropical', 'sun')
    const extra  = 3
    const add    = base.aspectAllowance! * extra
    const scaled = scaleBand(base, base.aspectBaseline! + extra)
    expect(scaled.fullMax).toBe(base.fullMax + add)
    expect(scaled.hardMax).toBe(base.hardMax + add)
    expect(scaled.fullMin).toBe(base.fullMin + Math.round(add / 2))
    expect(scaled.target).toBe(base.target + Math.round(add / 2)) // target tracks the floor
    expect(scaled.hardMin).toBe(base.hardMin)                     // hard floor unchanged
  })

  it('does not scale a band with no aspect allowance (comparative section)', () => {
    const diverge = wordBandFor('synthesis', 'diverge')
    expect(scaleBand(diverge, 8)).toEqual(diverge)
    expect(wordBandFor('synthesis', 'diverge', 8)).toEqual(diverge)
  })

  it('gives a densely aspected Sun its earned length at full marks', () => {
    // The ceiling of the SCALED band scores 5 on a dense chart, while the same
    // word count on a sparse chart is over its band and only scores 3. That is
    // the whole point of aspect scaling, stated without hardcoding either band.
    const dense  = wordBandFor('tropical', 'sun', 6)
    const sparse = wordBandFor('tropical', 'sun', 3)
    expect(dense.fullMax).toBeGreaterThan(sparse.fullMax)
    expect(scoreLength(dense.fullMax, dense)).toBe(5)
    expect(scoreLength(dense.fullMax, sparse)).toBe(3)
  })

  it('the runaway threshold itself scales with aspect count', () => {
    // One word count, two charts: tolerated on a 6-aspect chart (earned depth),
    // runaway on a 3-aspect chart where that length can only be padding.
    const dense  = wordBandFor('tropical', 'sun', 6)
    const sparse = wordBandFor('tropical', 'sun', 3)
    const words  = sparse.hardMax + 251 // just past the sparse chart's runaway edge
    expect(words).toBeLessThanOrEqual(dense.hardMax + 250)
    expect(scoreLength(words, dense)).toBe(3)
    expect(scoreLength(words, sparse)).toBe(1)

    const denseScores  = allScores(5); denseScores.length  = scoreLength(words, dense)
    const sparseScores = allScores(5); sparseScores.length = scoreLength(words, sparse)
    expect(computePassFromScores(denseScores)).toBe(true)
    expect(computePassFromScores(sparseScores)).toBe(false)
  })
})

describe('isTruncated', () => {
  it('is false for prose ending in terminal punctuation', () => {
    expect(isTruncated('This is a complete sentence.')).toBe(false)
    expect(isTruncated('It ended on a quoted phrase.”')).toBe(false)
    expect(isTruncated('Trailing whitespace is fine.  \n')).toBe(false)
  })
  it('is true for prose that ends mid-sentence', () => {
    expect(isTruncated('The section just stops mid')).toBe(true)
    expect(isTruncated('ends on a comma,')).toBe(true)
  })
  it('is true when the truncation sentinel is present', () => {
    expect(isTruncated(`A complete-looking draft.\n\n${TRUNCATION_SENTINEL}`)).toBe(true)
  })
  it('is true for empty text', () => {
    expect(isTruncated('   ')).toBe(true)
  })
})

describe('evaluateSection — truncation is a pre-scoring hard failure', () => {
  // These short-circuit before any API call, so they run without a key.
  it('fails a section carrying the truncation sentinel, blocking caching', async () => {
    const r = await evaluateSection({
      generatedText: `## The Sun\n\nA plausible draft.\n\n${TRUNCATION_SENTINEL}`,
      chartContext:  'CHART',
      section:       'tropical',
      planetSection: 'sun',
    })
    expect(r.truncated).toBe(true)
    expect(r.pass).toBe(false)
    expect(r.scores).toBeNull()
    expect(r.evaluatorErrored).toBe(false)
  })

  it('fails a section that ends mid-sentence', async () => {
    const r = await evaluateSection({
      generatedText: '## The Moon\n\nThe emotional architecture here is one in which meaning and',
      chartContext:  'CHART',
      section:       'tropical',
      planetSection: 'moon',
    })
    expect(r.truncated).toBe(true)
    expect(r.pass).toBe(false)
    expect(r.scores).toBeNull()
  })
})

describe('detectRescuePhrasings — rescue-clause backstop (ease → hidden strength)', () => {
  it('flags a curated reassurance frame appended to a strength', () => {
    const text = 'Venus in Taurus in the 5th gives a sure eye for pleasure, which is a genuine gift.'
    expect(detectRescuePhrasings(text)).toContain('a genuine gift')
  })

  it('is case-insensitive', () => {
    expect(detectRescuePhrasings('This is No Small Thing.')).toContain('no small thing')
  })

  it('returns every distinct phrase present, in list order', () => {
    const text = 'A real resource, and tends to be underestimated, no small thing at all.'
    expect(detectRescuePhrasings(text)).toEqual([
      'a real resource',
      'tends to be underestimated',
      'no small thing',
    ])
  })

  it('does not flag a clean, plainly-named strength', () => {
    const text = 'The Moon trine is what keeps the identity from fragmenting under the Neptune pressure.'
    expect(detectRescuePhrasings(text)).toEqual([])
  })

  it('does not flag a bare "goes unnoticed" describing a trine (deliberately omitted)', () => {
    // The list is curated for precision: a legitimate mechanism description of a
    // trine's ease must not spuriously hard-fail. The LLM criterion handles the
    // softer context-dependent case.
    const text = 'The trine works so easily that it goes unnoticed and stays underdeveloped.'
    expect(detectRescuePhrasings(text)).toEqual([])
  })
})

describe('rescue-clause detection forces a contradiction_handling hard fail', () => {
  it('a detected phrase drives the aggregate below the pass bar', () => {
    // Simulate the evaluateSection wiring: any rescue hit clamps
    // contradiction_handling to MIN_INDIVIDUAL - 1 (= 2), which fails min ≥ 3.
    const scores = allScores(5)
    const hits = detectRescuePhrasings('…the Pluto trine, which is rarer than it sounds.')
    expect(hits.length).toBeGreaterThan(0)
    scores.contradiction_handling = Math.min(scores.contradiction_handling, 2)
    expect(computePassFromScores(scores)).toBe(false)
  })
})

describe('banned rescue / hierarchy phrasings — shared consts', () => {
  it('renders the rescue list from the phrasing array', () => {
    for (const phrase of BANNED_RESCUE_PHRASINGS) {
      expect(BANNED_RESCUE_LIST).toContain(phrase)
    }
  })

  it('renders the hierarchy list from the phrasing array', () => {
    for (const phrase of BANNED_HIERARCHY_PHRASINGS) {
      expect(BANNED_HIERARCHY_LIST).toContain(phrase)
    }
  })

  it('keeps the rescue and hierarchy bans live in the shared prompt rules', () => {
    expect(SHARED_RULES).toContain(BANNED_RESCUE_LIST)
    expect(SHARED_RULES).toContain(BANNED_HIERARCHY_LIST)
  })
})

describe('shadow coverage — anti-quota doctrine', () => {
  it('keeps the shadow rules live in the shared prompt rules', () => {
    expect(SHARED_RULES).toContain(SHADOW_RULES)
  })

  it('bans manufactured shadow rather than mandating blanket coverage', () => {
    expect(SHADOW_RULES).toContain('Shadow is not a quota')
    expect(SHADOW_RULES).toContain('Never invent a flaw')
  })

  it('drops the former blanket coverage quota it replaces', () => {
    // The old line ordered the model to cover both sides of EVERY quality,
    // which is the manufacture SHADOW_RULES bans. Shipping both would put two
    // contradictory instructions in one prompt.
    expect(SHARED_RULES).not.toContain('For every sign and every placement, cover both')
    expect(SHARED_RULES).not.toContain('Never present only the positive or only the negative')
  })

  it('mirrors the manufacture ban in the gate so prompt and gate cannot drift', () => {
    expect(EVAL_SYSTEM_PROMPT).toContain('MANUFACTURED SHADOW')
  })
})

describe('falsifiability criterion — Barnum doctrine', () => {
  it('renders the banned list from the phrasing array', () => {
    for (const phrase of BANNED_BARNUM_PHRASINGS) {
      expect(BANNED_BARNUM_LIST).toContain(phrase)
    }
  })

  it('keeps the banned phrasings live in the shared prompt rules', () => {
    expect(SHARED_RULES).toContain(BANNED_BARNUM_LIST)
  })

  it('anchors the divergence fixture to the banned universal it collapses to', () => {
    expect(FALSIFIABILITY_DIVERGENCE_EXAMPLE).toContain('being understood')
    expect(BANNED_BARNUM_PHRASINGS).toContain('you want to be understood')
  })

  it('exposes the divergence fixture as a stable, non-empty regression string', () => {
    expect(typeof FALSIFIABILITY_DIVERGENCE_EXAMPLE).toBe('string')
    expect(FALSIFIABILITY_DIVERGENCE_EXAMPLE.length).toBeGreaterThan(0)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regression: the runtime doctrine scan vs. ordinary English.
//
// BANNED_HIERARCHY_PHRASINGS used to contain the bare words 'underneath' and
// 'the mask'. /api/reading substring-matches that list and refuses to cache any
// section that hits, so every reading using "underneath" in an innocent sense was
// permanently uncacheable — a full model call on every page load, against the
// global daily cap, catching nothing (the scan runs after the text has already
// streamed). Meanwhile scripts/verify-thesis.sh had always applied the correct
// context-bounded rule to hand-authored copy. These tests bind the two surfaces.
// ─────────────────────────────────────────────────────────────────────────────
describe('contextual hierarchy detection', () => {
  it('does not flag bare "underneath" in ordinary prose', () => {
    expect(detectContextualHierarchy(
      'The warmth shuts off on the surface while the attachment continues underneath.'
    )).toEqual([])
  })

  it('does not flag "beneath" describing physical or emotional position', () => {
    expect(detectContextualHierarchy(
      'The anger sits beneath the politeness and rarely surfaces in the room itself.'
    )).toEqual([])
  })

  it('does not flag "the mask" used as an ordinary image', () => {
    expect(detectContextualHierarchy('The mask slips when she is tired.')).toEqual([])
  })

  it('flags a depth-ranking claim: term before identity language', () => {
    expect(detectContextualHierarchy(
      'the Sidereal chart is what sits underneath the constructed identity'
    )).toContain('underneath')
  })

  it('flags a depth-ranking claim: identity language before term', () => {
    expect(detectContextualHierarchy(
      'the constructed self is only a layer over what lies beneath'
    )).toContain('beneath')
  })

  it('flags the Tropical-as-mask hierarchy', () => {
    expect(detectContextualHierarchy(
      'the Tropical chart is the mask over a truer reading'
    )).toContain('the mask')
  })

  it('does not treat reflexive pronouns as identity language', () => {
    // `self` is word-bounded, so "yourself"/"themselves"/"itself" must not arm
    // the proximity rule and resurrect the false positives this replaced.
    expect(detectContextualHierarchy('you find yourself underneath a pile of it')).toEqual([])
    expect(detectContextualHierarchy('the pattern repeats itself beneath the noise')).toEqual([])
  })

  it('keeps bare contextual terms OUT of the literal ban list', () => {
    // The literal list is substring-matched with no context check, so no entry in
    // it may be a bare ordinary word. This is the assertion whose absence let
    // 'underneath' ship as a literal ban.
    for (const term of HIERARCHY_CONTEXTUAL_TERMS) {
      expect(BANNED_HIERARCHY_PHRASINGS as readonly string[]).not.toContain(term)
    }
  })

  it("does not flag AXIS's own prompt copy as a doctrine breach", () => {
    // SHARED_RULES states the anti-hierarchy rule by quoting the banned moves, and
    // its Leo entry uses "underneath" innocently. A scan that flags the prompt
    // teaching the rule will flag a model dutifully restating it.
    const leo = SHARED_RULES.split('\n').find(l => l.startsWith('LEO:'))
    expect(leo).toBeDefined()
    expect(detectContextualHierarchy(leo!)).toEqual([])
  })
})

describe('countAspectsInContext — both emitted block shapes', () => {
  it('counts the bulleted per-planet block', () => {
    const ctx = [
      'ASPECTS (tightest first):',
      '• Sun □ Saturn (orb 1.2°, applying, tense): friction',
      '• Sun △ Moon (orb 4.0°, separating, flowing): flow',
      '',
      'OTHER HEADER:',
    ].join('\n')
    expect(countAspectsInContext(ctx)).toBe(2)
  })

  it('counts the non-bulleted key_aspects block', () => {
    // Regression: buildInterpretationContext emits 'ALL MAJOR ASPECTS (tightest
    // first):' with un-bulleted entries for the key_aspects section. Matching only
    // the bulleted header silently returned 0 for it.
    const ctx = [
      'ALL MAJOR ASPECTS (tightest first):',
      '',
      'Sun ☌ Mercury (orb 2.1°, applying, intensifying)',
      '  Sun: core identity',
      '  Mercury: cognition',
      '  Dynamic: merger',
      '',
      'Moon □ Mars (orb 3.4°, separating, tense)',
      '  Moon: emotional register',
      '  Mars: drive',
      '  Dynamic: friction',
      '',
    ].join('\n')
    expect(countAspectsInContext(ctx)).toBe(2)
  })

  it('returns 0 when no aspect block is present', () => {
    expect(countAspectsInContext('SIGN CHARACTER: Fire Fixed\nKeywords: warm')).toBe(0)
  })
})

describe('detectBannedOpeners — the convergent existential opener', () => {
  it('flags the frame as the first sentence, past both heading levels', () => {
    const text = '## The Sun\n\n### The Sun in Leo\n\nThere is a particular kind of warmth that waits to be asked for.'
    expect(detectBannedOpeners(text)).toEqual(['There is a particular'])
  })

  it('flags every listed variant, including the contraction and a curly apostrophe', () => {
    expect(detectBannedOpeners('## Venus\n\nThere is a kind of attention you pay.')).toHaveLength(1)
    expect(detectBannedOpeners("## Mars\n\nThere's something about a closed door.")).toHaveLength(1)
    expect(detectBannedOpeners('## Mars\n\nThere’s a specific way you push.')).toHaveLength(1)
    expect(detectBannedOpeners('## The Moon\n\nThere are moments when the room goes quiet.')).toHaveLength(1)
  })

  it('ignores the frame mid-body', () => {
    const text = '## The Sun\n\nYou take the hard decision first. There is a particular kind of quiet after it.'
    expect(detectBannedOpeners(text)).toEqual([])
  })

  it('ignores the frame opening a later paragraph', () => {
    const text = '## Mercury\n\nMercury in fall slows the reply.\n\nThere is a kind of patience in that.'
    expect(detectBannedOpeners(text)).toEqual([])
  })

  it('ignores a plain existential statement of a chart fact', () => {
    // The Divergence legitimately counts what the plan allocated.
    expect(detectBannedOpeners('## Where the Chart Is Least Negotiable\n\nThere is one full concordance in this chart.')).toEqual([])
  })
})

describe('banned opener — prompt and gate parity', () => {
  it('every example the prompt states is caught by its own pattern', () => {
    for (const { pattern, example } of BANNED_OPENER_PATTERNS) {
      expect(example.replace('…', ' x')).toMatch(pattern)
    }
  })

  it('renders every example into the list, and the list into the shared rules and the evaluator', () => {
    for (const { example } of BANNED_OPENER_PATTERNS) expect(BANNED_OPENER_LIST).toContain(example)
    expect(SHARED_RULES).toContain(BANNED_OPENER_LIST)
    expect(EVAL_SYSTEM_PROMPT).toContain(BANNED_OPENER_LIST)
  })

  it('a detected opener drives specificity below the pass bar', () => {
    const scores = allScores(5)
    expect(detectBannedOpeners('## Mars\n\nThere is something restless here.').length).toBeGreaterThan(0)
    scores.specificity = Math.min(scores.specificity, 2)
    expect(computePassFromScores(scores)).toBe(false)
  })
})

describe('opening and closing modes — personal-planet sections', () => {
  const frames = ['tropical', 'sidereal'] as const

  for (const [name, modes] of [['OPENER_MODES', OPENER_MODES], ['CLOSER_MODES', CLOSER_MODES]] as const) {
    it(`${name} gives every personal-planet section, in both frames, a distinct mode`, () => {
      const all = frames.flatMap(f => PERSONAL_PLANET_SECTIONS.map(p => modes[f][p]))
      expect(all.every(m => typeof m === 'string' && m.length > 0)).toBe(true)
      expect(new Set(all).size).toBe(all.length)
      // Distinct in substance, not only in wording: no two share a lead term.
      for (const f of frames) {
        const leads = PERSONAL_PLANET_SECTIONS.map(p => modes[f][p].split(' — ')[0])
        expect(new Set(leads).size).toBe(leads.length)
      }
    })

    it(`${name}: each section instruction carries its own mode and no other section's`, () => {
      for (const f of frames) {
        for (const p of PERSONAL_PLANET_SECTIONS) {
          const instr = SECTION_INSTRUCTIONS[f][p]
          expect(instr).toContain(modes[f][p])
          for (const f2 of frames) for (const p2 of PERSONAL_PLANET_SECTIONS) {
            if (f2 === f && p2 === p) continue
            expect(instr).not.toContain(modes[f2][p2])
          }
        }
      }
    })
  }

  it('is a pure function of frame and planet, and absent elsewhere', () => {
    expect(openerModeFor('tropical', 'venus')).toBe(OPENER_MODES.tropical.venus)
    expect(openerModeFor('tropical', 'venus')).toBe(openerModeFor('tropical', 'venus'))
    expect(openerModeFor('sidereal', 'mars')).toBe(OPENER_MODES.sidereal.mars)
    expect(openerModeFor('tropical', 'ascendant')).toBeUndefined()
    expect(openerModeFor('synthesis', 'sun')).toBeUndefined()
  })

  it('never sends a Sidereal section a Western-aspect opening or close', () => {
    // The Sidereal frame bans Western degree aspects; a mode built on one would
    // order the model to break that rule.
    for (const p of PERSONAL_PLANET_SECTIONS) {
      expect(OPENER_MODES.sidereal[p]).not.toMatch(/\b(aspect|orb|trine|square|sextile|opposition)\b/i)
      expect(CLOSER_MODES.sidereal[p]).not.toMatch(/\b(aspect|orb|trine|square|sextile|opposition)\b/i)
    }
  })

  it('no longer asks the secondaries to distil one observation, the instruction that produced the struck close', () => {
    for (const p of ['mercury', 'venus', 'mars'] as const) {
      expect(SECTION_INSTRUCTIONS.tropical[p]).not.toContain('most specific and honest observation')
      expect(SECTION_INSTRUCTIONS.tropical[p]).not.toContain('most honest observation')
    }
  })

  it('separates the Moon (needed for safety) from Venus (worth giving and having)', () => {
    expect(SHARED_RULES).toContain('The Moon and Venus sections describe different things')
    expect(SECTION_INSTRUCTIONS.tropical.venus).not.toContain('needs from intimacy')
  })
})
