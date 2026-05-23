import { describe, it, expect, beforeEach } from 'vitest'
import { calculateDualChart, BirthData, DualChartData } from '../astro-calc'

// A well-known birth date used across most tests.
// 1990-06-15 12:00 UTC, London (lat 51.5, lon -0.12)
const BASE_BIRTH: BirthData = {
  year: 1990, month: 6, day: 15,
  hour: 12, minute: 0,
  latitude: 51.5, longitude: -0.12,
  timezone: 0,
}

// ── Output shape ──────────────────────────────────────────────────────────────

describe('calculateDualChart — output shape', () => {
  let data: DualChartData

  beforeEach(() => {
    data = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
  })

  it('returns tropical and sidereal keys', () => {
    expect(data).toHaveProperty('tropical')
    expect(data).toHaveProperty('sidereal')
  })

  it('both charts identify their system', () => {
    expect(data.tropical.system).toBe('tropical')
    expect(data.sidereal.system).toBe('sidereal')
  })

  it('includes birthData on the result', () => {
    expect(data.birthData).toMatchObject({ year: 1990, month: 6, day: 15 })
  })

  it('plutoSource flows through from override', () => {
    const d = calculateDualChart(BASE_BIRTH, { plutoSource: 'jpl-horizons-de440' })
    expect(d.plutoSource).toBe('jpl-horizons-de440')
  })

  it('plutoSource defaults to local-meeus when passed as override', () => {
    expect(data.plutoSource).toBe('local-meeus')
  })

  it('tropical chart has the required angle fields', () => {
    expect(typeof data.tropical.ascendant).toBe('number')
    expect(typeof data.tropical.midheaven).toBe('number')
    expect(typeof data.tropical.ascendantSign).toBe('string')
    expect(typeof data.tropical.midheavenSign).toBe('string')
    expect(typeof data.tropical.ascendantDegree).toBe('number')
    expect(typeof data.tropical.midheavenDegree).toBe('number')
  })

  it('midheaven is present and in range', () => {
    expect(data.tropical.midheaven).toBeGreaterThanOrEqual(0)
    expect(data.tropical.midheaven).toBeLessThan(360)
    expect(data.sidereal.midheaven).toBeGreaterThanOrEqual(0)
    expect(data.sidereal.midheaven).toBeLessThan(360)
  })

  it('ascendant is in range 0–360', () => {
    expect(data.tropical.ascendant).toBeGreaterThanOrEqual(0)
    expect(data.tropical.ascendant).toBeLessThan(360)
  })

  it('returns 12 house cusps per chart', () => {
    expect(data.tropical.houses).toHaveLength(12)
    expect(data.sidereal.houses).toHaveLength(12)
  })

  it('planets array contains at least 10 entries', () => {
    expect(data.tropical.planets.length).toBeGreaterThanOrEqual(10)
    expect(data.sidereal.planets.length).toBeGreaterThanOrEqual(10)
  })

  it('every planet has required fields', () => {
    for (const p of data.tropical.planets) {
      expect(typeof p.name).toBe('string')
      expect(typeof p.sign).toBe('string')
      expect(typeof p.house).toBe('number')
      expect(typeof p.degree).toBe('number')
      expect(typeof p.retrograde).toBe('boolean')
    }
  })

  it('planet degree is within 0–30', () => {
    for (const p of data.tropical.planets) {
      expect(p.degree).toBeGreaterThanOrEqual(0)
      expect(p.degree).toBeLessThan(30)
    }
  })

  it('planet house is within 1–12', () => {
    for (const p of data.tropical.planets) {
      expect(p.house).toBeGreaterThanOrEqual(1)
      expect(p.house).toBeLessThanOrEqual(12)
    }
  })

  it('sidereal planets have nakshatra data', () => {
    const sun = data.sidereal.planets.find(p => p.name === 'Sun')
    expect(sun).toBeDefined()
    expect(typeof sun!.nakshatra).toBe('string')
    expect(sun!.nakshatra!.length).toBeGreaterThan(0)
    expect(sun!.nakshatraPada).toBeGreaterThanOrEqual(1)
    expect(sun!.nakshatraPada).toBeLessThanOrEqual(4)
  })
})

