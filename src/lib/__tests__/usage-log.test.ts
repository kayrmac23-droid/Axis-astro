import { describe, it, expect } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'
import { formatUsageLine } from '@/lib/usage-log'

const usage = (u: Partial<Anthropic.Usage>) => u as Anthropic.Usage

describe('formatUsageLine', () => {
  it('renders every token count the API returns, in a fixed greppable order', () => {
    const line = formatUsageLine('tropical/moon', 'evaluate', 'claude-opus-5', usage({
      input_tokens: 812, cache_read_input_tokens: 9_400, cache_creation_input_tokens: 650, output_tokens: 240,
    }), { stop: 'end_turn' })
    expect(line).toBe(
      '[AXIS_USAGE] section=tropical/moon call=evaluate model=claude-opus-5 in=812 cache_read=9400 cache_write=650 out=240 stop=end_turn',
    )
  })

  it('reports a missing cache count as 0 rather than "null"', () => {
    const line = formatUsageLine('sidereal/sun', 'generate', 'claude-sonnet-5', usage({
      input_tokens: 3_000, output_tokens: 900, cache_read_input_tokens: null, cache_creation_input_tokens: null,
    }))
    expect(line).toContain('cache_read=0 cache_write=0')
  })

  it('logs nothing when the response carried no usage', () => {
    expect(formatUsageLine('tropical/sun', 'repair', 'claude-sonnet-5', undefined)).toBeNull()
  })
})
