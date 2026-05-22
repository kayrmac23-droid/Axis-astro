// JPL Horizons REST API — professional-grade ephemeris data for Pluto
//
// JPL Horizons currently uses:
//   DE440 (Park et al. 2021, doi:10.3847/1538-3881/abd414) — 1550–2650, high precision
//   DE441 (extended) — 9999 BC to 9999 AD, used for extreme dates
// For typical birth dates (1900–2050), Horizons returns DE440 data.
//
// REST API docs: https://ssd-api.jpl.nasa.gov/doc/horizons.html
//
// What this returns: apparent geocentric ecliptic longitude in the ecliptic-of-date
// frame (mean ecliptic and equinox of the tabulation date), light-time corrected,
// aberration included, no atmospheric refraction. This matches what VSOP87 + nutation
// produces — same frame, same corrections.

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'

// JPL Horizons body codes. Only Pluto is used in production today; others reserved
// for future expansion to a full Horizons-backed pipeline.
export const HORIZONS_BODY_CODES: Record<string, string> = {
  Pluto:   '999',  // Pluto system barycenter (Charon offset < 0.00004°, negligible)
  Neptune: '899',
  Uranus:  '799',
  Saturn:  '699',
  Jupiter: '599',
  Mars:    '499',
  Venus:   '299',
  Mercury: '199',
}

export interface HorizonsPosition {
  longitude: number   // apparent geocentric ecliptic longitude, degrees [0, 360)
  latitude:  number   // apparent geocentric ecliptic latitude, degrees
  ephemeris: string   // e.g. 'DE440', 'DE441'
}

// Module-level cache — persists for the lifetime of a warm serverless instance.
// Key: "{bodyCode}:{YYYY-Mon-DD HH:MM UTC}" (rounded to minute).
// Capped at MAX_CACHE_ENTRIES via FIFO eviction so the Map cannot grow unbounded.
const MAX_CACHE_ENTRIES = 500
const _cache = new Map<string, HorizonsPosition>()

function cachePut(key: string, value: HorizonsPosition): void {
  if (_cache.size >= MAX_CACHE_ENTRIES) {
    // Delete the oldest entry (Map insertion order is preserved).
    _cache.delete(_cache.keys().next().value!)
  }
  _cache.set(key, value)
}

export async function getHorizonsEclipticLon(
  bodyName:  string,
  utcDate:   Date,
  timeoutMs: number = 5000
): Promise<HorizonsPosition | null> {
  const code = HORIZONS_BODY_CODES[bodyName]
  if (!code) return null

  const rounded = new Date(utcDate)
  rounded.setUTCSeconds(0, 0)
  const cacheKey = `${code}:${rounded.toISOString()}`

  const hit = _cache.get(cacheKey)
  if (hit) return hit

  const startStr = formatHorizonsDate(rounded)
  const stopDate  = new Date(rounded.getTime() + 60_000)
  const stopStr   = formatHorizonsDate(stopDate)

  const params = new URLSearchParams({
    format:     'json',
    COMMAND:    `'${code}'`,
    OBJ_DATA:   'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER:     "'500@399'",  // geocenter: body 399 (Earth), center 500
    START_TIME: `'${startStr}'`,
    STOP_TIME:  `'${stopStr}'`,
    STEP_SIZE:  "'1m'",
    QUANTITIES: "'31'",       // ObsEcLon, ObsEcLat — geocentric ecliptic of date
    ANG_FORMAT: 'DEG',
    APPARENT:   'AIRLESS',    // apparent, no atmospheric refraction
    CAL_FORMAT: 'CAL',
  })

  const ctrl  = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), timeoutMs)

  try {
    const res = await fetch(`${HORIZONS_URL}?${params}`, { signal: ctrl.signal })
    clearTimeout(timer)
    if (!res.ok) return null

    const json = await res.json() as Record<string, unknown>
    const pos  = parseHorizonsResult(json)
    if (pos) cachePut(cacheKey, pos)
    return pos
  } catch {
    clearTimeout(timer)
    return null
  }
}

function formatHorizonsDate(d: Date): string {
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']
  const y  = d.getUTCFullYear()
  const mo = MONTHS[d.getUTCMonth()]
  const dd = String(d.getUTCDate()).padStart(2, '0')
  const hh = String(d.getUTCHours()).padStart(2, '0')
  const mm = String(d.getUTCMinutes()).padStart(2, '0')
  return `${y}-${mo}-${dd} ${hh}:${mm}`
}

function parseHorizonsResult(json: Record<string, unknown>): HorizonsPosition | null {
  const text = json.result as string | undefined
  if (!text) return null

  const soeIdx = text.indexOf('$$SOE')
  const eoeIdx = text.indexOf('$$EOE')
  if (soeIdx === -1 || eoeIdx === -1) return null

  const dataBlock = text.slice(soeIdx + 5, eoeIdx).trim()
  const firstLine = dataBlock.split('\n')[0]?.trim()
  if (!firstLine) return null

  // The date columns (YYYY-Mon-DD HH:MM) contain no decimal points.
  // Ecliptic longitude and latitude are the only decimal-point numbers on the line.
  const floats = firstLine.match(/-?\d+\.\d+/g)
  if (!floats || floats.length < 2) return null

  const lon = parseFloat(floats[floats.length - 2])
  const lat = parseFloat(floats[floats.length - 1])
  if (isNaN(lon) || isNaN(lat)) return null

  // Detect ephemeris version from response header (DE440, DE441, etc.)
  const deMatch = text.match(/\bDE(\d+)\b/)
  const ephemeris = deMatch ? `DE${deMatch[1]}` : 'DE440'

  return {
    longitude: ((lon % 360) + 360) % 360,
    latitude:  lat,
    ephemeris,
  }
}
