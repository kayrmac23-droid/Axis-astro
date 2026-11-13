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
  /** Machine-readable cause: 'billing' | 'auth' | 'configuration' | 'generation'. */
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
  configuration:
    'Readings are temporarily unavailable — AXIS cannot complete the interpretation request. ' +
    'Your chart is fine and already calculated; retrying will not help until the service is restored.',
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

  // The model declined to write the section (stop_reason "refusal"). Whatever
  // partial text preceded the sentinel is discarded by the caller, exactly as
  // for any other failed section; a second attempt is a fresh sample and fair.
  if (payload === 'refused') {
    return { fatal: false, code: 'refused', message: 'This section could not be written this time. Please retry it.' }
  }

  return { fatal: false, code: 'generation', message: 'Generation failed. Please retry this reading.' }
}

/**
 * The model ended its turn with stop_reason "refusal". Thrown by every call
 * site that reads a model reply, so a refusal — which can arrive with partial
 * or boilerplate text attached — is never served as prose, threaded, cached,
 * scored or spliced into a repair.
 */
export class ModelRefusalError extends Error {
  constructor(label = 'model') {
    super(`${label}: the model refused (stop_reason=refusal)`)
    this.name = 'ModelRefusalError'
  }
}

export function assertNotRefusal(stopReason: string | null | undefined, label?: string): void {
  if (stopReason === 'refusal') throw new ModelRefusalError(label)
}

/** The in-band marker for one failed generation attempt. */
export function streamErrorSentinel(f: GenerationFailure): string {
  if (f.fatal) return `\n\n[AXIS_STREAM_ERROR: unavailable:${f.code}]`
  // The historic wording is kept verbatim for the transient case so an older
  // client still behaves exactly as before.
  return f.code === 'refused' ? '\n\n[AXIS_STREAM_ERROR: refused]' : '\n\n[AXIS_STREAM_ERROR: generation failed]'
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
  if (err instanceof ModelRefusalError) return { fatal: false, code: 'refused' }
  const status  = err instanceof Anthropic.APIError ? err.status : undefined
  const message = err instanceof Error ? err.message : String(err)

  // Exhausted credit balance — the account is out of funds.
  if (status === 400 && BILLING_MESSAGE_RE.test(message)) return { fatal: true, code: 'billing' }
  // Explicit payment-required, if the API ever uses it for this.
  if (status === 402) return { fatal: true, code: 'billing' }
  // Missing, invalid, or revoked key; or a key without access to the model.
  if (status === 401 || status === 403) return { fatal: true, code: 'auth' }
  // Any other non-429 4xx is a deterministic request-shape rejection: a bad
  // model choice, an unsupported/removed parameter (e.g. `temperature` on
  // Sonnet 5 / Opus 5), a malformed body. Replaying the same section cannot
  // change the outcome, so treat it as fatal and stop the ~21-section fan-out
  // rather than spending ~42 doomed retries. This is the defence-in-depth that
  // would have contained the temperature-400 outage instead of amplifying it.
  if (status !== undefined && status >= 400 && status < 500 && status !== 429) {
    return { fatal: true, code: 'configuration' }
  }

  // Rate limits, 5xx, network, and unknown failures may clear — retry is fair.
  return { fatal: false, code: 'generation' }
}

// ── Client retry policy for a non-OK /api/reading response ─────────────────────
// A 429 is retried only after the server's Retry-After (capped, so a reader is
// never left staring at a frozen section); retrying it at once is guaranteed to
// hit the limit again. A 5xx may clear. Every other status — a 4xx validation
// rejection, or a 503 from the kill switch or the daily cap — is the same
// answer on a second attempt, so it is not retried.
export const MAX_RETRY_WAIT_MS = 15_000

export function retryDelayForStatus(status: number, retryAfter: string | null): number | null {
  if (status === 429) {
    const secs = Number(retryAfter)
    return Math.min(MAX_RETRY_WAIT_MS, Number.isFinite(secs) && secs > 0 ? secs * 1000 : 5000)
  }
  if (status >= 500 && status !== 503) return 1500
  return null
}

/**
 * A refused request that no retry can fix TODAY: the server marks a daily quota
 * (`X-Axis-Quota: chart | ip`, 429) or the site-wide daily cap (`global`, 503).
 * Without this the panels treated a 429 as a short rate limit — waiting and
 * retrying it — and then marched on through every remaining section, each one
 * refused in turn. Returns a fatal failure carrying the server's own message so
 * the run unwinds once, or null for any response that is not a quota refusal.
 */
export function quotaFailure(status: number, quotaHeader: string | null, serverMessage?: string): StreamFailure | null {
  if (!quotaHeader || (status !== 429 && status !== 503)) return null
  const fallback = quotaHeader === 'global'
    ? "AXIS has reached today's reading limit. Anything already generated is saved — please come back tomorrow."
    : "You've reached today's reading limit. Anything already generated is saved — please come back tomorrow."
  return {
    fatal: true,
    code: `quota-${quotaHeader}`,
    message: typeof serverMessage === 'string' && serverMessage && serverMessage !== 'DAILY_QUOTA' ? serverMessage : fallback,
  }
}
