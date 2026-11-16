// The prompt must not demonstrate what the scans reject (CLAUDE.md, prompt rule
// 2). reading-review-fixes.test.ts guards the cached SHARED_RULES block; this
// file guards the rest of what the generator reads: the frame prompts and the
// uncached tail (section instruction + scene clause), which sits nearest the
// generation and is the text this model follows first.

import { describe, it, expect } from 'vitest'
import { calculateDualChart, type BirthData } from '@/lib/astro-calc'
import {
  SECTION_INSTRUCTIONS, renderSectionInstruction, antithesisClause, UNKNOWN_TIME_CLAUSE,
  TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT,
  BANNED_META_PHRASINGS, OPENER_MODES, CLOSER_MODES,
} from '@/lib/prompts'
import { detectAntithesisTic } from '@/lib/reading-rule-scan'
import { sceneClause } from '@/lib/scene-expectation'
import { buildSectionRequest } from '@/lib/reading-request'

const unquoted = (t: string) => t.replace(/["“”][^"“”]*["“”]/g, '…')

const SECTIONS = Object.entries(SECTION_INSTRUCTIONS)
  .flatMap(([section, m]) => Object.keys(m).map(p => [section, p] as const))

const FRAMES = { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SYNASTRY_SYSTEM_PROMPT }

describe('the uncached tail does not model what the scans reject', () => {
  it.each(SECTIONS)('%s/%s: no antithesis construction in the instruction\'s own voice', (section, p) => {
    const body = renderSectionInstruction(section, p)!.replace(antithesisClause(), '')
    expect(detectAntithesisTic(unquoted(body))).toEqual([])
  })

  // "The plan allocates nothing to agreement" reached a reader (2026-11-10)
  // while the `agree` instruction itself read "If the plan allocates little".
  it.each(SECTIONS)('%s/%s: no banned meta collocation in the instruction', (section, p) => {
    const body = renderSectionInstruction(section, p)!.toLowerCase()
    for (const phrase of BANNED_META_PHRASINGS) expect(body).not.toContain(phrase)
  })

  it('scene clauses carry no banned meta collocation', () => {
    const clauses = [
      sceneClause('third-person', 'synthesis'), sceneClause('no', 'synthesis'),
      sceneClause('yes', 'tropical'), sceneClause('no', 'tropical'),
      sceneClause('yes', 'sidereal'), sceneClause('no', 'sidereal'),
    ].join('\n').toLowerCase()
    for (const phrase of BANNED_META_PHRASINGS) expect(clauses).not.toContain(phrase)
  })
})

describe('the frame prompts', () => {
  it.each(Object.entries(FRAMES))('%s: no antithesis construction in its own voice', (_name, text) => {
    expect(detectAntithesisTic(unquoted(text))).toEqual([])
  })

  it.each(Object.entries(FRAMES))('%s: no banned meta collocation', (_name, text) => {
    for (const phrase of BANNED_META_PHRASINGS) expect(text.toLowerCase()).not.toContain(phrase)
  })

  // The Tropical frame is the cached prefix of 9 sections. Naming the "mask"
  // beside "identity" is the collocation the doctrine scan flags.
  it('the Tropical frame does not name the mask', () => {
    expect(TROPICAL_SYSTEM_PROMPT).not.toMatch(/mask/i)
  })
})

describe('opening and closing modes', () => {
  // A mode phrased toward the future invites the prediction PART 4 bans; both
  // Mars closers said "the next time" and sidereal/mars shipped a prediction.
  it('no mode points at the future', () => {
    const modes = [OPENER_MODES, CLOSER_MODES]
      .flatMap(t => Object.values(t)).flatMap(f => Object.values(f))
    for (const mode of modes) expect(mode).not.toMatch(/\bnext time\b|\bwill\b/i)
  })
})

describe('unknown birth time', () => {
  it('appends the clause to natal instructions only when the time is unknown', () => {
    expect(renderSectionInstruction('tropical', 'mercury')).not.toContain(UNKNOWN_TIME_CLAUSE)
    for (const [section, p] of [['tropical', 'mercury'], ['sidereal', 'venus']] as const) {
      const text = renderSectionInstruction(section, p, { birthTimeUnknown: true })!
      expect(text).toContain(UNKNOWN_TIME_CLAUSE)
      // The cadence clause stays last.
      expect(text.indexOf(UNKNOWN_TIME_CLAUSE)).toBeLessThan(text.indexOf(antithesisClause()))
    }
  })

  it('leaves The Divergence and synastry alone', () => {
    expect(renderSectionInstruction('synthesis', 'diverge', { birthTimeUnknown: true })).not.toContain(UNKNOWN_TIME_CLAUSE)
    expect(renderSectionInstruction('synastry', 'luminaries', { birthTimeUnknown: true })).not.toContain(UNKNOWN_TIME_CLAUSE)
  })

  it('reaches the request the route and the eval harness both build', () => {
    const base: BirthData = {
      year: 1996, month: 7, day: 4, hour: 12, minute: 0,
      latitude: 55.8642, longitude: -4.2518, timezone: 1, tzName: 'Europe/London',
    }
    const unknown = buildSectionRequest(calculateDualChart({ ...base, birthTimeUnknown: true }), 'tropical', 'mercury', [])
    const known   = buildSectionRequest(calculateDualChart(base), 'tropical', 'mercury', [])
    expect(unknown.userContent).toContain(UNKNOWN_TIME_CLAUSE)
    expect(known.userContent).not.toContain(UNKNOWN_TIME_CLAUSE)
  })
})
