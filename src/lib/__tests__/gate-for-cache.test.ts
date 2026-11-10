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

import { gateForCache, detectBannedPhrasings, EVAL_MODEL } from '../reading-quality-gate'
import { BANNED_RESCUE_PHRASINGS, OPENER_MODES, wordBandFor } from '../prompts'
import { READING_SO_FAR_FOOTER } from '../reading-thread'

// A section long enough to sit inside the tropical/sun word band, so the
// deterministic `length` criterion is not what decides these tests.
//
// ⚠ It opens on a second-person sentence deliberately. v10.40 clamps
// voice_quality on `hard` findings from scanSectionRules, and `register-drift`
// is hard for a natal section containing no second-person pronoun at all — which
// filler prose is. Without this the clamp fires on every fixture here and these
// tests measure the register check instead of the thing each one is about.
function sectionOfWords(n: number): string {
  const filler = Array.from({ length: Math.max(0, n - 6) }, (_, i) => `word${i}`).join(' ')
  return `## The Sun\n\nYou notice it first in the ordinary case. ${filler}.`
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
  model:         'claude-sonnet-5',
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
    expect(r.firstPass?.pass).toBe(true)
    expect(create).toHaveBeenCalledTimes(1)
  })

  it('reports the fail-open when the evaluator returns unparseable output', async () => {
    create.mockResolvedValueOnce(textReply('not json at all'))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    // Fail-open is deliberate — a broken evaluator must not block a reading —
    // but the reason string has to make it distinguishable from a real pass,
    // and an unscored section is cached for 24h, never the full 30 days.
    expect(r.cacheText).toBeNull()
    expect(r.provisionalText).toBe(GOOD_SECTION)
    expect(r.reason).toBe('passed-evaluator-errored')
    expect(r.scores).toBeNull()
    expect(r.modelCalls).toBe(1)
  })
})

