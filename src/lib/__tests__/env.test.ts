import { describe, it, expect, afterEach } from 'vitest'
import { getAnthropicKey, isAnthropicKeyConfigured } from '../env'

const ORIGINAL = process.env.ANTHROPIC_API_KEY

afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ANTHROPIC_API_KEY
  else process.env.ANTHROPIC_API_KEY = ORIGINAL
})

describe('getAnthropicKey', () => {
  it('returns a real, trimmed key', () => {
    process.env.ANTHROPIC_API_KEY = '  sk-ant-real123  '
    expect(getAnthropicKey()).toBe('sk-ant-real123')
    expect(isAnthropicKeyConfigured()).toBe(true)
  })

  it('treats a missing var as unconfigured', () => {
    delete process.env.ANTHROPIC_API_KEY
    expect(getAnthropicKey()).toBeNull()
    expect(isAnthropicKeyConfigured()).toBe(false)
  })

  it('treats blank / whitespace-only values as unconfigured', () => {
    process.env.ANTHROPIC_API_KEY = ''
    expect(getAnthropicKey()).toBeNull()
    process.env.ANTHROPIC_API_KEY = '   '
    expect(getAnthropicKey()).toBeNull()
  })

  it('rejects leftover docs placeholder values', () => {
    for (const placeholder of ['your_key_here', 'YOUR_KEY_HERE', 'your_api_key_here', 'sk-ant-xxx']) {
      process.env.ANTHROPIC_API_KEY = placeholder
      expect(getAnthropicKey()).toBeNull()
      expect(isAnthropicKeyConfigured()).toBe(false)
    }
  })
})
