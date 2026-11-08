// Shared Redis-backed rate limiter for API routes.
// Falls back to per-instance in-memory limiting when Redis is unavailable.
import type { NextRequest } from 'next/server'
import { getRedis } from './reading-cache'
import { intEnv } from './env'

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
    // If every entry is still live, drop the oldest (Map preserves insertion
    // order) — otherwise rotating IPs during a Redis outage grow this unbounded.
    if (!rec && map.size >= MAX_FALLBACK_ENTRIES) {
      map.forEach((v, k) => {
        if (now - v.windowStart >= windowSecs * 1000) map.delete(k)
      })
      if (map.size >= MAX_FALLBACK_ENTRIES) {
        const oldestKey = map.keys().next().value
        if (oldestKey !== undefined) map.delete(oldestKey)
      }
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

// Resolve the client IP for per-IP rate limiting.
//
// `x-vercel-forwarded-for` is set by Vercel's edge and cannot be supplied by the
// client, so it is preferred when present.
//
// SECURITY ASSUMPTION: the fallback trusts the first `x-forwarded-for` entry, which is
// only safe when the app runs behind a trusted proxy that SETS this header and
// strips any client-supplied value — which is the case on Vercel (the production
// target). If AXIS is ever deployed behind a proxy that forwards a client-supplied
// XFF, an attacker could spoof it to get a fresh rate-limit bucket per request and
// defeat the limiter. Revisit this (e.g. use the platform's connecting-IP header)
// before any such deployment. The `'direct'` fallback buckets header-less requests
// together, which is acceptable.
export function getClientIp(req: NextRequest): string {
  const raw = req.headers.get('x-vercel-forwarded-for')?.split(',')[0].trim()
           || req.headers.get('x-forwarded-for')?.split(',')[0].trim()
           || req.headers.get('x-real-ip')
           || 'direct'
  return clientBucket(raw)
}

// The unit a limit is applied to. IPv4 is one address. IPv6 is bucketed by its
// /64 prefix: an ordinary allocation hands a single subscriber at least a /64
// (2^64 addresses), so keying on the full address gave anyone with IPv6 a fresh
// rate-limit bucket per request — every per-IP limit in this file was then
// decorative for them. An IPv4-mapped IPv6 address (::ffff:1.2.3.4) is treated
// as the IPv4 address it carries. Anything unparseable is returned unchanged.
export function clientBucket(ip: string): string {
  if (!ip.includes(':')) return ip
  let addr = ip.replace(/^\[|\](:\d+)?$/g, '').split('%')[0].toLowerCase()
  const mapped = addr.match(/^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/)
  if (mapped) return mapped[1]
  // An embedded dotted quad occupies the last two hextets.
  addr = addr.replace(/(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/, (_, a, b, c, d) =>
    `${((+a << 8) | +b).toString(16)}:${((+c << 8) | +d).toString(16)}`)
  const halves = addr.split('::')
  if (halves.length > 2) return ip
  const head = halves[0] ? halves[0].split(':') : []
  const tail = halves.length === 2 && halves[1] ? halves[1].split(':') : []
  const fill = halves.length === 2 ? 8 - head.length - tail.length : 0
  if (fill < 0) return ip
  const groups = [...head, ...Array(fill).fill('0'), ...tail]
  if (groups.length !== 8 || !groups.every(g => /^[0-9a-f]{1,4}$/.test(g))) return ip
  return groups.slice(0, 4).map(g => g.replace(/^0+(?=.)/, '')).join(':') + '::/64'
}

// ── Global daily spend cap ───────────────────────────────────────────────────
// Atomically counts AI-backed reading calls per calendar day (Australia/
// Melbourne) across all instances via a single Redis key. Guards against a
// runaway spend event. Fails open: when Redis is unconfigured or errors, calls
// are allowed so a Redis outage never takes readings down globally.
const DEFAULT_DAILY_CAP = 2000
const BUDGET_TTL_SECS    = 48 * 60 * 60  // 48h — comfortably outlives one day

// Atomic INCRBY + ensure-TTL Lua script for the daily budget key. Mirrors the
// TTL-repair guard in _RL_SCRIPT but adds an explicit amount (ARGV[1]) so a
// single request can record the true number of model calls it made.
const _BUDGET_INCRBY_SCRIPT = `
local count = redis.call('INCRBY', KEYS[1], ARGV[1])
if redis.call('TTL', KEYS[1]) == -1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return count
`

// The calendar day every daily counter is keyed on: Australia/Melbourne, and
// separated per deployment environment so preview traffic never spends
// production's allowance.
function dayStamp(): string {
  const env  = process.env.VERCEL_ENV ?? 'local'
  const date = new Intl.DateTimeFormat('en-CA', { timeZone: 'Australia/Melbourne' }).format(new Date())
  return `${env}:${date}`
}

function budgetKey(): string {
  return `axis:budget:${dayStamp()}`
}

// Read-only preflight: reports the current daily count without incrementing.
// `allowed` uses `used < cap` (strict) because the caller is about to add calls;
// fails open exactly like the recorder — a Redis outage never takes readings
// down globally.
export async function readGlobalDailyBudget(): Promise<{ allowed: boolean; used: number; cap: number }> {
  const cap = intEnv('AXIS_DAILY_READING_CALL_CAP', DEFAULT_DAILY_CAP)

  const redis = getRedis()
  if (!redis) return { allowed: true, used: 0, cap }

  try {
    const raw  = await redis.get<string | number | null>(budgetKey())
    const used = Number(raw ?? 0)
    return { allowed: used < cap, used, cap }
  } catch {
    return { allowed: true, used: 0, cap }
  }
}

// Explicit recorder: increments the daily budget key by the actual number of
// model calls a request made. Fails silently — a spend-recording failure must
// never break a reading, so no error surfaces into the request path.
export async function recordModelCalls(n: number): Promise<void> {
  if (!Number.isFinite(n) || n <= 0) return

  const redis = getRedis()
  if (!redis) return

  try {
    await redis.eval(_BUDGET_INCRBY_SCRIPT, [budgetKey()], [String(n), String(BUDGET_TTL_SECS)])
  } catch {
    // Spend recording is best-effort; never throw into the request path.
  }
}

// ── Daily quotas ─────────────────────────────────────────────────────────────
// The global cap above is a SITE-WIDE kill switch: when it trips, every reader
// is refused for the rest of the day. With only a per-minute limit in front of
// it, one script looping over random birth data (each chart uncached) reached
// it from a single IP in about 25 minutes. A daily quota per IP and per chart
// bounds what any one source can take out of the shared allowance.
//
// Counted per uncached, model-calling request (cache hits never reach here).
// INCR-then-compare, so a refused request is counted too — a source that keeps
// hammering after its quota stays refused. Fails open when Redis is absent or
// errors, exactly like the global cap: a Redis outage must not take readings
// down. When Redis is absent, quotas are per-instance memory, bounded.
const QUOTA_TTL_SECS = 48 * 60 * 60
const _quotaFallback = new Map<string, number>()
const MAX_QUOTA_FALLBACK_ENTRIES = 2000

export async function consumeDailyQuota(
  name: string, id: string, max: number,
): Promise<{ allowed: boolean; used: number; max: number }> {
  const key = `axis:quota:${name}:${dayStamp()}:${id}`
  const redis = getRedis()
  if (!redis) {
    if (!_quotaFallback.has(key) && _quotaFallback.size >= MAX_QUOTA_FALLBACK_ENTRIES) {
      const oldest = _quotaFallback.keys().next().value
      if (oldest !== undefined) _quotaFallback.delete(oldest)
    }
    const used = (_quotaFallback.get(key) ?? 0) + 1
    _quotaFallback.set(key, used)
    return { allowed: used <= max, used, max }
  }
  try {
    const used = await redis.eval(_RL_SCRIPT, [key], [String(QUOTA_TTL_SECS)]) as number
    return { allowed: used <= max, used, max }
  } catch {
    return { allowed: true, used: 0, max }
  }
}

// Test hook — the fallback store is module state.
export function _resetQuotaMemoryForTests(): void {
  _quotaFallback.clear()
}
