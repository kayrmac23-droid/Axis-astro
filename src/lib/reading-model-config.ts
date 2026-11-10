// lib/reading-model-config.ts
// The exact generation request shape /api/reading sends to Anthropic. Pulled out
// of the route so the live smoke test (reading-pipeline-smoke.test.ts) imports the
// SAME constants production uses instead of a hand-copied guess that can drift —
// a smoke test asserting against stale config would pass while production 400s,
// which is exactly the failure mode it exists to catch.
import Anthropic from '@anthropic-ai/sdk'

export const MODEL = 'claude-sonnet-5'

// Sampling params (temperature/top_p/top_k) are REMOVED on Sonnet 5 / Opus 5 —
// sending `temperature` returns a 400 invalid_request_error and fails the whole
// generation. There is no temperature knob on these models; do not re-add one.
//
// Thinking is disabled explicitly: on Sonnet 5, omitting `thinking` runs adaptive
// thinking, whose tokens count against `max_tokens` (truncating the per-section
// prose budget) and add first-token latency to every one of the ~21 sequential
// sections. The prior generator (sonnet-4-6) ran with no thinking; we keep that.
export const THINKING: Anthropic.ThinkingConfigParam = { type: 'disabled' }

// Per-section token budgets. Keyed by planetSection; overlapping names
// (sun, moon, mercury, venus, mars, jupiter_saturn) apply to both tropical
// and sidereal readings. Falls back to 2000 for any unlisted key.
export const MAX_TOKENS_PER_SECTION: Record<string, number> = {
  // Tropical + sidereal primaries
  sun: 2500, moon: 2500, ascendant: 2500, lagna: 2000,
  // Secondaries (shared names across systems)
  mercury: 1500, venus: 1500, mars: 1500,
  jupiter_saturn: 1800, rahu_ketu: 1500,
  key_aspects: 1200,
  // The Divergence (legacy 'synthesis' key)
  agree: 2500, diverge: 2500, tension: 1800, closing: 2000,
  // Synastry
  luminaries: 2500, venus_mars: 1800, outer_planets: 1800, composite_chart: 2000, central_dynamic: 2000, navigation: 2000,
}
