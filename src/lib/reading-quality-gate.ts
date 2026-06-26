// Reading Quality Gate
//
// Second-pass evaluator that runs every generated section against AXIS's
// elite-reading criteria BEFORE the result is cached or returned to the user.
// If the section fails, it is regenerated once with the evaluator's critique
// included as repair instructions. The repaired text is what gets cached.
//
// This is the load-bearing check the prompt alone cannot enforce: model output
// is non-deterministic, and a strong prompt can still occasionally produce a
// generic, under-synthesised, or insufficiently chart-grounded section. The
// gate refuses to ship those.
//
// Threshold: average score ≥ 3.75 / 5 AND no individual criterion below 3.
// A single weak criterion fails the section regardless of average. Caching
// only happens after a pass.

import Anthropic from '@anthropic-ai/sdk'

// Haiku 4.5 is fast enough (~3s for short JSON output) that it adds little
// latency to the request, while still capable of the discriminating judgment
// the gate requires.
const EVAL_MODEL = 'claude-haiku-4-5-20251001'
const EVAL_MAX_TOKENS = 600
const EVAL_TEMPERATURE = 0

const REPAIR_TEMPERATURE = 0.2

const CRITERIA = [
  'chart_evidence',
  'specificity',
  'synthesis',
  'contradiction_handling',
  'anti_cliche',
  'psychological_depth',
  'practical_usefulness',
  'voice_quality',
] as const

type CriterionKey = typeof CRITERIA[number]

export interface GateScores {
  chart_evidence:         number
  specificity:            number
  synthesis:              number
  contradiction_handling: number
  anti_cliche:            number
  psychological_depth:    number
  practical_usefulness:   number
  voice_quality:          number
}

export interface GateResult {
  pass:     boolean
  scores:   GateScores | null
  critique: string
  // Internal — true when the evaluator itself errored and we defaulted to a pass.
  // We never block the user on evaluator failure; we cache the first pass.
  evaluatorErrored: boolean
}

const MIN_PASS_AVERAGE = 3.75
const MIN_INDIVIDUAL   = 3

const EVAL_SYSTEM_PROMPT = `You are the AXIS reading quality evaluator.

Your job is to score a single generated section of a natal chart reading against AXIS's elite-reading criteria. You return STRICT JSON only — no prose, no markdown, no preamble.

CRITERIA (score each 1–5; 5 = elite, 4 = strong, 3 = adequate, 2 = weak, 1 = unacceptable):

1. chart_evidence — Are major claims traceable to specific placements, houses, aspects, dignity, rulership, dispositors, nodes, dashas, or synthesis factors actually present in the chart context? Generic claims with no chart anchor score low.
2. specificity — Does the section describe recognisable lived patterns (concrete scenes, behavioural moments, what others see) rather than abstract trait labels?
3. synthesis — Does it combine chart factors (sign × house × aspect × dignity × ruler chain) rather than listing them separately? Are cross-references named (e.g. "this Sun's confidence, but with the Moon-in-Cancer guarded layer underneath")?
4. contradiction_handling — Does it name paradoxes, compensations, tensions, and mixed expressions? When two placements pull in opposite directions, is the contradiction held open rather than averaged away?
5. anti_cliche — Does it avoid sun-sign clichés (Scorpio = secretive, Virgo = critical, Leo = needing spotlight), vague affirmations ("your sensitivity is a gift"), and horoscope-voice phrasing?
6. psychological_depth — Does it explain defence patterns, relational dynamics, self-perception, blind spots, gifts, and shadow with real psychological grain — or stay at trait-level surface?
7. practical_usefulness — Will the reader leave with clearer self-understanding (a recognisable scene, a named pattern they can now see) rather than just aesthetic prose?
8. voice_quality — Does it sound like AXIS: precise, elegant, unsentimental, warm-but-honest, British spelling (favour/colour/recognised/practise), no mystical fluff, no wellness-industry softness, no predictions, no prescriptions?

DECISION RULES:
- pass = true ONLY IF the average of all 8 scores is ≥ 3.75 AND no individual score is below 3.
- If pass = false, write a CRITIQUE that is a list of concrete, actionable repair instructions. Reference specific chart factors the section ignored, specific clichés to remove, specific contradictions left unnamed, specific voice problems to fix. The critique will be fed back into a regeneration pass — write it for the model that has to rewrite the section, not for a human review committee.
- If pass = true, critique should be an empty string.

OUTPUT FORMAT (strict JSON, no markdown fence, no surrounding text):
{
  "scores": {
    "chart_evidence": <1-5>,
    "specificity": <1-5>,
    "synthesis": <1-5>,
    "contradiction_handling": <1-5>,
    "anti_cliche": <1-5>,
    "psychological_depth": <1-5>,
    "practical_usefulness": <1-5>,
    "voice_quality": <1-5>
  },
  "pass": <true|false>,
  "critique": "<repair instructions or empty string>"
}`

