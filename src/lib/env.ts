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
