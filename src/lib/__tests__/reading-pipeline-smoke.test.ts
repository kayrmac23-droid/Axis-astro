// Live smoke test for the reading pipeline — the one test in this suite that
// makes a REAL call to the Anthropic API using the EXACT request shape
// /api/reading sends in production (model, thinking config, cached system
// blocks, a real computed chart context).
//
// Why this exists: every other test touching generation mocks the Anthropic
// SDK (see gate-for-cache.test.ts, reading-stream.test.ts). A mock cannot catch
// the live API rejecting the request itself — which is exactly what happened
// when Sonnet 5 / Opus 5 removed the `temperature` sampling param: every
// generation 400'd in production while the full mocked suite stayed green. This
// test exists to catch that class of regression before merge, not after.
//
// It is SKIPPED by default — real spend, real network, real latency, none of
// which belong in the default `npm test` run or in ordinary CI pushes. Run it
// deliberately with:
//
//   AXIS_LIVE_SMOKE=1 npm run test:smoke
//
// which requires a real (non-placeholder) ANTHROPIC_API_KEY in the environment.
// Both gates must be true — the explicit opt-in AND a configured key — so a
// developer with a real key exported in their shell does not silently spend
// money on every ordinary `npm test`.
import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { calculateDualChart, BirthData } from '@/lib/astro-calc'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { SHARED_RULES, TROPICAL_SYSTEM_PROMPT, SECTION_INSTRUCTIONS } from '@/lib/prompts'
import { MODEL, THINKING, MAX_TOKENS_PER_SECTION } from '@/lib/reading-model-config'
import { isAnthropicKeyConfigured } from '@/lib/env'

const LIVE = process.env.AXIS_LIVE_SMOKE === '1' && isAnthropicKeyConfigured()

const FIXED_BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: 51.5074, longitude: -0.1278, timezone: 1,
}

describe.skipIf(!LIVE)('reading pipeline — live smoke test (real Anthropic call)', () => {
  // key_aspects carries the smallest token budget of any tropical section
  // (1200 vs. up to 2500 elsewhere), keeping the one billable call in this
  // suite as cheap as it can be while still exercising the real config.
  it(
    'the production request shape (model, thinking, cached system blocks) is accepted by the live API',
    async () => {
      const anthropic = new Anthropic()

      const dual        = calculateDualChart(FIXED_BIRTH)
      const chartBlock   = formatEliteChartBlock(dual.tropical, 'tropical')
      const ctxBlock     = buildInterpretationContext(dual, 'tropical', 'key_aspects')
      const instruction  = SECTION_INSTRUCTIONS.tropical.key_aspects
      const userContent  = `${chartBlock}\n${ctxBlock}\n\n---\n\n${instruction}`

      const systemBlocks: Anthropic.TextBlockParam[] = [
        { type: 'text', text: SHARED_RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: TROPICAL_SYSTEM_PROMPT, cache_control: { type: 'ephemeral' } },
      ]

      const message = await anthropic.messages.create({
        model:      MODEL,
        max_tokens: MAX_TOKENS_PER_SECTION.key_aspects,
        thinking:   THINKING,
        system:     systemBlocks,
        messages:   [{ role: 'user', content: userContent }],
      })

      // A request-shape rejection (unsupported param, bad model id, malformed
      // block) throws before any of this — reaching here already proves the
      // call was accepted. These assertions catch a degenerate "succeeded but
      // useless" response: an empty completion or an immediate max_tokens cutoff
      // on a 1200-token budget would both indicate something upstream is broken.
      expect(message.stop_reason).not.toBeNull()
      const text = message.content
        .filter((b): b is Anthropic.TextBlock => b.type === 'text')
        .map((b) => b.text)
        .join('')
      expect(text.length).toBeGreaterThan(50)

      console.log(
        `[AXIS_SMOKE] model=${MODEL} stop_reason=${message.stop_reason} ` +
        `input_tokens=${message.usage.input_tokens} output_tokens=${message.usage.output_tokens} ` +
        `cache_read=${message.usage.cache_read_input_tokens ?? 0} cache_creation=${message.usage.cache_creation_input_tokens ?? 0}`
      )
    },
    60_000
  )
})
