// lib/astro-calc.ts
// Astronomical calculations using full VSOP87 (astronomia package) for planetary positions
// and ELP2000 for the Moon. Tropical + Sidereal dual-system output.

/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

import { lahiriAyanamsa } from './ayanamsa'

// ── TYPES ─────────────────────────────────────────────────────────────────────

export interface BirthData {
  year: number
  month: number
  day: number
  hour: number
  minute: number
  latitude: number
  longitude: number
  timezone: number          // UTC offset in hours (DST-aware, derived from tzName if possible)
  tzName?: string           // IANA timezone identifier (optional; used for display/verification)
  birthTimeUnknown?: boolean // true when user submitted without a known birth time (noon used as fallback)
}

export interface PlanetPosition {
  name: string
  longitude: number  // 0–360 ecliptic longitude
  sign: string
  signIndex: number  // 0–11
  degree: number     // degree within sign
  house: number
  retrograde: boolean
  dailyMotion: number  // degrees per day (positive = direct, negative = retrograde)
  nakshatra?: string
  nakshatraPada?: number
}

export interface ChartData {
  ascendant: number
  ascendantSign: string
  ascendantDegree: number
  midheaven: number
  midheavenSign: string
  midheavenDegree: number
  planets: PlanetPosition[]
  houses: number[]   // 12 house cusps in degrees
  system: 'tropical' | 'sidereal'
}

export interface DualChartData {
  tropical: ChartData
  sidereal: ChartData
  birthData: BirthData
  plutoLongitude: number  // canonical tropical (geocentric) Pluto longitude — the value applied as the override
  plutoSource: string  // 'jpl-horizons-de440' | 'jpl-horizons-de441' | 'local-meeus'
  ayanamsa: number     // Lahiri ayanamsa in degrees at the birth instant (Tropical → Sidereal offset)
}

export interface ChartOverrides {
  plutoLongitude?: number  // if provided, replaces Meeus Pluto longitude
  plutoSource: string
}

// ── CONSTANTS ─────────────────────────────────────────────────────────────────

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

const DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI

// ── ASTRONOMIA IMPORTS ────────────────────────────────────────────────────────
// CJS require keeps bundling simple in Next.js App Router and avoids ESM issues.

const { Planet }         = require('astronomia/planetposition') as { Planet: new (data: any) => any }
const solar              = require('astronomia/solar')          as any
const moonposition       = require('astronomia/moonposition')   as any
const baseLib            = require('astronomia/base')           as any
const nutationLib        = require('astronomia/nutation')       as any
const plutoLib           = require('astronomia/pluto')          as any
const precessLib        = ((m: any) => m.default ?? m)(require('astronomia/precess'))
const coordLib          = ((m: any) => m.default ?? m)(require('astronomia/coord'))

// Data modules: ESM `export default {...}` → CJS wraps under `.default`
// Using static require paths so the bundler can resolve them at build time.
function d(m: any): any { return m.default ?? m }

const vsop87Bearth   = d(require('astronomia/data/vsop87Bearth'))
const vsop87Bmercury = d(require('astronomia/data/vsop87Bmercury'))
const vsop87Bvenus   = d(require('astronomia/data/vsop87Bvenus'))
const vsop87Bmars    = d(require('astronomia/data/vsop87Bmars'))
const vsop87Bjupiter = d(require('astronomia/data/vsop87Bjupiter'))
const vsop87Bsaturn  = d(require('astronomia/data/vsop87Bsaturn'))
const vsop87Buranus  = d(require('astronomia/data/vsop87Buranus'))
const vsop87Bneptune = d(require('astronomia/data/vsop87Bneptune'))

// Planet objects (created once at module load to avoid repeated construction)
let _earth: any, _mercury: any, _venus: any, _mars: any,
    _jupiter: any, _saturn: any, _uranus: any, _neptune: any

function getPlanets() {
  if (!_earth) {
    _earth   = new Planet(vsop87Bearth)
    _mercury = new Planet(vsop87Bmercury)
    _venus   = new Planet(vsop87Bvenus)
    _mars    = new Planet(vsop87Bmars)
    _jupiter = new Planet(vsop87Bjupiter)
    _saturn  = new Planet(vsop87Bsaturn)
    _uranus  = new Planet(vsop87Buranus)
    _neptune = new Planet(vsop87Bneptune)
  }
  return { _earth, _mercury, _venus, _mars, _jupiter, _saturn, _uranus, _neptune }
}

