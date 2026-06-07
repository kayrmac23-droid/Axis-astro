#!/usr/bin/env node
// Pluto ephemeris benchmark: local Meeus Ch.37 (full 43-term table) vs JPL Horizons DE440
// Run: node scripts/benchmark-pluto.mjs
//
// Requires Node.js 18+ (built-in fetch). Runs from the repo root (needs node_modules).
// Requires outbound HTTPS access to ssd.jpl.nasa.gov — will not run in sandboxed CI.
//
// The local Meeus column uses the same code path as the in-app fallback:
//   astronomia/pluto.heliocentric(jde)  →  rectangular geocentric  →  ecliptic lon + nutation
// Observed accuracy vs DE440: ~15–60 arcminutes across 1930–2025 (see BENCHMARK.md).

import { createRequire } from 'module'
const require = createRequire(import.meta.url)

const plutoLib    = require('astronomia/pluto')
const { Planet }  = require('astronomia/planetposition')
const nutationLib = require('astronomia/nutation')
const vsop87Bearth = require('astronomia/data/vsop87Bearth')

const d = m => m.default ?? m
const _earth   = new Planet(d(vsop87Bearth))
const plutoFn  = (plutoLib.default ?? plutoLib).heliocentric

const _DEG2RAD = Math.PI / 180
const RAD2DEG = 180 / Math.PI
const HORIZONS_URL = 'https://ssd.jpl.nasa.gov/api/horizons.api'
const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec']

// ── Utilities ──────────────────────────────────────────────────────────────────

function normalize(deg) { return ((deg % 360) + 360) % 360 }

function toJulianDay(year, month, day, utHour = 12) {
  let y = year, m = month
  if (m <= 2) { y -= 1; m += 12 }
  const A = Math.floor(y / 100)
  const B = 2 - A + Math.floor(A / 4)
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + day + utHour / 24 + B - 1524.5
}

// ── Local Meeus Ch.37 geocentric ecliptic longitude ────────────────────────────
// Uses the full 43-term table from astronomia/pluto (same as the in-app fallback).

function localPluto(jde) {
  const ep = _earth.position(jde)
  const ph = plutoFn(jde)
  const x = ph.range * Math.cos(ph.lat) * Math.cos(ph.lon) - ep.range * Math.cos(ep.lat) * Math.cos(ep.lon)
  const y = ph.range * Math.cos(ph.lat) * Math.sin(ph.lon) - ep.range * Math.cos(ep.lat) * Math.sin(ep.lon)
  let λ = Math.atan2(y, x)
  const [Δψ] = nutationLib.nutation(jde)
  λ += Δψ
  return normalize(λ * RAD2DEG)
}

// ── JPL Horizons fetch ──────────────────────────────────────────────────────────

function horizonsDate(y, m, d, h = 12) {
  return `${y}-${MONTHS[m - 1]}-${String(d).padStart(2,'0')} ${String(h).padStart(2,'0')}:00`
}

async function fetchHorizonsPluto(year, month, day) {
  const start = horizonsDate(year, month, day, 12)
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

  const res = await fetch(`${HORIZONS_URL}?${params}`, { signal: AbortSignal.timeout(12000) })
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
  { label: '1930-06-15  (near discovery)',    year: 1930, month:  6, day: 15 },
  { label: '1945-01-01',                      year: 1945, month:  1, day:  1 },
  { label: '1960-07-01',                      year: 1960, month:  7, day:  1 },
  { label: '1975-03-15',                      year: 1975, month:  3, day: 15 },
  { label: '1990-09-01  (post-perihelion)',    year: 1990, month:  9, day:  1 },
  { label: '2000-01-01  (J2000)',              year: 2000, month:  1, day:  1 },
  { label: '2010-06-21  (summer solstice)',    year: 2010, month:  6, day: 21 },
  { label: '2020-01-12  (Saturn–Pluto conj)', year: 2020, month:  1, day: 12 },
  { label: '2025-03-20  (spring equinox)',     year: 2025, month:  3, day: 20 },
]

// ── Run ────────────────────────────────────────────────────────────────────────

console.log('\nPluto ephemeris benchmark: Meeus Ch.37 (full 43-term) vs JPL Horizons')
console.log('─'.repeat(86))
console.log(
  'Date'.padEnd(42)  +
  'Meeus (°)'.padEnd(12) +
  'Horizons (°)'.padEnd(14) +
  'Δ (arcmin)'.padEnd(12) +
  'Ephem'
)
console.log('─'.repeat(86))

let totalAbsDiff = 0, count = 0

for (const { label, year, month, day } of TEST_DATES) {
  const jde   = toJulianDay(year, month, day)
  const local = localPluto(jde)

  process.stdout.write(label.padEnd(42) + local.toFixed(4).padEnd(12))

  try {
    const horizons = await fetchHorizonsPluto(year, month, day)
    if (!horizons) {
      console.log('[Horizons returned no data]')
      continue
    }

    let diff = horizons.longitude - local
    if (diff > 180)  diff -= 360
    if (diff < -180) diff += 360
    const diffArcmin = diff * 60

    totalAbsDiff += Math.abs(diffArcmin)
    count++

    const flag = Math.abs(diffArcmin) > 60 ? ' ← > 1°' : ''
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

console.log('─'.repeat(86))
if (count > 0) {
  console.log(`Mean absolute error: ${(totalAbsDiff / count).toFixed(1)} arcmin over ${count} dates`)
}
console.log()
