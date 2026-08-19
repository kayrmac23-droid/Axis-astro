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
  evaluateSection,
  TRUNCATION_SENTINEL,
  FALSIFIABILITY_DIVERGENCE_EXAMPLE,
  GateScores,
  LlmScores,
} from '../reading-quality-gate'
import { BANNED_BARNUM_PHRASINGS, BANNED_BARNUM_LIST, SHARED_RULES, wordBandFor } from '../prompts'

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
  const band = wordBandFor('tropical', 'sun') // BAND_MAJOR: full 550–750, hard 500–800

  it('full marks inside the band', () => {
    expect(scoreLength(650, band)).toBe(5)
  })
  it('partial in the tolerated margins', () => {
    expect(scoreLength(520, band)).toBe(3) // 500–550
    expect(scoreLength(780, band)).toBe(3) // 750–800
  })
  it('fails below the hard floor and above the hard cap', () => {
    expect(scoreLength(480, band)).toBe(1)
    expect(scoreLength(900, band)).toBe(1)
  })

  it('an 1800-word Sun section fails the aggregate on length alone', () => {
    // The verification case: a section elite on every prose axis but far over
    // the hard cap must still fail the gate.
    const scores = allScores(5)
    scores.length = scoreLength(1800, band)
    expect(scores.length).toBe(1)
    expect(computePassFromScores(scores)).toBe(false)
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