// ── Sidereal ayanamsa shift ───────────────────────────────────────────────────

describe('calculateDualChart — sidereal ayanamsa shift', () => {
  it('sidereal longitude is ~23–24° behind tropical for J2000 epoch', () => {
    const birth: BirthData = { year: 2000, month: 1, day: 1, hour: 12, minute: 0, latitude: 0, longitude: 0, timezone: 0 }
    const d = calculateDualChart(birth, { plutoSource: 'local-meeus' })
    const tSun = d.tropical.planets.find(p => p.name === 'Sun')!
    const sSun = d.sidereal.planets.find(p => p.name === 'Sun')!
    // Sidereal longitude must be less than tropical (or wrap around 360)
    let diff = tSun.longitude - sSun.longitude
    if (diff < 0) diff += 360
    // Lahiri ayanamsa at J2000 is ~23.85°; allow ±1° tolerance
    expect(diff).toBeGreaterThan(22.5)
    expect(diff).toBeLessThan(25)
  })
})

// ── Whole Sign houses ─────────────────────────────────────────────────────────

describe('calculateDualChart — Whole Sign houses', () => {
  it('ascendant planet is always in house 1', () => {
    const d = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    // In Whole Sign, the ascendant sign = house 1 entirely.
    // Any planet in the same sign as the ascendant must be in house 1.
    const ascSign = d.tropical.ascendantSign
    for (const p of d.tropical.planets) {
      if (p.sign === ascSign) {
        expect(p.house).toBe(1)
      }
    }
  })

  it('Whole Sign house 7 is opposite house 1', () => {
    const d = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    const signs = ['Aries','Taurus','Gemini','Cancer','Leo','Virgo','Libra','Scorpio','Sagittarius','Capricorn','Aquarius','Pisces']
    const ascIdx = signs.indexOf(d.tropical.ascendantSign)
    const oppositeSign = signs[(ascIdx + 6) % 12]
    for (const p of d.tropical.planets) {
      if (p.sign === oppositeSign) {
        expect(p.house).toBe(7)
      }
    }
  })

  it('house numbers are stable across identical inputs', () => {
    const d1 = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    const d2 = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    expect(d1.tropical.planets.map(p => p.house)).toEqual(d2.tropical.planets.map(p => p.house))
  })
})

// ── Leap year handling ────────────────────────────────────────────────────────

describe('calculateDualChart — leap year', () => {
  it('computes Feb 29 2000 without throwing', () => {
    const birth: BirthData = { year: 2000, month: 2, day: 29, hour: 12, minute: 0, latitude: 48.85, longitude: 2.35, timezone: 1 }
    expect(() => calculateDualChart(birth, { plutoSource: 'local-meeus' })).not.toThrow()
  })

  it('computes Feb 29 2000 and returns valid planet positions', () => {
    const birth: BirthData = { year: 2000, month: 2, day: 29, hour: 12, minute: 0, latitude: 48.85, longitude: 2.35, timezone: 1 }
    const d = calculateDualChart(birth, { plutoSource: 'local-meeus' })
    const sun = d.tropical.planets.find(p => p.name === 'Sun')!
    expect(sun.sign).toBe('Pisces')
    expect(sun.degree).toBeGreaterThan(0)
    expect(sun.degree).toBeLessThan(30)
  })
})

// ── Extreme coordinates ───────────────────────────────────────────────────────

