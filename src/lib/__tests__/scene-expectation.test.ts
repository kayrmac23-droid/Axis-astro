// PART 1's recurring moment is required only where the section's EVIDENCE
// names a trigger — an aspect in Tropical, a drishti received in Sidereal — and
// takes a third-person form in The Divergence. The value is computed from the
// context, never judged, and the generator and the evaluator must be told the
// same one: otherwise a section that correctly declines to invent a trigger is
// scored a 2 and repaired toward the invention.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import { calculateDualChart } from '../astro-calc'
import { parseBirthDataInput } from '../birth-data-validation'
import { buildSectionRequest } from '../reading-request'
import { sceneExpectation, sceneClause } from '../scene-expectation'
import { detectAntithesisTic } from '../reading-rule-scan'

function chart(id: string) {
  const d = JSON.parse(readFileSync('scripts/eval-charts.json', 'utf8'))
  const spec = (d.charts ?? d).find((c: { id: string }) => c.id === id)
  const parsed = parseBirthDataInput(spec.birth)
  if (!parsed.ok) throw new Error(parsed.error)
  return calculateDualChart(parsed.data)
}

describe('sceneExpectation', () => {
  const dual = chart('control-chicago-1987')

  it('Sidereal: yes exactly where a drishti is received (control-chicago-1987)', () => {
    // The chart the 2026-11-08 run measured: the four sections that reached
    // specificity 3 are four of the five that receive a drishti.
    const got = Object.fromEntries(['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu']
      .map(ps => [ps, buildSectionRequest(dual, 'sidereal', ps, []).scene]))
    expect(got).toEqual({
      lagna: 'no', sun: 'no', moon: 'yes', mercury: 'no',
      venus: 'yes', mars: 'yes', jupiter_saturn: 'yes', rahu_ketu: 'yes',
    })
  })

  it('treats a same-sign conjunction as arena, not trigger', () => {
    const ctx = 'GRAHA RELATIONSHIPS RECEIVED (Jyotish …):\n• Conjunct (same sign) Mercury — Libra 5°07\', H1'
    expect(sceneExpectation('sidereal', 'sun', ctx, 1)).toBe('no')
    expect(sceneExpectation('sidereal', 'sun', `${ctx}\n• Receives the 7th-house drishti of Mars (from Virgo, H12)`, 2)).toBe('yes')
    expect(sceneExpectation('sidereal', 'lagna', '• The Lagna receives the 9th-house drishti of Jupiter (from Leo, H5)', 1)).toBe('yes')
  })

  it('Tropical: yes when an aspect reaches the placement, no when none does', () => {
    expect(sceneExpectation('tropical', 'sun', '', 3)).toBe('yes')
    expect(sceneExpectation('tropical', 'sun', '', 0)).toBe('no')
    expect(buildSectionRequest(dual, 'tropical', 'mercury', []).scene).toBe('yes')
  })

  it('The Divergence: third-person, because its plan lists aspects as evidence', () => {
    for (const ps of ['agree', 'diverge', 'tension', 'closing']) {
      expect(buildSectionRequest(dual, 'synthesis', ps, []).scene).toBe('third-person')
    }
    expect(sceneExpectation('synthesis', 'diverge', 'RANKED DIVERGENCES\n  1. [D-SUN] Sun — sign changes. Evidence: D-SUN', 0)).toBe('no')
  })

  it('synastry keeps PART 1 as it was', () => {
    expect(sceneExpectation('synastry', 'luminaries', '', 0)).toBe('yes')
  })
})

describe('sceneClause — what the writer is told', () => {
  it('forbids the scene, and says what to write instead, where there is no trigger', () => {
    const c = sceneClause('no', 'sidereal')
    expect(c).toMatch(/no drishti reaches this placement/)
    expect(c).toMatch(/write no scene/)
    expect(c).toMatch(/condition under which its pattern is live/)
    expect(c).toMatch(/goes quiet/)
  })

  it('names the trigger kind where there is one', () => {
    expect(sceneClause('yes', 'sidereal')).toMatch(/drishti/)
    expect(sceneClause('yes', 'tropical')).toMatch(/aspect/)
  })

  it('gives The Divergence a third-person moment built from plan aspects', () => {
    const c = sceneClause('third-person', 'synthesis')
    expect(c).toMatch(/third person/i)
    expect(c).toMatch(/aspect the plan lists/)
  })

  it('does not model the antithesis tic or long sentences it is sent beside', () => {
    for (const e of ['yes', 'no', 'third-person'] as const) {
      const c = sceneClause(e, e === 'third-person' ? 'synthesis' : 'sidereal')
      expect(detectAntithesisTic(c)).toEqual([])
      for (const s of c.split(/(?<=[.:])\s+/)) expect(s.split(/\s+/).length).toBeLessThanOrEqual(35)
    }
  })
})

describe('the generator request carries the clause', () => {
  it('states SCENE beside the section instruction, matching req.scene', () => {
    const dual = chart('control-chicago-1987')
    const sun  = buildSectionRequest(dual, 'sidereal', 'sun', [])
    const moon = buildSectionRequest(dual, 'sidereal', 'moon', [])
    expect(sun.userContent.trimEnd().endsWith(sceneClause('no', 'sidereal'))).toBe(true)
    expect(moon.userContent.trimEnd().endsWith(sceneClause('yes', 'sidereal'))).toBe(true)
  })
})
