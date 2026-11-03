// lib/env.ts
// Centralised environment-variable checks. Keeping the Anthropic key check in
// one place means the /api/reading route and the reading-quality-gate agree on
// exactly what counts as "configured", and the rule is unit-testable.

// Placeholder values that ship in the docs/examples (README.md, CLAUDE.md,
// .env.local templates). A literal copy-paste of the example is a missing key,
// not a real one — reject it so the route returns the clear "not configured"
// error instead of a confusing 401 from the Anthropic API at request time.
const PLACEHOLDER_KEYS = new Set(['your_key_here', 'your_api_key_here', 'sk-ant-xxx'])

// Returns the configured Anthropic API key, or null when it is absent, blank,
// or a leftover docs placeholder.
export function getAnthropicKey(): string | null {
  const raw = process.env.ANTHROPIC_API_KEY
  if (typeof raw !== 'string') return null
  const key = raw.trim()
  if (key.length === 0) return null
  if (PLACEHOLDER_KEYS.has(key.toLowerCase())) return null
  return key
}

// Convenience predicate for guard clauses.
export function isAnthropicKeyConfigured(): boolean {
  return getAnthropicKey() !== null
}

// Integer env var with a safe fallback. `Number(process.env.X ?? default)`
// turns a typo ("2O00", "", "20k") into NaN or 0, and both fail badly: a NaN
// rate-limit max makes `count > max` always false (the limit vanishes), and a
// NaN daily cap makes `used < cap` always false (every reading is refused).
// A value that is not a whole number >= `min` falls back to the default and
// says so once in the logs, instead of silently changing behaviour.
const _warnedEnv = new Set<string>()
export function intEnv(name: string, fallback: number, min = 0): number {
  const raw = process.env[name]
  if (raw === undefined) return fallback
  const trimmed = raw.trim()
  const n = /^\d+$/.test(trimmed) ? Number(trimmed) : NaN
  if (Number.isSafeInteger(n) && n >= min) return n
  if (!_warnedEnv.has(name)) {
    _warnedEnv.add(name)
    console.error(`[AXIS] ${name}=${JSON.stringify(raw)} is not a whole number >= ${min}; using default ${fallback}.`)
  }
  return fallback
}
