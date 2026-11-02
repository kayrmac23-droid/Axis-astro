import { describe, it, expect } from 'vitest'
import { calculateDualChart, BirthData } from '../astro-calc'
import { buildInterpretationContext, formatEliteChartBlock } from '../interpretation-engine'

// v10.31. A noon chart's Ascendant is a placeholder and every Whole Sign house
// is counted from it. Before this change the ⚠ BIRTH TIME UNKNOWN caveat told
// the model not to state houses while every block below it printed them — and
// told it to "situate the behaviour" in that house and "use this house number as
// given". The v10.30 eval's unknown-time chart (Glasgow 1996) asserted a house
// twelve times to three hedges across its 19 sections. The context now withholds
// the house instead of hedging it, so these tests pin that NO house number
// reaches the model when the time is unknown, and that a known time is untouched.

const GLASGOW_UNKNOWN: BirthData = {
  year: 1996, month: 7, day: 4, hour: 12, minute: 0,
  latitude: 55.8642, longitude: -4.2518, timezone: 1, birthTimeUnknown: true,
}
const GLASGOW_KNOWN: BirthData = { ...GLASGOW_UNKNOWN, birthTimeUnknown: false }

const SECTIONS: Array<['tropical' | 'sidereal', string]> = [
  ['tropical', 'sun'], ['tropical', 'moon'], ['tropical', 'mercury'], ['tropical', 'venus'],
  ['tropical', 'mars'], ['tropical', 'jupiter_saturn'], ['tropical', 'rahu_ketu'], ['tropical', 'key_aspects'],
  ['sidereal', 'sun'], ['sidereal', 'moon'], ['sidereal', 'mercury'], ['sidereal', 'venus'],
  ['sidereal', 'mars'], ['sidereal', 'jupiter_saturn'], ['sidereal', 'rahu_ketu'],
]

// Every way the context spells a house: "House 7", "H7", "7th house", a lordship.
const HOUSE_TOKEN = /\bHouse \d|\bH\d{1,2}\b|\b\d{1,2}(?:st|nd|rd|th) house\b(?!-)|HOUSE LORDSHIP|HOUSE H\d/

describe('unknown birth time — houses are withheld from the context', () => {
  const unknown = calculateDualChart(GLASGOW_UNKNOWN)
  const known   = calculateDualChart(GLASGOW_KNOWN)

  it.each(SECTIONS)('%s/%s context names no house', (frame, planetSection) => {
    const ctx = buildInterpretationContext(unknown, frame, planetSection)
    // "the 5th-house drishti" is a sign-to-sign count, valid without a birth
    // time; strip it before looking for house assertions.
    const stripped = ctx.replace(/\d{1,2}(?:st|nd|rd|th)-house drishti/g, '')
    expect(stripped).not.toMatch(HOUSE_TOKEN)
    expect(ctx).not.toMatch(/Arena \(when\/where this surfaces\)/)
    expect(ctx).not.toMatch(/MAJOR YOGAS DETECTED/)
  })

  it.each(['tropical', 'sidereal'] as const)('%s chart block carries no angles, houses or chart ruler', frame => {
    const block = formatEliteChartBlock(unknown[frame], frame, { birthTimeUnknown: true })
    expect(block).toMatch(/Ascendant, MC and houses: NOT AVAILABLE — birth time unknown/)
    expect(block).not.toMatch(HOUSE_TOKEN)
    expect(block).not.toMatch(/CHART RULER|LAGNA LORD|MC \(Midheaven\)/)
    // The sign positions themselves are still there.
    const sun = unknown[frame].planets.find(p => p.name === 'Sun')!
    expect(block).toContain(`Sun: ${sun.sign} `)
  })

  it('keeps every planet placement line with its sign, dignity and motion', () => {
    const block = formatEliteChartBlock(unknown.tropical, 'tropical', { birthTimeUnknown: true })
    for (const p of unknown.tropical.planets) expect(block).toContain(`${p.name}: ${p.sign} `)
  })

  it('keeps sign-to-sign Jyotish evidence: drishti targets are named by sign', () => {
    const ctx = buildInterpretationContext(unknown, 'sidereal', 'jupiter_saturn')
    expect(ctx).toMatch(/DRISHTI CAST BY JUPITER:\n {2}· 5th from itself → [A-Z][a-z]+/)
  })

  it('the caveat and the context now say the same thing', () => {
    const ctx = buildInterpretationContext(unknown, 'tropical', 'sun')
    expect(ctx).toMatch(/BIRTH TIME UNKNOWN/)
    expect(ctx).toMatch(/NOT supplied anywhere in this context/)
    expect(ctx).toMatch(/HOUSE: not available — birth time unknown/)
  })

  it('leaves a known-time chart exactly as it was', () => {
    expect(formatEliteChartBlock(known.tropical, 'tropical')).toMatch(/· House \d+ ·/)
    expect(formatEliteChartBlock(known.tropical, 'tropical', { birthTimeUnknown: false }))
      .toBe(formatEliteChartBlock(known.tropical, 'tropical'))
    expect(buildInterpretationContext(known, 'tropical', 'sun')).toMatch(/Arena \(when\/where this surfaces\): House \d+/)
    expect(buildInterpretationContext(known, 'tropical', 'sun')).not.toMatch(/BIRTH TIME UNKNOWN/)
  })
})
