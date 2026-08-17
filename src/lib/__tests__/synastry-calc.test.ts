import { describe, it, expect } from 'vitest'
import type { ChartData, DualChartData, PlanetPosition, BirthData } from '../astro-calc'
import {
  calculateInterAspects,
  calculateComposite,
  annotateSiderealDivergence,
  buildSynastryData,
  formatSynastryBlock,
} from '../synastry-calc'

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

function norm(d: number): number { return ((d % 360) + 360) % 360 }

function mkPlanet(name: string, lon: number, house = 1, retrograde = false): PlanetPosition {
  const n = norm(lon)
  const signIndex = Math.floor(n / 30)
  return {
    name, longitude: n, sign: SIGNS[signIndex], signIndex,
    degree: n % 30, house, retrograde, dailyMotion: retrograde ? -1 : 1,
  }
}

function mkChart(planets: PlanetPosition[], asc = 0, mc = 90, system: 'tropical' | 'sidereal' = 'tropical'): ChartData {
  const ascIdx = Math.floor(norm(asc) / 30)
  return {
    ascendant: norm(asc), ascendantSign: SIGNS[ascIdx], ascendantDegree: norm(asc) % 30,
    midheaven: norm(mc), midheavenSign: SIGNS[Math.floor(norm(mc) / 30)], midheavenDegree: norm(mc) % 30,
    planets, houses: Array.from({ length: 12 }, (_, i) => norm((ascIdx + i) * 30)), system,
  }
}

const DUMMY_BIRTH: BirthData = {
  year: 1990, month: 1, day: 1, hour: 12, minute: 0,
  latitude: 0, longitude: 0, timezone: 0,
}

function mkDual(tropical: ChartData, sidereal: ChartData): DualChartData {
  return { tropical, sidereal, birthData: DUMMY_BIRTH, plutoLongitude: 0, plutoSource: 'local-meeus', ayanamsa: 24 }
}

describe('calculateInterAspects', () => {
  it('detects exact aspects between the two charts', () => {
    const a = mkChart([mkPlanet('Sun', 10)])
    const b = mkChart([mkPlanet('Moon', 190), mkPlanet('Venus', 70)])
    const aspects = calculateInterAspects(a, b)

    const sunMoon = aspects.find(x => x.planetA === 'Sun' && x.planetB === 'Moon')
    const sunVenus = aspects.find(x => x.planetA === 'Sun' && x.planetB === 'Venus')
    expect(sunMoon).toMatchObject({ aspect: 'opposition', orb: 0 })
    expect(sunVenus).toMatchObject({ aspect: 'sextile', orb: 0 })
    expect(aspects).toHaveLength(2)
  })

  it('applies the per-planet orb ceiling (more generous of the two)', () => {
    const a = mkChart([mkPlanet('Uranus', 0), mkPlanet('Mercury', 0)])
    const b = mkChart([mkPlanet('Neptune', 5)])
    const aspects = calculateInterAspects(a, b)

    // Mercury (orb 6) vs Neptune (orb 4): max orb 6, 5° apart → within.
    expect(aspects.find(x => x.planetA === 'Mercury' && x.planetB === 'Neptune')).toMatchObject({ aspect: 'conjunction' })
    // Uranus (orb 4) vs Neptune (orb 4): max orb 4, 5° apart → excluded.
    expect(aspects.find(x => x.planetA === 'Uranus' && x.planetB === 'Neptune')).toBeUndefined()
  })

  it('sorts results tightest-orb first', () => {
    const a = mkChart([mkPlanet('Sun', 0)])
    const b = mkChart([mkPlanet('Moon', 3), mkPlanet('Mars', 179)])
    const aspects = calculateInterAspects(a, b)
    // Sun-Mars opposition orb 1 should precede Sun-Moon conjunction orb 3.
    expect(aspects[0]).toMatchObject({ planetB: 'Mars', orb: 1 })
    expect(aspects[0].orb).toBeLessThanOrEqual(aspects[1].orb)
  })
})

