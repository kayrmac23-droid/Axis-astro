#!/usr/bin/env node
// Pluto ephemeris benchmark: local Meeus Ch.37 vs JPL Horizons DE440
// Run: node scripts/benchmark-pluto.mjs
//
// Requires Node.js 18+ (built-in fetch). No dependencies.
// Requires outbound HTTPS access to ssd.jpl.nasa.gov — will not run in sandboxed CI.
// Expected error range from Meeus Ch.37: ~10–20 arcminutes across 1930–2025.

const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const DEG2RAD = Math.PI / 180

// ── Meeus Chapter 37 Pluto longitude (same code as src/lib/astro-calc.ts) ──────

function toJulianDay(year, month, day, utHour = 12) {
  let y = year, m = month
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + utHour / 24 + B - 1524.5
}

function normalize(deg) { return ((deg % 360) + 360) % 360 }

function meeus37Pluto(jd) {
  const T  = (jd - 2451545.0) / 36525.0
  const Ja = normalize(34.35    + 3034.9057 * T)
  const Sa = normalize(50.08    + 1222.1138 * T)
  const Pa = normalize(238.96   +  144.9600 * T)
  const JaR = Ja * DEG2RAD, SaR = Sa * DEG2RAD, PaR = Pa * DEG2RAD

  let Σl = 238.958116
    + 144.960455 * T
    +  3.4 * Math.sin(PaR)
    -  5.3 * Math.sin(2 * PaR)
    +  0.5 * Math.sin(3 * PaR)
    +  6.2 * Math.sin(JaR)
    -  5.9 * Math.sin(JaR - PaR)
    -  2.9 * Math.sin(2 * JaR - PaR)
    +  1.0 * Math.sin(JaR + PaR)
    -  0.6 * Math.sin(2 * (JaR - PaR))
    -  1.1 * Math.sin(JaR - PaR + SaR)
    +  0.5 * Math.sin(JaR - SaR)
    -  1.0 * Math.sin(JaR + SaR - PaR)
    +  0.2 * Math.sin(2 * SaR - PaR)
  return normalize(Σl)
}

// ── JPL Horizons fetch ──────────────────────────────────────────────────────────

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

function horizonsDate(y, m, d, h = 12) {
  return `${y}-${MONTHS[m - 1]}-${String(d).padStart(2,'0')} ${String(h).padStart(2,'0')}:00`
}

async function fetchHorizonsPluto(year, month, day) {
  const start = horizonsDate(year, month, day, 12)
  const stop  = horizonsDate(year, month, day, 12)  // same minute, add 1 min in stop
  const stopDate = new Date(Date.UTC(year, month - 1, day, 12, 1))
  const stopStr  = `${stopDate.getUTCFullYear()}-${MONTHS[stopDate.getUTCMonth()]}-${String(stopDate.getUTCDate()).padStart(2,'0')} ${String(stopDate.getUTCHours()).padStart(2,'0')}:${String(stopDate.getUTCMinutes()).padStart(2,'0')}`

  const params = new URLSearchParams({
    format:     'json',
    COMMAND:    "'999'",
    OBJ_DATA:   'NO',
    MAKE_EPHEM: 'YES',
    EPHEM_TYPE: 'OBSERVER',
    CENTER:     "'500@399'",
    START_TIME: `'${start}'`,
    STOP_TIME:  `'${stopStr}'`,
    STEP_SIZE:  "'1m'",
    QUANTITIES: "'31'",
    ANG_FORMAT: 'DEG',
    APPARENT:   'AIRLESS',
    CAL_FORMAT: 'CAL',
  })

  const res = await fetch(`${HORIZONS_URL}?${params}`, { signal: AbortSignal.timeout(10000) })
  if (!res.ok) return null

  const json = await res.json()
  const text = json.result ?? ''

  const soeIdx = text.indexOf('$$SOE')
  const eoeIdx = text.indexOf('$$EOE')
  if (soeIdx === -1 || eoeIdx === -1) return null

  const line   = text.slice(soeIdx + 5, eoeIdx).trim().split('\n')[0]?.trim()
  const floats = line?.match(/-?\d+\.\d+/g)
  if (!floats || floats.length < 2) return null

  const lon = parseFloat(floats[floats.length - 2])

  const deMatch = text.match(/\bDE(\d+)\b/)
  const ephem   = deMatch ? `DE${deMatch[1]}` : 'DE440'

  return { longitude: normalize(lon), ephemeris: ephem }
}

// ── Test dates ──────────────────────────────────────────────────────────────────

const TEST_DATES = [
  { label: '1930-06-15  (near discovery)',   year: 1930, month:  6, day: 15 },
  { label: '1945-01-01',                     year: 1945, month:  1, day:  1 },
  { label: '1960-07-01',                     year: 1960, month:  7, day:  1 },
  { label: '1975-03-15',                     year: 1975, month:  3, day: 15 },
  { label: '1990-09-01',                     year: 1990, month:  9, day:  1 },
  { label: '2000-01-01  (J2000)',             year: 2000, month:  1, day:  1 },
  { label: '2010-06-21  (summer solstice)',   year: 2010, month:  6, day: 21 },
  { label: '2020-01-12  (Saturn-Pluto conj)',year: 2020, month:  1, day: 12 },
  { label: '2025-03-20  (spring equinox)',   year: 2025, month:  3, day: 20 },
]

// ── Run ────────────────────────────────────────────────────────────────────────

console.log('\nPluto benchmark: Meeus Ch.37 vs JPL Horizons')
console.log('─'.repeat(80))
console.log(
  'Date'.padEnd(38)  +
  'Meeus (°)'.padEnd(14) +
  'Horizons (°)'.padEnd(14) +
  'Δ (arcmin)'.padEnd(12) +
  'Ephem'
)
console.log('─'.repeat(80))

let totalAbsDiff = 0, count = 0

for (const { label, year, month, day } of TEST_DATES) {
  const jd = toJulianDay(year, month, day)
  const meeus = meeus37Pluto(jd)

  process.stdout.write(label.padEnd(38) + meeus.toFixed(4).padEnd(14))

  try {
    const horizons = await fetchHorizonsPluto(year, month, day)
    if (!horizons) {
      console.log('[Horizons returned no data]')
      continue
    }

    let diff = horizons.longitude - meeus
    if (diff > 180)  diff -= 360
    if (diff < -180) diff += 360
    const diffArcmin = diff * 60

    totalAbsDiff += Math.abs(diffArcmin)
    count++

    const flag = Math.abs(diffArcmin) > 10 ? ' ← > 10 arcmin' : ''
    console.log(
      horizons.longitude.toFixed(4).padEnd(14) +
      (diffArcmin >= 0 ? '+' : '') + diffArcmin.toFixed(1).padEnd(11) +
      horizons.ephemeris +
      flag
    )
  } catch (err) {
    console.log(`[Error: ${err.message}]`)
  }
}

console.log('─'.repeat(80))
if (count > 0) {
  console.log(`Mean absolute error: ${(totalAbsDiff / count).toFixed(1)} arcmin over ${count} dates`)
}
console.log()
