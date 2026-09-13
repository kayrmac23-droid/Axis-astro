// Shared birth-data validation for /api/calculate, /api/synastry and /api/reading.
// Replaces three hand-rolled parsers that had drifted apart (parseInt accepted
// "2000junk" as 2000, fractional months slipped through, the reading route used
// its own looser rules).
import type { BirthData } from '@/lib/astro-calc'
import { isValidCalendarDate, tzNameToOffset } from '@/lib/tz'

export type BirthDataResult =
  | { ok: true; data: BirthData }
  | { ok: false; error: string }

export interface ParseBirthDataOptions {
  // Prefix for error messages, e.g. 'Person A'.
  label?: string
  // Recompute the UTC offset server-side from tzName (DST-aware). /api/reading
  // passes false: its birth data is echoed back from /api/calculate with the
  // offset already resolved, and the reading cache key is built from that offset.
  resolveTzName?: boolean
}

// Plain decimal only — rejects "2000junk", "1e3", "0x10", whitespace-only, etc.
const DECIMAL = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/
const MAX_TZ_NAME_LENGTH = 100

function numberFromUnknown(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value !== 'string' || !DECIMAL.test(value.trim())) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

function isBlank(value: unknown): boolean {
  return value === undefined || value === null || value === ''
}

function isIntInRange(value: number | null, min: number, max: number): value is number {
  return value !== null && Number.isInteger(value) && value >= min && value <= max
}

export function parseBirthDataInput(
  raw: unknown,
  { label = 'Birth data', resolveTzName = true }: ParseBirthDataOptions = {},
): BirthDataResult {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: `${label}: expected an object` }
  }

  const input     = raw as Record<string, unknown>
  const year      = numberFromUnknown(input.year)
  const month     = numberFromUnknown(input.month)
  const day       = numberFromUnknown(input.day)
  // Unknown birth time is sent without an hour/minute; default to noon.
  const hour      = isBlank(input.hour)   ? 12 : numberFromUnknown(input.hour)
  const minute    = isBlank(input.minute) ? 0  : numberFromUnknown(input.minute)
  const latitude  = numberFromUnknown(input.latitude)
  const longitude = numberFromUnknown(input.longitude)

  if (!isIntInRange(year, 1, 9999))  return { ok: false, error: `${label}: invalid year` }
  if (!isIntInRange(month, 1, 12))   return { ok: false, error: `${label}: invalid month` }
  if (!isIntInRange(day, 1, 31))     return { ok: false, error: `${label}: invalid day` }
  if (!isIntInRange(hour, 0, 23))    return { ok: false, error: `${label}: invalid hour` }
  if (!isIntInRange(minute, 0, 59))  return { ok: false, error: `${label}: invalid minute` }
  if (latitude === null  || latitude  < -90  || latitude  > 90)  return { ok: false, error: `${label}: invalid latitude` }
  if (longitude === null || longitude < -180 || longitude > 180) return { ok: false, error: `${label}: invalid longitude` }
  if (!isValidCalendarDate(year, month, day)) {
    return { ok: false, error: `${label}: day out of range for month/year` }
  }

  let tzName: string | undefined
  if (!isBlank(input.tzName)) {
    if (typeof input.tzName !== 'string' || input.tzName.length > MAX_TZ_NAME_LENGTH) {
      return { ok: false, error: `${label}: invalid timezone name` }
    }
    tzName = input.tzName
  }

  let timezone = 0
  if (!isBlank(input.timezone)) {
    const parsed = numberFromUnknown(input.timezone)
    if (parsed === null || parsed < -14 || parsed > 14) {
      return { ok: false, error: `${label}: invalid timezone offset` }
    }
    timezone = parsed
  }

  // Timezone resolution priority:
  // 1. Server-side DST lookup from IANA name (most accurate)
  // 2. Numeric UTC offset supplied by client (already DST-aware if from /api/timezone)
  // 3. Fallback: 0 (UTC)
  // An unrecognised tzName keeps the supplied offset rather than failing the request.
  if (resolveTzName && tzName) {
    const computed = tzNameToOffset(tzName, year, month, day, hour, minute)
    if (computed !== null) timezone = computed
  }

  return {
    ok: true,
    data: {
      year, month, day, hour, minute, latitude, longitude, timezone, tzName,
      birthTimeUnknown: input.birthTimeUnknown === true || input.birthTimeUnknown === 'true',
    },
  }
}