// ── UTILITIES ─────────────────────────────────────────────────────────────────

function normalize(deg: number): number {
  return ((deg % 360) + 360) % 360
}

function getSign(longitude: number): { sign: string; signIndex: number; degree: number } {
  const signIndex = Math.floor(longitude / 30)
  return { sign: SIGNS[signIndex], signIndex, degree: longitude % 30 }
}

function getNakshatra(longitude: number): { nakshatra: string; pada: number } {
  const nakshatraSize = 360 / 27
  const padaSize = nakshatraSize / 4
  const nakshatraIndex = Math.floor(longitude / nakshatraSize) % 27
  const posInNakshatra = longitude % nakshatraSize
  const pada = Math.floor(posInNakshatra / padaSize) + 1
  return { nakshatra: NAKSHATRAS[nakshatraIndex], pada: Math.min(pada, 4) }
}

// ── JULIAN DAY ────────────────────────────────────────────────────────────────

// Convert calendar date/time (UTC) to Julian Day Number (JDE ≈ JD for our purposes).
// Exported for unit testing — pure, no behaviour change.
export function toJulianDay(
  year: number, month: number, day: number,
  hour: number, minute: number, tzOffset: number
): number {
  const utHour = hour - tzOffset + minute / 60
  let y = year
  let m = month
  if (m <= 2) { y -= 1; m += 12 }
  // Calendar selection (Meeus Ch.7): dates from 1582-10-15 onward use the
  // Gregorian correction B; earlier dates use the Julian calendar (B = 0), which
  // the IANA/ephemeris convention applies for pre-cutover dates. Decided from the
  // ORIGINAL date, not the month-shifted (y, m) working values. Without this,
  // pre-1582 charts drift by ~10+ days — inconsistent with the app's 1–9999 range.
  const isGregorian =
    year > 1582 ||
    (year === 1582 && (month > 10 || (month === 10 && day >= 15)))
  const A = Math.floor(y / 100)
  const B = isGregorian ? 2 - A + Math.floor(A / 4) : 0
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + utHour / 24 + B - 1524.5
}

// ── AYANAMSA ──────────────────────────────────────────────────────────────────

// Lahiri ayanamsa — the standard for Jyotish. Lives in lib/ayanamsa.ts so the
// client can use the same formula without pulling in the ephemeris data.
const getLahiriAyanamsa = lahiriAyanamsa

// ── PLANET POSITIONS ──────────────────────────────────────────────────────────

// Returns geocentric ecliptic longitude in degrees (0–360) for the Sun using
// full VSOP87 theory via the Earth's heliocentric position.
function getSunLongitude(jde: number): number {
  const { _earth } = getPlanets()
  // solar.apparentVSOP87 adds nutation + aberration on top of VSOP87 geocentric lon
  const { lon } = solar.apparentVSOP87(_earth, jde)
  return normalize(lon * RAD2DEG)
}

// Returns geocentric ecliptic longitude in degrees for the Moon using the full
// ELP2000 (Chapter 47) series from astronomia/moonposition.
function getMoonLongitude(jde: number): number {
  const { lon } = moonposition.position(jde)
  // ELP2000 result is geometric geocentric; add nutation for apparent position
  const [Δψ] = nutationLib.nutation(jde)
  return normalize((lon + Δψ) * RAD2DEG)
}

// Geocentric ecliptic longitude for a superior or inferior planet using full
// VSOP87 heliocentric positions + rectangular geocentric conversion + light-time.
function getGeocentricLon(planetObj: any, jde: number): number {
  const { _earth } = getPlanets()

  const earthPos = _earth.position(jde)
  const [L0, B0, R0] = [earthPos.lon, earthPos.lat, earthPos.range]
  const cB0 = Math.cos(B0)
  const [sL0, cL0] = [Math.sin(L0), Math.cos(L0)]

  // First-pass planet position (no light-time correction yet)
  let pos = planetObj.position(jde)
  // Light-time in days: distance (AU) / speed of light (AU/day ≈ 0.0057755)
  const tau = baseLib.lightTime(pos.range)
  // Re-compute planet position at light-time corrected epoch
  pos = planetObj.position(jde - tau)

  const [L, B, R] = [pos.lon, pos.lat, pos.range]
  const cB = Math.cos(B)
  const [sL, cL] = [Math.sin(L), Math.cos(L)]

  // Heliocentric rectangular → geocentric rectangular (ecliptic frame)
  const x = R * cB * cL - R0 * cB0 * cL0
  const y = R * cB * sL - R0 * cB0 * sL0

  // Geocentric ecliptic longitude
  let λ = Math.atan2(y, x)
  // Add nutation (Δψ ≈ ±17" max; small but included for completeness)
  const [Δψ] = nutationLib.nutation(jde)
  λ += Δψ
  return normalize(λ * RAD2DEG)
}

