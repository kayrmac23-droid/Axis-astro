// lib/astro-calc.ts
// Pure TypeScript astronomical calculations
// Tropical (Western) + Sidereal (Vedic/Jyotish) dual-system

export interface BirthData {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  latitude: number
  longitude: number
  timezone: number // UTC offset in hours
}

export interface PlanetPosition {
  name: string
  longitude: number // 0-360 ecliptic longitude
  sign: string
  signIndex: number // 0-11
  degree: number // degree within sign
  house: number
  retrograde: boolean
  nakshatra?: string // Sidereal only
  nakshatraPada?: number
}

export interface ChartData {
  ascendant: number
  ascendantSign: string
  ascendantDegree: number
  planets: PlanetPosition[]
  houses: number[] // 12 house cusps in degrees
  system: 'tropical' | 'sidereal'
}

export interface DualChartData {
  tropical: ChartData
  sidereal: ChartData
  birthData: BirthData
}

const SIGNS = [
  'Aries', 'Taurus', 'Gemini', 'Cancer', 'Leo', 'Virgo',
  'Libra', 'Scorpio', 'Sagittarius', 'Capricorn', 'Aquarius', 'Pisces'
]

const NAKSHATRAS = [
  'Ashwini', 'Bharani', 'Krittika', 'Rohini', 'Mrigashira', 'Ardra',
  'Punarvasu', 'Pushya', 'Ashlesha', 'Magha', 'Purva Phalguni', 'Uttara Phalguni',
  'Hasta', 'Chitra', 'Swati', 'Vishakha', 'Anuradha', 'Jyeshtha',
  'Mula', 'Purva Ashadha', 'Uttara Ashadha', 'Shravana', 'Dhanishtha', 'Shatabhisha',
  'Purva Bhadrapada', 'Uttara Bhadrapada', 'Revati'
]

// Lahiri ayanamsa (standard for Jyotish)
function getLahiriAyanamsa(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  return 23.85 + 0.0137 * T + (jd - 2415020.0) / 365.25 * (50.2564 / 3600)
}

// Julian Day Number from calendar date
function toJulianDay(year: number, month: number, day: number, hour: number, minute: number, tzOffset: number): number {
  const utHour = hour - tzOffset + minute / 60
  let y = year
  let m = month
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + utHour / 24 + B - 1524.5
}

// VSOP87 simplified planetary longitudes
function getSunLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L0 = 280.46646 + 36000.76983 * T
  const M = (357.52911 + 35999.05029 * T - 0.0001537 * T * T) * Math.PI / 180
  const C = (1.914602 - 0.004817 * T - 0.000014 * T * T) * Math.sin(M)
    + (0.019993 - 0.000101 * T) * Math.sin(2 * M)
    + 0.000289 * Math.sin(3 * M)
  return normalize(L0 + C)
}

function getMoonLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L1 = normalize(218.3164477 + 481267.88123421 * T)
  const M = normalize(357.5291092 + 35999.0502909 * T) * Math.PI / 180
  const Mp = normalize(134.9633964 + 477198.8675055 * T) * Math.PI / 180
  const D = normalize(297.8501921 + 445267.1114034 * T) * Math.PI / 180
  const F = normalize(93.2720950 + 483202.0175233 * T) * Math.PI / 180
  const lon = L1
    + 6.288774 * Math.sin(Mp)
    + 1.274027 * Math.sin(2 * D - Mp)
    + 0.658314 * Math.sin(2 * D)
    + 0.213618 * Math.sin(2 * Mp)
    - 0.185116 * Math.sin(M)
    - 0.114332 * Math.sin(2 * F)
    + 0.058793 * Math.sin(2 * D - 2 * Mp)
    + 0.057066 * Math.sin(2 * D - M - Mp)
    + 0.053322 * Math.sin(2 * D + Mp)
    + 0.045758 * Math.sin(2 * D - M)
    - 0.040923 * Math.sin(M - Mp)
    - 0.034720 * Math.sin(D)
    - 0.030383 * Math.sin(M + Mp)
  return normalize(lon)
}

function getMercuryLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L = normalize(252.250906 + 149474.0722491 * T)
  const M = normalize(357.5291092 + 35999.0502909 * T) * Math.PI / 180
  const Mm = normalize(134.9633964 + 477198.8675055 * T) * Math.PI / 180
  return normalize(L + 3.185 * Math.sin((63.18 + 103 * T) * Math.PI / 180)
    + 0.995 * Math.sin((103.0 + 149474 * T) * Math.PI / 180)
    + 2.73 * Math.sin(M)
    + 1.85 * Math.sin(Mm))
}

function getVenusLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L = normalize(181.979801 + 58519.2130302 * T)
  const M = normalize(212.2502 + 58517.803875 * T) * Math.PI / 180
  return normalize(L + 0.592 * Math.sin(M * 2)
    + 0.526 * Math.sin((85.96 + 62.14 * T) * Math.PI / 180))
}

function getMarsLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L = normalize(355.433 + 19141.6964471 * T)
  const M = normalize(19.387 + 19141.6964471 * T) * Math.PI / 180
  return normalize(L + 10.691 * Math.sin(M)
    + 0.623 * Math.sin(2 * M)
    + 0.050 * Math.sin(3 * M))
}

function getJupiterLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L = normalize(34.351519 + 3036.3027748 * T)
  const M = normalize(20.9 + 3034.906 * T) * Math.PI / 180
  return normalize(L + 5.555 * Math.sin(M)
    + 0.168 * Math.sin(2 * M))
}

function getSaturnLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const L = normalize(50.077444 + 1223.5110686 * T)
  const M = normalize(317.02 + 1222.114 * T) * Math.PI / 180
  return normalize(L + 6.394 * Math.sin(M)
    + 0.191 * Math.sin(2 * M))
}

function getUranusLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  return normalize(314.055005 + 429.8640561 * T + 0.3 * Math.sin((290 + 430 * T) * Math.PI / 180))
}

function getNeptuneLongitude(jd: number): number {
  const T = (jd - 2451545.0) / 36525.0
  return normalize(304.348665 + 219.8833092 * T + 0.1 * Math.sin((100 + 220 * T) * Math.PI / 180))
}

function getRahuLongitude(jd: number): number {
  // Mean North Node (Rahu) - retrograde
  const T = (jd - 2451545.0) / 36525.0
  return normalize(125.04452 - 1934.136261 * T)
}

function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function getSign(longitude: number): { sign: string; signIndex: number; degree: number } {
  const signIndex = Math.floor(longitude / 30)
  return {
    sign: SIGNS[signIndex],
    signIndex,
    degree: longitude % 30
  }
}

function getNakshatra(longitude: number): { nakshatra: string; pada: number } {
  const nakshatraIndex = Math.floor(longitude / (360 / 27))
  const pada = Math.floor((longitude % (360 / 27)) / (360 / 108)) + 1
  return {
    nakshatra: NAKSHATRAS[nakshatraIndex % 27],
    pada
  }
}

// Placidus-simplified house calculation
function calculateHouses(jd: number, lat: number, lon: number, ramc: number): number[] {
  const obliquity = 23.4397 - 0.0130 * (jd - 2451545.0) / 36525.0
  const oblRad = obliquity * Math.PI / 180
  const latRad = lat * Math.PI / 180
  const ramcRad = ramc * Math.PI / 180

  // ASC
  const ascRad = Math.atan2(
    Math.cos(ramcRad),
    -(Math.sin(ramcRad) * Math.cos(oblRad) + Math.tan(latRad) * Math.sin(oblRad))
  )
  const asc = normalize(ascRad * 180 / Math.PI)

  // MC
  const mcRad = Math.atan2(Math.sin(ramcRad), Math.cos(ramcRad) * Math.cos(oblRad))
  const mc = normalize(mcRad * 180 / Math.PI)

  // Equal houses from ASC for simplicity and reliability
  const houses: number[] = []
  for (let i = 0; i < 12; i++) {
    houses.push(normalize(asc + i * 30))
  }
  return houses
}

function getRAMC(jd: number, longitude: number): number {
  const T = (jd - 2451545.0) / 36525.0
  const gmst = 280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T
  return normalize(gmst + longitude)
}

function getHouseForPlanet(planetLon: number, houses: number[]): number {
  for (let i = 0; i < 12; i++) {
    const start = houses[i]
    const end = houses[(i + 1) % 12]
    if (end > start) {
      if (planetLon >= start && planetLon < end) return i + 1
    } else {
      if (planetLon >= start || planetLon < end) return i + 1
    }
  }
  return 1
}

function isRetrograde(planet: string, jd: number): boolean {
  // Simplified retrograde detection via position comparison
  const delta = 1
  const getLon = getPlanetLongFn(planet)
  if (!getLon) return false
  const lon1 = getLon(jd - delta)
  const lon2 = getLon(jd + delta)
  let diff = lon2 - lon1
  if (diff > 180) diff -= 360
  if (diff < -180) diff += 360
  return diff < 0
}

