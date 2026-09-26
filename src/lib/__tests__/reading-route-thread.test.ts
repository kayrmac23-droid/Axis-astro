// End-to-end through /api/reading with the Anthropic SDK mocked: proves what the
// model is actually SENT once sections are threaded. Kept in its own file so the
// SDK and next/server mocks cannot leak into the rest of the suite.
import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest'
import { NextRequest } from 'next/server'
// vi.mock calls are hoisted above these imports, so the route loads with both mocks.
import { POST } from '@/app/api/reading/route'
import { _resetThreadMemoryForTests } from '@/lib/reading-thread'

type StreamParams = { messages: { role: string; content: { type: string; text: string; cache_control?: unknown }[] }[] }
const streamCalls: StreamParams[] = []
let nextText = ''

vi.mock('@anthropic-ai/sdk', () => {
  class Anthropic {
    messages = {
      stream: (params: StreamParams) => {
        streamCalls.push(params)
        const text = nextText
        return {
          async *[Symbol.asyncIterator]() {
            yield { type: 'content_block_delta', delta: { type: 'text_delta', text } }
          },
          finalMessage: async () => ({ stop_reason: 'end_turn' }),
        }
      },
      create: async () => { throw new Error('gate is not under test here') },
    }
  }
  return { default: Anthropic }
})

// The quality gate runs in after(), which needs a live request scope; it is not
// what this file tests, so after() is a no-op.
vi.mock('next/server', async importOriginal => {
  const actual = await importOriginal<typeof import('next/server')>()
  return { ...actual, after: () => {} }
})


const BIRTH = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.02, timezone: 10,
}
const THREAD = '3f2b8c1e-9a4d-4e7b-8c21-5d6f7a8b9c0d'

async function read(section: string, planetSection: string, text: string, extra: Record<string, unknown> = {}) {
  nextText = text
  const res = await POST(new NextRequest('https://x/api/reading', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-forwarded-for': `10.0.0.${streamCalls.length + 1}` },
    body: JSON.stringify({ birthData: BIRTH, section, planetSection, threadId: THREAD, ...extra }),
  }))
  expect(res.status).toBe(200)
  return res.text()
}

const lastUserBlocks = () => streamCalls[streamCalls.length - 1].messages[0].content

describe('/api/reading — sections are written after the reading so far', () => {
  const priorKey = process.env.ANTHROPIC_API_KEY
  beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
  afterAll(() => {
    if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
    else process.env.ANTHROPIC_API_KEY = priorKey
  })
  beforeEach(() => { streamCalls.length = 0; _resetThreadMemoryForTests() })

  it('the opening section is sent with no reading so far', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    const blocks = lastUserBlocks()
    expect(blocks).toHaveLength(1)
    expect(blocks[0].text).not.toContain('THE READING SO FAR')
  })

  it('the next section is sent the text the reader just read', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    await read('tropical', 'moon', '## The Moon\n\nMOON-PROSE.')
    const blocks = lastUserBlocks()
    expect(blocks).toHaveLength(2)
    expect(blocks[0].text).toContain('THE READING SO FAR')
    expect(blocks[0].text).toContain('SUN-PROSE.')
    expect(blocks[0].cache_control).toEqual({ type: 'ephemeral' })
    // This section's own chart context and instruction come after the reading so far.
    expect(blocks[1].text).toContain('END OF THE READING SO FAR')
    expect(blocks[1].text).not.toContain('SUN-PROSE.')
  })

  it('the sidereal reading is sent the tropical text', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    await read('tropical', 'moon', '## The Moon\n\nMOON-PROSE.')
    await read('sidereal', 'lagna', '## The Lagna\n\nLAGNA-PROSE.')
    const prior = lastUserBlocks().slice(0, -1).map(b => b.text).join('\n')
    expect(prior).toContain('ALREADY READ · Tropical reading · Sun')
    expect(prior).toContain('SUN-PROSE.')
    expect(prior).toContain('MOON-PROSE.')
  })

  it('The Divergence is sent both readings', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    await read('sidereal', 'lagna', '## The Lagna\n\nLAGNA-PROSE.')
    await read('synthesis', 'agree', '## Concordance\n\nAGREE-PROSE.')
    const prior = lastUserBlocks().slice(0, -1).map(b => b.text).join('\n')
    expect(prior).toContain('SUN-PROSE.')
    expect(prior).toContain('LAGNA-PROSE.')
  })

  it('a request with no thread id is written as an opening section, as before', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    await read('tropical', 'moon', '## The Moon\n\nMOON-PROSE.', { threadId: undefined })
    expect(lastUserBlocks()).toHaveLength(1)
  })

  it('a malformed thread id is ignored rather than trusted', async () => {
    await read('tropical', 'sun', '## The Sun\n\nSUN-PROSE.')
    await read('tropical', 'moon', '## The Moon\n\nMOON-PROSE.', { threadId: 'not-a-uuid' })
    expect(lastUserBlocks()).toHaveLength(1)
  })
})
