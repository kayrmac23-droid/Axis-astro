import { describe, it, expect, afterEach } from 'vitest'
import { getAnthropicKey, isAnthropicKeyConfigured, intEnv } from '../env'

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

describe('intEnv', () => {
  const NAME = 'AXIS_TEST_INT_ENV'
  afterEach(() => { delete process.env[NAME] })

  it('returns the default when unset', () => {
    expect(intEnv(NAME, 20, 1)).toBe(20)
  })

  it('parses a whole number, tolerating surrounding whitespace', () => {
    process.env[NAME] = ' 35 '
    expect(intEnv(NAME, 20, 1)).toBe(35)
  })

  it.each(['', 'abc', '2O00', '20k', '1.5', '-3', '1e3'])(
    'falls back on %j instead of producing NaN or 0',
    raw => {
      // NaN as a rate-limit max disabled the limit; NaN as the daily cap
      // refused every reading. Neither may come from a typo.
      process.env[NAME] = raw
      expect(intEnv(NAME, 20, 1)).toBe(20)
    },
  )

  it('enforces the minimum', () => {
    process.env[NAME] = '0'
    expect(intEnv(NAME, 20, 1)).toBe(20)
    expect(intEnv(NAME, 2000, 0)).toBe(0)
  })
})