function getMercuryLongitude(jde: number): number  { return getGeocentricLon(getPlanets()._mercury, jde) }
function getVenusLongitude(jde: number): number    { return getGeocentricLon(getPlanets()._venus,   jde) }
function getMarsLongitude(jde: number): number     { return getGeocentricLon(getPlanets()._mars,    jde) }
function getJupiterLongitude(jde: number): number  { return getGeocentricLon(getPlanets()._jupiter, jde) }
function getSaturnLongitude(jde: number): number   { return getGeocentricLon(getPlanets()._saturn,  jde) }
function getUranusLongitude(jde: number): number   { return getGeocentricLon(getPlanets()._uranus,  jde) }
function getNeptuneLongitude(jde: number): number  { return getGeocentricLon(getPlanets()._neptune, jde) }

// Pluto is not in VSOP87. Meeus Ch.37 (astronomia/pluto) gives Pluto's
// heliocentric position referred to the ecliptic and equinox of J2000, so the
// geocentric conversion must be done in THAT frame — Earth from position2000(),
// not position() — and only the resulting geocentric direction precessed to the
// equinox of date. Mixing a J2000 Pluto with an of-date Earth (the original
// implementation) put the result off by the accumulated precession, ~50″ per
// year from 2000: 0.68° for a 1950 birth, 1.36° for 1900 — enough to change
// Pluto's sign near a boundary. With the frames consistent, plus light-time,
// nutation and annual aberration, this matches JPL Horizons DE440 to under
// 0.03′ on every date in BENCHMARK.md (pinned in astro-calc.test.ts).
const ABERRATION_DEG = 20.49552 / 3600
function getPlutoLongitude(jde: number): number {
  const { _earth } = getPlanets()
  const pluto = plutoLib.default ?? plutoLib
  const e = _earth.position2000(jde)

  const geo = (p: { lon: number; lat: number; range: number }) => {
    const x = p.range * Math.cos(p.lat) * Math.cos(p.lon) - e.range * Math.cos(e.lat) * Math.cos(e.lon)
    const y = p.range * Math.cos(p.lat) * Math.sin(p.lon) - e.range * Math.cos(e.lat) * Math.sin(e.lon)
    const z = p.range * Math.sin(p.lat) - e.range * Math.sin(e.lat)
    return { lon: Math.atan2(y, x), lat: Math.atan2(z, Math.hypot(x, y)), dist: Math.hypot(x, y, z) }
  }

  // Light-time: Pluto where it was when the light now arriving left it.
  const first = geo(pluto.heliocentric(jde))
  const g = geo(pluto.heliocentric(jde - baseLib.lightTime(first.dist)))

  // J2000 → ecliptic and equinox of date.
  const ofDate = precessLib.eclipticPosition(
    new coordLib.Ecliptic(g.lon, g.lat), 2000.0, baseLib.JDEToJulianYear(jde),
  )
  let λ = ofDate.lon * RAD2DEG
  // Nutation in longitude, then annual aberration (Meeus 23.2, longitude term).
  const [Δψ] = nutationLib.nutation(jde)
  λ += Δψ * RAD2DEG
  const sunLon = getSunLongitude(jde)
  λ -= ABERRATION_DEG * Math.cos((sunLon - λ) * DEG2RAD)
  return normalize(λ)
}

// True (osculating) ascending lunar node (Rahu) — Meeus Ch.47: the mean node
// plus the five periodic terms, via astronomia/moonposition.trueNode. The
// hand-rolled version this replaces carried only four of the five terms and
// dropped the 0.0801° sin 2(M′−F) term.
function getRahuLongitude(jde: number): number {
  return normalize(moonposition.trueNode(jde) * RAD2DEG)
}

