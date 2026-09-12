// Reading cache — deduplicates identical chart+section requests.
//
// Cache key includes: normalized birth data, reading section, planetSection,
// READING_PROMPT_VERSION, and fixed methodology constants (ayanamsa, house system).
// When prompts change, bump READING_PROMPT_VERSION to invalidate all prior entries.
//
// Storage: Upstash Redis (REST API). Requires UPSTASH_REDIS_REST_URL and
// UPSTASH_REDIS_REST_TOKEN environment variables. Reads return null and writes
// are silently skipped when those vars are absent (e.g. local dev without Redis).

import { createHash } from 'crypto'
import { Redis } from '@upstash/redis'
import type { BirthData } from '@/lib/astro-calc'

// ── Version constant ───────────────────────────────────────────────────────────
// Bump this whenever prompts are intentionally changed, or whenever what a cached
// entry MEANS changes. v10.19 is the latter: the prompt text is identical to
// v10.18, but every v10.18 entry was written by an ungated pipeline. Without the
// bump those entries would keep serving for the rest of their 30-day TTL and the
// gate would only ever apply to charts nobody had cast yet.
// Format: v{major}.{minor}  (minor = small copy edits; major = structural changes)
export const READING_PROMPT_VERSION = 'v10.19'

// Readings only change when the prompt version changes, so a 30-day TTL is safe.
const TTL_SECONDS = 30 * 24 * 60 * 60  // 30 days

// ── Redis client ───────────────────────────────────────────────────────────────
// Lazily initialised so the module is importable in environments that lack the
// env vars (unit tests, local dev without Redis). Returns null when unconfigured.
let _redis: Redis | null = null
let _warnedNoRedis = false

export function getRedis(): Redis | null {
  if (_redis) return _redis

  // Vercel's Upstash integration injects KV_REST_API_* (legacy Vercel KV
  // names). A manual setup uses UPSTASH_REDIS_REST_*. Accept either.
  const url   = process.env.UPSTASH_REDIS_REST_URL   ?? process.env.KV_REST_API_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN

  if (!url || !token) {
    if (!_warnedNoRedis) {
      _warnedNoRedis = true
      console.error(
        '[AXIS] REDIS NOT CONFIGURED — reading cache disabled, rate limiting ' +
        'degraded to per-instance memory, global budget guard INACTIVE.'
      )
    }
    return null
  }

  _redis = new Redis({ url, token })
  return _redis
}

// ── Cache key construction ─────────────────────────────────────────────────────

interface CacheKeyParams {
  birth:         BirthData
  section:       string
  planetSection: string
  // Which Pluto the reading was generated against. JPL Horizons and the local
  // Meeus fallback differ by up to ~0.5°, which can put Pluto in a different sign
  // near a boundary. Without this in the key, whichever source won the FIRST
  // uncached request stayed frozen in the cached prose for 30 days while the wheel
  // and the READOUT rail re-derived Pluto live on every visit — the exact
  // surface-to-surface drift readout.ts exists to prevent.
  plutoSource?:  string
}

export function makeSynastryCacheKey({
  birthA, birthB, section, planetSection, plutoSourceA, plutoSourceB,
}: { birthA: BirthData; birthB: BirthData; section: string; planetSection: string; plutoSourceA?: string; plutoSourceB?: string }): string {
  const norm = (b: BirthData) => ({
    year: b.year, month: b.month, day: b.day,
    hour:   b.birthTimeUnknown ? 12 : b.hour,
    minute: b.birthTimeUnknown ? 0  : b.minute,
    lat: Math.round(b.latitude  * 100) / 100,
    lon: Math.round(b.longitude * 100) / 100,
    tz:  Math.round(b.timezone  * 100) / 100,
    btu: b.birthTimeUnknown === true,
  })
  const key = {
    a: norm(birthA), b: norm(birthB), section, planetSection,
    promptVersion: READING_PROMPT_VERSION,
    plutoSourceA:  plutoSourceA ?? 'local-meeus',
    plutoSourceB:  plutoSourceB ?? 'local-meeus',
  }
  return 'axis:synastry:' + createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 40)
}

export function makeCacheKey({ birth, section, planetSection, plutoSource }: CacheKeyParams): string {
  // Normalize birth data to ensure equivalent inputs produce identical keys.
  // - lat/lon: 2 decimal places (~1.1 km, sufficient for astrological precision)
  // - tz: 2 decimal places (handles half/quarter-hour offsets like IST +5.5)
  // - hour/minute: if birthTimeUnknown, always 12/0 (noon) regardless of what was sent
  const normalized = {
    year:             birth.year,
    month:            birth.month,
    day:              birth.day,
    hour:             birth.birthTimeUnknown ? 12 : birth.hour,
    minute:           birth.birthTimeUnknown ? 0  : birth.minute,
    lat:              Math.round(birth.latitude  * 100) / 100,
    lon:              Math.round(birth.longitude * 100) / 100,
    tz:               Math.round(birth.timezone  * 100) / 100,
    birthTimeUnknown: birth.birthTimeUnknown === true,
    section,
    planetSection,
    promptVersion:    READING_PROMPT_VERSION,
    ayanamsa:         'lahiri',
    houseSystem:      'whole-sign',
    plutoSource:      plutoSource ?? 'local-meeus',
  }
  return 'axis:reading:' + createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 40)
}

// ── Storage ────────────────────────────────────────────────────────────────────

export async function getCachedReading(key: string): Promise<string | null> {
  const redis = getRedis()
  if (!redis) return null
  try {
    return await redis.get<string>(key)
  } catch (err) {
    console.error('Redis GET error:', err instanceof Error ? err.message : err)
    return null
  }
}

export async function setCachedReading(key: string, text: string): Promise<void> {
  const redis = getRedis()
  if (!redis) return
  try {
    await redis.set(key, text, { ex: TTL_SECONDS })
  } catch (err) {
    console.error('Redis SET error:', err instanceof Error ? err.message : err)
  }
}
