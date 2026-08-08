import { describe, it, expect } from 'vitest'
import { calculateDualChart, BirthData } from '../astro-calc'
import { computeVimshottariDasha } from '../interpretation-engine'

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
