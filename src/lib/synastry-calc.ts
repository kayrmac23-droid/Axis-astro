import { DualChartData, ChartData, PlanetPosition } from './astro-calc'

// ── Types ─────────────────────────────────────────────────────────────────────

export type AspectType = 'conjunction' | 'sextile' | 'square' | 'trine' | 'opposition'

export interface SynastryAspect {
  planetA: string
  planetB: string
  aspect: AspectType
  angle: number   // exact: 0, 60, 90, 120, 180
  orb: number     // deviation from exact, always positive
}

export interface SynastryData {
  personA: DualChartData
  personB: DualChartData
  interAspects: SynastryAspect[]
  composite: ChartData
}

// ── Constants ─────────────────────────────────────────────────────────────────

const ASPECT_DEFS: Array<{ aspect: AspectType; angle: number }> = [
  { aspect: 'conjunction',  angle: 0   },
  { aspect: 'sextile',      angle: 60  },
  { aspect: 'square',       angle: 90  },
  { aspect: 'trine',        angle: 120 },
  { aspect: 'opposition',   angle: 180 },
]

// Maximum orb per planet for synastry inter-aspects
const PLANET_ORBS: Record<string, number> = {
  Sun: 8, Moon: 8,
  Mercury: 6, Venus: 6, Mars: 6,
  Jupiter: 5, Saturn: 5,
  Uranus: 4, Neptune: 4, Pluto: 4,
  Rahu: 3, Ketu: 3,
}

// Note: Mercury is intentionally included here so Mercury inter-aspects land in
// the outer_planets section (mind/structure) rather than the venus_mars section.
// Rahu/Ketu (lunar nodes) are included because nodal contacts — especially Rahu
// conjunct the other person's Sun or Moon — are structurally significant.
// Ketu is always exactly opposite Rahu; both are included so contacts to either
// pole of the nodal axis are captured.
const SYNASTRY_PLANETS = [
  'Sun', 'Moon', 'Mercury', 'Venus', 'Mars',
  'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto',
  'Rahu', 'Ketu',
]

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces',
]

// ── Utilities ─────────────────────────────────────────────────────────────────

