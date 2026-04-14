// app/api/reading/route.ts
import { NextRequest, NextResponse } from 'next/server'
import Anthropic from '@anthropic-ai/sdk'
import { formatChartForPrompt, DualChartData } from '@/lib/astro-calc'
import { TROPICAL_SYSTEM_PROMPT, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT } from '@/lib/prompts'

export const maxDuration = 60

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY
})

export async function POST(req: NextRequest) {
  try {
    const { chartData, section }: { chartData: DualChartData; section: 'tropical' | 'sidereal' | 'synthesis' } = await req.json()

    if (!chartData || !section) {
      return NextResponse.json({ error: 'Missing chart data or section' }, { status: 400 })
    }

    let systemPrompt = ''
    let userContent = ''

    const tropicalFormatted = formatChartForPrompt(chartData.tropical, 'tropical')
    const siderealFormatted = formatChartForPrompt(chartData.sidereal, 'sidereal')

    if (section === 'tropical') {
      systemPrompt = TROPICAL_SYSTEM_PROMPT
      userContent = `Generate the Tropical reading for this chart:\n\n${tropicalFormatted}`
    } else if (section === 'sidereal') {
      systemPrompt = SIDEREAL_SYSTEM_PROMPT
      userContent = `Generate the Sidereal reading for this chart:\n\n${siderealFormatted}`
    } else if (section === 'synthesis') {
      systemPrompt = SYNTHESIS_SYSTEM_PROMPT
      userContent = `Generate the AXIS Synthesis reading.\n\nTROPICAL CHART:\n${tropicalFormatted}\n\nSIDEREAL CHART:\n${siderealFormatted}`
    }

    // Stream the response
    const stream = await anthropic.messages.stream({
      model: 'claude-sonnet-4-5',
      max_tokens: 6000,
      temperature: 0.7,
      system: systemPrompt,
      messages: [{ role: 'user', content: userContent }]
    })

    // Return as a readable stream
    const encoder = new TextEncoder()
    const readable = new ReadableStream({
      async start(controller) {
        try {
          for await (const chunk of stream) {
            if (chunk.type === 'content_block_delta' && chunk.delta.type === 'text_delta') {
              controller.enqueue(encoder.encode(chunk.delta.text))
            }
          }
          controller.close()
        } catch (err) {
          controller.error(err)
        }
      }
    })

    return new Response(readable, {
      headers: {
        'Content-Type': 'text/plain; charset=utf-8',
        'Transfer-Encoding': 'chunked',
      }
    })
  } catch (error) {
    console.error('Reading generation error:', error)
    return NextResponse.json({ error: 'Reading generation failed' }, { status: 500 })
  }
}