function getAnthropic(): Anthropic {
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
}

function extractText(message: Anthropic.Message): string {
  return message.content
    .filter((b): b is Anthropic.TextBlock => b.type === 'text')
    .map(b => b.text)
    .join('')
}

// Strip optional ```json fences and leading whitespace so JSON.parse succeeds
// even when the model adds a markdown wrapper despite instructions.
function stripJsonFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/, '').trim()
  }
  return s
}

function validateScores(obj: unknown): GateScores | null {
  if (!obj || typeof obj !== 'object') return null
  const o = obj as Record<string, unknown>
  const result = {} as GateScores
  for (const key of CRITERIA) {
    const v = o[key]
    if (typeof v !== 'number' || !Number.isFinite(v) || v < 1 || v > 5) return null
    result[key as CriterionKey] = v
  }
  return result
}

function computePassFromScores(scores: GateScores): boolean {
  const values = CRITERIA.map(k => scores[k])
  const min    = Math.min(...values)
  const avg    = values.reduce((a, b) => a + b, 0) / values.length
  return avg >= MIN_PASS_AVERAGE && min >= MIN_INDIVIDUAL
}

export interface EvaluateInput {
  generatedText: string
  chartContext:  string
  section:       string
  planetSection: string
}

export async function evaluateSection({
  generatedText, chartContext, section, planetSection,
}: EvaluateInput): Promise<GateResult> {
  const evalUserContent = `SECTION TYPE: ${section} → ${planetSection}

──────────── CHART CONTEXT THE SECTION WAS GENERATED FROM ────────────
${chartContext}

──────────── GENERATED SECTION TO EVALUATE ────────────
${generatedText}

Score the generated section against the eight criteria and return the JSON object specified in the system prompt.`

  try {
    const msg = await getAnthropic().messages.create({
      model:       EVAL_MODEL,
      max_tokens:  EVAL_MAX_TOKENS,
      temperature: EVAL_TEMPERATURE,
      system:      EVAL_SYSTEM_PROMPT,
      messages:    [{ role: 'user', content: evalUserContent }],
    })

    const raw = extractText(msg)
    const parsed = JSON.parse(stripJsonFence(raw)) as {
      scores?:   unknown
      pass?:     unknown
      critique?: unknown
    }

    const scores = validateScores(parsed.scores)
    if (!scores) {
      console.error('Reading quality gate: invalid scores object in evaluator output')
      return { pass: true, scores: null, critique: '', evaluatorErrored: true }
    }

    // Trust the scores over the model's pass field — recompute deterministically.
    const pass = computePassFromScores(scores)
    const critique = typeof parsed.critique === 'string' ? parsed.critique.trim() : ''

    return {
      pass,
      scores,
      critique: pass ? '' : critique,
      evaluatorErrored: false,
    }
  } catch (err) {
    // Never block a user on evaluator failure — fall through to caching the
    // first pass. The prompt's own constraints remain in force; the gate is
    // an additional safety net, not a single point of failure.
    console.error('Reading quality gate evaluator error:', err instanceof Error ? err.message : err)
    return { pass: true, scores: null, critique: '', evaluatorErrored: true }
  }
}

export interface RepairInput {
  // Same content that produced the failed first draft — chart blocks + section instructions.
  originalUserContent: string
  systemBlocks:        Anthropic.TextBlockParam[]
  failedDraft:         string
  critique:            string
  maxTokens:           number
  model:               string
}

export async function repairSection({
  originalUserContent, systemBlocks, failedDraft, critique, maxTokens, model,
}: RepairInput): Promise<string> {
  const repairUserContent = `${originalUserContent}

──────────── QUALITY-GATE REPAIR PASS ────────────
The first draft of this section did not meet the AXIS quality threshold. The evaluator's critique follows. Rewrite the section from scratch, addressing every point in the critique while keeping the same structure, sub-headers, and depth target.

CRITIQUE TO ADDRESS:
${critique}

DO NOT:
- Reference this critique in your output
- Apologise, hedge, or explain that you are rewriting
- Reuse phrasing from the first draft unless it was specifically commended

Produce only the rewritten section. The first character of your reply must be the section's first character (typically the ## heading).

For reference only — the first draft that failed (do NOT quote, echo, or recycle it):
${failedDraft}`

  const msg = await getAnthropic().messages.create({
    model,
    max_tokens:  maxTokens,
    temperature: REPAIR_TEMPERATURE,
    system:      systemBlocks,
    messages:    [{ role: 'user', content: repairUserContent }],
  })

  return extractText(msg)
}
