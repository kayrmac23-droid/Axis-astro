import { describe, it, expect } from 'vitest'
import { priceUsd, callCostMicroUsd, FALLBACK_CALL_USD, PRICES_USD_PER_MTOK } from '@/lib/model-pricing'
import { MODEL } from '@/lib/reading-model-config'
import { EVAL_MODEL } from '@/lib/reading-quality-gate'

describe('model pricing', () => {
  it('prices the models the pipeline actually calls', () => {
    // A model swap without a price would silently fall back for every call.
    expect(PRICES_USD_PER_MTOK[MODEL]).toBeDefined()
    expect(PRICES_USD_PER_MTOK[EVAL_MODEL]).toBeDefined()
  })

  it('bills cache writes at 1.25x input and cache reads at 0.1x', () => {
    const usd = priceUsd('claude-opus-5-5', { input: 1e6, cache_write: 1e6, cache_read: 1e6, output: 1e6 })
    expect(usd).toBeCloseTo(4 + 5 + 0.4 + 20, 6)
  })

  it('an unknown model has no price, and an unpriced call costs the fallback', () => {
    expect(priceUsd('some-future-model', { input: 1, cache_write: 0, cache_read: 0, output: 1 })).toBeNull()
    expect(callCostMicroUsd('some-future-model', { input_tokens: 1, output_tokens: 1 })).toBe(FALLBACK_CALL_USD * 1e6)
    expect(callCostMicroUsd(MODEL, null)).toBe(FALLBACK_CALL_USD * 1e6)
  })

  it('rounds a priced call up to a whole micro-dollar', () => {
    expect(callCostMicroUsd('claude-opus-5-5', { input_tokens: 1, output_tokens: 0 })).toBe(4)
  })
})
