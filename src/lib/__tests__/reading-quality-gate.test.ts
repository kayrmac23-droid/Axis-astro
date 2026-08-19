import { describe, it, expect } from 'vitest'
import {
  computePassFromScores,
  validateScores,
  stripJsonFence,
  extractScoresFromRaw,
  buildFallbackCritique,
  FALSIFIABILITY_DIVERGENCE_EXAMPLE,
  GateScores,
} from '../reading-quality-gate'
import { BANNED_BARNUM_PHRASINGS, BANNED_BARNUM_LIST, SHARED_RULES } from '../prompts'

// A full set of scores, all equal to `v`. The gate has 9 criteria.
function allScores(v: number): GateScores {
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

describe('computePassFromScores', () => {
  // Pass requires average ≥ 3.75 AND no individual score below 3.
  it('passes when every score is strong', () => {
    expect(computePassFromScores(allScores(4))).toBe(true)
  })

  it('fails when the average is below 3.75 even with no sub-3 score', () => {
    // All 3s → avg 3.0, min 3. Min gate passes but the average gate does not.
    expect(computePassFromScores(allScores(3))).toBe(false)
  })

  it('fails when a single criterion is below 3 despite a high average', () => {
    const scores = allScores(5)
    scores.voice_quality = 2 // avg = (8*5 + 2)/9 = 4.67, but min < 3
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('fails on a sub-3 falsifiability score regardless of a high average', () => {
    // This is the enforcement point for the no-Barnum doctrine: a section can
    // be strong on every other axis (interior, chart-grounded, well-voiced) yet
    // trip the gate purely for being universally endorsable.
    const scores = allScores(5)
    scores.falsifiability = 2 // avg = 42/9 = 4.67, but min < 3 → fail
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('passes just above the 3.75 boundary with min ≥ 3', () => {
    // Seven 4s and two 3s → (28 + 6)/9 = 3.78, min 3. (No 9-integer set hits
    // exactly 3.75 — the sum would need to be 33.75.)
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    expect(computePassFromScores(scores)).toBe(true)
  })

  it('fails just below the 3.75 boundary', () => {
    // Six 4s and three 3s → (24 + 9)/9 = 3.67, min 3.
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    scores.synthesis = 3
    expect(computePassFromScores(scores)).toBe(false)
  })
})

describe('validateScores', () => {
  it('returns the scores object when all nine criteria are valid', () => {
    const valid = allScores(4)
    expect(validateScores(valid)).toEqual(valid)
  })

  it('rejects an object missing a criterion', () => {
    const partial: Record<string, number> = { ...allScores(4) }
    delete partial.voice_quality
    expect(validateScores(partial)).toBeNull()
  })

  it('rejects an object missing the falsifiability criterion', () => {
    const partial: Record<string, number> = { ...allScores(4) }
    delete partial.falsifiability
    expect(validateScores(partial)).toBeNull()
  })

  it('rejects out-of-range scores', () => {
    const tooHigh = { ...allScores(4), synthesis: 6 }
    const tooLow = { ...allScores(4), synthesis: 0 }
    expect(validateScores(tooHigh)).toBeNull()
    expect(validateScores(tooLow)).toBeNull()
  })

  it('rejects non-numeric scores and non-objects', () => {
    const stringScore = { ...allScores(4), synthesis: '5' as unknown as number }
    expect(validateScores(stringScore)).toBeNull()
    expect(validateScores(null)).toBeNull()
    expect(validateScores('not an object')).toBeNull()
  })
})

describe('stripJsonFence', () => {
  it('strips a ```json fenced block', () => {
    const raw = '```json\n{"pass": true}\n```'
    expect(stripJsonFence(raw)).toBe('{"pass": true}')
  })

  it('strips a bare ``` fenced block', () => {
    const raw = '```\n{"pass": false}\n```'
    expect(stripJsonFence(raw)).toBe('{"pass": false}')
  })

  it('leaves unfenced JSON untouched (aside from trimming)', () => {
    const raw = '  {"pass": true}  '
    expect(stripJsonFence(raw)).toBe('{"pass": true}')
  })

  it('produces JSON.parse-able output for a fenced payload', () => {
    const raw = '```json\n{"scores":{},"pass":true,"critique":""}\n```'
    expect(() => JSON.parse(stripJsonFence(raw))).not.toThrow()
  })
})

describe('extractScoresFromRaw — verdict integrity on truncated output', () => {
  const scoresJson = JSON.stringify(allScores(1))

  it('recovers scores when a long critique truncated the JSON mid-string', () => {
    // Simulates stop_reason: max_tokens — a complete scores object followed by
    // an unterminated critique string. JSON.parse on the whole thing throws,
    // but the scores must still be recoverable so the verdict does not fail open.
    const truncated = `{"scores": ${scoresJson}, "pass": false, "critique": "1. CHART EVIDENCE: not a single placement is used and the section keeps going`
    expect(() => JSON.parse(stripJsonFence(truncated))).toThrow()
    expect(extractScoresFromRaw(truncated)).toEqual(allScores(1))
  })

  it('recovers scores from a fenced, truncated payload', () => {
    const truncated = '```json\n{"scores": ' + scoresJson + ', "critique": "unterminated…'
    expect(extractScoresFromRaw(truncated)).toEqual(allScores(1))
  })

  it('returns null when no scores object is present', () => {
    expect(extractScoresFromRaw('{"pass": false, "critique": "no scores here"}')).toBeNull()
  })

  it('returns null when the recovered scores object is invalid', () => {
    const bad = '{"scores": {"chart_evidence": 9}, "critique": "…'
    expect(extractScoresFromRaw(bad)).toBeNull()
  })
})

describe('buildFallbackCritique — direction when the critique was lost', () => {
  it('returns an empty string when every criterion is at or above the pass bar', () => {
    expect(buildFallbackCritique(allScores(4))).toBe('')
  })

  it('names each sub-4 criterion with its score', () => {
    const scores = allScores(4)
    scores.falsifiability = 1
    scores.chart_evidence = 2
    const critique = buildFallbackCritique(scores)
    expect(critique).toContain('falsifiability (scored 1)')
    expect(critique).toContain('chart_evidence (scored 2)')
    expect(critique).not.toContain('specificity')
  })
})

describe('falsifiability criterion — Barnum doctrine', () => {
  // The banned phrasings are a single source of truth shared between the prompt
  // (which bans them) and the gate's criterion 9 description (which scores for
  // them). These guard against the two drifting apart.
  it('renders the banned list from the phrasing array', () => {
    for (const phrase of BANNED_BARNUM_PHRASINGS) {
      expect(BANNED_BARNUM_LIST).toContain(phrase)
    }
  })

  it('keeps the banned phrasings live in the shared prompt rules', () => {
    // If the prompt stops interpolating the shared list, this fails — catching
    // the exact drift the shared const exists to prevent.
    expect(SHARED_RULES).toContain(BANNED_BARNUM_LIST)
  })

  // Permanent regression fixture. This claim is the reason falsifiability is a
  // distinct 9th criterion and not folded into specificity: it is a concrete
  // interior scene (would pass specificity) whose negation is equally endorsable
  // (fails the inversion test). It collapses to the banned "you want to be
  // understood" line. If someone ever re-merges the two axes, the reasoning this
  // fixture encodes is what they will have lost.
  it('anchors the divergence fixture to the banned universal it collapses to', () => {
    expect(FALSIFIABILITY_DIVERGENCE_EXAMPLE).toContain('being understood')
    expect(BANNED_BARNUM_PHRASINGS).toContain('you want to be understood')
  })

  it('exposes the divergence fixture as a stable, non-empty regression string', () => {
    expect(typeof FALSIFIABILITY_DIVERGENCE_EXAMPLE).toBe('string')
    expect(FALSIFIABILITY_DIVERGENCE_EXAMPLE.length).toBeGreaterThan(0)
  })
})
