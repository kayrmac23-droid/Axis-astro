// lib/rate-limit.ts — shared Redis-backed rate limiter
//
// Fixed-window via INCR + EXPIRE in one atomic Lua round-trip.
// Falls back to an in-memory fixed window when Redis is unavailable
// (local dev without env vars, or Redis downtime).
//
// The fallback map is capped at MAX_FALLBACK_ENTRIES to prevent unbounded
// growth during extended Redis outages.

import { getRedis } from './reading-cache'

// ── Lua script: atomic INCR + repair-missing-TTL ─────────────────────────────
// TTL == -1 means the key was created by a prior INCR whose EXPIRE was lost.
// We set EXPIRE in that case too, so the window is always bounded.
const _RL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

// ── In-memory fallback ────────────────────────────────────────────────────────
// Shared within a warm serverless instance. Cap prevents unbounded growth;
// FIFO eviction matches the pattern used in jpl-horizons.ts.
const MAX_FALLBACK_ENTRIES = 2_000
const _fallbackMap = new Map<string, { count: number; windowStart: number }>()

function _fallbackCheck(
  key: string,
  maxReqs: number,
  windowSecs: number,
): { allowed: boolean; retryAfter: number } {
  const now      = Date.now()
  const windowMs = windowSecs * 1000

  if (_fallbackMap.size >= MAX_FALLBACK_ENTRIES) {
    _fallbackMap.delete(_fallbackMap.keys().next().value!)
  }

  const rec = _fallbackMap.get(key)
  if (!rec || now - rec.windowStart >= windowMs) {
    _fallbackMap.set(key, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }
  if (rec.count >= maxReqs) {
    const retryAfter = Math.ceil((windowMs - (now - rec.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }
  rec.count++
  return { allowed: true, retryAfter: 0 }
}

// ── Public API ────────────────────────────────────────────────────────────────

export async function checkRateLimit(
  ip: string,
  keyPrefix: string,
  maxReqs: number,
  windowSecs: number,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const key   = keyPrefix + ip
  const redis = getRedis()
  if (!redis) return _fallbackCheck(key, maxReqs, windowSecs)
  try {
    const count = await redis.eval(_RL_SCRIPT, [key], [String(windowSecs)]) as number
    if (count > maxReqs) {
      const ttl = await redis.ttl(key)
      return { allowed: false, retryAfter: Math.max(ttl > 0 ? ttl : windowSecs, 1) }
    }
    return { allowed: true, retryAfter: 0 }
  } catch {
    return _fallbackCheck(key, maxReqs, windowSecs)
  }
}

export function extractIp(
  req: { headers: { get(name: string): string | null } },
): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
      ?? req.headers.get('x-real-ip')
      ?? 'direct'
}
