// lib/model-pricing.ts
// List prices, USD per million tokens (Anthropic first-party API, 2026-10), and
// the one function that turns a call's usage into dollars. Shared by the eval
// harness (run summaries) and the live route (the daily dollar ceiling), so the
// two cannot price the same call differently.
//
// Every cache_control in the pipeline is the default 5-minute ephemeral
// breakpoint: cache writes bill at 1.25× input, cache reads at 0.1× input.
// A model missing from the table prices as null, never as a guess — add it here.
export const PRICES_USD_PER_MTOK: Record<string, { input: number; output: number }> = {
  'claude-sonnet-5':   { input: 2, output: 10 },
  'claude-opus-5-5':   { input: 4, output: 20 },  // generator
  'claude-sonnet-5-5': { input: 2, output: 10 },  // offline evaluator
  'claude-opus-5':     { input: 5, output: 25 },  // kept so an older run still prices
}

export interface TokenUsage { input: number; cache_read: number; cache_write: number; output: number }

export function priceUsd(model: string, u: TokenUsage): number | null {
  const p = PRICES_USD_PER_MTOK[model]
  if (!p) return null
  return (u.input * p.input + u.cache_write * p.input * 1.25 + u.cache_read * p.input * 0.1 + u.output * p.output) / 1e6
}

// What one generation call costs when the API returned no usage to price (it
// threw, or the model is not in the table). Deliberately above the measured
// mean ($0.085 per Opus 5.5 call, Chicago 2026-11-12) so an unpriced call
// over-counts against the ceiling instead of slipping under it.
export const FALLBACK_CALL_USD = 0.15

// The API's usage object → whole micro-dollars, for an integer Redis counter.
export function callCostMicroUsd(
  model: string,
  usage: { input_tokens?: number | null; cache_read_input_tokens?: number | null; cache_creation_input_tokens?: number | null; output_tokens?: number | null } | null | undefined,
): number {
  const usd = usage
    ? priceUsd(model, {
        input:       usage.input_tokens ?? 0,
        cache_read:  usage.cache_read_input_tokens ?? 0,
        cache_write: usage.cache_creation_input_tokens ?? 0,
        output:      usage.output_tokens ?? 0,
      })
    : null
  return Math.ceil((usd ?? FALLBACK_CALL_USD) * 1e6)
}
