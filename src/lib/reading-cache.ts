// Reading cache — deduplicates identical chart+section requests.
//
// Cache key includes: normalized birth data, reading section, planetSection,
// READING_PROMPT_VERSION, fixed methodology constants (ayanamsa, house system),
// and a digest of the earlier sections the section was written after.
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
// entry MEANS changes. v10.19 was the latter: the prompt text was identical to
// v10.18, but every v10.18 entry was written by an ungated pipeline. Without the
// bump those entries would keep serving for the rest of their 30-day TTL and the
// gate would only ever apply to charts nobody had cast yet.
// v10.20: the per-section length instructions for the tropical/sidereal
// secondaries, the nodes, and all six synastry sections were ported from
// hand-synced literals ("300–400 words.") to the shared lengthClause() render,
// so the prompt text those sections send the model changed. Bumped to invalidate
// the prior cache.
// Format: v{major}.{minor}  (minor = small copy edits; major = structural changes)
// v10.22: evidence-led, shared Divergence plan and aligned section instructions.
// v10.23: Divergence restored to AXIS voice and THE LAW (ranked divergences worked
// in depth, the rest named as still unresolved) while keeping the deterministic
// evidence plan. The plan itself changed substantially — same-sign concordance,
// degrees, retrogradation, nakshatras, outer planets, nodes, dasha and yogas are
// all supplied now — so every prior cached Divergence was generated from a
// materially different evidence base and must be invalidated.
// v10.24: sections are no longer written in isolation. Each is generated after
// the reading so far (reading-thread.ts) under the ONE CONTINUOUS READING rule,
// which replaced SELF-COMPLETE SECTIONS; the Sidereal reading is written after
// the whole Tropical one and The Divergence after both. Every prior entry was
// written blind to the sections around it.
// v10.25: review of a live v10.24 reading. The Sidereal frame now reads through
// Jyotish technique (drishti, lordship, sign status, neecha bhanga) instead of
// re-walking the Tropical aspects; a ±3° sign-boundary reading instruction is
// defined and flagged per placement (removed again in v10.28); FACT DISCIPLINE, APPLY THE RULES SILENTLY and the stacking form of
// resolution-by-hierarchy were added to the shared rules. Every prior entry was
// generated from a different context block and different rules.
// v10.26: the Divergence prompts still framed the two systems as "the constructed
// self" versus "the incarnational pattern" — the built-vs-handed stacking metaphor
// v10.25 removed from the Sidereal prompt, and a pairing the doctrine scan treats as
// identity language. They now name the Sidereal frame as the conditions the person
// lives inside, matching the Sidereal system prompt. Cached Divergence prose was
// written to the old framing.
// v10.27: the Sun, Moon, Mercury, Venus and Mars sections each converged on the
// same "There is a particular kind of…" opener and the same struck-fragment close.
// Each now carries its own OPENING MODE and CLOSING MODE (per frame), the
// existential opener is banned as a first sentence and scanned by the gate, and
// the Moon and Venus sections are told not to share a concrete image. Cached
// sections were written without any of that.
// v10.28: the ±3° sign-boundary instruction added in v10.25 contradicted the
// ratified DOCTRINE.md ruling SIGN-BOUNDARY CUSPS — DEREGISTERED (a placement
// within 3° of a boundary is a normal placement in its sign). It is removed from
// SHARED_RULES, and the per-placement ⚠ flag and chart-block tag are removed from
// the context. The Divergence plan keeps only the cross-system note the ruling
// retains: a body boundary-ambiguous in one frame and settled in the other.
// Cached sections were written telling the model to name the neighbouring sign.
// v10.29: three changes to what a cached entry means. (1) The per-section length
// clause is no longer rendered at import from the base band — it is substituted
// per request from the chart-scaled band (prompts.ts LENGTH_CLAUSE_SLOT), so the
// numbers the model is given now match the numbers the gate scores, and the
// prompt text differs from every v10.28 entry. (2) The concordance/divergence
// evidence scaling is capped upward (evidenceUpCap), changing the target a
// concordance-rich chart is written to. (3) The key itself changed shape: it
// carries the canonical Pluto LONGITUDE, not just its source, and `prior` is now
// a digest of which earlier sections preceded this one rather than of their
// prose. Entries written under the old key shape are unreachable anyway; the
// bump keeps the version honest about the prompt change.
export const READING_PROMPT_VERSION = 'v10.30'

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
  // The canonical Pluto longitude the reading was generated against. plutoSource
  // alone is NOT enough: /api/reading accepts the longitude as a client hint (it
  // is the one position the hot path does not recompute, to avoid a JPL call) and
  // only range-checks it. Without the value in the key, any caller could send a
  // valid-looking source with an arbitrary 0–360 longitude and write prose about a
  // fabricated Pluto into the row every honest client then reads for 30 days.
  // Keyed on, a bad hint can only poison its own key.
  plutoLongitude?: number
  // The Vimshottari period current when the section was generated
  // ("Ketu/Rahu"). The dasha is computed from today's date and named in the
  // Sidereal and Divergence prose, so without it in the key a section cached
  // just before an antardasha boundary kept naming the ended period to every
  // reader for the rest of its 30-day TTL. Empty for sections that never
  // carry the dasha.
  dasha?:        string
  // Digest of the earlier sections this one was written after (see
  // reading-thread.ts priorDigest). A section is only reusable after the exact
  // text it was written to follow; '' for the opening section or no thread.
  priorDigest?:  string
}

export function makeSynastryCacheKey({
  birthA, birthB, section, planetSection, plutoSourceA, plutoSourceB, plutoLongitudeA, plutoLongitudeB,
}: { birthA: BirthData; birthB: BirthData; section: string; planetSection: string; plutoSourceA?: string; plutoSourceB?: string; plutoLongitudeA?: number; plutoLongitudeB?: number }): string {
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
    // See plutoLongitude on CacheKeyParams — the client hint is keyed on, per person.
    plutoLonA:     plutoLongitudeA == null ? '' : Math.round(plutoLongitudeA * 100) / 100,
    plutoLonB:     plutoLongitudeB == null ? '' : Math.round(plutoLongitudeB * 100) / 100,
  }
  return 'axis:synastry:' + createHash('sha256').update(JSON.stringify(key)).digest('hex').slice(0, 40)
}

export function makeCacheKey({ birth, section, planetSection, plutoSource, plutoLongitude, priorDigest, dasha }: CacheKeyParams): string {
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
    plutoLon:         plutoLongitude == null ? '' : Math.round(plutoLongitude * 100) / 100,
    prior:            priorDigest ?? '',
    dasha:            dasha ?? '',
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