describe('calculateDualChart — extreme coordinates', () => {
  it('handles equatorial birth location (lat=0, lon=0)', () => {
    const birth: BirthData = { year: 1985, month: 3, day: 21, hour: 6, minute: 0, latitude: 0, longitude: 0, timezone: 0 }
    expect(() => calculateDualChart(birth, { plutoSource: 'local-meeus' })).not.toThrow()
  })

  it('handles high northern latitude (Helsinki, lat=60.17)', () => {
    const birth: BirthData = { year: 1985, month: 3, day: 21, hour: 6, minute: 0, latitude: 60.17, longitude: 24.93, timezone: 2 }
    expect(() => calculateDualChart(birth, { plutoSource: 'local-meeus' })).not.toThrow()
  })

  it('handles southern hemisphere coordinates (Sydney, lat=-33.87)', () => {
    const birth: BirthData = { year: 1985, month: 3, day: 21, hour: 6, minute: 0, latitude: -33.87, longitude: 151.2, timezone: 11 }
    expect(() => calculateDualChart(birth, { plutoSource: 'local-meeus' })).not.toThrow()
  })
})

// ── JPL Pluto longitude override ──────────────────────────────────────────────

describe('calculateDualChart — JPL Pluto override', () => {
  it('uses provided pluto longitude override', () => {
    const d = calculateDualChart(BASE_BIRTH, {
      plutoLongitude: 240.5,
      plutoSource: 'jpl-horizons-de440',
    })
    const pluto = d.tropical.planets.find(p => p.name === 'Pluto')!
    expect(pluto).toBeDefined()
    // 240.5° is Sagittarius (240–270)
    expect(pluto.sign).toBe('Sagittarius')
    expect(pluto.longitude).toBeCloseTo(240.5, 1)
  })

  it('uses local Meeus when no override provided', () => {
    const d1 = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    const d2 = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    const p1 = d1.tropical.planets.find(p => p.name === 'Pluto')!
    const p2 = d2.tropical.planets.find(p => p.name === 'Pluto')!
    expect(p1.longitude).toBeCloseTo(p2.longitude, 4)
  })
})

// ── Rahu/Ketu always opposite ─────────────────────────────────────────────────

describe('calculateDualChart — Rahu/Ketu axis', () => {
  it('Ketu is exactly 180° from Rahu in tropical', () => {
    const d = calculateDualChart(BASE_BIRTH, { plutoSource: 'local-meeus' })
    const rahu = d.tropical.planets.find(p => p.name === 'Rahu')!
    const ketu = d.tropical.planets.find(p => p.name === 'Ketu')!
    expect(rahu).toBeDefined()
    expect(ketu).toBeDefined()
    let diff = Math.abs(rahu.longitude - ketu.longitude)
    if (diff > 180) diff = 360 - diff
    expect(diff).toBeCloseTo(180, 0)
  })

  it('true node differs from mean node by up to ±1.5°', () => {
    // Sample 8 dates across a ~173-day true-node oscillation cycle and verify
    // that the correction is non-zero for at least one of them, confirming the
    // periodic terms are applied. The amplitude of the dominant correction is
    // ~1.5°, so across 8 samples we should see at least one > 0.1°.
    const dates = [
      { year: 1985, month: 1,  day: 1  },
      { year: 1990, month: 6,  day: 15 },
      { year: 1995, month: 11, day: 30 },
      { year: 2000, month: 1,  day: 1  },
      { year: 2005, month: 7,  day: 4  },
      { year: 2010, month: 3,  day: 20 },
      { year: 2015, month: 9,  day: 23 },
      { year: 2020, month: 12, day: 21 },
    ]

    // Mean node formula (pre-correction) for comparison
    function meanNode(year: number, month: number, day: number): number {
      // JDE approximation: days from J2000.0
      const a = Math.floor((14 - month) / 12)
      const y = year + 4800 - a
      const m = month + 12 * a - 3
      const jd = day + Math.floor((153 * m + 2) / 5) + 365 * y +
        Math.floor(y / 4) - Math.floor(y / 100) + Math.floor(y / 400) - 32045 - 0.5
      const T = (jd - 2451545.0) / 36525.0
      return ((125.04452 - 1934.136261 * T) % 360 + 360) % 360
    }

    let maxDiff = 0
    for (const { year, month, day } of dates) {
      const birth: BirthData = { year, month, day, hour: 12, minute: 0, latitude: 0, longitude: 0, timezone: 0 }
      const d = calculateDualChart(birth, { plutoSource: 'local-meeus' })
      const rahu = d.tropical.planets.find(p => p.name === 'Rahu')!
      const mn = meanNode(year, month, day)
      let diff = Math.abs(rahu.longitude - mn)
      if (diff > 180) diff = 360 - diff
      if (diff > maxDiff) maxDiff = diff
    }

    // At least one sample should show a correction > 0.1° (confirming periodic terms fire)
    expect(maxDiff).toBeGreaterThan(0.1)
    // No sample should exceed 1.7° (the known amplitude ceiling of the correction)
    expect(maxDiff).toBeLessThan(1.7)
  })
})

