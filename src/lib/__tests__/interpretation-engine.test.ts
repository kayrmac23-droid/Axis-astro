import { describe, it, expect } from 'vitest'
import { calculateDualChart, BirthData } from '../astro-calc'
import { computeVimshottariDasha, computeAscendantAspects, buildInterpretationContext } from '../interpretation-engine'
import { countAspectsInContext } from '../reading-quality-gate'
import { BANNED_RESCUE_PHRASINGS, BANNED_HIERARCHY_PHRASINGS } from '../prompts'

const MODERN_BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: 51.5074, longitude: -0.1278, timezone: 1,
}

describe('computeVimshottariDasha', () => {
  it('returns a coherent maha/antar dasha for a modern birth', () => {
    const chart = calculateDualChart(MODERN_BIRTH)
    const dasha = computeVimshottariDasha(chart)

    expect(dasha).not.toBeNull()
    const LORDS = ['Ketu', 'Venus', 'Sun', 'Moon', 'Mars', 'Rahu', 'Jupiter', 'Saturn', 'Mercury']
    expect(LORDS).toContain(dasha!.mahadasha)
    expect(LORDS).toContain(dasha!.antardasha)
    // Dates are formatted YYYY-MM and should be in the future for a living native.
    expect(dasha!.mahaDashaEndDate).toMatch(/^\d{4}-\d{2}$/)
    expect(dasha!.antarDashaEndDate).toMatch(/^\d{4}-\d{2}$/)
  })

  // Regression: computeVimshottariDasha previously built the birth instant with
  // Date.UTC(bd.year, …), which remaps years 0–99 to 1900–1999. A year-50 birth was
  // silently treated as 1950, fabricating a dasha from a ~1900-year-wrong instant.
  // With birthToUtcMs the instant is correct, so no fabricated dasha is produced for
  // an ancient birth the current-day window cannot legitimately reach.
  it('does not fabricate a dasha from a remapped early-CE year', () => {
    const ancient = calculateDualChart({ ...MODERN_BIRTH, year: 50 })
    const dasha = computeVimshottariDasha(ancient)
    expect(dasha).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// Regression: the Ascendant/Lagna context carried NO aspects.
//
// computeAspects() iterates chart.planets, and the Ascendant is an angle, not a
// body — so no aspect to it was computed anywhere in the codebase. Meanwhile
// DEPTH REQUIREMENTS instructs the model to work "every major aspect with the
// aspecting planet named" for that section, and BAND_PRIMARY is aspect-scaled
// with a 400-word hard floor. A model told to work aspects it was never given can
// only pad or invent, which made this the most likely source of hallucinated
// aspects in shipped readings.
// ─────────────────────────────────────────────────────────────────────────────
describe('computeAscendantAspects', () => {
  const chart = calculateDualChart(MODERN_BIRTH)

  it('returns only aspects within the tighter angle orb', () => {
    const aspects = computeAscendantAspects(chart.tropical.ascendant, chart.tropical.planets)
    for (const a of aspects) {
      expect(a.orb).toBeLessThanOrEqual(5)
      expect(a.orb).toBeGreaterThanOrEqual(0)
    }
  })

  it('orders tightest first', () => {
    const aspects = computeAscendantAspects(chart.tropical.ascendant, chart.tropical.planets)
    const orbs = aspects.map(a => a.orb)
    expect([...orbs].sort((x, y) => x - y)).toEqual(orbs)
  })

  it('excludes Ketu, which is tracked via the Rahu axis', () => {
    const aspects = computeAscendantAspects(chart.tropical.ascendant, chart.tropical.planets)
    expect(aspects.map(a => a.planet)).not.toContain('Ketu')
  })

  it('finds a conjunction for a planet placed on the Ascendant degree', () => {
    const sun = chart.tropical.planets.find(p => p.name === 'Sun')!
    // Put the Ascendant exactly on the Sun; the aspect must be found at orb 0.
    const aspects = computeAscendantAspects(sun.longitude, chart.tropical.planets)
    const toSun = aspects.find(a => a.planet === 'Sun')
    expect(toSun).toBeDefined()
    expect(toSun!.aspectName).toBe('Conjunction')
    expect(toSun!.orb).toBe(0)
  })

  it('finds an opposition for a planet on the Descendant', () => {
    const moon = chart.tropical.planets.find(p => p.name === 'Moon')!
    const asc  = (moon.longitude + 180) % 360
    const toMoon = computeAscendantAspects(asc, chart.tropical.planets)
      .find(a => a.planet === 'Moon')
    expect(toMoon).toBeDefined()
    expect(toMoon!.aspectName).toBe('Opposition')
  })

  it('rejects a planet just outside the angle orb that a planet-to-planet orb would accept', () => {
    // A 7° square is inside ASPECT_DEFS' 8° planetary orb but outside the 5° an
    // angle carries — the Ascendant is a point and moves ~1° per four minutes of
    // birth time, so a loose orb here manufactures aspects a small time error erases.
    const sun = chart.tropical.planets.find(p => p.name === 'Sun')!
    const asc = (sun.longitude + 90 + 7) % 360
    const toSun = computeAscendantAspects(asc, chart.tropical.planets)
      .find(a => a.planet === 'Sun')
    expect(toSun).toBeUndefined()
  })
})

describe('Ascendant interpretation context', () => {
  const chart = calculateDualChart(MODERN_BIRTH)

  for (const [section, planetSection] of [['tropical', 'ascendant'], ['sidereal', 'lagna']] as const) {
    it(`emits an aspect block for ${section}:${planetSection}`, () => {
      const ctx = buildInterpretationContext(chart, section, planetSection)
      // The header must be present whether or not the chart yields aspects: an
      // explicit "none within orb" is what stops the model inventing them.
      expect(ctx).toContain('ASPECTS (tightest first):')
    })

    it(`states the aspects it gives are the only ones, for ${section}:${planetSection}`, () => {
      const ctx = buildInterpretationContext(chart, section, planetSection)
      expect(ctx).toMatch(/ONLY aspects to the (Ascendant|Lagna)|None within 5° orb/)
    })

    it(`counts its own aspect block, so the word band can scale (${section}:${planetSection})`, () => {
      const ctx = buildInterpretationContext(chart, section, planetSection)
      const listed = (ctx.match(/^• (Ascendant|Lagna) /gm) ?? []).length
      // Emitted bullets and the gate's counter must agree — the band is scaled
      // from the counter, and the model is held to the band.
      if (listed > 0) expect(countAspectsInContext(ctx)).toBe(listed)
    })
  }
})

// ─────────────────────────────────────────────────────────────────────────────
// Regression: the interpretation engine used to EMIT the rescue clause the
// prompt bans. buildStrengths shipped "a genuine talent, not just an absence of
// friction", "This is a real strength of the chart", "one of the places this
// person is naturally, reliably strong" and "so easy it may go unnoticed" — all
// trailing value-assertions that fail the prompt's own deletion test, and all
// landing in the USER message, downstream of SHARED_RULES and therefore more
// salient than the rule forbidding them. The context was modelling the banned
// register while the rules banned it.
// ─────────────────────────────────────────────────────────────────────────────
describe('interpretation context — does not model the banned rescue register', () => {
  const chart = calculateDualChart(MODERN_BIRTH)

  const SECTIONS: Array<['tropical' | 'sidereal' | 'synthesis', string]> = [
    ['tropical', 'sun'], ['tropical', 'moon'], ['tropical', 'ascendant'],
    ['tropical', 'venus'], ['tropical', 'jupiter_saturn'], ['tropical', 'key_aspects'],
    ['sidereal', 'lagna'], ['sidereal', 'sun'], ['sidereal', 'venus'],
    ['synthesis', 'diverge'],
  ]

  for (const [section, planetSection] of SECTIONS) {
    it(`emits no banned rescue phrasing for ${section}:${planetSection}`, () => {
      const ctx = buildInterpretationContext(chart, section, planetSection).toLowerCase()
      const hits = BANNED_RESCUE_PHRASINGS.filter(p => ctx.includes(p.toLowerCase()))
      expect(hits).toEqual([])
    })

    it(`emits no literal hierarchy phrasing for ${section}:${planetSection}`, () => {
      const ctx = buildInterpretationContext(chart, section, planetSection).toLowerCase()
      const hits = BANNED_HIERARCHY_PHRASINGS.filter(p => ctx.includes(p.toLowerCase()))
      expect(hits).toEqual([])
    })
  }

  it('states a strength as function, not as an assertion of its worth', () => {
    const ctx = buildInterpretationContext(chart, 'tropical', 'sun')
    // The specific constructions that failed the deletion test.
    expect(ctx).not.toContain('a genuine talent')
    expect(ctx).not.toContain('a real strength of the chart')
    expect(ctx).not.toContain('naturally, reliably strong')
    // NOT asserted: a bare "goes unnoticed". prompts.ts deliberately leaves that
    // off BANNED_RESCUE_PHRASINGS — the Sextile's "tends to go unnoticed because
    // it creates no friction" is a mechanism, not a value-assertion, and survives
    // the deletion test. Only the "easy to/easy enough to go unnoticed" framing
    // is banned, and that is covered by the ban-list parity tests above.
  })
})
