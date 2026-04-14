// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { formatChartForPrompt, DualChartData } from '@/lib/astro-calc'
import * as Prompts from '@/lib/prompts'

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
    const { chartData, section, planetSection }: { chartData: DualChartData; section: 'tropical' | 'sidereal' | 'synthesis', planetSection: string } = await req.json()

    if (!chartData || !section || !planetSection) {
      return NextResponse.json({ error: 'Missing chart data, section, or planetSection' }, { status: 400 })
    }

    const systemPrompt = PROMPT_MAP[section]?.[planetSection]
    if (!systemPrompt) {
      return NextResponse.json({ error: 'Invalid section or planetSection' }, { status: 400 })
    }

    let userContent = ''
    const tropicalFormatted = formatChartForPrompt(chartData.tropical, 'tropical')
    const siderealFormatted = formatChartForPrompt(chartData.sidereal, 'sidereal')

    if (section === 'tropical') {
      userContent = `Generate the ${planetSection} section for the Tropical reading. Here is the full chart data for cross-chart accuracy context:\n\n${tropicalFormatted}`
    } else if (section === 'sidereal') {
      userContent = `Generate the ${planetSection} section for the Sidereal reading. Here is the full chart data for cross-chart accuracy context:\n\n${siderealFormatted}`
    } else if (section === 'synthesis') {
      userContent = `Generate the ${planetSection} section for the AXIS Synthesis reading. Here is the full chart data:\n\nTROPICAL CHART:\n${tropicalFormatted}\n\nSIDEREAL CHART:\n${siderealFormatted}`
    }

    // Stream the response
    const stream = await anthropic.messages.stream({
      model: 'claude-3-5-sonnet-20241022',
      max_tokens: 6000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })

    // Return as a readable stream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        let firstToken = false
        const keepAlive = setInterval(() => {
          if (!firstToken) controller.enqueue(encoder.encode(' '))
        }, 5000)
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              firstToken = true
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
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
  } catch (error: any) {
    console.error('Reading generation error:', JSON.stringify(error, null, 2))
    console.error('Error message:', error?.message)
    return NextResponse.json({ error: 'Reading generation failed' }, { status: 500 })
  }
}
