import { describe, it, expect } from 'vitest'
import { preflightSection, pickBetter, formatPreflightLog } from '@/lib/reading-preflight'
import { wordBandFor } from '@/lib/prompts'

const BAND = wordBandFor('tropical', 'sun', 0)
const CONTEXT = `TROPICAL CHART
Sun: Leo 14.4° · House 4 · Domicile ✓ · direct

ASPECTS (tightest first):
• Trine Moon (2.1°, close, applying, harmonising) | Moon H8
ORB WEIGHT: tight ≤2°, close ≤4°, moderate ≤6°, wide >6°.`

// In-band, second person, no tic, no banned opener, no fabricated figure.
const clean = (n = BAND.fullMin + 20) =>
  '## The Sun\n\nYou notice it first in the ordinary case. ' +
  Array.from({ length: Math.max(0, n - 6) }, (_, i) => `word${i}`).join(' ') + '.'

const run = (text: string) =>
  preflightSection({ text, chartContext: CONTEXT, section: 'tropical', planetSection: 'sun', band: BAND })

describe('preflightSection — the deterministic checks on the hot path', () => {
  it('passes clean, in-band prose with nothing to say', () => {
    const r = run(clean())
    expect(r.findings).toEqual([])
    expect(r.instruction).toBe('')
  })

  it('catches a section under the hard floor, and says to work more chart rather than pad', () => {
    const r = run('## The Sun\n\nYou notice it. Short.')
    expect(r.findings.map(f => f.check)).toContain('length')
    expect(r.instruction).toMatch(/under the \d+-word floor/)
    expect(r.instruction).toMatch(/do not pad/)
  })

  it('leaves a merely out-of-band section alone — only a HARD length miss regenerates', () => {
    // Between fullMin and hardMin scores 3, which the gate itself does not fail.
    // Spending a generation call to chase a point nothing deducts for would make
    // the pre-flight more expensive than the evaluator it sits in front of.
    const slightlyShort = clean(Math.floor((BAND.hardMin + BAND.fullMin) / 2))
    expect(run(slightlyShort).findings.map(f => f.check)).not.toContain('length')
  })

  it('catches the banned existential opener and names this section\'s opening mode', () => {
    const r = run('## The Sun\n\nThere is a particular kind of restlessness here. ' + clean().slice(12))
    expect(r.findings.map(f => f.check)).toContain('opener')
    expect(r.instruction).toMatch(/Open instead on/)
  })

  it('catches the antithesis tic as paragraph density (v10.45)', () => {
    const tics = ' It asserts rather than asks. It leads rather than follows. It is not a stance but a reflex. It arrives less a decision than a habit.'
    const r = run(clean() + tics)
    const f = r.findings.find(x => x.check === 'antithesis-tic')
    expect(f).toBeDefined()
    expect(f!.detail).toContain('in one paragraph')
    expect(f!.detail).toContain('at most one per paragraph')
  })

  it('catches a fabricated degree and tells the rewrite to re-derive it, not delete it', () => {
    const r = run(clean() + ' The square sits at 44.4° of separation.')
    expect(r.findings.map(f => f.check)).toContain('unstated-degree')
    expect(r.instruction).toMatch(/Re-derive it from the context/)
  })

  it('catches a placement bled out of the prompt\'s worked example', () => {
    const r = run('## The Sun\n\nYour Mercury in Aries answers first. ' + clean().slice(12))
    expect(r.findings.map(f => f.check)).toContain('exemplar-bleed')
    expect(r.instruction).toMatch(/a different chart/)
  })

  it('catches a hard stated-rule breach', () => {
    const r = run(clean() + ' You should sit with that for a while.')
    expect(r.findings.map(f => f.check)).toContain('prescription')
  })

  it('reports the antithesis tic once, from the tic check rather than twice via the rule scan', () => {
    const tics = ' It asserts rather than asks. It leads rather than follows. It is not a stance but a reflex. It arrives less a decision than a habit.'
    const checks = run(clean() + tics).findings.map(f => f.check)
    expect(checks.filter(c => c === 'antithesis-tic')).toHaveLength(1)
  })

  it('is scoped by frame, so The Divergence is not failed for being third person', () => {
    // register-drift is a natal rule; The Divergence is third person by its own
    // instruction. A frame-blind check would regenerate every Divergence section.
    const band = wordBandFor('synthesis', 'diverge', 0, 4)
    const thirdPerson = '## The Divergence\n\n' +
      Array.from({ length: band.fullMin + 10 }, (_, i) => `word${i}`).join(' ') + '.'
    const r = preflightSection({
      text: thirdPerson, chartContext: 'DIVERGENCE PLAN\nPLAN WEIGHT: 4',
      section: 'synthesis', planetSection: 'diverge', band,
    })
    expect(r.findings.map(f => f.check)).not.toContain('register-drift')
  })

  it('says nothing about empty text, and never throws', () => {
    expect(run('').findings).toEqual([])
    expect(() => run('   ')).not.toThrow()
  })

  it('sends no failed draft in the instruction — only the faults', () => {
    // The v10.40 repair rewrite moved the failed draft out of the strongest
    // position in the prompt. The pre-flight does not send one at all: the
    // faults are string facts, so naming them is the whole message.
    const draft = '## The Sun\n\nYou notice it. Short.'
    expect(run(draft).instruction).not.toContain('Short.')
  })
})

describe('pickBetter — a rewrite is kept only when it is genuinely cleaner', () => {
  const f = (n: number) => Array.from({ length: n }, (_, i) => ({ check: `c${i}`, detail: 'x' }))

  it('keeps the rewrite when it has fewer findings', () => {
    expect(pickBetter({ text: 'A', findings: f(2) }, { text: 'B', findings: f(0) }))
      .toEqual({ text: 'B', kept: 'second' })
  })

  it('keeps the FIRST pass on a tie — a rewrite that trades one breach for another is not an improvement', () => {
    expect(pickBetter({ text: 'A', findings: f(1) }, { text: 'B', findings: f(1) }))
      .toEqual({ text: 'A', kept: 'first' })
  })

  it('keeps the first pass when the rewrite is worse', () => {
    expect(pickBetter({ text: 'A', findings: f(1) }, { text: 'B', findings: f(3) }))
      .toEqual({ text: 'A', kept: 'first' })
  })
})

describe('formatPreflightLog', () => {
  it('emits one greppable line in the [AXIS_*] family', () => {
    const r = run('## The Sun\n\nYou notice it. Short.')
    const line = formatPreflightLog('tropical/sun', r, 'rewrote-1to0-kept-second')
    expect(line).toMatch(/^\[AXIS_PREFLIGHT\] section=tropical\/sun findings=\d+ checks=\S+ action=rewrote-1to0-kept-second$/)
  })

  it('omits the checks field when there is nothing to report', () => {
    expect(formatPreflightLog('tropical/sun', run(clean()), 'clean'))
      .toBe('[AXIS_PREFLIGHT] section=tropical/sun findings=0 action=clean')
  })
})

describe('pickBetter — an empty rewrite never wins', () => {
  it('keeps the first pass when the rewrite is blank', () => {
    // Blank text has nothing to find, so it scores zero findings. Without the
    // guard it beats any first pass and the reader is served nothing at all.
    const first = { text: '## The Sun\n\nYou notice it.', findings: [{ check: 'length', detail: 'x' }] }
    expect(pickBetter(first, { text: '', findings: [] })).toEqual({ text: first.text, kept: 'first' })
    expect(pickBetter(first, { text: '   \n ', findings: [] })).toEqual({ text: first.text, kept: 'first' })
  })
})
