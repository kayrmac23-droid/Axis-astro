import { describe, expect, it } from 'vitest'
import { SECTION_INSTRUCTIONS, SYNTHESIS_SYSTEM_PROMPT, SYNTHESIS_DESCRIPTORS_HEADINGS } from '../prompts'
import { EVAL_SYSTEM_PROMPT } from '../reading-quality-gate'
import { SYNTHESIS_DESCRIPTORS } from '../planet-descriptors'

describe('Divergence prompt and evaluator alignment', () => {
  const instructions = Object.values(SECTION_INSTRUCTIONS.synthesis).join('\n')

  it('keeps the AXIS thesis: the divergence is terrain, held open, never ranked', () => {
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain('the specific terrain this person lives on')
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain('NEITHER SUBORDINATE')
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/Neither is deeper, truer, more authentic, more essential, an essence, a mask, a surface/)
    // Regression: PR #189 reframed the closing as a methodology comparison.
    expect(instructions).not.toMatch(/when using one framework rather than the other changes the question/i)
    expect(instructions).not.toMatch(/limited interpretive significance/i)
  })

  it('carries THE LAW: the unwalked divergences are named, never silently dropped', () => {
    expect(instructions).toContain('STILL UNRESOLVED')
    expect(instructions).toContain('This is required by THE LAW')
    expect(instructions).toMatch(/never silently dropped and never implied to resolve/)
  })

  it('states no divergence quota — the chart decides how many are load-bearing', () => {
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain('There is no quota')
    expect(instructions).toMatch(/However many that is, is how many the chart earned/)
    // The old quota language must not come back with the AXIS voice.
    expect(instructions).not.toMatch(/Cover the TOP 3–4 divergences/)
    expect(instructions).not.toMatch(/must be the sharpest, most precise observation in the entire reading/)
  })

  it('bans inflation as well as resolution — both directions of mis-sizing', () => {
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/It is NOT, by itself, evidence of conflict, suffering, a coping history/)
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/never inflated into drama, and it is never resolved to make it smaller/)
    expect(instructions).toMatch(/hold it open without inflating it/)
  })

  it('evaluator still catches pseudo-synthesis, which PR #189 deleted', () => {
    expect(EVAL_SYSTEM_PROMPT).toContain('pseudo-synthesis')
    expect(EVAL_SYSTEM_PROMPT).toContain('carries both simultaneously')
    expect(EVAL_SYSTEM_PROMPT).toContain('advance a DIFFERENT claim')
    expect(EVAL_SYSTEM_PROMPT).toContain('RESOLUTION-BY-HIERARCHY')
    // …while keeping what PR #189 correctly added.
    expect(EVAL_SYSTEM_PROMPT).toContain('a claimed conflict the supplied evidence does not earn')
    expect(EVAL_SYSTEM_PROMPT).toContain('Concordance is consistency across frameworks')
    expect(EVAL_SYSTEM_PROMPT).toContain('named at that size and left open, is correct')
  })

  it('every section heading the prompts specify resolves to a UI descriptor', async () => {
    // Regression: PR #189 changed all four headings and none of them matched
    // getSynthesisKey any more, so all four descriptor boxes silently vanished
    // with no error, no failing test, and nothing in the logs. This walks the
    // whole contract: prompt heading → getSynthesisKey → descriptor entry.
    const { getSynthesisKey } = await import('../../components/ReadingPanel')
    for (const [key, heading] of Object.entries(SYNTHESIS_DESCRIPTORS_HEADINGS)) {
      expect(SECTION_INSTRUCTIONS.synthesis[key as keyof typeof SECTION_INSTRUCTIONS.synthesis])
        .toContain(`## ${heading}`)
      expect(getSynthesisKey(heading)).toBe(key)
      expect(SYNTHESIS_DESCRIPTORS[key as keyof typeof SYNTHESIS_DESCRIPTORS]).toBeDefined()
    }
  })

  it('still resolves the headings PR #189 shipped, so cached prose keeps its descriptors', async () => {
    // 30-day TTL: readings generated under v10.22 are still being served.
    const { getSynthesisKey } = await import('../../components/ReadingPanel')
    expect(getSynthesisKey('Meaningful Common Ground')).toBe('agree')
    expect(getSynthesisKey('Where the Frameworks Differ')).toBe('diverge')
    expect(getSynthesisKey('How the Differences Relate')).toBe('tension')
    expect(getSynthesisKey('What the Comparison Changes')).toBe('closing')
  })

  it('UI descriptor copy does not assert the hierarchy the prompts ban', () => {
    // Assertion-shaped patterns only. A bare "beneath" would flag the sentence
    // that BANS the hierarchy ("neither framework ranks above the other") —
    // the same literal-vs-contextual trap the doctrine scan documents, and the
    // reason bare ordinary words stay out of the literal ban lists.
    const copy = Object.values(SYNTHESIS_DESCRIPTORS).map(d => `${d.title} ${d.keywords} ${d.description}`).join('\n')
    expect(copy).not.toMatch(/essential nature|as a mask|more real than|deeper than|truer than|sits beneath/i)
  })
})