describe('gateForCache — a failing section is repaired and the repair is cached', () => {
  it('caches a repair that passes its re-score, for three calls (eval + repair + re-eval)', async () => {
    const repairedText = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(2, 'Anchor the Barnum claims.'))  // first-pass eval: fail
      .mockResolvedValueOnce(textReply(repairedText))                    // repair
      .mockResolvedValueOnce(evalReply(5))                               // re-eval of repair: pass

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(repairedText)
    expect(r.repaired).toBe(true)
    expect(r.reason).toBe('repaired')
    expect(r.modelCalls).toBe(3)
    // The reported scores are the repair's own re-score, not the failed first pass's.
    expect(r.scores?.falsifiability).toBe(5)
    // The first pass's own verdict survives alongside it, for the eval harness.
    expect(r.firstPass?.pass).toBe(false)
    expect(r.firstPass?.scores?.falsifiability).toBe(2)
    expect(r.firstPass?.critique).toContain('Anchor the Barnum claims.')
  })

  it('passes the evaluator critique into the repair prompt', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'Anchor the Barnum claims.'))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.messages[0].content).toContain('Anchor the Barnum claims.')
  })

  it('repairs a rubric-PASSING draft that trips the doctrine scan', async () => {
    // The regeneration hole this closes: pre-gate, a doctrine hit meant "never
    // cache", so the section regenerated on every page load and usually
    // re-violated. It must now go through repair instead.
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const replacement = 'This steadiness remains available in ordinary decisions.'
    create
      .mockResolvedValueOnce(evalReply(5))       // first-pass eval passes the rubric…
      .mockResolvedValueOnce(textReply(JSON.stringify([replacement])))

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(`${GOOD_SECTION} ${replacement}`)
    expect(r.repaired).toBe(true)
    expect(r.reason).toBe('doctrine-repaired')
    expect(r.modelCalls).toBe(2)
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.max_tokens).toBe(500)
    expect(repairCall.messages[0].content).toContain(BANNED_RESCUE_PHRASINGS[0])
    expect(repairCall.messages[0].content).not.toContain(GOOD_SECTION)
    expect(create).toHaveBeenCalledTimes(2)
  })

  it('surgically replaces a contextual hierarchy sentence and preserves surrounding prose byte-for-byte', async () => {
    const before = `${GOOD_SECTION} `
    const dirtySentence = 'Underneath that identity, the Sidereal self is the essential one.'
    const after = ' The tension remains active in close relationships.'
    const replacement = 'The Sidereal account describes a simultaneous inward emphasis.'
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(JSON.stringify([replacement])))

    const r = await gateForCache({ ...BASE, firstPassText: before + dirtySentence + after, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(before + replacement + after)
    expect(r.reason).toBe('doctrine-repaired')
    expect(r.modelCalls).toBe(2)
  })

  it('localises a contextual hit whose identity token ENDS inside the window but starts outside it', async () => {
    // The scan measures the gap from the END of the identity token; the
    // localiser measured from its start, so this hit was reported and then
    // found in no sentence — the surgical edit threw and a rubric-passing
    // section took a full repair (production, 2026-11-07, synthesis/closing).
    const before = `${GOOD_SECTION} `
    const dirtySentence = 'The incarnational pattern keeps running through every ordinary working week, beneath notice.'
    const after = ' The tension remains active in close relationships.'
    const tokenStart = dirtySentence.indexOf('incarnational')
    const termStart  = dirtySentence.indexOf('beneath')
    expect(termStart - tokenStart).toBeGreaterThan(60)                              // outside, from the start
    expect(termStart - (tokenStart + 'incarnational'.length)).toBeLessThanOrEqual(60) // inside, from the end
    const replacement = 'The pattern keeps running through every ordinary working week without drawing attention.'
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(JSON.stringify([replacement])))

    const r = await gateForCache({ ...BASE, firstPassText: before + dirtySentence + after, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(before + replacement + after)
    expect(r.reason).toBe('doctrine-repaired')
    expect(r.modelCalls).toBe(2)
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

  it('refuses a complete, doctrine-clean repair that still fails its re-score', async () => {
    // The core of finding #2: a repair can be complete and doctrine-clean yet
    // regress across the prose criteria. Re-scoring catches it, and it is left
    // uncached (reason repair-failed-recheck) rather than frozen for 30 days.
    const cleanButWeak = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))     // first-pass eval: fail
      .mockResolvedValueOnce(textReply(cleanButWeak))    // repair: complete + clean
      .mockResolvedValueOnce(evalReply(2, 'still weak')) // re-eval: still below the bar

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('repair-failed-recheck')
    expect(r.modelCalls).toBe(3)
    expect(r.firstPass?.critique).toContain('fix it')
  })

  it('caches a repair PROVISIONALLY when its re-score errors (fail-open, 24h not 30 days)', async () => {
    // Evaluator failure never blocks caching: the repair is complete and
    // doctrine-clean. But an errored re-score is not a pass, so it gets the
    // provisional TTL — a repair that is re-scored and FAILS already gets 24h.
    const cleanRepair = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockResolvedValueOnce(textReply(cleanRepair))
      .mockResolvedValueOnce(textReply('not json at all'))  // re-eval unparseable

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.provisionalText).toBe(cleanRepair)
    expect(r.repaired).toBe(true)
    expect(r.reason).toBe('repaired-recheck-errored')
    expect(r.modelCalls).toBe(3)
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

  it('caches an unscored repair PROVISIONALLY when no budget is left to re-score it', async () => {
    // Inside the repair guard when the repair starts; the repair itself then
    // takes long enough to pass the eval guard, so the re-score is skipped. An
    // unchecked repair must not out-live a checked-and-failed one (24h).
    const cleanRepair = sectionOfWords(IN_BAND_WORDS)
    const realNow = Date.now.bind(Date)
    const startedAt = realNow() - 65_000
    const clock = vi.spyOn(Date, 'now')
    try {
      create
        .mockResolvedValueOnce(evalReply(2, 'fix it'))
        .mockImplementationOnce(async () => {
          clock.mockImplementation(() => realNow() + 35_000)  // the repair took 35s
          return textReply(cleanRepair)
        })
      const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt })
      expect(r.reason).toBe('repaired-recheck-skipped-budget')
      expect(r.cacheText).toBeNull()
      expect(r.provisionalText).toBe(cleanRepair)
      expect(r.repaired).toBe(true)
      expect(create).toHaveBeenCalledTimes(2)
    } finally {
      clock.mockRestore()
    }
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

describe('gateForCache — the evaluator is told whether a scene is expected', () => {
  // The same computed value the generator saw (scene-expectation.ts): without
  // it, a section that correctly declines to invent a trigger scores 2 on
  // specificity and is repaired toward the invention.
  const sentTurn = () => JSON.stringify(create.mock.calls[0][0].messages)
  beforeEach(() => { create.mockReset() })

  it('says no for a Sidereal section that receives no drishti', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, section: 'sidereal', planetSection: 'sun',
      chartContext: 'GRAHA RELATIONSHIPS RECEIVED (Jyotish):\n• Conjunct (same sign) Mercury — Libra 5°07\', H1',
      firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(sentTurn()).toContain('scene_expected: no')
  })

  it('says yes where a drishti is received', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, section: 'sidereal', planetSection: 'moon',
      chartContext: '• Receives the 7th-house drishti of Mars (from Virgo, H12)',
      firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(sentTurn()).toContain('scene_expected: yes')
  })

  it('says third-person for The Divergence', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, section: 'synthesis', planetSection: 'diverge',
      chartContext: '1. [D-MARS] Mars — sign changes. Evidence: D-MARS, A-MARS-SATURN-SEXTILE',
      firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(sentTurn()).toContain('scene_expected: third-person')
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

describe('gateForCache — surgical doctrine repair targeting', () => {
  it('rewrites only the sentence near identity language, not every use of the word', async () => {
    // "underneath" is a CONTEXTUAL hit: it breaches THE LAW only within
    // HIERARCHY_PROXIMITY_CHARS of identity language. Uses well away from any
    // identity claim are innocent and must survive byte-for-byte — rewriting
    // them spends a repair on prose that was never at fault.
    const filler     = Array.from({ length: 80 }, (_, i) => `word${i}`).join(' ')
    const innocent1  = 'The Saturn return put a floor underneath the whole arrangement.'
    const offending  = 'Underneath that identity, the Sidereal self is the essential one.'
    const innocent2  = 'Something steady sits underneath the routine.'
    const draft = `${GOOD_SECTION} ${innocent1} ${filler}. ${offending} ${filler}. ${innocent2}`
    const replacement = 'The Sidereal account describes a simultaneous inward emphasis.'
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(JSON.stringify([replacement])))

    const r = await gateForCache({ ...BASE, firstPassText: draft, startedAt: JUST_NOW() })
    expect(r.reason).toBe('doctrine-repaired')
    expect(r.cacheText).toContain(innocent1)
    expect(r.cacheText).toContain(innocent2)
    expect(r.cacheText).not.toContain(offending)
    // Exactly one sentence was sent for editing.
    const sent = create.mock.calls[1][0].messages[0].content as string
    expect(sent).toContain('Underneath that identity')
    expect(sent).not.toContain(innocent1)
    expect(sent).not.toContain(innocent2)
  })

  it('falls back to the full repair when the surgical pass does not clear the scan', async () => {
    // Returning uncached here would regenerate the section on EVERY subsequent
    // page load — a permanent model call for something the full repair can fix.
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const clean = sectionOfWords(IN_BAND_WORDS)
    create
      .mockResolvedValueOnce(evalReply(5))                       // rubric passes
      .mockResolvedValueOnce(textReply(JSON.stringify([`Still ${BANNED_RESCUE_PHRASINGS[0]} here.`])))
      .mockResolvedValueOnce(textReply(clean))                   // full repair
      .mockResolvedValueOnce(evalReply(5))                       // re-score passes

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(clean)
    expect(r.repaired).toBe(true)
    expect(create.mock.calls[2][0].messages[0].content).toContain('DOCTRINE FAILURE')
  })

  it('does not take the surgical path when the evaluator errored', async () => {
    // evaluatorErrored defaults rubricPass to true to fail open on prose. That
    // default is not a verdict, so a doctrine hit must go through full repair.
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    const clean = sectionOfWords(IN_BAND_WORDS)
    create
      .mockRejectedValueOnce(new Error('evaluator exploded'))
      .mockResolvedValueOnce(textReply(clean))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.cacheText).toBe(clean)
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.messages[0].content).toContain('DOCTRINE FAILURE')
  })
})

describe('gateForCache — the reading so far is sent cache-ready, never flattened', () => {
  // The evaluator and the repair used to receive the reading so far as one
  // uncached string: full-price Opus input on every section, growing with each
  // one. They must now send the generation's own prior blocks, breakpoint intact.
  const PRIOR: Anthropic.TextBlockParam[] = [
    { type: 'text', text: 'THE READING SO FAR …\n\nSUN-PROSE.' },
    { type: 'text', text: 'MOON-PROSE.', cache_control: { type: 'ephemeral' } },
  ]
  type Block = { type: string; text: string; cache_control?: unknown }

  it('sends the evaluator a cached system prompt and the prior blocks byte-for-byte', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, priorBlocks: PRIOR, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })

    const evalCall = create.mock.calls[0][0]
    expect(evalCall.system).toEqual([expect.objectContaining({ cache_control: { type: 'ephemeral' } })])
    const blocks = evalCall.messages[0].content as Block[]
    expect(blocks.slice(0, 2)).toEqual(PRIOR)
    // The reading so far is not repeated after the breakpoint.
    const tail = blocks.slice(2).map(b => b.text).join('\n')
    expect(tail).toContain('END OF THE READING SO FAR')
    expect(tail).toContain(BASE.chartContext)
    expect(tail).toContain(GOOD_SECTION)
    expect(tail).not.toContain('SUN-PROSE.')
  })

  it('sends the repair the same prefix the first pass was generated from', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'Anchor the Barnum claims.'))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, priorBlocks: PRIOR, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })

    const repairCall = create.mock.calls[1][0]
    expect(repairCall.system).toBe(BASE.systemBlocks)
    const blocks = repairCall.messages[0].content as Block[]
    expect(blocks.slice(0, 2)).toEqual(PRIOR)
    expect(blocks[2].text).toBe(`${READING_SO_FAR_FOOTER}\n\n${BASE.chartContext}`)
    expect(blocks.slice(3).map(b => b.text).join('\n')).toContain('Anchor the Barnum claims.')
    // The re-score of the repair rides the same cached prefix.
    expect((create.mock.calls[2][0].messages[0].content as Block[]).slice(0, 2)).toEqual(PRIOR)
  })

  it('an opening section (no prior blocks) still sends a plain string', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, priorBlocks: [], firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(typeof create.mock.calls[0][0].messages[0].content).toBe('string')
  })
})