// ── HOUSES + ASC + MC ─────────────────────────────────────────────────────────

// RAMC from GMST + birth longitude.
function getRAMC(jd: number, geoLongitude: number): number {
  const T = (jd - 2451545.0) / 36525.0
  // GMST at 0h UT then rotate to birth longitude (both in degrees)
  const gmst = normalize(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T)
  return normalize(gmst + geoLongitude)
}

// Ascendant and MC from RAMC + geographic latitude.
// Returns exact ecliptic degrees for ASC and MC only — Whole Sign house cusps
// are computed separately from the ASC sign boundary, not from the ASC degree.
// MC is NOT the 10th-house cusp in Whole Sign astrology; it is shown separately.
function calculateAngles(jd: number, lat: number, ramc: number): { asc: number; mc: number } {
  const T = (jd - 2451545.0) / 36525.0
  const obliquity = 23.4397 - 0.0130 * T  // mean obliquity of ecliptic
  const oblRad = obliquity * DEG2RAD
  const latRad = lat * DEG2RAD
  const ramcRad = ramc * DEG2RAD

  // Ascendant
  const ascRad = Math.atan2(
    Math.cos(ramcRad),
    -(Math.sin(ramcRad) * Math.cos(oblRad) + Math.tan(latRad) * Math.sin(oblRad))
  )
  const asc = normalize(ascRad * RAD2DEG)

  // Midheaven — ecliptic projection of the meridian (career/public axis)
  const mcRad = Math.atan2(Math.sin(ramcRad), Math.cos(ramcRad) * Math.cos(oblRad))
  const mc = normalize(mcRad * RAD2DEG)

  return { asc, mc }
}

// Whole Sign house number (standard for Jyotish)
function getHouseWholeSign(planetLon: number, ascendant: number): number {
  const ascSignIndex  = Math.floor(ascendant / 30)
  const planetSignIdx = Math.floor(planetLon / 30)
  return ((planetSignIdx - ascSignIndex + 12) % 12) + 1
}

// ── MAIN EXPORT ───────────────────────────────────────────────────────────────

