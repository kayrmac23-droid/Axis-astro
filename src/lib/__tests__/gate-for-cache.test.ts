// Orchestration tests for gateForCache — the evaluate-and-recache path that
// /api/reading runs after the response stream closes.
//
// These are the tests the gate did not have while it was off the request path:
// the pure scoring helpers were well covered, but nothing exercised the decision
// the route actually depends on — what gets cached, what does not, and how many
// billable calls each outcome costs. The Anthropic SDK is mocked here (in its own
// file so the mock cannot leak into the rest of the gate suite).
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Anthropic from '@anthropic-ai/sdk'

const create = vi.hoisted(() => vi.fn())
vi.mock('@anthropic-ai/sdk', () => ({
  default: class MockAnthropic {
    messages = { create }
  },
}))

import { gateForCache, detectBannedPhrasings } from '../reading-quality-gate'
import { BANNED_RESCUE_PHRASINGS, wordBandFor } from '../prompts'

// A section long enough to sit inside the tropical/sun word band, so the
// deterministic `length` criterion is not what decides these tests.
function sectionOfWords(n: number): string {
  return '## The Sun\n\n' + Array.from({ length: n }, (_, i) => `word${i}`).join(' ') + '.'
}

const IN_BAND_WORDS = wordBandFor('tropical', 'sun', 0).fullMin + 20
const GOOD_SECTION  = sectionOfWords(IN_BAND_WORDS)

// An evaluator reply with every LLM criterion at `v`.
function evalReply(v: number, critique = '', extra: Record<string, unknown> = {}) {
  const scores = {
    chart_evidence: v, specificity: v, synthesis: v, contradiction_handling: v,
    anti_cliche: v, psychological_depth: v, practical_usefulness: v,
    voice_quality: v, falsifiability: v,
  }
  return {
    content: [{
      type: 'text',
      text: JSON.stringify({ scores, pass: v >= 4, critique, ...extra }),
    }],
  }
}

function textReply(text: string) {
  return { content: [{ type: 'text', text }] }
}

const BASE = {
  chartContext:  'TROPICAL CHART\nSun: Leo 14°22\' · House 4 · Domicile ✓ · direct',
  section:       'tropical',
  planetSection: 'sun',
  systemBlocks:  [{ type: 'text' as const, text: 'SYSTEM' }] as Anthropic.TextBlockParam[],
  maxTokens:     2500,
  model:         'claude-sonnet-4-6',
  truncated:     false,
}

// `startedAt` far enough in the past to trip a wall-clock guard.
const LONG_AGO = () => Date.now() - 100_000
const JUST_NOW = () => Date.now()

