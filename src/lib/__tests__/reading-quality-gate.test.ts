import { describe, it, expect } from 'vitest'
import {
  computePassFromScores,
  validateScores,
  stripJsonFence,
  GateScores,
} from '../reading-quality-gate'

// A full set of scores, all equal to `v`. The gate has 9 criteria.
function allScores(v: number): GateScores {
  return {
    chart_evidence:         v,
    specificity:            v,
    synthesis:              v,
    contradiction_handling: v,
    anti_cliche:            v,
    falsifiability:         v,
    psychological_depth:    v,
    practical_usefulness:   v,
    voice_quality:          v,
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
    scores.voice_quality = 2 // avg = (8*5 + 2)/9 ≈ 4.67, but min < 3
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('passes at the exact 3.75 average boundary (inclusive) with min ≥ 3', () => {
    // Nine integer criteria cannot sum to exactly 3.75 average, so exercise the
    // inclusive `>=` boundary directly: every criterion at 3.75 → avg 3.75, min 3.75.
    expect(computePassFromScores(allScores(3.75))).toBe(true)
  })

  it('fails just below the 3.75 boundary', () => {
    // Six 4s and three 3s → (24 + 9)/9 = 3.666…, min 3.
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    scores.synthesis = 3
    expect(computePassFromScores(scores)).toBe(false)
  })

  it('passes just above the 3.75 boundary', () => {
    // Seven 4s and two 3s → (28 + 6)/9 = 3.777…, min 3.
    const scores = allScores(4)
    scores.specificity = 3
    scores.anti_cliche = 3
    expect(computePassFromScores(scores)).toBe(true)
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