describe('calculateComposite', () => {
  it('places planets at the shorter-arc midpoint, including across 0°', () => {
    const a = mkChart([mkPlanet('Sun', 10), mkPlanet('Moon', 350)])
    const b = mkChart([mkPlanet('Sun', 30), mkPlanet('Moon', 10)])
    const comp = calculateComposite(a, b)

    const sun = comp.planets.find(p => p.name === 'Sun')!
    const moon = comp.planets.find(p => p.name === 'Moon')!
    expect(sun.longitude).toBeCloseTo(20, 6)   // midpoint of 10 and 30
    expect(moon.longitude).toBeCloseTo(0, 6)    // shorter arc of 350 and 10 wraps to 0
    expect(sun.sign).toBe('Aries')
  })

  it('flags planets missing from one chart instead of fabricating a midpoint', () => {
    const a = mkChart([mkPlanet('Sun', 10), mkPlanet('Pluto', 250)])
    const b = mkChart([mkPlanet('Sun', 30)])
    const comp = calculateComposite(a, b) as ChartData & { _skippedPlanets?: string[] }

    expect(comp.planets.find(p => p.name === 'Pluto')).toBeUndefined()
    expect(comp._skippedPlanets).toContain('Pluto')
  })
})

describe('annotateSiderealDivergence', () => {
  it('flags a contact as divergent when a participating planet shifts sign', () => {
    const aTrop = mkChart([mkPlanet('Sun', 10)])                       // Aries
    const aSid = mkChart([mkPlanet('Sun', 345, 1, false)], 0, 90, 'sidereal') // Pisces
    const bTrop = mkChart([mkPlanet('Moon', 190)])                     // Libra
    const bSid = mkChart([mkPlanet('Moon', 190)], 0, 90, 'sidereal')  // Libra (unchanged)

    const personA = mkDual(aTrop, aSid)
    const personB = mkDual(bTrop, bSid)
    const base = calculateInterAspects(aTrop, bTrop)
    const annotated = annotateSiderealDivergence(base, personA, personB)

    const sunMoon = annotated.find(x => x.planetA === 'Sun' && x.planetB === 'Moon')!
    expect(sunMoon.divergent).toBe(true)
    expect(sunMoon.tropicalSignA).toBe('Aries')
    expect(sunMoon.siderealSignA).toBe('Pisces')
  })

  it('leaves a contact non-divergent when neither planet shifts sign', () => {
    const aTrop = mkChart([mkPlanet('Sun', 10)])
    const aSid = mkChart([mkPlanet('Sun', 12)], 0, 90, 'sidereal') // still Aries
    const bTrop = mkChart([mkPlanet('Moon', 190)])
    const bSid = mkChart([mkPlanet('Moon', 188)], 0, 90, 'sidereal') // still Libra

    const annotated = annotateSiderealDivergence(
      calculateInterAspects(aTrop, bTrop),
      mkDual(aTrop, aSid), mkDual(bTrop, bSid),
    )
    expect(annotated.find(x => x.planetA === 'Sun' && x.planetB === 'Moon')!.divergent).toBe(false)
  })
})

describe('buildSynastryData + formatSynastryBlock', () => {
  const personA = mkDual(mkChart([mkPlanet('Sun', 10)]), mkChart([mkPlanet('Sun', 345)], 0, 90, 'sidereal'))
  const personB = mkDual(mkChart([mkPlanet('Moon', 190)]), mkChart([mkPlanet('Moon', 190)], 0, 90, 'sidereal'))

  it('assembles inter-aspects and a composite', () => {
    const data = buildSynastryData(personA, personB)
    expect(data.interAspects.length).toBeGreaterThan(0)
    expect(data.composite).toBeDefined()
  })

  it('renders the expected section headers', () => {
    const data = buildSynastryData(personA, personB)
    const block = formatSynastryBlock(data, 'luminaries')
    expect(block).toContain('PERSON A — TROPICAL CHART')
    expect(block).toContain('SYNASTRY INTER-ASPECTS')
    expect(block).toContain('COMPOSITE CHART')
  })
})
