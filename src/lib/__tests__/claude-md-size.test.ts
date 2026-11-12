// CLAUDE.md is loaded into every agent session, so every byte is paid on every
// task. It grew to 137 KB of version-by-version narrative before being cut to
// current state (~26 KB, 2026-11-10). This ceiling keeps it there.
//
// If this fails: move history, eval numbers and "why" stories to
// docs/PIPELINE-HISTORY.md (append a dated entry) or a comment beside the code,
// and state only the current rule here. Raise the ceiling only for genuinely new
// current-state content, and cut something else first.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

const CEILING_BYTES = 28_000

describe('CLAUDE.md stays current-state only', () => {
  it(`is under ${CEILING_BYTES} bytes`, () => {
    const bytes = readFileSync(resolve(process.cwd(), 'CLAUDE.md')).byteLength
    expect(bytes, `CLAUDE.md is ${bytes} bytes; move history to docs/PIPELINE-HISTORY.md`).toBeLessThan(CEILING_BYTES)
  })
})