function norm(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function arcDist(a: number, b: number): number {
  const d = Math.abs(norm(a) - norm(b))
  return d > 180 ? 360 - d : d
}

// Shorter-arc midpoint
function midpointLon(a: number, b: number): number {
  const diff = norm(b - a)
  if (diff <= 180) return norm(a + diff / 2)
  return norm(a + diff / 2 + 180)
}

function lonToSignInfo(lon: number): { sign: string; signIndex: number; degree: number } {
  const n = norm(lon)
  const idx = Math.floor(n / 30)
  return { sign: SIGNS[idx], signIndex: idx, degree: n % 30 }
}

// ── Aspect calculation ────────────────────────────────────────────────────────

export function calculateInterAspects(a: ChartData, b: ChartData): SynastryAspect[] {
  const aspects: SynastryAspect[] = []
  const pA = a.planets.filter(p => SYNASTRY_PLANETS.includes(p.name))
  const pB = b.planets.filter(p => SYNASTRY_PLANETS.includes(p.name))

  for (const pa of pA) {
    for (const pb of pB) {
      // Use the more generous orb of the two planets
      const maxOrb = Math.max(PLANET_ORBS[pa.name] ?? 5, PLANET_ORBS[pb.name] ?? 5)
      const dist = arcDist(pa.longitude, pb.longitude)
      for (const { aspect, angle } of ASPECT_DEFS) {
        const orb = Math.abs(dist - angle)
        if (orb <= maxOrb) {
          aspects.push({
            planetA: pa.name,
            planetB: pb.name,
            aspect,
            angle,
            orb: Math.round(orb * 100) / 100,
          })
          // Each pair gets at most one aspect. With max orb of 8° and a minimum
          // gap of 30° between any two adjacent aspect angles, two aspects cannot
          // simultaneously be within orb for the same pair — so this break never
          // silently drops a valid second match.
          break
        }
      }
    }
  }

  return aspects.sort((x, y) => x.orb - y.orb)
}

// ── Composite chart (midpoint method) ────────────────────────────────────────

export function calculateComposite(a: ChartData, b: ChartData): ChartData {
  const mapA = Object.fromEntries(a.planets.map(p => [p.name, p]))
  const mapB = Object.fromEntries(b.planets.map(p => [p.name, p]))

  const compAsc = midpointLon(a.ascendant, b.ascendant)
  const compMC  = midpointLon(a.midheaven, b.midheaven)

  // Whole Sign houses from composite ascendant
  const ascIdx = Math.floor(norm(compAsc) / 30)
  const houses = Array.from({ length: 12 }, (_, i) => norm((ascIdx + i) * 30))

  function getHouse(lon: number): number {
    const rel = norm(norm(lon) - ascIdx * 30)
    return Math.floor(rel / 30) + 1
  }

  const allNamesSet = new Set([...Object.keys(mapA), ...Object.keys(mapB)])
  const allNames = Array.from(allNamesSet)
  const planets: PlanetPosition[] = []
  const skippedPlanets: string[] = []
  for (const name of allNames) {
    const pa = mapA[name]
    const pb = mapB[name]
    if (!pa || !pb) { skippedPlanets.push(name); continue }
    const lon = midpointLon(pa.longitude, pb.longitude)
    const { sign, signIndex, degree } = lonToSignInfo(lon)
    planets.push({
      name, longitude: lon, sign, signIndex, degree,
      house: getHouse(lon), retrograde: false, dailyMotion: 0,
    })
  }

  const ascInfo = lonToSignInfo(compAsc)
  const mcInfo  = lonToSignInfo(compMC)
  return {
    ascendant: compAsc, ascendantSign: ascInfo.sign, ascendantDegree: ascInfo.degree,
    midheaven: compMC,  midheavenSign: mcInfo.sign,  midheavenDegree: mcInfo.degree,
    planets, houses, system: 'tropical',
    ...(skippedPlanets.length > 0 ? { _skippedPlanets: skippedPlanets } : {}),
  } as ChartData & { _skippedPlanets?: string[] }
}

// ── Entry point ───────────────────────────────────────────────────────────────

export function buildSynastryData(personA: DualChartData, personB: DualChartData): SynastryData {
  return {
    personA,
    personB,
    interAspects: calculateInterAspects(personA.tropical, personB.tropical),
    composite: calculateComposite(personA.tropical, personB.tropical),
  }
}

// ── Prompt formatting ─────────────────────────────────────────────────────────

function fmtDeg(deg: number): string {
  const d = Math.floor(deg)
  const m = Math.round((deg - d) * 60)
  return `${d}°${String(m).padStart(2, '0')}'`
}

function fmtPlanet(p: PlanetPosition): string {
  return `  ${p.name.padEnd(10)} ${(p.sign + ' ' + fmtDeg(p.degree)).padEnd(18)} H${p.house}${p.retrograde ? ' ℞' : ''}`
}

export const ASPECT_SYMBOLS: Record<AspectType, string> = {
  conjunction:  '☌',
  sextile:      '⚹',
  square:       '□',
  trine:        '△',
  opposition:   '☍',
}

export function formatSynastryBlock(data: SynastryData, planetSection: string): string {
  const { personA, personB, interAspects, composite } = data

  const PLANET_ORDER = ['Sun', 'Moon', 'Mercury', 'Venus', 'Mars', 'Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto']

  function chartLines(chart: ChartData): string {
    const lines = [
      `Ascendant: ${chart.ascendantSign} ${fmtDeg(chart.ascendantDegree)}`,
      `Midheaven: ${chart.midheavenSign} ${fmtDeg(chart.midheavenDegree)}`,
    ]
    for (const name of PLANET_ORDER) {
      const p = chart.planets.find(x => x.name === name)
      if (p) lines.push(fmtPlanet(p))
    }
    return lines.join('\n')
  }

  // Filter aspects relevant to the current section
  const sectionAspects = filterAspectsForSection(interAspects, planetSection)

  const aspectLines = sectionAspects.map(a =>
    `  ${a.planetA.padEnd(10)} ${ASPECT_SYMBOLS[a.aspect]} ${a.planetB.padEnd(10)} ${a.aspect.padEnd(12)} orb ${a.orb.toFixed(1)}°`
  ).join('\n')

  const compLines = chartLines(composite)
  const skipped = (composite as ChartData & { _skippedPlanets?: string[] })._skippedPlanets
  const skippedNote = skipped && skipped.length > 0
    ? `\n  ⚠ INCOMPLETE: ${skipped.join(', ')} excluded from composite — position data missing from one chart (birth time unknown or planet not computed)`
    : ''

  return `PERSON A — TROPICAL CHART
${chartLines(personA.tropical)}

PERSON B — TROPICAL CHART
${chartLines(personB.tropical)}

SYNASTRY INTER-ASPECTS (Person A → Person B, section: ${planetSection})
${aspectLines || '  (no aspects within orb for this section)'}

COMPOSITE CHART (midpoint method, Whole Sign houses)
${compLines}${skippedNote}`
}

// Which planets are relevant for each reading section.
// Mercury is in outer_planets (mind/structure) not venus_mars (attraction/desire) — intentional.
// Rahu/Ketu are in outer_planets: nodal contacts are structurally significant and
// belong with the transformative/structural group rather than personal-planet sections.
const SECTION_PLANET_GROUPS: Record<string, string[]> = {
  luminaries:     ['Sun', 'Moon'],
  venus_mars:     ['Venus', 'Mars'],
  outer_planets:  ['Jupiter', 'Saturn', 'Uranus', 'Neptune', 'Pluto', 'Mercury', 'Rahu', 'Ketu'],
  composite_chart: [],  // composite section — show all aspects
  integration:    [],   // show all aspects
}

function filterAspectsForSection(aspects: SynastryAspect[], section: string): SynastryAspect[] {
  const planets = SECTION_PLANET_GROUPS[section]
  if (!planets || planets.length === 0) return aspects
  // Include aspects where either planet is in the group, plus cross-aspects from group members
  return aspects.filter(a => planets.includes(a.planetA) || planets.includes(a.planetB))
}
