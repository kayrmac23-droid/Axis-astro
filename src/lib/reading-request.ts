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
  TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SECTION_INSTRUCTIONS, SHARED_RULES,
  renderSectionInstruction, countPlanEvidence, wordBandFor, type WordBand,
} from '@/lib/prompts'
import { countAspectsInContext } from '@/lib/reading-quality-gate'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { MODEL, THINKING, MAX_TOKENS_PER_SECTION } from '@/lib/reading-model-config'
import {
  priorSectionBlocks, phrasesAlreadyUsedBlock, READING_SO_FAR_FOOTER, type PriorSection,
} from '@/lib/reading-thread'

export type NatalFrame = 'tropical' | 'sidereal' | 'synthesis'

const SYSTEM_PROMPT_MAP: Record<NatalFrame, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
}

export interface SectionRequest {
  // Exactly the params the route passes to anthropic.messages.stream().
  params: {
    model:      string
    max_tokens: number
    thinking:   Anthropic.ThinkingConfigParam
    system:     Anthropic.TextBlockParam[]
    messages:   [{ role: 'user'; content: Anthropic.TextBlockParam[] }]
  }
  // What the route hands gateForCache alongside the first pass.
  userContent: string
  priorBlocks: Anthropic.TextBlockParam[]
  // The chart-scaled band the instruction's length clause was rendered from —
  // the same band the gate scores against. Reported per section by the harness.
  band:        WordBand
  // The counts the band was scaled by, for the route's [AXIS_LEN] line.
  aspectCount:   number
  evidenceCount: number | undefined
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
    const ctxBlock   = buildInterpretationContext(dual, section, planetSection, { priorText })
    const chartBlock = formatEliteChartBlock(dual[section], section)
    contextBlock = `${chartBlock}\n${ctxBlock}`
  }

  // The length clause is substituted from the band THIS chart is scored against.
  const aspectCount   = countAspectsInContext(contextBlock)
  const evidenceCount = countPlanEvidence(contextBlock, planetSection) ?? undefined
  const band          = wordBandFor(section, planetSection, aspectCount, evidenceCount)
  const sectionInstruction = renderSectionInstruction(section, planetSection, { aspectCount, evidenceCount })!

  const userContent = `${contextBlock}\n\n---\n\n${repeatBlock}${sectionInstruction}`

  const priorBlocks = priorSectionBlocks(prior)
  const userBlocks: Anthropic.TextBlockParam[] = [
    ...priorBlocks,
    { type: 'text', text: prior.length > 0 ? `${READING_SO_FAR_FOOTER}\n\n${userContent}` : userContent },
  ]

  return {
    params: {
      model:      MODEL,
      max_tokens: MAX_TOKENS_PER_SECTION[planetSection] ?? 2000,
      thinking:   THINKING,
      system: [
        { type: 'text', text: SHARED_RULES, cache_control: { type: 'ephemeral' } },
        { type: 'text', text: SYSTEM_PROMPT_MAP[section], cache_control: { type: 'ephemeral' } },
      ],
      messages: [{ role: 'user', content: userBlocks }],
    },
    userContent,
    priorBlocks,
    band,
    aspectCount,
    evidenceCount,
  }
}
