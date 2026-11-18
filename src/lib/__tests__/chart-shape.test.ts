// v10.57 — The Shape of Your Chart (tropical/overview). The reading used to open
// on the Sun, with the chart's dominant story worked out "internally" and never
// said. Kay (2026-11-18) asked for a master astrologer's reading: one that starts
// from the whole chart and shows how the placements act on each other. The
// opening section says it, from whole-chart facts computed here — so these pin
// the facts, the wiring, and the instructions that tell later sections to build
// on it.

import { describe, it, expect } from 'vitest'
import { calculateDualChart, type BirthData, type ChartData } from '@/lib/astro-calc'
import { buildInterpretationContext, dispositorChain, formatChartShapeBlock } from '@/lib/interpretation-engine'
import { NATAL_SECTION_ORDER, priorSectionsFor } from '@/lib/reading-order'
import { FREE_SECTIONS, natalReadingOrder } from '@/lib/paywall'
import { SECTION_INSTRUCTIONS, SHARED_RULES, renderSectionInstruction, wordBandFor } from '@/lib/prompts'
import { countAspectsInContext, scoreLength } from '@/lib/reading-quality-gate'
import { buildSectionRequest } from '@/lib/reading-request'
import { maxTokensFor, THINKING_HEADROOM_TOKENS } from '@/lib/reading-model-config'

// The reference chart (Kay, Epping, 23 Jul 1999 23:45 AEST).
const KAY: BirthData = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.03, timezone: 10, tzName: 'Australia/Melbourne',
}
const kay = calculateDualChart(KAY)

