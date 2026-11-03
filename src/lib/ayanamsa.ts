// Lahiri ayanamsa — the Tropical → Sidereal offset. Client-safe (no ephemeris
// data), so the computation interstitial can show the offset for the chart being
// cast instead of a hardcoded present-day value, while astro-calc.ts uses the
// same function for the chart itself: one formula, no drift between surfaces.

// IAU-calibrated precession rate 50.2564"/yr, base 23.85° at J2000.
export function lahiriAyanamsa(jd: number): number {
  return 23.85 + (jd - 2451545.0) / 365.25 * (50.2564 / 3600)
}

// Approximate offset for a calendar date (noon UT). The ayanamsa moves ~0.014°
// a year, so the time of day is immaterial at display precision.
export function lahiriAyanamsaForDate(year: number, month: number, day: number): number {
  const d = new Date(0)
  d.setUTCFullYear(year, month - 1, day)
  d.setUTCHours(12, 0, 0, 0)
  return lahiriAyanamsa(d.getTime() / 86_400_000 + 2440587.5)
}
