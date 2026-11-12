// lib/reading-request.ts
//
// The Anthropic request /api/reading sends for one natal section — the single
// assembly of prompt, chart block, context block, thread blocks and model
// constants. The route calls it, and so does the batch eval harness
// (scripts/eval-readings.mjs), so the harness measures exactly the request
// production sends. It used to live in scripts/ as a hand-mirrored copy of the
// route's inline glue, pinned by a byte-parity test; now there is one copy.
// eval-harness-parity.test.ts still drives the route end to end as a guard.
import Anthropic from '@anthropic-ai/sdk'
import type { DualChartData } from '@/lib/astro-calc'
import {
  TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES, SHARED_RULES_LEAN,
  renderSectionInstruction, countPlanEvidence, wordBandFor, type WordBand,
} from '@/lib/prompts'
import { countAspectsInContext } from '@/lib/reading-quality-gate'
import { sceneExpectation, sceneClause, type SceneExpectation } from '@/lib/scene-expectation'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { MODEL, THINKING, OUTPUT_CONFIG, maxTokensFor } from '@/lib/reading-model-config'
import {
  priorSectionBlocks, phrasesAlreadyUsedBlock, READING_SO_FAR_FOOTER, type PriorSection,
} from '@/lib/reading-thread'

export type NatalFrame = 'tropical' | 'sidereal' | 'synthesis'

const SYSTEM_PROMPT_MAP: Record<NatalFrame, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
}

/**
 * The cached rules block. SHARED_RULES unless AXIS_LEAN_RULES=true, which swaps
 * in the derived SHARED_RULES_LEAN so `npm run eval` can measure the dilution
 * hypothesis (see SHARED_RULES_LEAN in prompts.ts). Read per request, never at
 * import, so the harness can set it without a rebuild. Off by default.
 *
 * ⚠ Flipping it changes the prompt and therefore what the cache rows mean:
 * a lean run must be compared against its own baseline, and a measured keep
 * needs READING_PROMPT_VERSION bumped like any other prompt change.
 */
function rulesBlock(): string {
  return process.env.AXIS_LEAN_RULES === 'true' ? SHARED_RULES_LEAN : SHARED_RULES
}

export interface SectionRequest {
  // Exactly the params the route passes to anthropic.messages.stream().
  params: {
    model:      string
    max_tokens: number
    thinking:   Anthropic.ThinkingConfigParam
    output_config: Anthropic.OutputConfig
    system:     Anthropic.TextBlockParam[]
    messages:   [{ role: 'user'; content: Anthropic.TextBlockParam[] }]
  }
  // What the eval harness hands gateForCache alongside the first pass; the
  // route uses userContent for the pre-flight.
  userContent: string
  priorBlocks: Anthropic.TextBlockParam[]
  // The chart-scaled band the instruction's length clause was rendered from —
  // the same band the gate scores against. Reported per section by the harness.
  band:        WordBand
  // The counts the band was scaled by, for the route's [AXIS_LEN] line.
  aspectCount:   number
  evidenceCount: number | undefined
  // Whether the evidence can carry PART 1's moment (scene-expectation.ts).
  scene:         SceneExpectation
}

export function buildSectionRequest(
  dual: DualChartData,
  section: NatalFrame,
  planetSection: string,
  prior: PriorSection[],
): SectionRequest {
  if (!SECTION_INSTRUCTIONS[section]?.[planetSection]) throw new Error(`No section instruction for ${section}/${planetSection}`)

  const repeatBlock = phrasesAlreadyUsedBlock(prior)
  const priorText = prior.map(p => p.text).join('\n\n')

  let contextBlock: string
  if (section === 'synthesis') {
    contextBlock = buildInterpretationContext(dual, 'synthesis', planetSection)
  } else {
    const ctxBlock   = buildInterpretationContext(dual, section, planetSection, {
      priorText,
      priorPlanetSections: prior.filter(p => p.section === section).map(p => p.planetSection),
    })
    const chartBlock = formatEliteChartBlock(dual[section], section)
    contextBlock = `${chartBlock}\n${ctxBlock}`
  }

  // The length clause is substituted from the band THIS chart is scored against.
  const aspectCount   = countAspectsInContext(contextBlock)
  const evidenceCount = countPlanEvidence(contextBlock, planetSection) ?? undefined
  const band          = wordBandFor(section, planetSection, aspectCount, evidenceCount)
  const sectionInstruction = renderSectionInstruction(section, planetSection, { aspectCount, evidenceCount })!
  // Whether this section's evidence names a trigger PART 1's moment can be
  // built from. Stated beside the instruction, in the uncached tail, because
  // the nearer instruction is the one this model follows; the evaluator
  // computes the same value from the same context (scene-expectation.ts).
  const scene = sceneExpectation(section, planetSection, contextBlock, aspectCount)

  const userContent = `${contextBlock}\n\n---\n\n${repeatBlock}${sectionInstruction}\n\n${sceneClause(scene, section)}`

  const priorBlocks = priorSectionBlocks(prior)
  const userBlocks: Anthropic.TextBlockParam[] = [
    ...priorBlocks,
    { type: 'text', text: prior.length > 0 ? `${READING_SO_FAR_FOOTER}\n\n${userContent}` : userContent },
  ]

  return {
    params: {
      model:      MODEL,
      max_tokens:    maxTokensFor(planetSection),
      thinking:      THINKING,
      output_config: OUTPUT_CONFIG,
      system: [
        { type: 'text', text: rulesBlock(), cache_control: { type: 'ephemeral' } },
        { type: 'text', text: SYSTEM_PROMPT_MAP[section], cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userBlocks }],
    },
    userContent,
    priorBlocks,
    band,
    aspectCount,
    evidenceCount,
    scene,
  }
}