describe('gateForCache — every model call is logged with its token usage', () => {
  const withUsage = <T extends object>(reply: T, input: number) => ({
    ...reply,
    stop_reason: 'end_turn',
    usage: { input_tokens: input, output_tokens: 50, cache_read_input_tokens: 4_000, cache_creation_input_tokens: 0 },
  })
  const usageLines = () => (console.log as unknown as { mock: { calls: unknown[][] } }).mock.calls
    .map(c => String(c[0])).filter(l => l.startsWith('[AXIS_USAGE]'))

  it('logs the evaluation, the repair and the re-score, each under its own call kind', async () => {
    create
      .mockResolvedValueOnce(withUsage(evalReply(2, 'Anchor the Barnum claims.'), 101))
      .mockResolvedValueOnce(withUsage(textReply(sectionOfWords(IN_BAND_WORDS)), 202))
      .mockResolvedValueOnce(withUsage(evalReply(5), 303))

    await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    const lines = usageLines()
    expect(lines).toHaveLength(3)
    // The evaluator model is imported, not spelled out: it changed once already
    // (Opus 5 → current-generation Sonnet in v10.30) and a hardcoded name turns
    // that into a false failure. The repair model is the GENERATION model, which
    // is a separate choice and stays asserted by name.
    expect(lines[0]).toMatch(new RegExp(`section=tropical/sun call=evaluate model=${EVAL_MODEL} in=101 cache_read=4000`))
    expect(lines[1]).toMatch(/section=tropical\/sun call=repair model=claude-sonnet-5 in=202/)
    expect(lines[2]).toMatch(new RegExp(`section=tropical/sun call=recheck model=${EVAL_MODEL} in=303`))
  })

  it('logs the surgical doctrine repair', async () => {
    const dirty = `${GOOD_SECTION} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    create
      .mockResolvedValueOnce(withUsage(evalReply(5), 10))
      .mockResolvedValueOnce(withUsage(textReply(JSON.stringify(['A plain replacement sentence.'])), 20))

    await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(usageLines()[1]).toMatch(/section=tropical\/sun call=doctrine-repair model=claude-sonnet-5 in=20/)
  })
})

describe('gateForCache — the antithesis tic (v10.34, density-scoped v10.45)', () => {
  // ⚠ v10.45 — the clamp fires on DENSITY IN A PARAGRAPH, not on a total
  // against a band-derived cap. The band-scaled cap of v10.39 did not hold (10
  // of 21 frozen bench sections breached it, 6 hard) and was not tracking
  // density: see reading-rule-scan.ts. Two consequences are pinned below. A
  // section's LENGTH no longer buys room WITHIN a paragraph — two uses in one
  // paragraph are adjacent repetition whether the section is 230 words or 760
  // — while across the section the allowance scales with the paragraph count,
  // which is where earned length earns cadence room.
  // `tics()` puts every construction in ONE paragraph, so n is the paragraph
  // density; the spread cases are built separately.
  const CAP1 = { ...BASE, planetSection: 'key_aspects' }
  const CAP1_WORDS = wordBandFor('tropical', 'key_aspects', 0).fullMin + 10
  const shortSection = () => sectionOfWords(CAP1_WORDS)

  const tics = (base: string, n: number) => {
    const constructions = [
      'It asserts rather than asks.',
      'It leads rather than follows.',
      'It is not a stance but a reflex.',
      'It arrives less a decision than a habit.',
    ]
    return `${base}\n\n${constructions.slice(0, n).join(' ')}`
  }

  it('states the section\'s own allowance in the evaluator user turn', async () => {
    // The evaluator cannot read the band, and EVAL_SYSTEM_PROMPT is a cached
    // block that must stay byte-identical across the ~21 sections of a reading,
    // so the number has to travel in the per-section user turn. If it did not,
    // the rater would judge against a fixed cap of its own while the clamp
    // enforced a different one.
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    const content = JSON.stringify(create.mock.calls[0][0].messages[0].content)
    expect(content).toContain('<section_meta>')
    expect(content).toContain('cadence_allowance:')
    // The rater is told the DENSITY rule, and explicitly not to invent a total
    // of its own — the clamp and the rubric must agree on what is counted.
    expect(content).toContain('at most once in any one paragraph')
    expect(content).toContain('once every two paragraphs')
    expect(content).toContain('against no number of your own')
    // The three bodies the evaluator must keep apart are each fenced.
    expect(content).toContain('<chart_context>')
    expect(content).toContain('<section_under_review>')

    // ⚠ And it is byte-identical for a different band: the allowance is a
    // property of the text now, so no number travels per section.
    const sunTurn = content
    create.mockReset()
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...CAP1, firstPassText: shortSection(), startedAt: JUST_NOW() })
    const shortTurn = JSON.stringify(create.mock.calls[0][0].messages[0].content)
    const allowance = (t: string) => t.slice(t.indexOf('cadence_allowance:'), t.indexOf('</section_meta>'))
    expect(allowance(shortTurn)).toBe(allowance(sunTurn))
  })

  // ── The 230-word band: cap 1 ───────────────────────────────────────────────
  it('treats two instances in a cap-1 section as a deduction, not a hard failure', async () => {
    // v10.34 clamped below the bar here, which on the rule scan's own numbers
    // is 39 of 63 sections taking a full repair — and a repair landing on two
    // again fails its re-score, caches provisionally for 24h, and the section
    // is regenerated daily for every reader over a cadence tic.
    const text = tics(shortSection(), 2)
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...CAP1, firstPassText: text, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBe(3)   // clamped TO the bar
    expect(r.repaired).toBe(false)
    expect(r.cacheText).toBe(text)
    expect(r.modelCalls).toBe(1)
  })

  it('hard-fails three instances in a cap-1 section', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(shortSection()))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...CAP1, firstPassText: tics(shortSection(), 3), startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBeLessThan(3)
    expect(r.repaired).toBe(true)
  })

  // ── A long section: length does NOT buy room inside one paragraph ─────────
  // The v10.39 cap gave the 760-word Sun band two uses anywhere in the section,
  // so two in the SAME sentence pair scored clean. That is the adjacent
  // repetition the rule exists to stop, and it is a fault at any length.
  it('deducts for two instances in ONE paragraph however long the section is', async () => {
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: tics(GOOD_SECTION, 2), startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBe(3)
    expect(r.repaired).toBe(false)
  })

  // ── …but it DOES buy room across the section ──────────────────────────────
  it('leaves the same two instances clean when they sit in separate paragraphs', async () => {
    const spread = `${GOOD_SECTION}\n\nIt asserts rather than asks.\n\nThe ruler is peregrine, so the assertion arrives already settled.\n\nIt leads rather than follows.\n\nYou read the silence after as agreement.`
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: spread, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBe(5)   // not even a deduction
    expect(r.reason).toBe('passed')
    expect(r.modelCalls).toBe(1)
  })

  it('hard-fails three instances in one paragraph at any band', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: tics(GOOD_SECTION, 3), startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBeLessThan(3)
    expect(r.repaired).toBe(true)
  })

  it('hard-fails four instances in one paragraph', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: tics(GOOD_SECTION, 4), startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBeLessThan(3)
    expect(r.repaired).toBe(true)
  })

  it('leaves a section with a single use untouched', async () => {
    const atCap = tics(shortSection(), 1)
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...CAP1, firstPassText: atCap, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBe(5)
    expect(r.reason).toBe('passed')
    expect(r.cacheText).toBe(atCap)
  })

  // ── The critique ──────────────────────────────────────────────────────────
  it('names every instance and what was actually measured', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: tics(GOOD_SECTION, 4), startedAt: JUST_NOW() })
    expect(r.reason).toBe('repaired')
    expect(r.modelCalls).toBe(3)

    const content = JSON.stringify(create.mock.calls[1][0].messages[0].content)
    expect(content).toContain('ANTITHESIS-TIC FAILURE')
    // The measurement leads — the breach is the repetition, not any single use.
    expect(content).toContain('One paragraph carries 4 of them')
    expect(content).toContain('at most one per paragraph')
    expect(content).toContain('Keep the most load-bearing one in each affected paragraph')
    // Each instance is quoted, so the repair cuts the right ones.
    expect(content).toContain('rather than asks')
    expect(content).toContain('rather than follows')
  })

  it('names the deduction in the critique when the section fails for another reason', async () => {
    // Two instances in a cap-1 section do not fail it alone, but once something
    // else does, the repair must still be told to cut the tic — otherwise the
    // rewrite reproduces it and the re-score is where it surfaces.
    create
      .mockResolvedValueOnce(evalReply(2))
      .mockResolvedValueOnce(textReply(shortSection()))
      .mockResolvedValueOnce(evalReply(5))

    await gateForCache({ ...CAP1, firstPassText: tics(shortSection(), 2), startedAt: JUST_NOW() })
    const content = JSON.stringify(create.mock.calls[1][0].messages[0].content)
    expect(content).toContain('ANTITHESIS-TIC FAILURE')
    expect(content).toContain('One paragraph carries 2 of them')
  })

  it('does not take the surgical doctrine edit when a tic rides alongside a doctrine hit', async () => {
    // The surgical edit rewrites only the doctrine sentence. Taken here it would
    // clear the scan and cache a section whose tic is spread across paragraphs —
    // which is why the clamp is applied BEFORE rubricPass, as the opener is.
    const dirty = `${tics(GOOD_SECTION, 4)} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.reason).toBe('repaired')
    // A full repair (3 calls), not the 2-call surgical doctrine edit.
    expect(r.modelCalls).toBe(3)
  })
})

