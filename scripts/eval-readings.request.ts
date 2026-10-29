// scripts/eval-readings.request.ts
//
// The Anthropic request /api/reading sends for one natal section, assembled from
// the production modules for the batch evaluation harness (eval-readings.mjs).
//
// The route builds this inline, so the assembly below necessarily mirrors it —
// every prompt, chart block, context block, model constant and thread helper is
// imported, but the glue (the order they are concatenated in) is restated here.
// That glue is pinned by src/lib/__tests__/eval-harness-parity.test.ts, which
// drives the real route with the SDK mocked and asserts it sends exactly what
// buildSectionRequest returns. If the route's assembly changes, that test fails
// until this file is brought back in line — the harness cannot silently measure
// a request production no longer sends.
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
  }
}
