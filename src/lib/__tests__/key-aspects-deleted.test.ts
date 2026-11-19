// DOCTRINE.md — LENGTH (1): the tropical Key Aspects section is deleted (v10.61).
// These pin the deletion so the section cannot come back through any one of the
// tables it used to live in.

import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { NextRequest } from 'next/server'
import { POST as readingPOST } from '@/app/api/reading/route'
import { NATAL_SECTION_ORDER } from '@/lib/reading-order'
import { SECTION_WORD_BANDS, SECTION_INSTRUCTIONS } from '@/lib/prompts'

describe('tropical Key Aspects is deleted (DOCTRINE: LENGTH (1))', () => {
  it('is not in the tropical reading order', () => {
    expect(NATAL_SECTION_ORDER.tropical as readonly string[]).not.toContain('key_aspects')
  })

  it('has no word band', () => {
    expect(Object.keys(SECTION_WORD_BANDS)).not.toContain('tropical:key_aspects')
  })

  it('has no section instruction', () => {
    expect(Object.keys(SECTION_INSTRUCTIONS.tropical)).not.toContain('key_aspects')
  })

  describe('the reading route', () => {
    const priorKey = process.env.ANTHROPIC_API_KEY
    beforeAll(() => { process.env.ANTHROPIC_API_KEY = 'sk-ant-test-not-a-real-key' })
    afterAll(() => {
      if (priorKey === undefined) delete process.env.ANTHROPIC_API_KEY
      else process.env.ANTHROPIC_API_KEY = priorKey
    })

    it('rejects planetSection=key_aspects with the invalid-section response', async () => {
      const res = await readingPOST(new NextRequest('https://x/api/reading', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          birthData: { year: 1990, month: 6, day: 15, hour: 12, minute: 0, latitude: 51.5, longitude: -0.12, timezone: 0 },
          section: 'tropical', planetSection: 'key_aspects',
        }),
      }))
      expect(res.status).toBe(400)
      expect(await res.json()).toEqual({ error: 'Invalid planetSection for this section' })
    })
  })
})
