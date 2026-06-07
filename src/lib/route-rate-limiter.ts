// Shared Redis-backed rate limiter for API routes.
// Falls back to per-instance in-memory limiting when Redis is unavailable.
import type { NextRequest } from 'next/server'
import { getRedis } from './reading-cache'

export interface RateLimitConfig {
  max:        number   // max requests per window
  windowSecs: number   // window duration in seconds
  keyPrefix:  string   // Redis key prefix (must be unique per route)
}

type RateRecord = { count: number; windowStart: number }

// One fallback map per keyPrefix so different routes don't share state.
const _fallbackMaps = new Map<string, Map<string, RateRecord>>()
const MAX_FALLBACK_ENTRIES = 500

// Atomic INCR + ensure-TTL Lua script. Repairs keys that have no expiry due to
// a prior EXPIRE call being lost (e.g. after a Redis crash mid-transaction).
const _RL_SCRIPT = `
local count = redis.call('INCR', KEYS[1])
if redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[1])
end
return count
`

function getFallbackMap(prefix: string): Map<string, RateRecord> {
  let m = _fallbackMaps.get(prefix)
  if (!m) { m = new Map(); _fallbackMaps.set(prefix, m) }
  return m
}

function fallbackCheck(
  ip: string,
  { max, windowSecs, keyPrefix }: RateLimitConfig,
): { allowed: boolean; retryAfter: number } {
  const now = Date.now()
  const map = getFallbackMap(keyPrefix)
  const rec = map.get(ip)

  if (!rec || now - rec.windowStart >= windowSecs * 1000) {
    // Evict expired entries before adding a new one when the map is at capacity.
    if (!rec && map.size >= MAX_FALLBACK_ENTRIES) {
      map.forEach((v, k) => {
        if (now - v.windowStart >= windowSecs * 1000) map.delete(k)
      })
    }
    map.set(ip, { count: 1, windowStart: now })
    return { allowed: true, retryAfter: 0 }
  }

  if (rec.count >= max) {
    const retryAfter = Math.ceil((windowSecs * 1000 - (now - rec.windowStart)) / 1000)
    return { allowed: false, retryAfter }
  }
  rec.count++
  return { allowed: true, retryAfter: 0 }
}

export async function checkRateLimit(
  ip: string,
  config: RateLimitConfig,
): Promise<{ allowed: boolean; retryAfter: number }> {
  const redis = getRedis()
  if (!redis) return fallbackCheck(ip, config)
  try {
    const key   = config.keyPrefix + ip
    const count = await redis.eval(_RL_SCRIPT, [key], [String(config.windowSecs)]) as number
    if (count > config.max) {
      const ttl = await redis.ttl(key)
      return { allowed: false, retryAfter: Math.max(ttl > 0 ? ttl : config.windowSecs, 1) }
    }
    return { allowed: true, retryAfter: 0 }
  } catch {
    return fallbackCheck(ip, config)
  }
}

export function getClientIp(req: NextRequest): string {
  return req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           ?? req.headers.get('x-real-ip')
           ?? 'direct'
}
