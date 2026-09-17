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

describe('shared Divergence evidence plan', () => {
  it('uses one plan in every Divergence section and includes computed aspects', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const chart = calculateDualChart(MODERN_BIRTH)
    const plan = buildDivergencePlan(chart)
    const contexts = ['agree', 'diverge', 'tension', 'closing'].map(section =>
      buildInterpretationContext(chart, 'synthesis', section))
    expect(new Set(contexts).size).toBe(1)
    expect(plan.evidence.some(e => e.kind === 'aspect' && /orb \d/.test(e.summary))).toBe(true)
    expect(contexts[0]).toContain('Angular relationship is unchanged across frameworks')
    expect(contexts[0]).toContain('Tropical')
    expect(contexts[0]).toContain('Sidereal')
  })

  // THE REGRESSION THAT SHIPPED: concordance required the house to match as
  // well as the sign. AXIS uses Whole Sign houses, so a shifted Ascendant
  // renumbers every same-sign body — making concordance unreachable and leaving
  // the agree section with nothing allocated on most charts.
  it('allocates concordance on charts whose Ascendant shifts sign', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    let empty = 0, total = 0
    for (let year = 1960; year <= 2005; year += 3) {
      for (const hour of [3, 9, 15, 21]) {
        const plan = buildDivergencePlan(calculateDualChart({
          ...MODERN_BIRTH, year, month: (year % 12) + 1, day: (year % 27) + 1, hour,
        }))
        total++
        if (plan.allocation.agree.length === 0) empty++
      }
    }
    expect(total).toBeGreaterThan(50)
    // Concordance is a property of real charts, not a rarity. Before the fix
    // this was 48/64.
    expect(empty).toBe(0)
  })

  it('grades concordance: a same-sign body whose house moves is both concordant and divergent', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const text = buildInterpretationContext(calculateDualChart(MODERN_BIRTH), 'synthesis', 'agree')
    expect(text).toContain('SAME-SIGN CONCORDANCE')
    expect(text).toMatch(/the character of this \w+ is fixed across both, and only the life domain moves/)
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    const sameSign = plan.evidence.filter(e => e.kind === 'concordance' && e.summary.includes('SAME-SIGN'))
    expect(sameSign.length).toBeGreaterThan(0)
    // Its house shift is still surfaced as a difference — both facts are true.
    for (const c of sameSign) {
      expect(plan.evidence.some(e => e.kind === 'difference' && e.planets[0] === c.planets[0])).toBe(true)
    }
  })

  // The sign-ruler tables are IDENTICAL. Telling the model the systems assign
  // different rulers is a fabricated astrological claim.
  it('never claims the two systems assign different sign rulers', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    const text = buildInterpretationContext(calculateDualChart(MODERN_BIRTH), 'synthesis', 'diverge')
    expect(text).not.toMatch(/system-specific rulers differ/i)
    expect(plan.candidates.flatMap(c => c.reasons).join(' ')).not.toMatch(/system-specific rulers/i)
    // A changed ruler is described as a consequence of the changed sign.
    const rulerReasons = plan.candidates.flatMap(c => c.reasons).filter(r => /sign ruler/.test(r))
    expect(rulerReasons.length).toBeGreaterThan(0)
    for (const r of rulerReasons) expect(r).toContain('follows the sign')
  })

  // The synthesis sections receive ONLY this plan, so anything absent from it
  // is a fact the model does not have and cannot use.
  it('supplies the facts the shared rules require: degree, retrogradation, nakshatra, outers and nodes', async () => {
    const text = buildInterpretationContext(calculateDualChart(MODERN_BIRTH), 'synthesis', 'diverge')
    expect(text).toMatch(/\d+°\d{2}'/)                      // cusp rule needs degrees
    expect(text).toMatch(/Pada \d/)                          // Jyotish grain
    for (const body of ['Uranus', 'Neptune', 'Pluto', 'Rahu', 'Ketu']) {
      expect(text).toContain(body)
    }
    expect(text).toMatch(/Vimshottari dasha|No dasha timing/)
  })

  it("never prints an impossible arcminute (fmtDeg's 60' carry)", async () => {
    for (let year = 1955; year <= 2005; year += 2) {
      const text = buildInterpretationContext(calculateDualChart({ ...MODERN_BIRTH, year }), 'synthesis', 'diverge')
      expect(text).not.toMatch(/°60'/)
    }
  })

  it('ranks by interpretive weight and structural size, never by degree gap', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    expect(plan.candidates.map(c => c.score)).toEqual([...plan.candidates.map(c => c.score)].sort((a, b) => b - a))
    // A Lagna sign change renumbers every house — it can never rank out of depth.
    const asc = plan.candidates.find(c => c.subject === 'Ascendant')
    if (asc) expect(plan.allocation.diverge).toContain(asc.id)
  })

  // THE LAW: divergences that did not make the depth cut stay named.
  it('names the unwalked divergences rather than dropping them', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    const text = buildInterpretationContext(calculateDualChart(MODERN_BIRTH), 'synthesis', 'diverge')
    expect(plan.allocation.diverge.length).toBeLessThanOrEqual(4)
    expect(plan.remaining.length).toBeGreaterThan(0)
    expect(text).toContain('STILL UNRESOLVED')
    for (const id of plan.remaining) expect(text).toContain(id)
  })

  // Codex's allocation gave diverge, tension and closing the same top-2 ids, so
  // the same placements were the subject of three consecutive sections while
  // the rubric scored that as repetition.
  it('gives the tension section the links between divergences, not a re-list', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    expect(plan.allocation.tension.some(id => id.startsWith('A-'))).toBe(true)
  })

  it('excludes time-dependent houses, angles and ranking when birth time is unknown', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const chart = calculateDualChart({ ...MODERN_BIRTH, birthTimeUnknown: true })
    const plan = buildDivergencePlan(chart)
    const text = buildInterpretationContext(chart, 'synthesis', 'diverge')
    expect(plan.evidence.find(e => e.id === 'L-BIRTH-TIME')?.summary).toContain('angles, houses, angle-derived ranking')
    expect(plan.candidates.flatMap(c => c.reasons).join(' ')).not.toMatch(/house changes/)
    expect(plan.candidates.some(c => c.subject === 'Ascendant' || c.subject === 'Midheaven')).toBe(false)
    expect(text).not.toMatch(/ H\d/)
    expect(text).toContain('Moon degree and any very tight Moon aspect as timing-sensitive')
  })

  it('allows fewer than three substantial divergences, and manufactures none', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const chart = calculateDualChart(MODERN_BIRTH)
    const same = { ...chart, sidereal: { ...chart.tropical, system: 'sidereal' as const, planets: chart.tropical.planets.map(p => ({ ...p })) } }
    const plan = buildDivergencePlan(same)
    expect(plan.allocation.diverge).toHaveLength(0)
    expect(plan.evidence.filter(e => e.kind === 'concordance').length).toBeGreaterThan(3)
  })

  // Yogas are sidereal-chart facts. Allocating them to `agree` would present
  // them as something both frameworks independently produced.
  it('never allocates sidereal yogas as cross-system concordance', async () => {
    const { buildDivergencePlan } = await import('../interpretation-engine')
    const plan = buildDivergencePlan(calculateDualChart(MODERN_BIRTH))
    for (const id of plan.allocation.agree) {
      expect(plan.evidence.find(e => e.id === id)?.kind).toBe('concordance')
    }
    expect(plan.evidence.filter(e => e.kind === 'yoga').every(e => !plan.allocation.agree.includes(e.id))).toBe(true)
  })
})
