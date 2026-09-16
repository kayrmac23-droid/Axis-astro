import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

// Claude 5 rejects `temperature` rather than ignoring it. Keep this regression
// guard across every production request site: generation, evaluation, and both
// repair paths. The live failure presents as a 200 stream with an error sentinel,
// so an ordinary route status test would not catch this provider rejection.
describe('Claude 5 request configuration', () => {
  it('never sends the deprecated temperature parameter', () => {
    const requestSources = [
      new URL('../../app/api/reading/route.ts', import.meta.url),
      new URL('../reading-quality-gate.ts', import.meta.url),
    ]

    for (const source of requestSources) {
      expect(readFileSync(source, 'utf8')).not.toMatch(/\btemperature\s*:/)
    }
  })
})
