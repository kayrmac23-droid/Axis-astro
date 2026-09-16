import { describe, expect, it } from 'vitest'
import { SECTION_INSTRUCTIONS, SYNTHESIS_SYSTEM_PROMPT } from '../prompts'
import { EVAL_SYSTEM_PROMPT } from '../reading-quality-gate'

describe('Divergence prompt and evaluator alignment', () => {
  const instructions = Object.values(SECTION_INSTRUCTIONS.synthesis).join('\n')

  it('permits evidence-led outcomes and gives four sections distinct jobs', () => {
    expect(SYNTHESIS_SYSTEM_PROMPT).toContain('conflict, different emphasis, a conditional difference, or limited interpretive significance')
    expect(instructions).toContain('Meaningful Common Ground')
    expect(instructions).toContain('Where the Frameworks Differ')
    expect(instructions).toContain('How the Differences Relate')
    expect(instructions).toContain('What the Comparison Changes')
    expect(instructions).not.toMatch(/final sentence must be the sharpest|tension that will not resolve|TOP 3–4/)
  })

  it('scores added comparison insight, earned conflict, hierarchy and available scope', () => {
    expect(EVAL_SYSTEM_PROMPT).toContain('add insight beyond two separate placement descriptions')
    expect(EVAL_SYSTEM_PROMPT).toContain('claimed conflict that is not earned')
    expect(EVAL_SYSTEM_PROMPT).toContain('Assess only this section and the chart context supplied')
    expect(EVAL_SYSTEM_PROMPT).toContain('Concordance is consistency across frameworks')
  })
})
