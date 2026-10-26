// Pins the batch eval harness (scripts/eval-readings.mjs) to /api/reading: drives
// the real route through a whole natal reading with the Anthropic SDK mocked, and
// asserts that every request it sends is exactly what the harness's
// buildSectionRequest builds for the same chart and the same reading so far.
// If the route's prompt assembly changes, this fails until the harness is brought
// back in line — the harness must never measure a request production does not send.
// Kept in its own file so the SDK and next/server mocks cannot leak.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests, type PriorSection } from '@/lib/reading-thread'
import { NATAL_SECTION_ORDER, priorSectionsFor } from '@/lib/reading-order'
import { calculateDualChart } from '@/lib/astro-calc'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { unknownTimeAngleNotice } from '@/lib/unknown-time-notice'
import { buildSectionRequest, type NatalFrame } from '../../../scripts/eval-readings.request'

const streamCalls: unknown[] = []
let nextText = ''

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: (params: unknown) => {
        streamCalls.push(params)
        const text = nextText
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
          },
          finalMessage: async () => ({
            stop_reason: 'end_turn',
            usage: { input_tokens: 1, output_tokens: 1, cache_read_input_tokens: 0, cache_creation_input_tokens: 0 },
          }),
        }
      },
      create: async () => { throw new Error('gate is not under test here') },
    }
  }
  return { default: Anthropic }
})

vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} }
})

const KNOWN   = { year: 1984, month: 5, day: 1, hour: 3, minute: 30, latitude: -26.2041, longitude: 28.0473, timezone: 2 }
const UNKNOWN = { year: 1996, month: 7, day: 4, latitude: 55.8642, longitude: -4.2518, timezone: 1, birthTimeUnknown: true }
const THREAD  = '7c1d2e3f-4a5b-4c6d-8e7f-9a0b1c2d3e4f'

async function readWholeReading(birth: Record<string, unknown>) {
  const parsed = parseBirthDataInput(birth, { resolveTzName: false })
  if (!parsed.ok) throw new Error(parsed.error)
  const dual = calculateDualChart(parsed.data)
  const thread = new Map<string, string>()
  let ip = 0

  for (const section of ['tropical', 'sidereal', 'synthesis'] as NatalFrame[]) {
    for (const planetSection of NATAL_SECTION_ORDER[section] as readonly string[]) {
      const label = `${section}/${planetSection}`
      nextText = `## ${label}\n\nPROSE FOR ${label}.`
      const before = streamCalls.length
      const res = await POST(new NextRequest('https://x/api/reading', {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.9.${Math.floor(++ip / 200)}.${ip % 200}` },
        body: JSON.stringify({ birthData: birth, section, planetSection, threadId: THREAD }),
      }))
      expect(res.status).toBe(200)
      const text = await res.text()

      const prior: PriorSection[] = priorSectionsFor(section, planetSection).flatMap(ref => {
        const t = thread.get(`${ref.section}/${ref.planetSection}`)
        return t ? [{ ...ref, text: t }] : []
      })

      if (parsed.data.birthTimeUnknown && (planetSection === 'ascendant' || planetSection === 'lagna')) {
        expect(streamCalls.length, `${label} must not call the model`).toBe(before)
        expect(text).toBe(unknownTimeAngleNotice(planetSection))
      } else {
        expect(streamCalls.length, `${label} must call the model once`).toBe(before + 1)
        expect(streamCalls[streamCalls.length - 1], label).toEqual(buildSectionRequest(dual, section, planetSection, prior).params)
      }
      thread.set(label, text)
    }
  }
}

describe('eval harness ↔ /api/reading parity', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => { streamCalls.length = 0; _resetThreadMemoryForTests() })

  it('every section of a known-time reading sends exactly the harness request', async () => {
    await readWholeReading(KNOWN)
    expect(streamCalls).toHaveLength(21)
  })

  it('an unknown-time reading matches too, with the angle sections answered deterministically', async () => {
    await readWholeReading(UNKNOWN)
    expect(streamCalls).toHaveLength(19)
  })
})
