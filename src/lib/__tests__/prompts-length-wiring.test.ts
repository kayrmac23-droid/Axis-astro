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
import { SECTION_INSTRUCTIONS, SECTION_WORD_BANDS, wordBandFor } from '../prompts'

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
