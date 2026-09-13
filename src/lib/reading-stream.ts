import Anthropic from '@anthropic-ai/sdk'

// lib/reading-stream.ts
//
// The client half of /api/reading's in-band failure protocol.
//
// A generation failure cannot be reported as an HTTP status: by the time the
// model call fails, the streaming Response has already been returned with a 200
// and its headers are long gone. So the route writes a sentinel into the stream
// body instead, and this module is the single place that reads it back.
//
// Two sentinels, and the difference is what stops a billing outage from
// becoming a stampede:
//
//   [AXIS_STREAM_ERROR: generation failed]     — transient. Retry is reasonable.
//   [AXIS_STREAM_ERROR: unavailable:<code>]    — FATAL. The account, not the
//                                                request, is the problem, so
//                                                every remaining section will
//                                                fail identically.
//
// A natal chart fans out to ~21 sections and each client retries once. Treating
// a fatal failure as retryable therefore turns ONE exhausted credit balance into
// ~42 doomed API round trips, and shows the reader "please retry" for a
// condition no retry can fix. `fatal` exists to make the caller stop the run.

export const STREAM_ERROR_PREFIX = '[AXIS_STREAM_ERROR:'

export interface StreamFailure {
  /** True when retrying cannot help: stop the run rather than trying the next section. */
  fatal: boolean
  /** Machine-readable cause: 'billing' | 'auth' | 'generation'. */
  code: string
  /** Reader-facing message. Says plainly whether retrying is worth it. */
  message: string
}

// Reader-facing copy. Deliberately honest about retry being pointless — the
// old blanket "Please retry this reading." invited the reader to hammer a wall.
// Neither fatal message names the provider or the account: the reader cannot act
// on that, and the operator has the greppable [AXIS_GEN_FAIL] server log.
const FATAL_MESSAGES: Record<string, string> = {
  billing:
    'Readings are temporarily unavailable — AXIS has run out of generation capacity. ' +
    'Your chart is fine and already calculated; retrying will not help until capacity is restored.',
  auth:
    'Readings are temporarily unavailable — AXIS cannot reach its interpretation service. ' +
    'Your chart is fine and already calculated; retrying will not help until the connection is restored.',
}

const FATAL_FALLBACK =
  'Readings are temporarily unavailable. Your chart is fine and already calculated; ' +
  'retrying will not help until the service is restored.'

/**
 * Scan a completed section body for a failure sentinel.
 * Returns null when the text carries no sentinel (i.e. generation succeeded).
 */
export function detectStreamError(text: string): StreamFailure | null {
  const at = text.indexOf(STREAM_ERROR_PREFIX)
  if (at === -1) return null

  const close = text.indexOf(']', at)
  const payload = (close === -1 ? text.slice(at + STREAM_ERROR_PREFIX.length)
                                : text.slice(at + STREAM_ERROR_PREFIX.length, close)).trim()

  if (payload.startsWith('unavailable')) {
    // 'unavailable:billing' → 'billing'. A bare 'unavailable' stays fatal with
    // the generic copy, so a future code this client has not seen still stops
    // the run instead of silently degrading to a retry loop.
    const code = payload.split(':')[1]?.trim() || 'unavailable'
    return { fatal: true, code, message: FATAL_MESSAGES[code] ?? FATAL_FALLBACK }
  }

  return { fatal: false, code: 'generation', message: 'Generation failed. Please retry this reading.' }
}

/**
 * Thrown to unwind out of the per-section loop when a fatal failure lands.
 * Carries a plain reader-facing message, so the existing outer catch in each
 * panel renders it unchanged.
 */
export class ReadingUnavailableError extends Error {
  readonly code: string
  constructor(failure: StreamFailure) {
    super(failure.message)
    this.name = 'ReadingUnavailableError'
    this.code = failure.code
  }
}

// ── Generation failure classification ──────────────────────────────────────────
// Not every generation failure is the same kind of failure, and the difference
// decides whether retrying can possibly help.
//
//   FATAL   — the account, not the request, is the problem: an exhausted credit
//             balance, a revoked or invalid key, a permission denial. Every
//             section will fail identically, so retrying is pure waste: a single
//             chart fans out to ~21 sections and the client retries each once,
//             turning one billing failure into ~42 doomed API round trips while
//             telling the reader "please retry" for something no retry can fix.
//
//   SECTION — this attempt failed (overload, timeout, a transient 5xx). Retrying
//             the same section is reasonable.
//
// Anything below 500 that is not a 429 is non-retryable by definition — the same
// request will be rejected the same way — so it never earns a second attempt.
export type GenerationFailure = { fatal: boolean; code: string }

// Anthropic reports an exhausted balance as a 400 invalid_request_error rather
// than a 402, so status alone cannot identify it; the message is the only signal.
const BILLING_MESSAGE_RE = /credit balance|purchase credits|plans & billing|billing/i

export function classifyGenerationError(err: unknown): GenerationFailure {
  const status  = err instanceof Anthropic.APIError ? err.status : undefined
  const message = err instanceof Error ? err.message : String(err)

  // Exhausted credit balance — the account is out of funds.
  if (status === 400 && BILLING_MESSAGE_RE.test(message)) return { fatal: true, code: 'billing' }
  // Explicit payment-required, if the API ever uses it for this.
  if (status === 402) return { fatal: true, code: 'billing' }
  // Missing, invalid, or revoked key; or a key without access to the model.
  if (status === 401 || status === 403) return { fatal: true, code: 'auth' }

  // Everything else is this attempt's problem, not the account's.
  return { fatal: false, code: 'generation' }
}