export function calculateDualChart(birth: BirthData, overrides?: ChartOverrides): DualChartData {
  const jd = toJulianDay(birth.year, birth.month, birth.day, birth.hour, birth.minute, birth.timezone)
  const ayanamsa = getLahiriAyanamsa(jd)
  const ramc = getRAMC(jd, birth.longitude)
  const { asc: ascendantTropical, mc: mcTropical } = calculateAngles(jd, birth.latitude, ramc)

  // Planet longitude functions paired with their names
  const PLANET_FUNS: Array<{ name: string; getLon: (jde: number) => number }> = [
    { name: 'Sun',     getLon: getSunLongitude     },
    { name: 'Moon',    getLon: getMoonLongitude     },
    { name: 'Mercury', getLon: getMercuryLongitude  },
    { name: 'Venus',   getLon: getVenusLongitude    },
    { name: 'Mars',    getLon: getMarsLongitude     },
    { name: 'Jupiter', getLon: getJupiterLongitude  },
    { name: 'Saturn',  getLon: getSaturnLongitude   },
    { name: 'Uranus',  getLon: getUranusLongitude   },
    { name: 'Neptune', getLon: getNeptuneLongitude  },
    { name: 'Pluto',   getLon: getPlutoLongitude    },
    { name: 'Rahu',    getLon: getRahuLongitude     },
  ]

  // Compute tropical longitudes, retrograde status, and daily motion (centered difference)
  const rawPlanets: Array<{ name: string; longitude: number; retrograde: boolean; dailyMotion: number }> = []
  for (const { name, getLon } of PLANET_FUNS) {
    const longitude = getLon(jd)
    const lonBefore = getLon(jd - 1)
    const lonAfter  = getLon(jd + 1)
    let dm = lonAfter - lonBefore
    if (dm > 180) dm -= 360
    if (dm < -180) dm += 360
    dm /= 2  // centred difference → degrees per day
    rawPlanets.push({ name, longitude, retrograde: dm < 0, dailyMotion: dm })
  }

  // Apply Horizons Pluto override if provided by the caller (replaces Meeus longitude only;
  // retrograde flag and dailyMotion remain from Meeus — the velocity error is negligible)
  if (overrides?.plutoLongitude !== undefined) {
    const pluto = rawPlanets.find(p => p.name === 'Pluto')
    if (pluto) pluto.longitude = overrides.plutoLongitude
  }

  // Ketu is always exactly opposite Rahu; its motion mirrors Rahu's in reverse
  const rahu = rawPlanets.find(p => p.name === 'Rahu')!
  rawPlanets.push({ name: 'Ketu', longitude: normalize(rahu.longitude + 180), retrograde: rahu.retrograde, dailyMotion: rahu.dailyMotion })

  const ascSignTropical   = getSign(ascendantTropical)
  const mcSignTropical    = getSign(mcTropical)

  // Whole Sign house cusps for tropical — 12 × 30° starting at 0° of the ascending sign.
  // Consistent with Whole Sign planet assignments via getHouseWholeSign().
  // The MC is NOT included as the 10th-house cusp — it is a separate angle shown independently.
  const ascSignTropIdx    = Math.floor(ascendantTropical / 30)
  const tropicalHouses    = Array.from({ length: 12 }, (_, i) =>
    normalize(ascSignTropIdx * 30 + i * 30)
  )

  // ── Tropical chart ────────────────────────────────────────────────────────
  const tropicalPlanets: PlanetPosition[] = rawPlanets.map(p => {
    const { sign, signIndex, degree } = getSign(p.longitude)
    return {
      name:        p.name,
      longitude:   p.longitude,
      sign,
      signIndex,
      degree,
      house:       getHouseWholeSign(p.longitude, ascendantTropical),
      retrograde:  p.retrograde,
      dailyMotion: p.dailyMotion,
    }
  })

  // ── Sidereal chart ────────────────────────────────────────────────────────
  const ascendantSidereal  = normalize(ascendantTropical - ayanamsa)
  const ascSignSidereal    = getSign(ascendantSidereal)
  const mcSidereal         = normalize(mcTropical - ayanamsa)
  const mcSignSidereal     = getSign(mcSidereal)

  // Whole Sign house cusps from the sidereal ASC sign
  const ascSiderealSignIdx = Math.floor(ascendantSidereal / 30)
  const siderealHouses     = Array.from({ length: 12 }, (_, i) =>
    normalize(ascSiderealSignIdx * 30 + i * 30)
  )

  const siderealPlanets: PlanetPosition[] = rawPlanets.map(p => {
    const siderealLon = normalize(p.longitude - ayanamsa)
    const { sign, signIndex, degree } = getSign(siderealLon)
    const { nakshatra, pada } = getNakshatra(siderealLon)
    return {
      name:           p.name,
      longitude:      siderealLon,
      sign,
      signIndex,
      degree,
      house:          getHouseWholeSign(siderealLon, ascendantSidereal),
      retrograde:     p.retrograde,
      dailyMotion:    p.dailyMotion,  // ayanamsa shift is constant, so Δlon/Δt is identical in both systems
      nakshatra,
      nakshatraPada:  pada,
    }
  })

  return {
    tropical: {
      ascendant:      ascendantTropical,
      ascendantSign:  ascSignTropical.sign,
      ascendantDegree: ascSignTropical.degree,
      midheaven:      mcTropical,
      midheavenSign:  mcSignTropical.sign,
      midheavenDegree: mcSignTropical.degree,
      planets:        tropicalPlanets,
      houses:         tropicalHouses,
      system:         'tropical',
    },
    sidereal: {
      ascendant:      ascendantSidereal,
      ascendantSign:  ascSignSidereal.sign,
      ascendantDegree: ascSignSidereal.degree,
      midheaven:      mcSidereal,
      midheavenSign:  mcSignSidereal.sign,
      midheavenDegree: mcSignSidereal.degree,
      planets:        siderealPlanets,
      houses:         siderealHouses,
      system:         'sidereal',
    },
    birthData:   birth,  // includes birthTimeUnknown flag when set
    plutoLongitude: rawPlanets.find(p => p.name === 'Pluto')?.longitude ?? 0,
    plutoSource: overrides?.plutoSource ?? 'local-meeus',
    ayanamsa,            // live Lahiri value — the Δ the frame-shift wheel rotates by
  }
}