describe('gateForCache — banned existential opener', () => {
  // GOOD_SECTION with its first sentence opened on the convergent frame.
  const OPENS_ON_FRAME = GOOD_SECTION.replace('## The Sun\n\n', '## The Sun\n\nThere is a particular kind of ')

  it('fails a rubric-passing draft on the opener and sends it to the full repair with the section\'s mode', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))                                 // rubric passes on its own…
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))     // full repair
      .mockResolvedValueOnce(evalReply(5))                                 // re-score passes

    const r = await gateForCache({ ...BASE, firstPassText: OPENS_ON_FRAME, startedAt: JUST_NOW() })
    expect(r.reason).toBe('repaired')
    expect(r.modelCalls).toBe(3)
    const repairCall = create.mock.calls[1][0]
    expect(repairCall.max_tokens).toBe(BASE.maxTokens)
    const content = JSON.stringify(repairCall.messages[0].content)
    expect(content).toContain('OPENER FAILURE')
    expect(content).toContain(OPENER_MODES.tropical.sun.slice(0, 40))
  })

  it('does not take the surgical doctrine edit when an opener hit rides alongside a doctrine hit', async () => {
    // The surgical edit only rewrites the doctrine sentence. Taken here, it would
    // clear the scan and cache the section with the banned opener intact.
    const dirty = `${OPENS_ON_FRAME} This is ${BANNED_RESCUE_PHRASINGS[0]}.`
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: dirty, startedAt: JUST_NOW() })
    expect(r.reason).toBe('repaired')
    expect(create.mock.calls[1][0].max_tokens).not.toBe(500)
  })

  it('does not cache a repair that still opens on the frame', async () => {
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(OPENS_ON_FRAME))
      .mockResolvedValueOnce(evalReply(5))   // the evaluator misses it; the scan does not

    const r = await gateForCache({ ...BASE, firstPassText: OPENS_ON_FRAME, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.reason).toBe('repair-failed-recheck')
    expect(r.scores?.specificity).toBeLessThan(3)
  })

  it('leaves the frame alone mid-body', async () => {
    const midBody = `${GOOD_SECTION} There is a particular kind of quiet in the 4th house.`
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: midBody, startedAt: JUST_NOW() })
    expect(r.reason).toBe('passed')
    expect(r.modelCalls).toBe(1)
  })
})

