// Regression guard for the string-format coupling between the chart context the
// interpretation engine emits and the parser in countAspectsInContext.
//
// The parser matches an EXACT header ('ASPECTS (tightest first):') followed by
// '• ' bullet lines. Nothing enforces that contract at the type level, so a
// reword in interpretation-engine.ts would silently zero every aspect count and
// quietly un-scale every aspect-driven word band — a failure with no error and
// no visible symptom except shorter readings. These tests run the REAL engine
// rather than fixtures, so that drift fails here instead of in production.

import { describe, it, expect } from 'vitest'
import { countAspectsInContext } from '@/lib/reading-quality-gate'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { calculateDualChart } from '@/lib/astro-calc'
import type { BirthData } from '@/lib/astro-calc'

const BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: -37.8136, longitude: 144.9631, timezone: 10,
  tzName: 'Australia/Melbourne', birthTimeUnknown: false,
}

// The exact string evaluateSection receives as chartContext: chart block plus
// context block, no section instruction. Must stay identical to the route's
// assembly or the counts here aren't the counts the gate sees.
function chartContext(system: 'tropical' | 'sidereal', planetSection: string): string {
  const dual = calculateDualChart(BIRTH, undefined)
  return `${formatEliteChartBlock(dual[system], system)}\n${buildInterpretationContext(dual, system, planetSection)}`
}

describe('countAspectsInContext ↔ interpretation-engine format coupling', () => {
  it('counts aspects from real per-planet blocks', () => {
    // formatPlanetBlock is the counter's only live producer. Assert the header
    // verbatim so a reword fails loudly here rather than silently returning 0.
    const moon = chartContext('tropical', 'moon')
    expect(moon).toContain('ASPECTS (tightest first):')
    expect(countAspectsInContext(moon)).toBeGreaterThan(0)

    // Every section routed through formatPlanetBlock must produce a count —
    // these are the sections whose bands actually consume it.
    for (const s of ['moon', 'mercury', 'venus', 'mars', 'jupiter_saturn'] as const) {
      expect(countAspectsInContext(chartContext('tropical', s))).toBeGreaterThan(0)
    }
  })

  it('counts key_aspects from its plain (non-bulleted) block', () => {
    // interpretation-engine.ts emits 'ALL MAJOR ASPECTS (tightest first):' here,
    // followed by a blank line and unbulleted entries with indented continuation
    // lines — a different shape from the '• ' bullets formatPlanetBlock emits.
    // countAspectsInContext reads both (inPlainBlock vs inBulletBlock), so assert
    // the plain branch stays wired: if it regresses to 0 the count is silently
    // wrong, not an error.
    const ctx = chartContext('tropical', 'key_aspects')
    expect(ctx).toContain('ALL MAJOR ASPECTS (tightest first):')
    expect(countAspectsInContext(ctx)).toBeGreaterThan(0)

    // The count is INERT for this section by design: BAND_KEY_ASPECTS (prompts.ts)
    // declares no aspectBaseline or aspectAllowance, so scaleBand returns the band
    // unchanged whatever the count is. Deliberate — a definitionally all-aspects
    // section scaling its length by aspect count is circular.
  })

  it('counts the Ascendant/Lagna aspects computeAscendantAspects supplies', () => {
    // formatAscendantBlock now emits a real ASPECTS block, fed by
    // computeAscendantAspects (5° angle orb — the ASC is a point, and it moves
    // ~1° per four minutes of birth time). It uses the same '• ' bullet shape
    // formatPlanetBlock does, so the counter reads it with no special case.
    const asc = chartContext('tropical', 'ascendant')
    expect(asc).toContain('ASPECTS (tightest first):')
    // Pin the count to the bullets actually emitted rather than a magic number:
    // the chart is fixed, but this fails loudly if the two ever disagree.
    const ascBullets = asc.split('\n').filter(l => l.trimStart().startsWith('• Ascendant ')).length
    expect(ascBullets).toBeGreaterThan(0)
    expect(countAspectsInContext(asc)).toBe(ascBullets)

    // Sidereal Lagna matters more: BAND_SIDEREAL_PRIMARY declares
    // aspectBaseline/aspectAllowance, so this count actually scales the band.
    // (BAND_PRIMARY, the tropical Ascendant band, still declares no scaling.)
    expect(countAspectsInContext(chartContext('sidereal', 'lagna'))).toBeGreaterThan(0)
  })
})
