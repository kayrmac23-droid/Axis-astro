// Regression suite for the review of a live v10.24 reading (23 Jul 1999,
// 23:45, Epping VIC). Each block pins one defect that reached a reader, against
// the chart it was found on, so the fix cannot quietly regress.

import { describe, it, expect } from 'vitest'
import { calculateDualChart, type BirthData } from '@/lib/astro-calc'
import {
  buildInterpretationContext, formatEliteChartBlock, computeVimshottariDasha, currentDashaKey,
  cuspNeighbour, orbTier, isNearStation, drishtiHouses, jyotishSignStatus, lordshipsOf,
  neechaBhangaConditions, detectMajorYogas, aspectAlreadyWorked,
} from '@/lib/interpretation-engine'
import { makeCacheKey } from '@/lib/reading-cache'
import { detectBannedPhrasings, countAspectsInContext } from '@/lib/reading-quality-gate'
import { phrasesAlreadyUsed, overusedTics, phrasesAlreadyUsedBlock, type PriorSection } from '@/lib/reading-thread'
import { SHARED_RULES, SECTION_INSTRUCTIONS, SIDEREAL_SYSTEM_PROMPT, BANNED_META_PHRASINGS } from '@/lib/prompts'

const BIRTH: BirthData = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.03, timezone: 10, tzName: 'Australia/Melbourne',
}
const chart = calculateDualChart(BIRTH)
const OCT_5_2026 = Date.UTC(2026, 9, 5)
const planet = (system: 'tropical' | 'sidereal', name: string) =>
  chart[system].planets.find(p => p.name === name)!

