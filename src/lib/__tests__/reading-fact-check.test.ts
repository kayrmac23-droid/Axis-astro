import { describe, it, expect } from 'vitest'
import { checkNumericFacts, formatFactCheckLog } from '@/lib/reading-fact-check'

// A context block in the shape interpretation-engine.ts emits. The aspect bullet
// format is the one aspect-count-coupling.test.ts pins, so this fixture and the
// parser cannot drift from production independently.
const CONTEXT = `
DIGNITY: peregrine — no special dignity or debility

MERCURY: Libra 28.8°, House 12

ASPECTS (tightest first):
• Sextile Uranus (4.5°, moderate, applying, cooperative) | Uranus H2
• Opposition Jupiter (6.1°, wide, separating, tense) | Jupiter H6
ORB WEIGHT: tight ≤2°, close ≤4°, moderate ≤6°, wide >6°.
`

describe('checkNumericFacts — unstated degree figures', () => {
  it('catches an orb the context never states', () => {
    const f = checkNumericFacts('The square to Saturn is 0.4° from exact.', CONTEXT)
    expect(f).toHaveLength(1)
    expect(f[0].check).toBe('unstated-degree')
    expect(f[0].severity).toBe('hard')
    expect(f[0].match).toBe('0.4°')
  })

  it('stays silent on every figure the context does state', () => {
    const ok = 'Mercury sits at 28.8° of Libra. The sextile to Uranus is 4.5° wide, the opposition 6.1°.'
    expect(checkNumericFacts(ok, CONTEXT)).toEqual([])
  })

  it('tolerates rounding, because prose rounds and that is not a fabrication', () => {
    // 28.8 -> "29°" and 4.5 -> "4°" are the same fact, differently written.
    expect(checkNumericFacts('Mercury at 29° of Libra, sextile Uranus by 4°.', CONTEXT)).toEqual([])
  })

  it('ignores numbers that are not degrees', () => {
    const ok = 'The 12th house holds 2 planets, and the 9th none. Both matter here.'
    expect(checkNumericFacts(ok, CONTEXT)).toEqual([])
  })

  it('ignores headings, so a heading is never fact-checked', () => {
    expect(checkNumericFacts('## Mercury at 99°\n\nYou draft in private.', CONTEXT)).toEqual([])
  })
})

describe('checkNumericFacts — worded closeness claims', () => {
  // THE REGRESSION. v10.37 shipped "Venus sits in Scorpio, in detriment, half a
  // degree from your Sun and Pluto" when Venus was 18.7° from the Sun and the
  // half-degree pair was Sun–Pluto. chart_evidence scored it 3–4, the rule scan
  // structurally could not see it, and it reached the reader.
  it('catches a sub-degree claim the context does not support', () => {
    const bad = 'Venus sits in Scorpio, in detriment, half a degree from your Sun and Pluto.'
    const f = checkNumericFacts(bad, CONTEXT)
    expect(f.some(x => x.check === 'unsupported-closeness')).toBe(true)
    expect(f.find(x => x.check === 'unsupported-closeness')!.match).toContain('half a degree')
  })

  it('catches the other wordings of the same claim', () => {
    for (const phrase of ['exactly conjunct', 'within a degree of', 'a degree apart from', 'partile']) {
      const f = checkNumericFacts(`Venus is ${phrase} your Sun.`, CONTEXT)
      expect(f.some(x => x.check === 'unsupported-closeness')).toBe(true)
    }
  })

  it('stays silent when the context DOES carry an aspect that close', () => {
    const tight = CONTEXT.replace('Sextile Uranus (4.5°', 'Sextile Uranus (0.6°')
    expect(checkNumericFacts('Mercury is within a degree of Uranus.', tight)
      .some(x => x.check === 'unsupported-closeness')).toBe(false)
  })

  it('stays silent when no body is named — it has nothing to check against', () => {
    expect(checkNumericFacts('The orb is within a degree.', CONTEXT)).toEqual([])
  })

  it('needs TWO bodies, because closeness is a relation', () => {
    // Calibrated on the 84-section replay: "the guardedness is fixed to the
    // degree" names only Venus and makes no closeness claim about a pair. It was
    // the single false positive, and a checker that flags correct prose about
    // someone's own chart costs trust in every other line it reports.
    expect(checkNumericFacts('Venus is exactly conjunct, fixed in place.', CONTEXT)).toEqual([])
  })

  it('does not match "to the degree", which is an intensifier or an idiom', () => {
    for (const t of [
      'the guardedness is not an artefact of either calendar, it is fixed to the degree',
      'this holds to the degree that the aspect stays tight',
    ]) expect(checkNumericFacts(t, CONTEXT)).toEqual([])
  })

  it('reports closeness as soft, not hard', () => {
    // The pair may simply not be in THIS section's aspect list, which is a
    // reporting gap rather than certainly a false claim.
    const f = checkNumericFacts('Venus is half a degree from your Sun.', CONTEXT)
    expect(f.find(x => x.check === 'unsupported-closeness')!.severity).toBe('soft')
  })
})

describe('checkNumericFacts — robustness', () => {
  it('never throws on empty or junk input', () => {
    expect(checkNumericFacts('', CONTEXT)).toEqual([])
    expect(checkNumericFacts('text', '')).toEqual([])
    expect(() => checkNumericFacts('°°° 1.2.3° ((', '°')).not.toThrow()
  })

  it('is reusable across sections (no stale regex lastIndex)', () => {
    const t = 'The square to Saturn is 0.4° from exact.'
    expect(checkNumericFacts(t, CONTEXT)).toEqual(checkNumericFacts(t, CONTEXT))
  })

  it('logs one greppable line in the [AXIS_*] family', () => {
    const f = checkNumericFacts('The square is 0.4° from exact.', CONTEXT)
    expect(formatFactCheckLog('tropical/mercury', f))
      .toMatch(/^\[AXIS_FACTS\] section=tropical\/mercury hard=1 soft=0 unstated-degree=1$/)
  })
})
