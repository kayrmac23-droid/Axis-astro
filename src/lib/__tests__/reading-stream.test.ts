import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import {
  detectStreamError,
  classifyGenerationError,
  ReadingUnavailableError,
} from '@/lib/reading-stream'

// The exact wire payload Anthropic returns for an exhausted balance. This is the
// failure that took every AXIS reading down: a 400 invalid_request_error, NOT a
// 402 — which is why the classifier has to read the message, not just the status.
const BILLING_MESSAGE =
  '400 {"type":"error","error":{"type":"invalid_request_error","message":"Your credit balance is too low to access the Anthropic API. Please go to Plans & Billing to upgrade or purchase credits."}}'

function apiError(status: number, message: string) {
  return new Anthropic.APIError(status, undefined, message, undefined)
}

describe('classifyGenerationError', () => {
  it('treats an exhausted credit balance (400) as fatal', () => {
    expect(classifyGenerationError(apiError(400, BILLING_MESSAGE)))
      .toEqual({ fatal: true, code: 'billing' })
  })

  it('treats 402 as fatal billing', () => {
    expect(classifyGenerationError(apiError(402, 'Payment Required')).fatal).toBe(true)
  })

  it('treats 401 and 403 as fatal auth', () => {
    expect(classifyGenerationError(apiError(401, 'invalid x-api-key')))
      .toEqual({ fatal: true, code: 'auth' })
    expect(classifyGenerationError(apiError(403, 'Forbidden')))
      .toEqual({ fatal: true, code: 'auth' })
  })

  it('does NOT mark retryable failures fatal', () => {
    expect(classifyGenerationError(apiError(429, 'rate_limit_error')).fatal).toBe(false)
    expect(classifyGenerationError(apiError(500, 'api_error')).fatal).toBe(false)
    expect(classifyGenerationError(apiError(529, 'overloaded_error')).fatal).toBe(false)
    expect(classifyGenerationError(new Error('socket hang up')).fatal).toBe(false)
    expect(classifyGenerationError('weird').fatal).toBe(false)
  })

  it('does not mark an ordinary 400 fatal — only a billing one', () => {
    expect(classifyGenerationError(apiError(400, 'max_tokens: must be >= 1')).fatal).toBe(false)
  })
})

describe('detectStreamError', () => {
  it('returns null for clean prose', () => {
    expect(detectStreamError('## The Sun\n\nYou run hot.')).toBeNull()
  })

  it('reads the transient sentinel as retryable', () => {
    const f = detectStreamError('some prose\n\n[AXIS_STREAM_ERROR: generation failed]')!
    expect(f.fatal).toBe(false)
    expect(f.message).toMatch(/retry/i)
  })

  it('reads the fatal sentinel and names the cause', () => {
    const f = detectStreamError('\n\n[AXIS_STREAM_ERROR: unavailable:billing]')!
    expect(f.fatal).toBe(true)
    expect(f.code).toBe('billing')
    // The whole point: it must NOT tell the reader to retry.
    expect(f.message).toMatch(/will not help/i)
  })

  it('handles the auth cause', () => {
    const f = detectStreamError('[AXIS_STREAM_ERROR: unavailable:auth]')!
    expect(f).toMatchObject({ fatal: true, code: 'auth' })
  })

  it('stays fatal for an unknown future cause', () => {
    const f = detectStreamError('[AXIS_STREAM_ERROR: unavailable:quantum_flux]')!
    expect(f.fatal).toBe(true)
    expect(f.message).toMatch(/will not help/i)
  })

  it('stays fatal for a bare unavailable with no cause', () => {
    expect(detectStreamError('[AXIS_STREAM_ERROR: unavailable]')!.fatal).toBe(true)
  })

  it('does not mistake prose that merely mentions the marker mid-stream', () => {
    // Sentinel is always appended at the end; a partial one without a closing
    // bracket must still be caught rather than silently shown to the reader.
    expect(detectStreamError('text [AXIS_STREAM_ERROR: unavailable:billing')!.fatal).toBe(true)
  })
})

describe('server → client protocol round trip', () => {
  // Proves the two halves cannot drift: what the route writes for a given error
  // is what the client reads back as fatal.
  it('an exhausted balance ends as a fatal, non-retryable client failure', () => {
    const { fatal, code } = classifyGenerationError(apiError(400, BILLING_MESSAGE))
    const wire = fatal
      ? `\n\n[AXIS_STREAM_ERROR: unavailable:${code}]`
      : '\n\n[AXIS_STREAM_ERROR: generation failed]'

    const seen = detectStreamError(wire)!
    expect(seen.fatal).toBe(true)
    expect(seen.code).toBe('billing')
    expect(new ReadingUnavailableError(seen).message).toBe(seen.message)
  })

  it('an overload ends as a retryable client failure', () => {
    const { fatal, code } = classifyGenerationError(apiError(529, 'overloaded_error'))
    const wire = fatal
      ? `\n\n[AXIS_STREAM_ERROR: unavailable:${code}]`
      : '\n\n[AXIS_STREAM_ERROR: generation failed]'
    expect(detectStreamError(wire)!.fatal).toBe(false)
  })
})
