// lib/usage-log.ts
// One greppable line per Anthropic call /api/reading makes — the generation and
// every gate call after it — carrying the token counts the API itself returns.
// This is the only production record of what a reading actually costs, and the
// only way to see whether prompt caching is landing: a section after the first
// should show a large cache_read and a small uncached `in`. Grep `[AXIS_USAGE]`.
import type Anthropic from '@anthropic-ai/sdk'

export type ModelCallKind = 'generate' | 'evaluate' | 'recheck' | 'repair' | 'doctrine-repair'

// Pure, so the line format is testable. Returns null when the response carried
// no usage (a mocked SDK, or a malformed response) — nothing is logged then.
export function formatUsageLine(
  label: string,
  call: ModelCallKind,
  model: string,
  usage: Anthropic.Usage | null | undefined,
  extra: Record<string, string | number> = {},
): string | null {
  if (!usage) return null
  const fields: Record<string, string | number> = {
    section:     label,
    call,
    model,
    in:          usage.input_tokens ?? 0,
    cache_read:  usage.cache_read_input_tokens ?? 0,
    cache_write: usage.cache_creation_input_tokens ?? 0,
    out:         usage.output_tokens ?? 0,
    ...extra,
  }
  return `[AXIS_USAGE] ${Object.entries(fields).map(([k, v]) => `${k}=${v}`).join(' ')}`
}

export function logUsage(
  label: string,
  call: ModelCallKind,
  model: string,
  usage: Anthropic.Usage | null | undefined,
  extra: Record<string, string | number> = {},
): void {
  const line = formatUsageLine(label, call, model, usage, extra)
  if (line) console.log(line)
}