beforeEach(() => {
  create.mockReset()
  delete process.env.AXIS_GATE_ENABLED
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'warn').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe('gateForCache — nothing is spent on output that can never be cached', () => {
  it('refuses a truncated section on the stop_reason flag alone, with no model call', async () => {
    // The flag is authoritative: this text ends on a full stop, so the
    // end-of-prose heuristic would have passed it.
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, truncated: true, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('truncated-or-empty')
    expect(r.modelCalls).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses a section that ends mid-sentence even when stop_reason was clean', async () => {
    const r = await gateForCache({ ...BASE, firstPassText: '## The Sun\n\nThe drive here is', startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.modelCalls).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('refuses empty output', async () => {
    const r = await gateForCache({ ...BASE, firstPassText: '   ', startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.modelCalls).toBe(0)
  })
})

describe('gateForCache — kill switch and wall-clock guards fall back to pre-gate behaviour', () => {
  it('caches a clean first pass without gating when AXIS_GATE_ENABLED=false', async () => {
    process.env.AXIS_GATE_ENABLED = 'false'
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(GOOD_SECTION)
    expect(r.reason).toBe('gate-disabled')
    expect(r.modelCalls).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })

  it('still refuses to cache doctrine-breaching text when the gate is disabled', async () => {
    process.env.AXIS_GATE_ENABLED = 'false'
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toContain('doctrine-hit')
    expect(create).not.toHaveBeenCalled()
  })

  it('skips the eval entirely when the request has already burned the budget', async () => {
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: LONG_AGO() })
    expect(r.cacheText).toBe(GOOD_SECTION)
    expect(r.reason).toBe('eval-skipped-budget')
    expect(r.modelCalls).toBe(0)
    expect(create).not.toHaveBeenCalled()
  })
})

describe('gateForCache — a passing section is cached as-is', () => {
  it('caches the first pass and spends exactly one call', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(GOOD_SECTION)
    expect(r.repaired).toBe(false)
    expect(r.reason).toBe('passed')
    expect(r.modelCalls).toBe(1)
    expect(r.scores?.falsifiability).toBe(5)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('reports the fail-open when the evaluator returns unparseable output', async () => {
    create.mockResolvedValueOnce(textReply('not json at all'))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    // Fail-open is deliberate — a broken evaluator must not block a reading —
    // but the reason string has to make it distinguishable from a real pass.
    expect(r.cacheText).toBe(GOOD_SECTION)
    expect(r.reason).toBe('passed-evaluator-errored')
    expect(r.scores).toBeNull()
    expect(r.modelCalls).toBe(1)
  })
})

describe('gateForCache — a failing section is repaired and the repair is cached', () => {
  it('caches the repair, not the failed draft, for two calls', async () => {
    const repairedText = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(2, 'Anchor the Barnum claims.'))
      .mockResolvedValueOnce(textReply(repairedText))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(repairedText)
    expect(r.repaired).toBe(true)
    expect(r.reason).toBe('repaired')
    expect(r.modelCalls).toBe(2)
  })

  it('passes the evaluator critique into the repair prompt', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'Anchor the Barnum claims.'))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))

    await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.messages[0].content).toContain('Anchor the Barnum claims.')
  })

  it('repairs a rubric-PASSING draft that trips the doctrine scan', async () => {
    // The regeneration hole this closes: pre-gate, a doctrine hit meant "never
    // cache", so the section regenerated on every page load and usually
    // re-violated. It must now go through repair instead.
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const clean = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(clean))

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(clean)
    expect(r.repaired).toBe(true)
    expect(r.modelCalls).toBe(2)
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.messages[0].content).toContain('DOCTRINE FAILURE')
  })
})

describe('gateForCache — an unusable repair is not cached', () => {
  it('refuses a repair that still trips the doctrine scan', async () => {
    const stillDirty = `${sectionOfWords(IN_BAND_WORDS)} Truly ${BANNED_RESCUE_PHRASINGS[0]}.`
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockResolvedValueOnce(textReply(stillDirty))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('repair-doctrine-hit')
    expect(r.modelCalls).toBe(2)
  })

  it('refuses a truncated repair', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockResolvedValueOnce(textReply('## The Sun\n\nThe drive here is'))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('repair-truncated-or-empty')
  })

  it('counts the call and caches nothing when the repair throws', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockRejectedValueOnce(new Error('upstream 529'))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('failed-repair-errored')
    // The attempt is counted: a call that fails late can still have billed.
    expect(r.modelCalls).toBe(2)
  })

  it('does not start a repair it cannot finish, and caches nothing', async () => {
    // Past the repair guard but inside the eval guard: the section is still
    // scored (so the failure is observable) but left uncached for a fresh retry.
    create.mockResolvedValueOnce(evalReply(2, 'fix it'))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: Date.now() - 80_000 })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('failed-repair-skipped-budget')
    expect(r.modelCalls).toBe(1)
    expect(create).toHaveBeenCalledTimes(1)
  })
})

describe('detectBannedPhrasings', () => {
  it('returns nothing for clean prose', () => {
    expect(detectBannedPhrasings('The Saturn square makes the warmth costly to offer.')).toEqual([])
  })

  it('catches a literal rescue phrasing', () => {
    expect(detectBannedPhrasings(`That steadiness is ${BANNED_RESCUE_PHRASINGS[0]}.`))
      .toContain(BANNED_RESCUE_PHRASINGS[0])
  })

  it('catches contextual hierarchy, which the literal lists deliberately omit', () => {
    const hits = detectBannedPhrasings(
      'The sidereal Sun is what the identity is actually made of underneath the tropical persona.'
    )
    expect(hits.length).toBeGreaterThan(0)
  })
})
