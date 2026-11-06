import { describe, it, expect } from 'vitest'
import { checkNumericFacts, checkExemplarBleed, formatFactCheckLog, EXEMPLAR_PLACEMENTS } from '@/lib/reading-fact-check'
import { SCENE_EXEMPLAR } from '@/lib/prompts'

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

// ─────────────────────────────────────────────────────────────────────────────
// The engine renders an orb in four different shapes, and the original parser
// matched exactly ONE of them. That does not fail loudly: `orbs` comes back
// empty, `supported` becomes unreachable, and a TRUE closeness claim about the
// chart's own tightest aspect is reported as `unsupported-closeness` — the
// checker crying wolf about correct prose, which is the one failure mode its
// own header calls the design constraint. Each fixture below is copied from the
// live format at the interpretation-engine.ts line named beside it.
// ─────────────────────────────────────────────────────────────────────────────
describe('checkNumericFacts — every aspect format the engine emits', () => {
  // formatPlanetBlock: "• Sextile Saturn (3.6°, close, applying, cooperative)"
  const PLANET_BLOCK = `
VENUS: Scorpio 14.2°, House 8

ASPECTS (tightest first):
• Trine Moon (0.4°, tight, separating, flowing) | Moon H5
• Sextile Rahu (3.8°, close, applying, cooperative) | Rahu H7
`
  // key_aspects: no bullet, "orb" label, BOTH bodies named.
  const KEY_ASPECTS = `
TIGHTEST ASPECT IN THE CHART: Sun sextile Jupiter (orb 0.2°). No other aspect may be called the tightest, closest or most exact.

ALL MAJOR ASPECTS (tightest first):

Sun ⚹ Jupiter (orb 0.2°, tight, separating, cooperative)
  Placements: Sun Gemini H9 · Jupiter Aries H7
Moon △ Venus (orb 0.4°, tight, separating, flowing)
`
  // formatAscendantBlock: bullet AND the "orb" label, both bodies named.
  const ASCENDANT = `
ASPECTS (tightest first):
• Ascendant △ Moon (orb 1.3°, tight, harmonising): Moon — emotional instinct.
• Ascendant ⚹ Saturn (orb 3.8°, close, cooperative): Saturn — structure, discipline.
`
  // jupiter_saturn's direct-relationship line: aspect name alone, no second body.
  const JUPSAT = `
JUPITER–SATURN DIRECT RELATIONSHIP:
Square (orb 2.1°, applying): productive friction — the planets pull in incompatible directions
Jupiter = expansion | Saturn = contraction
`

  it('supports a true closeness claim in the key_aspects format', () => {
    // 0.2° Sun–Jupiter is in the context. Before the line-based parser this was
    // reported, because the regex required a bullet and no "orb" label.
    expect(checkNumericFacts('Your Sun is exactly conjunct your Jupiter.', KEY_ASPECTS)).toEqual([])
  })

  it('supports a true closeness claim in the ascendant format', () => {
    expect(checkNumericFacts('Your Ascendant sits within a degree of your Moon.', ASCENDANT)).toEqual([])
  })

  it('supports a true closeness claim in the planet-block format', () => {
    // This format names only the OTHER body — the subject is the block's own
    // planet and implicit — which is why the support test matches on ANY named
    // body rather than requiring the pair.
    expect(checkNumericFacts('Your Venus is exactly conjunct your Moon.', PLANET_BLOCK)).toEqual([])
  })

  it('still reports a closeness claim the context does NOT support', () => {
    // Rahu is 3.8° out in this block. The parser getting wider must not make
    // the check toothless.
    const f = checkNumericFacts('Your Venus sits half a degree from your Rahu.', PLANET_BLOCK)
    expect(f.map(x => x.check)).toContain('unsupported-closeness')
  })

  it('reads an orb off a line that names no second body', () => {
    // The jupiter_saturn line names Jupiter and Saturn on the FOLLOWING line,
    // so the orb is attached to "Jupiter"/"Saturn" nowhere — but the figure
    // itself must still be allowed, or every mention of it is a hard breach.
    expect(checkNumericFacts('That square is 2.1° from exact.', JUPSAT)).toEqual([])
  })

  it('does not mistake an ordinary position line for an aspect orb', () => {
    // "VENUS: Scorpio 14.2°" is a position, not an orb. Anchoring on the
    // opening parenthesis is what keeps it out of the orb table — otherwise a
    // 14.2° position would silently license a closeness claim at 14.2°.
    const f = checkNumericFacts('Your Venus is exactly conjunct your Saturn.', `
VENUS: Scorpio 14.2°, House 8
SATURN: Pisces 14.2°, House 12
`)
    expect(f.map(x => x.check)).toContain('unsupported-closeness')
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The check that motivated this file matched only the `°` glyph — and the prose
// the prompt actually asks for does not always use it. "twelve degrees from
// your Sun" is the same invented figure as "12°", in the register PART 4
// requires, and it passed both checks.
// ─────────────────────────────────────────────────────────────────────────────
describe('checkNumericFacts — worded degree figures', () => {
  it('catches a spelled-out figure the context never states', () => {
    const f = checkNumericFacts('Mercury sits twelve degrees from your Sun.', CONTEXT)
    expect(f).toHaveLength(1)
    expect(f[0].check).toBe('unstated-degree')
    expect(f[0].severity).toBe('hard')
    expect(f[0].match).toBe('twelve degrees')
  })

  it('catches a digit-plus-word figure the context never states', () => {
    const f = checkNumericFacts('It is 12 degrees off.', CONTEXT)
    expect(f.map(x => x.match)).toEqual(['12 degrees'])
  })

  it('allows a worded figure the context DOES state, within rounding', () => {
    // The context carries "Sextile Uranus (4.5°" and "Libra 28.8°".
    expect(checkNumericFacts('Uranus is four degrees out.', CONTEXT)).toEqual([])
    expect(checkNumericFacts('Mercury sits at twenty-nine degrees of Libra.', CONTEXT)).toEqual([])
  })

  // ⚠ FALSE POSITIVES ARE THE DESIGN CONSTRAINT. "degrees" is ordinary English
  // in forms that assert no number at all, and a hard breach is the loudest
  // thing this file can say.
  it('stays silent where no figure is asserted', () => {
    for (const t of [
      'The guardedness shifts to varying degrees.',
      'You keep a few degrees of slack in every arrangement.',
      'It is several degrees away from anything comfortable.',
      'There are degrees of separation here that you do not close.',
      'You hold the line to the degree that it still serves you.',
    ]) expect(checkNumericFacts(t, CONTEXT)).toEqual([])
  })

  it('does not double-report a worded closeness claim as an unstated degree', () => {
    // "half a degree" is a CLAIM, handled by the closeness check; counting the
    // bare "a"/"half" as a figure too would report one sentence under two
    // checks and double the apparent error count.
    const f = checkNumericFacts('Your Mercury sits half a degree from your Saturn.', CONTEXT)
    expect(f.map(x => x.check)).toEqual(['unsupported-closeness'])
  })

  it('is reusable across sections (no stale regex lastIndex on the worded pass)', () => {
    const t = 'Mercury sits twelve degrees from your Sun.'
    expect(checkNumericFacts(t, CONTEXT)).toEqual(checkNumericFacts(t, CONTEXT))
    expect(checkNumericFacts(t, CONTEXT)).toHaveLength(1)
  })
})

// ── v10.40: placements carried out of the prompt's own worked example ────────
//
// v10.37 added SCENE_EXEMPLAR because three prompt versions of rule prose had
// failed to produce a scene. It worked, and it brought a risk the prompt names
// in a prose warning and nothing measured: a concrete example is a specific
// chart, so its placements can be carried into a reading about someone else.
// CLAUDE.md records this as "an eval question" — and an eval question with no
// instrument stays open forever. The exemplar's chart is a compile-time
// constant, so the check is deterministic.
describe('checkExemplarBleed — the worked example\'s chart leaking into a reading', () => {
  const FOREIGN = 'MERCURY: Gemini 14.2°, House 3\nMARS: Cancer 3.1°, House 4'

  it('every pinned placement really is in the exemplar, or the check guards nothing', () => {
    for (const { body, sign } of EXEMPLAR_PLACEMENTS) {
      expect(SCENE_EXEMPLAR).toMatch(new RegExp(`\\b${body}\\b[\\s\\S]{0,24}\\b${sign}\\b`, 'i'))
    }
  })

  it('catches the bleed in a sub-header, which is its likeliest form', () => {
    // The exemplar models "### Mercury in Aries, House 12" and the section
    // instructions ask for that exact heading shape, so the heading is where a
    // bled placement lands first. proseOnly() would strip it, which is why this
    // check reads the whole text.
    const f = checkExemplarBleed('### Mercury in Aries, House 12\n\nYou draft on the walk.', FOREIGN)
    expect(f).toHaveLength(1)
    expect(f[0].check).toBe('exemplar-bleed')
    expect(f[0].severity).toBe('hard')
    expect(f[0].match).toBe('Mercury in Aries')
  })

  it('catches it in prose, and reports each placement once', () => {
    const f = checkExemplarBleed(
      'Your Mercury in Aries answers first. Your Mars in Aquarius holds the line. The Aries Mercury again.',
      FOREIGN,
    )
    expect(f.map(x => x.match).sort()).toEqual(['Mars in Aquarius', 'Mercury in Aries'])
  })

  it('says nothing when the reader\'s own chart carries the placement', () => {
    const own = 'MERCURY: Aries 2.1°, House 12\nMARS: Aquarius 9.9°, House 10'
    expect(checkExemplarBleed('### Mercury in Aries, House 12\n\nYour Mars in Aquarius.', own)).toEqual([])
  })

  // ⚠ FALSE POSITIVES ARE THE DESIGN CONSTRAINT, as everywhere in this file.
  it('does not pair a body and a sign that sit in different sentences', () => {
    // The proximity window is 24 characters, which reaches across a full stop.
    // Scoped to the line rather than the sentence, this read as a placement
    // claim at 23 characters apart.
    expect(checkExemplarBleed(
      'Your Mercury works in private. The Aries emphasis belongs to Mars.',
      FOREIGN,
    )).toEqual([])
  })

  it('does not fire on a body and a sign merely co-occurring far apart', () => {
    expect(checkExemplarBleed(
      'Your Mercury in Gemini reaches the answer before the Aquarius placements have finished weighing it.',
      FOREIGN,
    )).toEqual([])
  })

  it('is folded into checkNumericFacts, so every existing caller gets it', () => {
    const f = checkNumericFacts('### Mercury in Aries, House 12', FOREIGN)
    expect(f.map(x => x.check)).toContain('exemplar-bleed')
  })

  it('returns nothing without a context to check against', () => {
    expect(checkExemplarBleed('### Mercury in Aries, House 12', '')).toEqual([])
  })
})