// ── Midnight handling ─────────────────────────────────────────────────────────

describe('calculateDualChart — midnight handling', () => {
  // The midnight bug shipped in /api/calculate/route.ts and BirthForm.tsx earlier
  // would silently convert hour=0 → hour=12 via `parseInt(hour) || 12`, producing
  // a noon chart for anyone born at midnight. This guards against that pattern
  // ever reappearing in the calc layer.
  it('hour=0 produces a chart distinct from hour=12 (Sun and Ascendant both move)', () => {
    const midnight: BirthData = { ...BASE_BIRTH, hour: 0,  minute: 0 }
    const noon:     BirthData = { ...BASE_BIRTH, hour: 12, minute: 0 }

    const dMid  = calculateDualChart(midnight, { plutoSource: 'local-meeus' })
    const dNoon = calculateDualChart(noon,     { plutoSource: 'local-meeus' })

    // Sun motion over 12 hours is roughly 0.5° — wrap to handle 0/360 boundary.
    const sunMid  = dMid.tropical.planets.find(p => p.name === 'Sun')!
    const sunNoon = dNoon.tropical.planets.find(p => p.name === 'Sun')!
    let sunΔ = Math.abs(sunMid.longitude - sunNoon.longitude)
    if (sunΔ > 180) sunΔ = 360 - sunΔ
    expect(sunΔ).toBeGreaterThan(0.4)
    expect(sunΔ).toBeLessThan(0.6)

    // Ascendant moves through all 12 signs in 24 hours, so 12 hours shifts it ~6 signs.
    // Different sign is guaranteed, and the longitudinal distance should be substantial.
    expect(dMid.tropical.ascendantSign).not.toBe(dNoon.tropical.ascendantSign)
    let ascΔ = Math.abs(dMid.tropical.ascendant - dNoon.tropical.ascendant)
    if (ascΔ > 180) ascΔ = 360 - ascΔ
    expect(ascΔ).toBeGreaterThan(150)  // ≈ 180° opposite — never exact due to lat/precession
  })

  it('hour=0 does not silently fall through to a noon fallback', () => {
    // Direct check that calculateDualChart honours hour=0 as midnight UTC.
    // The bug fixed in commit 063db569 only lived in the form/API layer, but a
    // future regression that re-introduced `|| 12` anywhere in the input pipeline
    // would produce a noon chart for midnight births; this test fails loudly
    // if hour=0 ever stops resolving to actual midnight.
    const d = calculateDualChart(
      { year: 2000, month: 1, day: 1, hour: 0, minute: 0, latitude: 51.5, longitude: -0.12, timezone: 0 },
      { plutoSource: 'local-meeus' },
    )
    // At 2000-01-01 00:00 UTC in London, the Sun has just crossed into Capricorn ~10°
    // (winter solstice was a week earlier). At noon UTC the same day, the Sun is ~10.5°
    // Capricorn. We check that the result sits at the midnight position, not noon.
    const sun = d.tropical.planets.find(p => p.name === 'Sun')!
    expect(sun.sign).toBe('Capricorn')
    expect(sun.degree).toBeGreaterThan(9.5)
    expect(sun.degree).toBeLessThan(10.5)
  })
})
