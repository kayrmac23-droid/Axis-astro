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

  it('KNOWN GAP: key_aspects emits a header the counter does not match', () => {
    // interpretation-engine.ts emits 'ALL MAJOR ASPECTS (tightest first):' for
    // this section. Three independent reasons the count is 0: the startsWith
    // match fails on the 'ALL MAJOR ' prefix, a blank line follows the header,
    // and the aspect lines carry no '• ' bullet.
    //
    // Inert today: BAND_KEY_ASPECTS (prompts.ts) declares no aspectBaseline or
    // aspectAllowance, so scaleBand returns the band unchanged whatever the
    // count is. Deferred deliberately — a definitionally all-aspects section
    // scaling its length by aspect count is circular.
    //
    // Pinned to CURRENT (broken) behaviour on purpose: if anyone fixes the
    // engine or the counter, this test SHOULD fail. When it does, update it and
    // decide whether BAND_KEY_ASPECTS should opt in to scaling too.
    const ctx = chartContext('tropical', 'key_aspects')
    expect(ctx).toContain('ALL MAJOR ASPECTS (tightest first):')
    expect(countAspectsInContext(ctx)).toBe(0)
  })

  it('ascendant/lagna assemble no aspects at all', () => {
    // formatAscendantBlock emits no ASPECTS block — there is no computeAspects
    // call on that path — so the count is structurally 0. Harmless: BAND_PRIMARY
    // no longer advertises scaling, and BAND_SIDEREAL_PRIMARY's baseline clamps
    // the bonus to 0. Guards against a future ASC-aspect block landing without
    // the counter being taught to read it.
    expect(countAspectsInContext(chartContext('tropical', 'ascendant'))).toBe(0)
    expect(countAspectsInContext(chartContext('sidereal', 'lagna'))).toBe(0)
  })
})
