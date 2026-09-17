// Regression guard for the length-band wiring (audit finding #6).
//
// Every section used to state its word budget one of two ways: aspect-scaled and
// synthesis sections rendered it from the shared band via lengthClause(), while
// ~11 others carried a hand-typed literal ("300–400 words."). The literals were
// invisible to SECTION_WORD_BANDS, so changing a band silently left those sections
// telling the model the old number — which the gate would then penalise. All
// sections now render their band through lengthClause(). These tests fail if a
// literal creeps back, or if a ported section drifts from its band.
import { describe, it, expect } from 'vitest'
import { SECTION_INSTRUCTIONS, SECTION_WORD_BANDS, wordBandFor, countPlanEvidence } from '../prompts'
import { buildInterpretationContext } from '../interpretation-engine'
import { calculateDualChart, type BirthData } from '../astro-calc'

const WIRING_BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: 51.5074, longitude: -0.1278, timezone: 1,
}

// lengthClause() renders "Acceptable range {fullMin}–{fullMax}" and
// "Target {target} words" straight from the band, so their presence proves the
// instruction is band-derived rather than a hand-typed number.
function assertBandDerived(section: string, planetSection: string) {
  const text = SECTION_INSTRUCTIONS[section]?.[planetSection]
  expect(text, `${section}/${planetSection} instruction missing`).toBeTruthy()
  const band = wordBandFor(section, planetSection)
  expect(text).toContain(`Target ${band.target} words`)
  expect(text).toContain(`Acceptable range ${band.fullMin}–${band.fullMax}`)
}

describe('length-band wiring — every typed section renders its band via lengthClause', () => {
  // Every key that has a typed band should have a matching instruction that
  // renders from it. (DEFAULT_WORD_BAND fallbacks are not asserted.)
  for (const key of Object.keys(SECTION_WORD_BANDS)) {
    const [section, planetSection] = key.split(':')
    it(`${key} states its band from SECTION_WORD_BANDS`, () => {
      assertBandDerived(section, planetSection)
    })
  }
})

describe('length-band wiring — no hand-typed word-count literals remain', () => {
  it('no SECTION_INSTRUCTIONS value carries a bare "NNN–NNN words" or "words total" literal', () => {
    for (const [section, planetSections] of Object.entries(SECTION_INSTRUCTIONS)) {
      for (const [planetSection, text] of Object.entries(planetSections)) {
        // lengthClause renders "range NNN–NNN. Below …" — a bare "NNN–NNN words"
        // is the old literal form and must not reappear.
        expect(
          /\d{3}–\d{3} words/.test(text),
          `${section}/${planetSection} still contains a bare "NNN–NNN words" literal`,
        ).toBe(false)
        expect(
          /words total\./.test(text),
          `${section}/${planetSection} still contains a "words total." literal`,
        ).toBe(false)
      }
    }
  })
})

describe('evidence-scaled Divergence bands', () => {
  it('lowers the floor when the plan allocated little, so a quiet chart is not padded', () => {
    const base  = wordBandFor('synthesis', 'agree')
    const thin  = wordBandFor('synthesis', 'agree', undefined, 1)
    const rich  = wordBandFor('synthesis', 'agree', undefined, 6)
    expect(thin.hardMin).toBeLessThan(base.hardMin)
    expect(thin.fullMin).toBeLessThan(base.fullMin)
    expect(rich.fullMax).toBeGreaterThan(base.fullMax)
    // A rich plan must not raise the hard floor — earned brevity stays legal.
    expect(rich.hardMin).toBe(base.hardMin)
  })

  it('never lets a scaled floor collapse below a real section', () => {
    for (const section of ['agree', 'diverge'] as const) {
      const band = wordBandFor('synthesis', section, undefined, 0)
      expect(band.hardMin).toBeGreaterThanOrEqual(90)
      expect(band.hardMin).toBeLessThan(band.fullMin)
      expect(band.fullMin).toBeLessThan(band.fullMax)
    }
  })

  it('leaves every non-Divergence band untouched by evidence scaling', () => {
    for (const [key] of Object.entries(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      if (section === 'synthesis' && (planetSection === 'agree' || planetSection === 'diverge')) continue
      expect(wordBandFor(section, planetSection, undefined, 1))
        .toEqual(wordBandFor(section, planetSection))
    }
  })

  it('reads the plan weight the context block actually prints', () => {
    const ctx = buildInterpretationContext(calculateDualChart(WIRING_BIRTH), 'synthesis', 'agree')
    expect(ctx).toMatch(/^PLAN WEIGHT: \d+ concordance\(s\), \d+ divergence\(s\)/m)
    expect(countPlanEvidence(ctx, 'agree')).toBeGreaterThan(0)
    expect(countPlanEvidence(ctx, 'diverge')).toBeGreaterThan(0)
    // Sections without a plan are left alone.
    expect(countPlanEvidence('no plan here', 'agree')).toBeNull()
    expect(countPlanEvidence(ctx, 'tension')).toBeNull()
  })
})
