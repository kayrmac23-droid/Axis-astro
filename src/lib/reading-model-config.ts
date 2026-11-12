// lib/reading-model-config.ts
// The exact generation request shape /api/reading sends to Anthropic. Pulled out
// of the route so the live smoke test (reading-pipeline-smoke.test.ts) imports the
// SAME constants production uses instead of a hand-copied guess that can drift —
// a smoke test asserting against stale config would pass while production 400s,
// which is exactly the failure mode it exists to catch.
import Anthropic from '@anthropic-ai/sdk'

// v10.51: generation, repair and doctrine-repair run on Opus 5.5 with thinking.
// The first-pass failures measured on v10.50 (Chicago, 2026-11-12) were voice and
// synthesis — judgment, not rule-following — which is what the larger model and
// reasoning are for. See docs/PIPELINE-HISTORY.md.
export const MODEL = 'claude-opus-5-5'

// Sampling params (temperature/top_p/top_k) are REMOVED on current models —
// sending `temperature` returns a 400. Do not re-add one.
//
// Thinking cannot be disabled on Opus 5.5: `{type:'disabled'}` and `budget_tokens`
// are both a 400 at every effort level. Adaptive is the only legal shape. Depth is
// set with EFFORT, not with prompt text — "don't deliberate" lines do nothing.
export const THINKING: Anthropic.ThinkingConfigParam = { type: 'adaptive' }

// Opus 5.5 defaults to `medium` (one below Opus 5's `high`), so it is set
// explicitly. Effort barely changes reply LENGTH — length is the prompt's job
// (SECTION_WORD_BANDS) — it changes how much the model reasons first, which is
// first-token latency on a streamed section.
export const EFFORT: Anthropic.OutputConfig['effort'] = 'medium'
export const OUTPUT_CONFIG: Anthropic.OutputConfig = { effort: EFFORT }

// Thinking tokens bill as output and count against max_tokens. The prose budgets
// below are sized for the prose alone; the headroom is added on top so a long
// think cannot truncate the section (a truncated section is never cached).
export const THINKING_HEADROOM_TOKENS = 8000

// Per-section PROSE budgets. Keyed by planetSection; overlapping names
// (sun, moon, mercury, venus, mars, jupiter_saturn) apply to both tropical
// and sidereal readings. Falls back to DEFAULT_PROSE_TOKENS for any unlisted key.
const PROSE_TOKENS_PER_SECTION: Record<string, number> = {
  // Tropical + sidereal primaries
  sun: 3200, moon: 3200, ascendant: 2800, lagna: 2500,
  // Secondaries (shared names across systems)
  mercury: 2000, venus: 2000, mars: 2000,
  jupiter_saturn: 2200, rahu_ketu: 1900,
  key_aspects: 1500,
  // The Divergence (legacy 'synthesis' key)
  agree: 2800, diverge: 3200, tension: 2100, closing: 2200,
  // Synastry
  luminaries: 2500, venus_mars: 1800, outer_planets: 1800, composite_chart: 2000, central_dynamic: 2000, navigation: 2000,
}
const DEFAULT_PROSE_TOKENS = 2000

// What is actually sent as max_tokens: prose budget + thinking headroom.
export const MAX_TOKENS_PER_SECTION: Record<string, number> = Object.fromEntries(
  Object.entries(PROSE_TOKENS_PER_SECTION).map(([k, v]) => [k, v + THINKING_HEADROOM_TOKENS]),
)
export const DEFAULT_MAX_TOKENS = DEFAULT_PROSE_TOKENS + THINKING_HEADROOM_TOKENS

export function maxTokensFor(planetSection: string): number {
  return MAX_TOKENS_PER_SECTION[planetSection] ?? DEFAULT_MAX_TOKENS
}