function getPlanetLongFn(name: string): ((jd: number) => number) | null {
  const map: Record<string, (jd: number) => number> = {
    Mercury: getMercuryLongitude,
    Venus: getVenusLongitude,
    Mars: getMarsLongitude,
    Jupiter: getJupiterLongitude,
    Saturn: getSaturnLongitude,
    Uranus: getUranusLongitude,
    Neptune: getNeptuneLongitude,
  }
  return map[name] || null
}

export function calculateDualChart(birth: BirthData): DualChartData {
  const jd = toJulianDay(birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.timezone)
  const ayanamsa = getLahiriAyanamsa(jd)
  const ramc = getRAMC(jd, birth.longitude)
  const houses = calculateHouses(jd, birth.latitude, birth.longitude, ramc)

  // Get all tropical longitudes
  const rawPlanets: Array<{ name: string; longitude: number }> = [
    { name: 'Sun', longitude: getSunLongitude(jd) },
    { name: 'Moon', longitude: getMoonLongitude(jd) },
    { name: 'Mercury', longitude: getMercuryLongitude(jd) },
    { name: 'Venus', longitude: getVenusLongitude(jd) },
    { name: 'Mars', longitude: getMarsLongitude(jd) },
    { name: 'Jupiter', longitude: getJupiterLongitude(jd) },
    { name: 'Saturn', longitude: getSaturnLongitude(jd) },
    { name: 'Uranus', longitude: getUranusLongitude(jd) },
    { name: 'Neptune', longitude: getNeptuneLongitude(jd) },
    { name: 'Rahu', longitude: getRahuLongitude(jd) },
    { name: 'Ketu', longitude: normalize(getRahuLongitude(jd) + 180) },
  ]

  const ascendantTropical = houses[0]
  const ascSignTropical = getSign(ascendantTropical)

  // Tropical planets
  const tropicalPlanets: PlanetPosition[] = rawPlanets.map(p => {
    const { sign, signIndex, degree } = getSign(p.longitude)
    return {
      name: p.name,
      longitude: p.longitude,
      sign,
      signIndex,
      degree,
      house: getHouseForPlanet(p.longitude, houses),
      retrograde: isRetrograde(p.name, jd)
    }
  })

  // Sidereal — shift all longitudes by ayanamsa
  const siderealHouses = houses.map(h => normalize(h - ayanamsa))
  const ascendantSidereal = siderealHouses[0]
  const ascSignSidereal = getSign(ascendantSidereal)

  const siderealPlanets: PlanetPosition[] = rawPlanets.map(p => {
    const siderealLon = normalize(p.longitude - ayanamsa)
    const { sign, signIndex, degree } = getSign(siderealLon)
    const { nakshatra, pada } = getNakshatra(siderealLon)
    return {
      name: p.name,
      longitude: siderealLon,
      sign,
      signIndex,
      degree,
      house: getHouseForPlanet(siderealLon, siderealHouses),
      retrograde: isRetrograde(p.name, jd),
      nakshatra,
      nakshatraPada: pada
    }
  })

  return {
    tropical: {
      ascendant: ascendantTropical,
      ascendantSign: ascSignTropical.sign,
      ascendantDegree: ascSignTropical.degree,
      planets: tropicalPlanets,
      houses,
      system: 'tropical'
    },
    sidereal: {
      ascendant: ascendantSidereal,
      ascendantSign: ascSignSidereal.sign,
      ascendantDegree: ascSignSidereal.degree,
      planets: siderealPlanets,
      houses: siderealHouses,
      system: 'sidereal'
    },
    birthData: birth
  }
}

export function formatChartForPrompt(chart: ChartData, system: 'tropical' | 'sidereal'): string {
  const lines: string[] = []
  lines.push(`${system.toUpperCase()} CHART`)
  lines.push(`Ascendant: ${chart.ascendantSign} ${chart.ascendantDegree.toFixed(1)}°`)
  lines.push('')
  lines.push('PLANETARY POSITIONS:')
  chart.planets.forEach(p => {
    let line = `${p.name}: ${p.sign} ${p.degree.toFixed(1)}° | House ${p.house}${p.retrograde ? ' (R)' : ''}`
    if (system === 'sidereal' && p.nakshatra) {
      line += ` | ${p.nakshatra} pada ${p.nakshatraPada}`
    }
    lines.push(line)
  })
  return lines.join('\n')
}
