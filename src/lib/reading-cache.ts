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
const MAX_ENTRIES = 1000  // ~3.5 MB ceiling at avg 3.5 KB per section

export function getCachedReading(key: string): string | undefined {
  return _cache.get(key)
}

export function setCachedReading(key: string, text: string): void {
  if (_cache.size >= MAX_ENTRIES) {
    // Evict oldest entry — Map iterates in insertion order
    const oldest = _cache.keys().next().value
    if (oldest !== undefined) _cache.delete(oldest)
  }
  _cache.set(key, text)
}
