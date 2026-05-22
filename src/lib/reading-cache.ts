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
// Bump this whenever prompts are intentionally changed.
// Format: v{major}.{minor}  (minor = small copy edits; major = structural changes)
export const READING_PROMPT_VERSION = 'v9.2'

// Readings only change when the prompt version changes, so a 30-day TTL is safe.
const TTL_SECONDS = 30 * 24 * 60 * 60  // 30 days

// ── Redis client ───────────────────────────────────────────────────────────────
// Lazily initialised so the module is importable in environments that lack the
// env vars (unit tests, local dev without Redis). Returns null when unconfigured.
let _redis: Redis | null = null

export function getRedis(): Redis | null {
  if (_redis) return _redis
  const url   = process.env.UPSTASH_REDIS_REST_URL
  const token = process.env.UPSTASH_REDIS_REST_TOKEN
  if (!url || !token) return null
  _redis = new Redis({ url, token })
  return _redis
}

// ── Cache key construction ─────────────────────────────────────────────────────

interface CacheKeyParams {
  birth:         BirthData
  section:       string
  planetSection: string
}

export function makeCacheKey({ birth, section, planetSection }: CacheKeyParams): string {
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