describe('the chart shape block — computed whole-chart facts', () => {
  const block = formatChartShapeBlock(kay.tropical, true)

  it('follows the chart ruler to where its chain ends', () => {
    // Aries rising, Mars in Scorpio: the chart ruler rules itself.
    expect(block).toMatch(/CHART RULER CHAIN: Aries rising → Mars in Scorpio H8 \[Domicile ✓\]; the chain ends on Mars, in its own sign\./)
  })

  it('names where every chain of sign rulers ends', () => {
    // Moon → Jupiter → Venus → Mercury → Sun; Mars disposes only itself.
    expect(block).toMatch(/no single final dispositor/)
    expect(block).toMatch(/Sun \(own sign\) ← Sun, Moon, Mercury, Venus, Jupiter, Saturn/)
    expect(block).toMatch(/Mars \(own sign\) ← Mars/)
    expect(dispositorChain(kay.tropical, 'Moon').chain).toEqual(['Moon', 'Jupiter', 'Venus', 'Mercury', 'Sun'])
  })

  it('lists dignities, angularity, element and modality balance', () => {
    expect(block).toMatch(/DIGNIFIED: Sun in Leo H5 \[Domicile ✓\] · Mars in Scorpio H8 \[Domicile ✓\]\./)
    expect(block).toMatch(/DEBILITATED: Venus in Virgo H6 \[Fall\]\./)
    expect(block).toMatch(/ANGULAR \(houses 1, 4, 7, 10\): none\./)
    expect(block).toMatch(/ELEMENTS, of 8: Fire 4 \(Sun, Moon, Mercury, Ascendant\) · Earth 3 \(Venus, Jupiter, Saturn\) · Air 0 · Water 1 \(Mars\)\./)
    expect(block).toMatch(/MISSING ELEMENT: Air\./)
    expect(block).toMatch(/EMPHASIS \(four or more\): Fire, Fixed\./)
  })

  it('computes the superlative and keeps the key aspects to tight and close ones', () => {
    expect(block).toMatch(/TIGHTEST ASPECT IN THE CHART: Moon trine Mercury/)
    const keyLines = block.split('\n').filter(l => /^ {2}\w+ \w+ \w+ \(orb/.test(l))
    expect(keyLines.length).toBeGreaterThan(0)
    for (const l of keyLines) expect(l).toMatch(/, (tight|close),/)
  })

  it('does not feed the aspect counter, so the opening band is never aspect-scaled', () => {
    const ctx = buildInterpretationContext(kay, 'tropical', 'overview')
    expect(ctx).not.toContain('ASPECTS (tightest first):')
    expect(countAspectsInContext(ctx)).toBe(0)
  })

  it('drops houses, angles and the ruler chain when the birth time is unknown', () => {
    const noon = calculateDualChart({ ...KAY, hour: 12, minute: 0, birthTimeUnknown: true })
    const unknown = formatChartShapeBlock(noon.tropical, false)
    expect(unknown).not.toMatch(/\bH\d/)
    expect(unknown).not.toContain('ANGULAR')
    expect(unknown).not.toContain('CHART RULER CHAIN')
    expect(unknown).toMatch(/ELEMENTS, of 7:/)
  })

  it('names a mutual reception when two planets sit in each other\'s signs', () => {
    const at = (name: string, sign: string) => ({ name, sign, house: 1, degree: 10, longitude: 0, retrograde: false })
    const fake = {
      ascendantSign: 'Aries', ascendantDegree: 0,
      planets: [at('Venus', 'Aries'), at('Mars', 'Libra'), at('Sun', 'Leo'), at('Moon', 'Cancer'),
        at('Mercury', 'Gemini'), at('Jupiter', 'Sagittarius'), at('Saturn', 'Capricorn')],
    } as unknown as ChartData
    expect(formatChartShapeBlock(fake, true)).toMatch(/MUTUAL RECEPTION: Venus \(Aries\) ↔ Mars \(Libra\)/)
    expect(dispositorChain(fake, 'Venus')).toEqual({ chain: ['Venus', 'Mars'], end: 'loop', loop: ['Venus', 'Mars'] })
  })
})

describe('the opening section is wired into the reading', () => {
  it('opens the reading, and the Sun is written after it', () => {
    expect(NATAL_SECTION_ORDER.tropical[0]).toBe('overview')
    expect(natalReadingOrder()[0]).toEqual({ section: 'tropical', planetSection: 'overview' })
    expect(priorSectionsFor('tropical', 'sun')).toEqual([{ section: 'tropical', planetSection: 'overview' }])
  })

  it('joins the free tier, which stays a prefix of the reading order', () => {
    expect(FREE_SECTIONS[0]).toEqual({ section: 'tropical', planetSection: 'overview' })
    expect(natalReadingOrder().slice(0, FREE_SECTIONS.length)).toEqual([...FREE_SECTIONS])
  })

  it('has its own band, and the target scores full marks against it', () => {
    const band = wordBandFor('tropical', 'overview')
    expect(band.target).toBe(700)
    expect(scoreLength(band.target, band)).toBe(5)
    expect(maxTokensFor('overview')).toBe(2600 + THINKING_HEADROOM_TOKENS)
  })

  it('builds a request whose scene clause asks for situations from the chart\'s aspects', () => {
    const req = buildSectionRequest(kay, 'tropical', 'overview', [])
    expect(req.scene).toBe('yes')
    expect(req.userContent).toContain('CHART SHAPE')
    expect(req.userContent).toContain('## The Shape of Your Chart')
  })
})

describe('the instructions take the fences down', () => {
  it('the opening section reads the chart as one system, without sub-headers or a walk-through', () => {
    const text = renderSectionInstruction('tropical', 'overview')!
    expect(text).toMatch(/No sub-headers/)
    expect(text).toMatch(/the chart read as one system/)
    expect(text).toMatch(/show how the key placements act on each other/)
    expect(text).toMatch(/Don't walk the placements one by one/)
  })

  it('the Sun builds on the shape and no longer hides the chart\'s story', () => {
    const sun = SECTION_INSTRUCTIONS.tropical.sun
    expect(sun).not.toMatch(/Do not output this reasoning step/)
    expect(sun).toMatch(/Build the Sun section on it/)
    // The Moon is no longer walled off: its effect on the Sun is fair game.
    expect(sun).not.toMatch(/You may NOT interpret the Moon/)
    expect(sun).toMatch(/The Moon's sign, house and aspects are fair reasons/)
  })

  it('every section shows what the rest of the chart does to its placement', () => {
    expect(SHARED_RULES).toMatch(/THE PLACEMENTS ACT ON EACH OTHER/)
    expect(SHARED_RULES).toMatch(/A placement read on its own is the half of a reading/)
    // The reading so far is still never a source of chart facts for another frame.
    expect(SHARED_RULES).toMatch(/in this frame/)
  })
})