describe('gateForCache — spend is recorded per call, and unconfirmed sections expire rather than regenerate forever', () => {
  it('calls onModelCall once per billable call, matching modelCalls', async () => {
    const onModelCall = vi.fn()
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(2, 'still weak'))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW(), onModelCall })
    expect(onModelCall).toHaveBeenCalledTimes(r.modelCalls)
  })

  it('bounds every call with a timeout inside the invocation and disables SDK retries', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    const opts = create.mock.calls[0][1] as { timeout: number; maxRetries: number }
    expect(opts.maxRetries).toBe(0)
    expect(opts.timeout).toBeGreaterThan(0)
    expect(opts.timeout).toBeLessThanOrEqual(120_000)
  })

  it('offers the clean first pass as provisional when the repair fails its re-score', async () => {
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockResolvedValueOnce(textReply(sectionOfWords(IN_BAND_WORDS)))
      .mockResolvedValueOnce(evalReply(2, 'still weak'))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.provisionalText).toBe(GOOD_SECTION)
  })

  it('never offers a doctrine-breaching first pass as provisional', async () => {
    const breaching = `${GOOD_SECTION} ${BANNED_RESCUE_PHRASINGS[0]}.`
    create
      .mockResolvedValueOnce(evalReply(2, 'fix it'))
      .mockRejectedValueOnce(new Error('repair failed'))
    const r = await gateForCache({ ...BASE, firstPassText: breaching, startedAt: JUST_NOW() })
    expect(r.cacheText).toBeNull()
    expect(r.provisionalText ?? null).toBeNull()
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The rubric tells the evaluator to write a critique "whenever any criterion is
// below 4" — i.e. for sections that PASS with real weaknesses. The result used
// to blank it on pass, which threw exactly those away. That text is the eval
// harness's only sensitive instrument for the scene requirement (`specificity`
// moved +0.05 per version regardless of what each version did), and with the
// critique dropped on pass its numerator could only come from failing sections,
// so the metric moved the wrong way as the pass rate improved.
// ─────────────────────────────────────────────────────────────────────────────
describe('gateForCache — the critique survives a pass', () => {
  it('returns the evaluator critique on a section that passed', async () => {
    const note = 'No concrete moment appears; the Mars material is asserted structurally.'
    create.mockResolvedValueOnce(evalReply(4, note))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.firstPass?.pass).toBe(true)
    expect(r.firstPass?.critique).toBe(note)
  })

  it('does not repair a passing section because a critique exists', async () => {
    create.mockResolvedValueOnce(evalReply(4, 'thin on the aftermath'))

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    // One call: the eval. The repair path is gated on `pass`, never on the
    // critique string, so widening the critique cannot cost a model call.
    expect(r.modelCalls).toBe(1)
    expect(r.repaired).toBe(false)
    expect(r.cacheText).toBe(GOOD_SECTION)
  })
})

// ── v10.40: the two deterministic instruments that measured and enforced nothing
//
// `reading-fact-check.ts` and `reading-rule-scan.ts` are pure, microsecond-fast
// and better calibrated than the LLM evaluator (checkNumericFacts: 0 false
// positives on `hard` across 84 real sections, against a `chart_evidence` score
// of 3-4 for the fabrication that motivated it). Both fed a log line, because
// the only options weighed were "veto the cache" — a false positive then costs a
// model call on every page load, forever — and "do nothing". The third option is
// the one the opener and antithesis backstops already use: clamp the criterion
// and name the fault in the critique, so a false positive costs one repair pass.
describe('gateForCache — deterministic fact and rule backstops (v10.40)', () => {
  it('a fabricated degree clamps chart_evidence below the bar and forces a repair', async () => {
    // 44.4° is in no chart: the context states one figure, 14°22'.
    const invented = `${GOOD_SECTION}\n\nThe square sits at 44.4° of separation.`
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(GOOD_SECTION))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: invented, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.chart_evidence).toBeLessThan(3)
    expect(r.repaired).toBe(true)
  })

  it('names the figure and the sentence, and tells the repair to re-derive rather than delete', async () => {
    const invented = `${GOOD_SECTION}\n\nThe square sits at 44.4° of separation.`
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(GOOD_SECTION))
      .mockResolvedValueOnce(evalReply(5))

    await gateForCache({ ...BASE, firstPassText: invented, startedAt: JUST_NOW() })
    const content = JSON.stringify(create.mock.calls[1][0].messages[0].content)
    expect(content).toContain('FACT FAILURE')
    expect(content).toContain('44.4°')
    expect(content).toContain('Re-derive every figure from the chart context')
    // Stripping the number to clear the check would cost criterion 1 the
    // anchoring it rewards, so the critique rules that repair out explicitly.
    expect(content).toContain('do not strip the surrounding anchoring')
  })

  it('leaves a figure the context DOES state alone', async () => {
    const accurate = `${GOOD_SECTION}\n\nThe Sun sits at 14.4° of its sign.`
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: accurate, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.chart_evidence).toBe(5)
    expect(r.reason).toBe('passed')
  })

  it('runs on the REPAIR too, so a repair cannot introduce a fabricated figure and be cached', async () => {
    // First pass fails the rubric; the repair comes back fluent and false.
    const badRepair = `${GOOD_SECTION}\n\nThe aspect perfects at 44.4°.`
    create
      .mockResolvedValueOnce(evalReply(2))
      .mockResolvedValueOnce(textReply(badRepair))
      .mockResolvedValueOnce(evalReply(5))   // the re-score likes the prose

    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    // The clamp inside evaluateSection applies to the recheck as well, so the
    // re-score cannot pass and the fabrication is never cached as final.
    expect(r.cacheText).not.toBe(badRepair)
    expect(r.reason).toBe('repair-failed-recheck')
  })

  it('a hard stated-rule breach clamps voice_quality TO the bar, not below it', async () => {
    // `prescription` — a second-person "you should", which SHARED_RULES bans
    // outright. Clamped to the bar: a real deduction that drags the average and
    // earns a critique, without making one slip an automatic repair. The scan
    // carries more rules than the fact check and has not been measured in
    // production, so it gets the more conservative of the two clamps.
    const prescriptive = `${GOOD_SECTION}\n\nYou should sit with that for a while.`
    create
      .mockResolvedValueOnce(evalReply(5))
      .mockResolvedValueOnce(textReply(GOOD_SECTION))
      .mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({ ...BASE, firstPassText: prescriptive, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.voice_quality).toBe(3)
  })

  it('names the breached rule and its repair, so the fix is not a re-read of the rules', async () => {
    const prescriptive = `${GOOD_SECTION}\n\nYou should sit with that for a while.`
    create
      .mockResolvedValueOnce(evalReply(3))
      .mockResolvedValueOnce(textReply(GOOD_SECTION))
      .mockResolvedValueOnce(evalReply(5))

    await gateForCache({ ...BASE, firstPassText: prescriptive, startedAt: JUST_NOW() })
    const content = JSON.stringify(create.mock.calls[1][0].messages[0].content)
    expect(content).toContain('STATED-RULE BREACH')
    expect(content).toContain('prescription')
    expect(content).toContain('present tense')
  })

  it('leaves clean prose at 5 on both criteria', async () => {
    create.mockResolvedValueOnce(evalReply(5))
    const r = await gateForCache({ ...BASE, firstPassText: GOOD_SECTION, startedAt: JUST_NOW() })
    expect(r.firstPass?.scores?.chart_evidence).toBe(5)
    expect(r.firstPass?.scores?.voice_quality).toBe(5)
    expect(r.reason).toBe('passed')
  })

  it('passes the frame, so register-drift is scoped to the natal sections', async () => {
    // The Divergence is third person by its own instruction and synastry is
    // second person plural, so the register check must not fire there. It is
    // frame-aware and fails closed, and the gate has the frame in `section`.
    const thirdPerson = '## The Divergence\n\n' +
      Array.from({ length: wordBandFor('synthesis', 'diverge', 0, 4).fullMin + 10 }, (_, i) => `word${i}`).join(' ') + '.'
    create.mockResolvedValueOnce(evalReply(5))

    const r = await gateForCache({
      ...BASE, section: 'synthesis', planetSection: 'diverge',
      chartContext: 'DIVERGENCE PLAN\nPLAN WEIGHT: 4\nSun: Leo → Cancer',
      firstPassText: thirdPerson, startedAt: JUST_NOW(),
    })
    expect(r.firstPass?.scores?.voice_quality).toBe(5)
  })
})
