import { describe, it, expect } from 'vitest'
import type { ChartData, DualChartData, PlanetPosition, BirthData } from '../astro-calc'
import { buildReadoutRows, buildFlips, countBodies, dms, lonStr } from '../readout'

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

const norm = (d: number) => ((d % 360) + 360) % 360

function mkPlanet(name: string, lon: number, house = 1): PlanetPosition {
  const n = norm(lon)
  const signIndex = Math.floor(n / 30)
  return {
    name, longitude: n, sign: SIGNS[signIndex], signIndex,
    degree: n % 30, house, retrograde: false, dailyMotion: 1,
  }
}

function mkChart(planets: PlanetPosition[], system: 'tropical' | 'sidereal'): ChartData {
  return {
    ascendant: 0, ascendantSign: SIGNS[0], ascendantDegree: 0,
    midheaven: 270, midheavenSign: SIGNS[9], midheavenDegree: 0,
    planets, houses: Array.from({ length: 12 }, (_, i) => i * 30), system,
  }
}

const BIRTH: BirthData = {
  year: 1990, month: 1, day: 1, hour: 12, minute: 0,
  latitude: 0, longitude: 0, timezone: 0,
}

// Sun crosses a sign boundary AND a whole-sign house boundary; Moon stays put.
function mkDual(): DualChartData {
  return {
    tropical: mkChart([mkPlanet('Sun', 125, 5), mkPlanet('Moon', 235, 8)], 'tropical'),
    sidereal: mkChart([mkPlanet('Sun', 101, 4), mkPlanet('Moon', 211, 8)], 'sidereal'),
    birthData: BIRTH,
    plutoLongitude: 0,
    plutoSource: 'local-meeus',
    ayanamsa: 24,
  }
}

describe('buildFlips', () => {
  it('lists only bodies that change sign, angles excluded', () => {
    const flips = buildFlips(buildReadoutRows(mkDual()))
    expect(flips.map(f => f.id)).toEqual(['sun'])
  })

  it('formats both frames as sign · house and never reconciles them', () => {
    const [sun] = buildFlips(buildReadoutRows(mkDual()))
    expect(sun.tCell).toBe('Leo · H5')
    expect(sun.sCell).toBe('Cancer · H4')
  })

  it('marks SIGN + HOUSE when the whole-sign house moves too', () => {
    const [sun] = buildFlips(buildReadoutRows(mkDual()))
    expect(sun.signal).toBe('SIGN + HOUSE')
  })

  it('marks SIGN alone when only the sign changes', () => {
    const data = mkDual()
    // Same house in both frames, different sign.
    data.tropical.planets = [mkPlanet('Sun', 125, 5)]
    data.sidereal.planets = [mkPlanet('Sun', 101, 5)]
    const [sun] = buildFlips(buildReadoutRows(data))
    expect(sun.signal).toBe('SIGN')
  })

  it('returns nothing when no body changes sign', () => {
    const data = mkDual()
    data.sidereal.planets = [mkPlanet('Sun', 124, 5), mkPlanet('Moon', 211, 8)]
    expect(buildFlips(buildReadoutRows(data))).toEqual([])
  })
})

describe('countBodies', () => {
  it('counts bodies only — ASC and MC are excluded, as in buildFlips', () => {
    const rows = buildReadoutRows(mkDual())
    expect(rows.length).toBe(4)          // ASC, MC, Sun, Moon
    expect(countBodies(rows)).toBe(2)    // Sun, Moon
  })
})

describe('formatting', () => {
  it('renders degrees as d°mm′, rounding minutes and carrying at 60', () => {
    expect(dms(12.5)).toBe('12°30′')
    expect(dms(12.999)).toBe('13°00′')
  })

  it('renders a longitude as degree-in-sign plus the sign glyph', () => {
    expect(lonStr(125)).toBe('5°00′ ♌︎')
  })
})