describe('cusp rule — Sun at 0°17′ Leo was read as "unmixed" Leo', () => {
  it('finds the neighbour sign within 3° of either boundary, and nowhere else', () => {
    expect(cuspNeighbour('Leo', 0.28)).toBe('Cancer')
    expect(cuspNeighbour('Virgo', 28.5)).toBe('Libra')
    expect(cuspNeighbour('Leo', 3)).toBeNull()
    expect(cuspNeighbour('Leo', 15)).toBeNull()
  })

  it('flags the Sun in its own section context and in the chart block', () => {
    const ctx = buildInterpretationContext(chart, 'tropical', 'sun')
    expect(ctx).toMatch(/⚠ CUSP: Sun at Leo 0°17' .*just past Cancer/)
    expect(ctx).toContain('Never describe this placement as "pure", "unmixed"')
    expect(formatEliteChartBlock(chart.tropical, 'tropical')).toMatch(/^Sun: Leo 0°17'.*CUSP \(Cancer boundary/m)
  })

  it('does not flag a placement away from a boundary', () => {
    expect(buildInterpretationContext(chart, 'tropical', 'mercury')).not.toContain('⚠ CUSP: Mercury')
  })

  it('is defined in the shared rules (it was referenced but never stated)', () => {
    expect(SHARED_RULES).toContain('CUSP RULE — NON-NEGOTIABLE')
  })
})

describe('orb weight and motion', () => {
  it('classes orbs so a 7° square cannot be read as "real force"', () => {
    expect(orbTier(0.3)).toBe('tight')
    expect(orbTier(2.4)).toBe('close')
    expect(orbTier(5.1)).toBe('moderate')
    expect(orbTier(7.0)).toBe('wide')
    expect(buildInterpretationContext(chart, 'tropical', 'sun')).toMatch(/• Square Mars \(7°, wide,/)
  })

  it('marks Venus near station (it stations retrograde a week after this birth)', () => {
    expect(isNearStation(planet('tropical', 'Venus'))).toBe(true)
    const ctx = buildInterpretationContext(chart, 'tropical', 'venus')
    expect(ctx).toContain('⚠ NEAR STATION: Venus')
    expect(ctx).toMatch(/• Square Pluto \([^)]*may never perfect/)
  })
})

describe('key aspects — superlatives and re-covered aspects', () => {
  it('names the real tightest aspect (Moon trine Mercury at 0°, not Jupiter square Neptune)', () => {
    const ctx = buildInterpretationContext(chart, 'tropical', 'key_aspects')
    expect(ctx).toContain('TIGHTEST ASPECT IN THE CHART: Moon trine Mercury (orb 0°)')
  })

  it('marks aspects the reading so far already worked', () => {
    const priorText = 'Opposite Neptune in the 11th, Mercury idealises.\n\n### Saturn in Taurus\nThe square to Uranus means rupture. Saturn square Uranus recurs.'
    expect(aspectAlreadyWorked(priorText, 'Saturn', 'Uranus')).toBe(true)
    expect(aspectAlreadyWorked(priorText, 'Mercury', 'Neptune')).toBe(true)
    expect(aspectAlreadyWorked(priorText, 'Jupiter', 'Neptune')).toBe(false)
    const ctx = buildInterpretationContext(chart, 'tropical', 'key_aspects', { priorText })
    expect(ctx).toMatch(/Saturn □ Uranus[^\n]*\n {2}ALREADY WORKED/)
    expect(ctx).toMatch(/Jupiter □ Neptune[^\n]*\n {2}NOT YET WORKED/)
  })
})

describe('Sidereal frame — Jyotish evidence instead of re-walked Western aspects', () => {
  it('states the Venus shift as backward with the house unchanged', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'venus')
    expect(ctx).toContain("FRAME SHIFT: Tropical Virgo 4°21' H6 → Sidereal Leo")
    expect(ctx).toContain('never "forward"')
    expect(ctx).toContain('House is unchanged (H6 in both frames)')
  })

  it('gives no Western aspect list to any Sidereal section', () => {
    for (const s of ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu']) {
      expect(buildInterpretationContext(chart, 'sidereal', s)).not.toContain('ASPECTS (tightest first):')
    }
  })

  it('separates a nakshatra lord from its deity (Shravana is Moon-ruled, Vishnu presides)', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'rahu_ketu')
    expect(ctx).toContain('Planetary lord (its Vimshottari ruler): Moon | Presiding deity: Vishnu')
    expect(ctx).toContain('A deity is never the nakshatra\'s ruler')
  })

  it('computes whole-sign drishti, lordship and natural-friendship status', () => {
    expect(drishtiHouses('Jupiter', 2).map(d => d.house)).toEqual([6, 8, 10])
    expect(drishtiHouses('Mars', 8).map(d => d.house)).toEqual([11, 2, 3])
    expect(drishtiHouses('Rahu', 5)).toEqual([])
    expect(lordshipsOf(chart.sidereal, 'Mars')).toEqual([2, 9])
    expect(lordshipsOf(chart.sidereal, 'Jupiter')).toEqual([1, 10])
    expect(jyotishSignStatus(planet('sidereal', 'Venus'))).toMatch(/^enemy's sign/)
    expect(jyotishSignStatus(planet('sidereal', 'Jupiter'))).toMatch(/^friend's sign/)
    expect(jyotishSignStatus(planet('sidereal', 'Moon'))).toMatch(/^debilitated/)
  })

  it('reports the classical cancellation conditions for the debilitated Moon and Saturn', () => {
    const moon = neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Moon'))
    expect(moon.join(' ')).toMatch(/Venus, lord of Moon's exaltation sign Taurus, is in a kendra from the Moon/)
    expect(neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Saturn')).length).toBeGreaterThan(0)
    expect(neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Venus'))).toEqual([])
  })

  it('detects Sarala yoga — one dusthana lord in a dusthana (the old check required two)', () => {
    expect(detectMajorYogas(chart.sidereal).join(' ')).toMatch(/^Sarala Yoga .*Venus, lord of House 8, placed in House 6/)
  })

  it('scales Sidereal bands by the Jyotish relationships actually received', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'venus')
    expect(ctx).toContain('• Receives the 5th-house drishti of Jupiter (from Aries, H2)')
    expect(countAspectsInContext(ctx)).toBe(1)
  })
})

describe('dasha — current period, transition flag, cache key', () => {
  it('flags the Rahu antardasha as days old on the reading date', () => {
    const d = computeVimshottariDasha(chart, OCT_5_2026)!
    expect(`${d.mahadasha}/${d.antardasha}`).toBe('Ketu/Rahu')
    expect(d.daysSinceAntarStart).toBeLessThan(30)
    expect(buildInterpretationContext(chart, 'sidereal', 'lagna', { now: OCT_5_2026 }))
      .toContain('⚠ TRANSITION: the Rahu antardasha began only')
  })

  it('keys the cache on the period, so a September section is not served in October', () => {
    const sept = currentDashaKey(chart, Date.UTC(2026, 8, 1))
    const oct  = currentDashaKey(chart, OCT_5_2026)
    expect(sept).toBe('Ketu/Mars')
    expect(oct).toBe('Ketu/Rahu')
    const base = { birth: BIRTH, section: 'sidereal', planetSection: 'lagna' }
    expect(makeCacheKey({ ...base, dasha: sept })).not.toBe(makeCacheKey({ ...base, dasha: oct }))
  })
})

describe('doctrine scan — the stacking form of resolution-by-hierarchy and meta-narration', () => {
  it('catches the v10.24 Sidereal constructions', () => {
    expect(detectBannedPhrasings('a constructed identity performs Leo on top of an incarnational core that is organised around safety'))
      .toEqual(expect.arrayContaining(['incarnational core', 'on top of']))
    expect(detectBannedPhrasings('These are not mask and face.')).toContain('not mask and face')
    expect(detectBannedPhrasings('the cost is real rather than a secretly deeper form of love')).toContain('a secretly deeper')
  })

  it('leaves ordinary "on top of" alone', () => {
    expect(detectBannedPhrasings('Deadlines pile on top of the existing workload.')).toEqual([])
  })

  it('states the meta-narration ban in the shared rules', () => {
    for (const p of BANNED_META_PHRASINGS) expect(SHARED_RULES).toContain(p)
  })
})

describe('repetition across the reading', () => {
  const prior = (texts: string[]): PriorSection[] =>
    texts.map((text, i) => ({ section: 'tropical', planetSection: `s${i}`, text }))

  it('names a refrain repeated across sections, ignoring headings and chart terms', () => {
    const p = prior([
      '### Putting It Together\nThe warmth goes to the chosen few. The Leo Sun shines for the chosen few.',
      '### Putting It Together\nAgain the chosen few matter. The Leo Sun again.',
    ])
    const found = phrasesAlreadyUsed(p)
    expect(found).toContain('chosen few')
    expect(found).not.toContain('putting it together')
    expect(found.some(f => f.includes('leo'))).toBe(false)
  })

  it('counts the "rather than" antithesis tic', () => {
    const p = prior([
      'a rather than b. c rather than d. e rather than f.',
      'g rather than h. i rather than j. k rather than l.',
    ])
    expect(overusedTics(p)).toEqual([{ tic: 'rather than', count: 6 }])
    expect(phrasesAlreadyUsedBlock(p)).toContain('"rather than" ×6')
  })

  it('emits nothing for an opening section', () => {
    expect(phrasesAlreadyUsedBlock([])).toBe('')
  })
})

describe('prompt framing that produced the defects', () => {
  it('no longer frames the Sidereal chart as what pre-dates a constructed identity', () => {
    expect(SIDEREAL_SYSTEM_PROMPT).not.toContain('pre-date the constructed identity')
    expect(SIDEREAL_SYSTEM_PROMPT).toContain('Western degree aspects')
    for (const instr of Object.values(SECTION_INSTRUCTIONS.sidereal)) {
      expect(instr).not.toContain('constructed Tropical')
      expect(instr).not.toContain('incarnational-layer')
    }
  })

  it('no longer asks the Ascendant section for the first impression others receive', () => {
    expect(SECTION_INSTRUCTIONS.tropical.ascendant).not.toContain('first impression')
    expect(SECTION_INSTRUCTIONS.tropical.ascendant).toContain('Do not open on what other people notice')
  })

  it('no longer feeds a stock caveat to every trine and sextile', () => {
    const ctx = buildInterpretationContext(chart, 'tropical', 'moon')
    expect(ctx).not.toContain('seldom deliberately deployed')
    expect(ctx).not.toContain('stay dormant otherwise')
  })
})
