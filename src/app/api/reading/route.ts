// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { DualChartData } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, SECTION_INSTRUCTIONS } from '@/lib/prompts'
import { buildInterpretationContext, formatEliteChartBlock } from '@/lib/interpretation-engine'
import { makeCacheKey, getCachedReading, setCachedReading } from '@/lib/reading-cache'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const SYSTEM_PROMPT_MAP: Record<string, string> = {
  tropical:  TROPICAL_SYSTEM_PROMPT,
  sidereal:  SIDEREAL_SYSTEM_PROMPT,
  synthesis: SYNTHESIS_SYSTEM_PROMPT,
}

export async function POST(req: NextRequest) {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json({ error: 'API key not configured', detail: 'ANTHROPIC_API_KEY is not set — add it to .env.local or Vercel environment variables' }, { status: 500 })
    }

    const { chartData, section, planetSection }: { chartData: DualChartData; section: 'tropical' | 'sidereal' | 'synthesis', planetSection: string } = await req.json()

    if (!chartData || !section || !planetSection) {
      return NextResponse.json({ error: 'Missing chart data, section, or planetSection' }, { status: 400 })
    }

    const systemPrompt = SYSTEM_PROMPT_MAP[section]
    if (!systemPrompt) {
      return NextResponse.json({ error: 'Invalid section' }, { status: 400 })
    }

    const sectionInstruction = SECTION_INSTRUCTIONS[section]?.[planetSection]
    if (!sectionInstruction) {
      return NextResponse.json({ error: 'Invalid section or planetSection' }, { status: 400 })
    }

    // ── Cache check ────────────────────────────────────────────────────────────
    const cacheKey = makeCacheKey({ birth: chartData.birthData, section, planetSection })
    const cached = getCachedReading(cacheKey)
    if (cached) {
      return new Response(cached, {
        headers: { 'Content-Type': 'text/plain; charset=utf-8' }
      })
    }

    // ── Build prompt ───────────────────────────────────────────────────────────
    // Structured interpretation context: first-principles facts (dignity, sign modification,
    // house environment, dispositor chain, aspects with applying/separating, contradictions,
    // dasha, yogas) derived before Claude writes. This scaffold prevents hallucinated
    // dignity/aspect data and anchors interpretation in actual chart positions.
    const interpretationContext = buildInterpretationContext(chartData, section, planetSection)

    // Elite chart block: compact human-readable summary injected at the top of the user message.
    // Gives the model a bird's-eye view of the whole chart before the section-specific instruction.
    let userContent: string

    if (section === 'tropical') {
      const chartBlock = formatEliteChartBlock(chartData.tropical, 'tropical')
      userContent = `${chartBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    } else if (section === 'sidereal') {
      const chartBlock = formatEliteChartBlock(chartData.sidereal, 'sidereal')
      userContent = `${chartBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    } else {
      // Synthesis: show both charts in full
      const tropicalBlock = formatEliteChartBlock(chartData.tropical, 'tropical')
      const siderealBlock = formatEliteChartBlock(chartData.sidereal, 'sidereal')
      userContent = `${tropicalBlock}\n\n${siderealBlock}\n${interpretationContext}\n\n---\n\n${sectionInstruction}`
    }

    // ── Stream generation ──────────────────────────────────────────────────────
    const stream = await anthropic.messages.stream({
      model:      'claude-opus-4-5',
      max_tokens: 6000,
      temperature: 0.2,   // low temperature for consistent, deterministic readings
      system:     systemPrompt,
      messages:   [{ role: 'user', content: userContent }]
    })

    const encoder = new TextEncoder()
    let accumulated = ''
    let streamErrored = false

    const readable = new ReadableStream({
      async start(controller) {
        let hasFirstToken = false
        const keepAlive = setInterval(() => {
          if (!hasFirstToken) controller.enqueue(encoder.encode(' '))
        }, 5000)
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              hasFirstToken = true
              accumulated += chunk.delta.text
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          streamErrored = true
          const msg = err instanceof Error ? err.message : String(err)
          controller.enqueue(encoder.encode(`\n\n[AXIS_STREAM_ERROR: ${msg}]`))
          controller.close()
        } finally {
          clearInterval(keepAlive)
          // Cache only on clean completion: no stream error and non-empty text
          if (!streamErrored && accumulated.trim()) {
            setCachedReading(cacheKey, accumulated)
          }
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      }
    })
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    console.error('Reading generation error:', message)
    return NextResponse.json({ error: 'Reading generation failed', detail: message }, { status: 500 })
  }
}
