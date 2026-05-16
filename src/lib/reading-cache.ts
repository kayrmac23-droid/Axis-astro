// Reading cache — deduplicates identical chart+section requests.
//
// Cache key includes: normalized birth data, reading section, planetSection,
// READING_PROMPT_VERSION, and fixed methodology constants (ayanamsa, house system).
// When prompts change, bump READING_PROMPT_VERSION to invalidate all prior entries.
//
// Storage: module-level Map, so it persists for the lifetime of a warm serverless
// instance but is NOT shared across cold starts or concurrent instances. For
// cross-instance persistence, replace getCachedReading / setCachedReading with
// a KV/Redis client — the interface is deliberately small for that reason.

import { createHash } from 'crypto'
import type { BirthData } from '@/lib/astro-calc'

// ── Version constant ───────────────────────────────────────────────────────────
// Bump this whenever prompts are intentionally changed.
// Format: v{major}.{minor}  (minor = small copy edits; major = structural changes)
export const READING_PROMPT_VERSION = 'v9.0'

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
  return createHash('sha256')
    .update(JSON.stringify(normalized))
    .digest('hex')
    .slice(0, 40)
}

// ── Storage ────────────────────────────────────────────────────────────────────

const _cache = new Map<string, string>()
const MAX_BYTES = 25_000_000  // 25 MB ceiling (readings can reach ~24 KB at max_tokens:6000)

let _totalBytes = 0

export function getCachedReading(key: string): string | undefined {
  return _cache.get(key)
}

export function setCachedReading(key: string, text: string): void {
  const existing = _cache.get(key)
  const existingBytes = existing ? Buffer.byteLength(existing, 'utf8') : 0
  const newBytes = Buffer.byteLength(text, 'utf8')

  // Evict oldest entries until the new entry fits — Map iterates in insertion order
  while (_totalBytes - existingBytes + newBytes > MAX_BYTES && _cache.size > 0) {
    const oldest = _cache.keys().next().value
    if (oldest === undefined) break
    _totalBytes -= Buffer.byteLength(_cache.get(oldest)!, 'utf8')
    _cache.delete(oldest)
  }

  _totalBytes = _totalBytes - existingBytes + newBytes
  _cache.set(key, text)
}
