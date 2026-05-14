// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { formatChartForPrompt, DualChartData } from '@/lib/astro-calc'
import * as Prompts from '@/lib/prompts'
import { buildInterpretationContext } from '@/lib/interpretation-engine'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

const PROMPT_MAP: Record<string, Record<string, string>> = {
  tropical: {
    sun: Prompts.TROPICAL_SUN_PROMPT,
    moon: Prompts.TROPICAL_MOON_PROMPT,
    ascendant: Prompts.TROPICAL_ASCENDANT_PROMPT,
    mercury: Prompts.TROPICAL_MERCURY_PROMPT,
    venus: Prompts.TROPICAL_VENUS_PROMPT,
    mars: Prompts.TROPICAL_MARS_PROMPT,
    jupiter_saturn: Prompts.TROPICAL_JUPITER_SATURN_PROMPT,
    key_aspects: Prompts.TROPICAL_KEY_ASPECTS_PROMPT
  },
  sidereal: {
    lagna: Prompts.SIDEREAL_LAGNA_PROMPT,
    sun: Prompts.SIDEREAL_SUN_PROMPT,
    moon: Prompts.SIDEREAL_MOON_PROMPT,
    mercury: Prompts.SIDEREAL_MERCURY_PROMPT,
    venus: Prompts.SIDEREAL_VENUS_PROMPT,
    mars: Prompts.SIDEREAL_MARS_PROMPT,
    jupiter_saturn: Prompts.SIDEREAL_JUPITER_SATURN_PROMPT,
    rahu_ketu: Prompts.SIDEREAL_RAHU_KETU_PROMPT
  },
  synthesis: {
    agree: Prompts.SYNTHESIS_AGREE_PROMPT,
    diverge: Prompts.SYNTHESIS_DIVERGE_PROMPT,
    tension: Prompts.SYNTHESIS_TENSION_PROMPT,
    closing: Prompts.SYNTHESIS_CLOSING_PROMPT
  }
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

    const basePrompt = PROMPT_MAP[section]?.[planetSection]
    if (!basePrompt) {
      return NextResponse.json({ error: 'Invalid section or planetSection' }, { status: 400 })
    }

    const systemPrompt = basePrompt + `\n\nDo not reach for textbook sun-sign archetypes or clichéd sign behaviors. Read the specific combination of sign, house position, and aspects for each planet. A Leo Sun in the 4th house is not the same as a Leo Sun on the Midheaven — treat them differently. Avoid the following overused patterns entirely: Leo "needing the spotlight" or "withdrawing when not validated", Scorpio "being secretive or manipulative", Virgo "being critical", Capricorn "being cold". If a withdrawal or avoidance pattern is genuinely supported by multiple chart factors (e.g., Saturn conjunct Sun, 12th house stellium), you may name it — but ground it in the actual placements, not the archetype. Every interpretation must feel like it was written for this specific chart, not this sun sign.`

    const tropicalFormatted = () => formatChartForPrompt(chartData.tropical, 'tropical')
    const siderealFormatted = () => formatChartForPrompt(chartData.sidereal, 'sidereal')

    // Structured interpretation context: first-principles facts (dignity, sign modification,
    // house environment, dispositor chain, aspects, contradictions) derived before Claude writes.
    // This gives Claude a reasoning scaffold rather than letting it reconstruct facts from scratch.
    const interpretationContext = buildInterpretationContext(chartData, section, planetSection)

    const userContent =
      section === 'tropical'
        ? `Generate the ${planetSection} section for the Tropical reading.\n\nFULL CHART DATA:\n${tropicalFormatted()}\n${interpretationContext}`
        : section === 'sidereal'
          ? `Generate the ${planetSection} section for the Sidereal reading.\n\nFULL CHART DATA:\n${siderealFormatted()}\n${interpretationContext}`
          : `Generate the ${planetSection} section for the AXIS Synthesis reading.\n\nTROPICAL CHART:\n${tropicalFormatted()}\n\nSIDEREAL CHART:\n${siderealFormatted()}\n${interpretationContext}`

    const stream = await anthropic.messages.stream({
      model: 'claude-opus-4-5',
      max_tokens: 6000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })

    const encoder = new TextEncoder()
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
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          // Encode the error as a readable marker in the stream so the client can display it
          const msg = err instanceof Error ? err.message : String(err)
          controller.enqueue(encoder.encode(`\n\n[AXIS_STREAM_ERROR: ${msg}]`))
          controller.close()
        } finally {
          clearInterval(keepAlive)
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
