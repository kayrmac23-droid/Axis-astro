// Regression suite for the review of a live v10.24 reading (23 Jul 1999,
// 23:45, Epping VIC). Each block pins one defect that reached a reader, against
// the chart it was found on, so the fix cannot quietly regress.

import { describe, it, expect } from 'vitest'
import { calculateDualChart, type BirthData } from '@/lib/astro-calc'
import {
  buildInterpretationContext, formatEliteChartBlock, computeVimshottariDasha, currentDashaKey,
  cuspNeighbour, orbTier, isNearStation, drishtiHouses, jyotishSignStatus, lordshipsOf,
  neechaBhangaConditions, detectMajorYogas,
} from '@/lib/interpretation-engine'
import { makeCacheKey } from '@/lib/reading-cache'
import { detectBannedPhrasings, countAspectsInContext } from '@/lib/reading-quality-gate'
import { phrasesAlreadyUsed, overusedTics, phrasesAlreadyUsedBlock, type PriorSection } from '@/lib/reading-thread'
import { SHARED_RULES, SHARED_RULES_LEAN, SCENE_EXEMPLAR, SECTION_INSTRUCTIONS, SIDEREAL_SYSTEM_PROMPT, SYNTHESIS_SYSTEM_PROMPT, BANNED_META_PHRASINGS, wordBandFor, renderSectionInstruction, TENSE_CLAUSE, SECTION_WORD_BANDS } from '@/lib/prompts'
import { scanSectionRules, detectAntithesisTic, antithesisVerdict } from '@/lib/reading-rule-scan'
import { checkExemplarBleed, EXEMPLAR_PLACEMENTS } from '@/lib/reading-fact-check'
import { countWords, scoreLength, EVAL_SYSTEM_PROMPT } from '@/lib/reading-quality-gate'
import { TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS } from '@/lib/planet-descriptors'

const BIRTH: BirthData = {
  year: 1999, month: 7, day: 23, hour: 23, minute: 45,
  latitude: -37.65, longitude: 145.03, timezone: 10, tzName: 'Australia/Melbourne',
}
const chart = calculateDualChart(BIRTH)
const OCT_5_2026 = Date.UTC(2026, 9, 5)
const planet = (system: 'tropical' | 'sidereal', name: string) =>
  chart[system].planets.find(p => p.name === name)!

// v10.25 answered the "unmixed Leo" review by mandating that the model name the
// neighbouring sign at every placement within 3° of a boundary. That contradicted
// the ratified DOCTRINE.md ruling SIGN-BOUNDARY CUSPS — DEREGISTERED (a boundary
// placement is a normal placement in its sign), so v10.28 removed it. Pin the
// ruling: no within-system boundary instruction anywhere the model reads, and only
// the cross-system note the ruling retains, in the Divergence plan.
describe('sign-boundary placements — DOCTRINE.md: SIGN-BOUNDARY CUSPS — DEREGISTERED', () => {
  it('finds the neighbour sign within 3° of either boundary, and nowhere else (geometry only)', () => {
    expect(cuspNeighbour('Leo', 0.28)).toBe('Cancer')
    expect(cuspNeighbour('Virgo', 28.5)).toBe('Libra')
    expect(cuspNeighbour('Leo', 3)).toBeNull()
    expect(cuspNeighbour('Leo', 15)).toBeNull()
  })

  it('states no boundary rule in the shared rules', () => {
    expect(SHARED_RULES).not.toMatch(/cusp\s+(rule|note)/i)
    expect(SHARED_RULES).not.toContain('⚠ CUSP')
  })

  it('flags no within-system boundary in any section context or chart block', () => {
    for (const [system, planetSection] of [['tropical', 'sun'], ['tropical', 'ascendant'], ['sidereal', 'sun'], ['sidereal', 'lagna'], ['tropical', 'rahu_ketu']] as const) {
      const ctx = buildInterpretationContext(chart, system, planetSection)
      expect(ctx).not.toContain('⚠ CUSP')
      expect(ctx).not.toMatch(/still live in it/)
    }
    expect(formatEliteChartBlock(chart.tropical, 'tropical')).not.toMatch(/CUSP \(/)
    expect(formatEliteChartBlock(chart.sidereal, 'sidereal')).not.toMatch(/CUSP \(/)
  })

  it('keeps the cross-system note in the Divergence plan: Sun at 0°17′ Leo, settled in Sidereal Cancer', () => {
    const plan = buildInterpretationContext(chart, 'synthesis', 'diverge')
    expect(plan).toMatch(/Boundary-ambiguous in one frame only: within 3° of a sign boundary in the Tropical frame \(Leo 0°17'\), settled away from a boundary in the Sidereal/)
    expect(plan).not.toMatch(/cusp\s+rule/i)
  })
})

describe('orb weight and motion', () => {
  it('classes orbs so a 7° square cannot be read as "real force"', () => {
    expect(orbTier(0.3)).toBe('tight')
    expect(orbTier(2.4)).toBe('close')
    expect(orbTier(5.1)).toBe('moderate')
    expect(orbTier(7.0)).toBe('wide')
    expect(buildInterpretationContext(chart, 'tropical', 'sun')).toMatch(/• Square Mars \(7°, wide,/)
  })

  it('marks Venus near station (it stations retrograde a week after this birth)', () => {
    expect(isNearStation(planet('tropical', 'Venus'))).toBe(true)
    const ctx = buildInterpretationContext(chart, 'tropical', 'venus')
    expect(ctx).toContain('⚠ NEAR STATION: Venus')
    expect(ctx).toMatch(/• Square Pluto \([^)]*may never perfect/)
  })
})

describe('Sidereal frame — Jyotish evidence instead of re-walked Western aspects', () => {
  it('states the Venus shift as backward with the house unchanged', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'venus')
    expect(ctx).toContain("FRAME SHIFT: Tropical Virgo 4°21' H6 → Sidereal Leo")
    expect(ctx).toContain('never "forward"')
    expect(ctx).toContain('House is unchanged (H6 in both frames)')
  })

  it('gives no Western aspect list to any Sidereal section', () => {
    for (const s of ['lagna', 'sun', 'moon', 'mercury', 'venus', 'mars', 'jupiter_saturn', 'rahu_ketu']) {
      expect(buildInterpretationContext(chart, 'sidereal', s)).not.toContain('ASPECTS (tightest first):')
    }
  })

  it('separates a nakshatra lord from its deity (Shravana is Moon-ruled, Vishnu presides)', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'rahu_ketu')
    expect(ctx).toContain('Planetary lord (its Vimshottari ruler): Moon | Presiding deity: Vishnu')
    expect(ctx).toContain('A deity is never the nakshatra\'s ruler')
  })

  it('computes whole-sign drishti, lordship and natural-friendship status', () => {
    expect(drishtiHouses('Jupiter', 2).map(d => d.house)).toEqual([6, 8, 10])
    expect(drishtiHouses('Mars', 8).map(d => d.house)).toEqual([11, 2, 3])
    expect(drishtiHouses('Rahu', 5)).toEqual([])
    expect(lordshipsOf(chart.sidereal, 'Mars')).toEqual([2, 9])
    expect(lordshipsOf(chart.sidereal, 'Jupiter')).toEqual([1, 10])
    expect(jyotishSignStatus(planet('sidereal', 'Venus'))).toMatch(/^enemy's sign/)
    expect(jyotishSignStatus(planet('sidereal', 'Jupiter'))).toMatch(/^friend's sign/)
    expect(jyotishSignStatus(planet('sidereal', 'Moon'))).toMatch(/^debilitated/)
  })

  it('reports the classical cancellation conditions for the debilitated Moon and Saturn', () => {
    const moon = neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Moon'))
    expect(moon.join(' ')).toMatch(/Venus, lord of Moon's exaltation sign Taurus, is in a kendra from the Moon/)
    expect(neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Saturn')).length).toBeGreaterThan(0)
    expect(neechaBhangaConditions(chart.sidereal, planet('sidereal', 'Venus'))).toEqual([])
  })

  it('detects Sarala yoga — one dusthana lord in a dusthana (the old check required two)', () => {
    expect(detectMajorYogas(chart.sidereal).join(' ')).toMatch(/^Sarala Yoga .*Venus, lord of House 8, placed in House 6/)
  })

  it('scales Sidereal bands by the Jyotish relationships actually received', () => {
    const ctx = buildInterpretationContext(chart, 'sidereal', 'venus')
    expect(ctx).toContain('• Receives the 5th-house drishti of Jupiter (from Aries, H2)')
    expect(countAspectsInContext(ctx)).toBe(1)
  })
})

describe('dasha — current period, transition flag, cache key', () => {
  it('flags the Rahu antardasha as days old on the reading date', () => {
    const d = computeVimshottariDasha(chart, OCT_5_2026)!
    expect(`${d.mahadasha}/${d.antardasha}`).toBe('Ketu/Rahu')
    expect(d.daysSinceAntarStart).toBeLessThan(30)
    expect(buildInterpretationContext(chart, 'sidereal', 'lagna', { now: OCT_5_2026 }))
      .toContain('⚠ TRANSITION: the Rahu antardasha began only')
  })

  it('keys the cache on the period, so a September section is not served in October', () => {
    const sept = currentDashaKey(chart, Date.UTC(2026, 8, 1))
    const oct  = currentDashaKey(chart, OCT_5_2026)
    expect(sept).toBe('Ketu/Mars')
    expect(oct).toBe('Ketu/Rahu')
    const base = { birth: BIRTH, section: 'sidereal', planetSection: 'lagna' }
    expect(makeCacheKey({ ...base, dasha: sept })).not.toBe(makeCacheKey({ ...base, dasha: oct }))
  })
})

describe('doctrine scan — the stacking form of resolution-by-hierarchy and meta-narration', () => {
  it('catches the v10.24 Sidereal constructions', () => {
    expect(detectBannedPhrasings('a constructed identity performs Leo on top of an incarnational core that is organised around safety'))
      .toEqual(expect.arrayContaining(['incarnational core', 'on top of']))
    expect(detectBannedPhrasings('These are not mask and face.')).toContain('not mask and face')
    expect(detectBannedPhrasings('the cost is real rather than a secretly deeper form of love')).toContain('a secretly deeper')
  })

  it('leaves ordinary "on top of" alone', () => {
    expect(detectBannedPhrasings('Deadlines pile on top of the existing workload.')).toEqual([])
  })

  it('states the meta-narration ban to the evaluator, not to the writer', () => {
    // Same reasoning as the rescue/hierarchy/Barnum/opener lists: a rule-echo
    // quoted into the generation prompt is a rule-echo in the writing model's
    // context. The gate keeps the specimens; APPLY THE RULES SILENTLY keeps the
    // positive instruction.
    for (const p of BANNED_META_PHRASINGS) expect(EVAL_SYSTEM_PROMPT).toContain(p)
    for (const p of BANNED_META_PHRASINGS) expect(SHARED_RULES).not.toContain(p)
    expect(SHARED_RULES).toMatch(/State the\s*\n?\s*cost and move on/)
    expect(SHARED_RULES).toMatch(/without announcing that you\s*\n?\s*are doing so/)
    // And the positive generalisation that replaces the specimen list.
    expect(SHARED_RULES).toMatch(/satisfied by the shape of the\s*\n?\s*prose/)
  })
})

describe('repetition across the reading', () => {
  const prior = (texts: string[]): PriorSection[] =>
    texts.map((text, i) => ({ section: 'tropical', planetSection: `s${i}`, text }))

  it('names a refrain repeated across sections, ignoring headings and chart terms', () => {
    const p = prior([
      '### Putting It Together\nThe warmth goes to the chosen few. The Leo Sun shines for the chosen few.',
      '### Putting It Together\nAgain the chosen few matter. The Leo Sun again.',
    ])
    const found = phrasesAlreadyUsed(p)
    expect(found).toContain('chosen few')
    expect(found).not.toContain('putting it together')
    expect(found.some(f => f.includes('leo'))).toBe(false)
  })

  it('counts the "rather than" antithesis tic', () => {
    const p = prior([
      'a rather than b. c rather than d. e rather than f.',
      'g rather than h. i rather than j. k rather than l.',
    ])
    expect(overusedTics(p)).toEqual([{ tic: 'rather than', count: 6 }])
    expect(phrasesAlreadyUsedBlock(p)).toContain('"rather than" ×6')
  })

  it('emits nothing for an opening section', () => {
    expect(phrasesAlreadyUsedBlock([])).toBe('')
  })
})

describe('prompt framing that produced the defects', () => {
  it('no longer frames the Sidereal chart as what pre-dates a constructed identity', () => {
    expect(SIDEREAL_SYSTEM_PROMPT).not.toContain('pre-date the constructed identity')
    expect(SIDEREAL_SYSTEM_PROMPT).toContain('Western degree aspects')
    for (const instr of Object.values(SECTION_INSTRUCTIONS.sidereal)) {
      expect(instr).not.toContain('constructed Tropical')
      expect(instr).not.toContain('incarnational-layer')
    }
  })

  it('no longer frames the two systems as a constructed self against an incarnational pattern', () => {
    // v10.25 removed this built-vs-handed metaphor from the Sidereal prompt but it
    // survived in the Divergence prompts and the reader-facing descriptors, where
    // the model copies it straight into the closing section.
    const synthesis = [SYNTHESIS_SYSTEM_PROMPT, ...Object.values(SECTION_INSTRUCTIONS.synthesis)].join('\n')
    const descriptors = [TROPICAL_DESCRIPTORS, SIDEREAL_DESCRIPTORS, SYNTHESIS_DESCRIPTORS]
      .flatMap(d => Object.values(d)).map(d => `${d.title} ${d.keywords} ${d.description}`).join('\n')
    for (const text of [synthesis, descriptors]) {
      expect(text).not.toMatch(/incarnational/i)
      expect(text).not.toMatch(/constructed (self|identity|one)/i)
    }
  })

  it('no longer asks the Ascendant section for the first impression others receive', () => {
    expect(SECTION_INSTRUCTIONS.tropical.ascendant).not.toContain('first impression')
    expect(SECTION_INSTRUCTIONS.tropical.ascendant).toContain('Do not open on what other people notice')
  })

  it('no longer feeds a stock caveat to every trine and sextile', () => {
    const ctx = buildInterpretationContext(chart, 'tropical', 'moon')
    expect(ctx).not.toContain('seldom deliberately deployed')
    expect(ctx).not.toContain('stay dormant otherwise')
  })
})

// The calibration chart in the axis-output-quality and tropical-sidereal-framework
// skills once put this Moon in the 8th house — a quadrant-system figure AXIS never
// computes. Pin the facts the skills quote so neither can drift from the engine.
describe('reference chart facts quoted by the AXIS skills', () => {
  it('places the Sun in the 5th and the Moon in the 9th in both frames (Whole Sign)', () => {
    expect([planet('tropical', 'Sun').sign, planet('tropical', 'Sun').house]).toEqual(['Leo', 5])
    expect([planet('sidereal', 'Sun').sign, planet('sidereal', 'Sun').house]).toEqual(['Cancer', 5])
    expect([planet('tropical', 'Moon').sign, planet('tropical', 'Moon').house]).toEqual(['Sagittarius', 9])
    expect([planet('sidereal', 'Moon').sign, planet('sidereal', 'Moon').house]).toEqual(['Scorpio', 9])
  })

  it('has an Aries Ascendant ruled by Mars and a Pisces Lagna whose lord is Jupiter', () => {
    expect(formatEliteChartBlock(chart.tropical, 'tropical')).toMatch(/CHART RULER: Ascendant Aries · Ruler: Mars/)
    expect(formatEliteChartBlock(chart.sidereal, 'sidereal')).toMatch(/LAGNA LORD: Ascendant Pisces · Ruler: Jupiter/)
  })

  it('reads the Sidereal Moon as debilitated', () => {
    expect(jyotishSignStatus(planet('sidereal', 'Moon'))).toMatch(/debilitated/)
  })
})

// ── v10.35: the prompt must not model the register it forbids ───────────────
// PART 4 requires second person. On the 2026-11-04 eval run 16 of 17 natal
// sections contained ZERO second-person address. The cause was the same as the
// antithesis one: PART 1 — the block that governs the scene, and priority #2 —
// stated its OWN requirements in the third person ("what the person does, and
// what they themselves register"), so the most emphatic block in the prompt
// demonstrated the register PART 4 bans, and examples outrank rules. Without
// the reader as grammatical subject a moment cannot be told from the inside, so
// the scene requirement failed as a consequence (specificity 2.24).
describe('register — the prompt states its rules in the register it requires (v10.35)', () => {
  const part1 = SHARED_RULES
    .slice(SHARED_RULES.indexOf('PART 1 — THE SCENE REQUIREMENT'))
    .split('── PART 2')[0]

  it('priority #2 names the second-person address', () => {
    const priorities = SHARED_RULES.split('PART 1 —')[0]
    expect(priorities).toMatch(/addressed\s*\n?\s*to the reader as "you"/)
  })

  it('PART 1 no longer describes the moment in the third person', () => {
    expect(part1).not.toMatch(/what the person does/)
    expect(part1).not.toMatch(/what they themselves register/)
  })

  // v10.57: the three-part staged moment (trigger, action, aftermath) is gone.
  // Kay read the staged "hours later" scene as homework; the situation is now
  // folded into the claim as a habit, and the consequence is still required.
  it('PART 1 folds the situation into the claim and bans the staged scene', () => {
    expect(part1).toMatch(/Fold each situation into the interpretation/)
    expect(part1).toMatch(/Never narrate it as a little story/)
    expect(part1).toMatch(/What\s+comes of it is the part most often dropped/)
    expect(part1).toMatch(/An example names a KIND of situation/)
  })

  it('PART 1 requires the reader, not the placement, as grammatical subject', () => {
    expect(part1).toMatch(/grammatical subject/i)
    expect(part1).toMatch(/Placements explain; they do not act in a life/)
  })

  it('PART 4 states the register as a hard constraint and names the drift', () => {
    const part4 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 4 — VOICE')).split('── PART 5')[0]
    expect(part4).toMatch(/hard constraint, not a stylistic preference/i)
    expect(part4).toMatch(/third person about a placement/i)
    expect(part4).toMatch(/no second-person\s*\n?\s*address has breached this rule/i)
  })

  it('PART 4 preserves the two legitimate overrides, so the fix cannot break them', () => {
    const part4 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 4 — VOICE')).split('── PART 5')[0]
    expect(part4).toMatch(/THE DIVERGENCE/)
    expect(part4).toMatch(/second person plural/i)
    // And The Divergence's own instruction still says so.
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/Third person only/)
  })
})

// ── The antithesis: withdrawn from the generation prompt, still measured ────
// v10.34–v10.56 capped the contrastive construction in PART 4 (VARY THE
// ANTITHESIS) and in a CADENCE ALLOWANCE clause appended to every section. On
// Opus 5.5 with the clause withdrawn, 1 of 48 sections exceeded the density
// limit (4 of 6 Sonnet samples did), so v10.57 dropped the rule from the prompt.
// What must survive is the older lesson: the prompt never models the tic in its
// own voice, because example outranks rule on this model.
describe('the antithesis — withdrawn from the prompt, still measured (v10.57)', () => {
  const unquoted = (t: string) => t.replace(/["“”][^"“”]*["“”]/g, '…')

  it('no longer contains the self-demonstrating clause', () => {
    expect(SHARED_RULES).not.toMatch(/hears\s+the\s+template\s+rather\s+than\s+the\s+content/)
  })

  it('does not model the tic anywhere in the cached rules', () => {
    const body = SHARED_RULES.slice(0, SHARED_RULES.indexOf('── APPENDIX'))
    expect(detectAntithesisTic(unquoted(body))).toEqual([])
  })

  it('carries no cadence allowance in the rules or in any section instruction', () => {
    expect(SHARED_RULES).not.toContain('VARY THE ANTITHESIS')
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      expect(renderSectionInstruction(section, planetSection)!, key).not.toContain('CADENCE ALLOWANCE')
    }
  })

  it('is still measured as density on the finished text', () => {
    const three = '## X\n\nYou act on instinct rather than plan, on loyalty rather than reward, and on feeling rather than proof.'
    expect(antithesisVerdict(three).severity).toBe('hard')
    expect(antithesisVerdict('## X\n\nYou act on instinct rather than plan.').severity).toBe('clean')
  })
})

// ── v10.57: the tense reminder reaches EVERY section ────────────────────────
// THE VOICE allows contractions, and with them Opus wrote the habitual "you'll"
// in 7 of 42 sections, each a hard prediction finding and a paid regeneration.
// renderSectionInstruction appends the reminder last, nearest the generation.
describe('the tense reminder is wired to every section (v10.57)', () => {
  it('ends every section instruction', () => {
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      const rendered = renderSectionInstruction(section, planetSection)
      expect(rendered, key).toBeDefined()
      expect(rendered!.endsWith(TENSE_CLAUSE), key).toBe(true)
    }
    expect(TENSE_CLAUSE).toMatch(/never appears in your prose/)
  })

  it('never leaves the length slot unsubstituted', () => {
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      expect(renderSectionInstruction(section, planetSection)!, key).not.toContain('LENGTH_CLAUSE')
    }
  })
})

// ── v10.34: the unheaded close must be REQUIRED, not merely unheaded ─────────
// v10.30 removed the mandated `### Putting It Together` heading, correctly: the
// prompt mandated a summary heading twelve times per reading while PROSE FAILURE
// MODES #4 penalised the summary it produced. But what remained in PART 8 was a
// purely negative rule — where the close goes and what not to call it — and
// nothing saying it must exist. On the 2026-11-03 eval run 4 of 21 sections
// ended on their last aspect sub-section with no close at all, and `synthesis`
// scored 2.48 with 11 of 21 below the individual pass bar. The heading had been
// load-bearing scaffolding; removing it removed the close.
//
// These assertions fail if PART 8 goes back to stating only the prohibition.
describe('PART 8 — the closing paragraph is required (v10.34)', () => {
  it('states that every section ends on a closing paragraph', () => {
    expect(SHARED_RULES).toMatch(/ENDS ON A CLOSING PARAGRAPH/)
  })

  it('rules out the two ways the close degraded: absent, and a one-liner', () => {
    expect(SHARED_RULES).toMatch(/has not closed/i)
    expect(SHARED_RULES).toMatch(/one-line sign-off is not a closing paragraph/i)
  })

  it('still bans the heading and every variant v10.30 named', () => {
    expect(SHARED_RULES).toMatch(/carries no heading|carries NO\s*\n?heading/i)
    for (const variant of [
      'Putting It Together', 'Synthesis', 'In Summary', 'The Core', 'Bringing It Together',
    ]) expect(SHARED_RULES).toContain(variant)
  })

  it('says what the close must DO, so the requirement is not satisfied by padding', () => {
    // One live pattern and what living it is like — not a re-list of
    // placements, which is the pseudo-synthesis PROSE FAILURE MODES #4 catches.
    expect(SHARED_RULES).toMatch(/lands on ONE live pattern/i)
    expect(SHARED_RULES).toMatch(/Open it on\s+your reader's life/)
    expect(SHARED_RULES).toMatch(/does not re-list placements/i)
  })
})

// ── v10.60: VALENCE FOLLOWS EVIDENCE (DOCTRINE, Nov 2026) ────────────────────
// The close lands on one live pattern in the direction the evidence points: a
// cost, a capacity, or both. No prompt line and no gate criterion may require a
// cost the chart did not establish. The rescue bans and SHADOW COVERAGE are
// untouched, so a real cost still stands uncompensated.
describe('VALENCE FOLLOWS EVIDENCE — no close is required to state a cost (v10.60)', () => {
  it('the PART 8 close follows the evidence, and the tension-only close is gone', () => {
    expect(SHARED_RULES).toContain('The valence follows the evidence')
    expect(SHARED_RULES).not.toMatch(/lands on ONE tension/i)
  })

  it('SHARED_RULES_LEAN inherits the change, because it is derived from SHARED_RULES', () => {
    expect(SHARED_RULES_LEAN).toContain('The valence follows the evidence')
  })

  it('the gate scores neither synthesis nor contradiction_handling on a stated cost', () => {
    const start = EVAL_SYSTEM_PROMPT.indexOf('3. synthesis')
    const end = EVAL_SYSTEM_PROMPT.indexOf('5. anti_cliche')
    expect(start).toBeGreaterThan(-1)
    expect(end).toBeGreaterThan(start)
    const criteria = EVAL_SYSTEM_PROMPT.slice(start, end).replace(/\s+/g, ' ')
    expect(criteria).toContain('4. contradiction_handling')
    expect(criteria).not.toContain('clause stating the cost')
    expect(criteria).not.toContain('inhabiting it costs')
  })
})

// ── v10.37: the worked section ──────────────────────────────────────────────
// Through v10.36 the prompt described the scene requirement exhaustively and
// never SHOWED one. The scene was absent from 14 of 21 sections on the
// 2026-11-05 run — with the register fixed (register-drift 16/17 -> 1) and the
// secondary budget raised 1.69x — and `specificity` moved 2.33 -> 2.38, flat.
// Rule prose has failed to produce a scene across three versions, two registers
// and two budgets; example is the mechanism that demonstrably moves this model
// (it beat the register rule 16 times out of 17, and the antithesis cap too).
//
// An example that breaks the rules it teaches is worse than no example, so the
// exemplar is held to them here. These assertions are the whole point of the
// const being exported.
describe('SCENE_EXEMPLAR — the example must obey the rules it teaches', () => {
  it('produces ZERO deterministic rule findings', () => {
    expect(scanSectionRules(SCENE_EXEMPLAR, { frame: 'tropical' })).toEqual([])
  })

  it('scores 5 on length for its own band (tropical/mercury, 4 aspects)', () => {
    const band = wordBandFor('tropical', 'mercury', 4)
    const words = countWords(SCENE_EXEMPLAR)
    expect(scoreLength(words, band)).toBe(5)
    // And is genuinely inside the band, not merely not-failing.
    expect(words).toBeGreaterThanOrEqual(band.fullMin)
    expect(words).toBeLessThanOrEqual(band.fullMax)
  })

  it('addresses the reader, and never makes the placement the subject', () => {
    expect(SCENE_EXEMPLAR).toMatch(/\byou\b/i)
    // The apparatus register the prose kept reverting to before v10.35.
    expect(SCENE_EXEMPLAR).not.toMatch(/this (?:mind|Mercury|placement) (?:does|works|turns)/i)
    expect(SCENE_EXEMPLAR).not.toMatch(/\bthe native\b/i)
  })

  // v10.57: the exemplar is rewritten in the voice Kay asked for. It keeps the
  // consequence (the part that used to be dropped) and loses the staged time
  // jump and the invented clock, weekday and count it used to model.
  it('states the consequence as the thing itself, with no staged time jump', () => {
    expect(SCENE_EXEMPLAR).toMatch(/the defending is exactly what keeps you from finishing\s+it/)
    expect(SCENE_EXEMPLAR).not.toMatch(/Hours later|hours later/)
    expect(SCENE_EXEMPLAR).not.toMatch(/you notice/)
    expect(SCENE_EXEMPLAR).not.toMatch(/feel the pull/)
  })

  it('invents no clock, weekday or count', () => {
    expect(SCENE_EXEMPLAR).not.toMatch(/in the morning|Thursday|fourth draft|on the walk/i)
  })

  it('talks: contractions, and the reader\'s life before the dignity', () => {
    expect(SCENE_EXEMPLAR).toMatch(/\b(?:you're|it's|can't|you'd|that's)\b/)
    const firstPara = SCENE_EXEMPLAR.split('\n\n')[2]
    expect(firstPara.split('.')[0]).not.toMatch(/dignity|peregrine/i)
  })

  it('is carried into PART 1, interpolated rather than left as a slot', () => {
    const part1 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 1 — THE SCENE')).split('── PART 2')[0]
    expect(part1).toContain('Mercury in Aries, House 12')
    expect(part1).not.toContain('${')
  })

  it('carries the anti-import warning, or it teaches fabrication', () => {
    // Without this, another chart's Aries Mercury in the twelfth starts turning
    // up in charts that have neither.
    const part1 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 1 — THE SCENE')).split('── PART 2')[0]
    expect(part1).toMatch(/another person's reading/i)
    expect(part1).toMatch(/only if your own chart context states them/i)
    expect(part1).toMatch(/from your\s*\n?\s*chart context and nowhere else/i)
    expect(part1).toMatch(/leave every fact inside the tags/i)
  })

  // ⚠ The exemplar is the only block in the prompt formatted exactly like the
  // model's own output: it opens on a `## Planet` heading, which is what the
  // section instructions ask the model to emit. Delimited by nothing but that
  // heading, the boundary between quoted material and instruction is a prose
  // warning. The tags make it a token.
  it('is fenced in tags, so quoted material is not formatted like the output', () => {
    const part1 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 1 — THE SCENE')).split('── PART 2')[0]
    expect(part1).toContain('<worked_example>')
    expect(part1).toContain('</worked_example>')
    // The example sits INSIDE them, and the warning OUTSIDE — a warning fenced
    // in with the material it warns about reads as part of the example.
    // The fences are matched on their own lines: PART 1 also NAMES the tag in
    // prose ("Below, inside <worked_example>, is one complete section"), and a
    // bare indexOf finds that mention instead of the opening fence.
    const open = part1.indexOf('\n<worked_example>\n')
    const close = part1.indexOf('\n</worked_example>')
    expect(open).toBeGreaterThan(-1)
    expect(close).toBeGreaterThan(open)
    expect(part1.indexOf('Mercury in Aries, House 12')).toBeGreaterThan(open)
    expect(part1.indexOf('Mercury in Aries, House 12')).toBeLessThan(close)
    expect(part1.indexOf('leave every fact inside the tags')).toBeLessThan(open)
  })

  // The deterministic counterpart: the prose warning is now backed by a check,
  // so "whether it holds is an eval question" has an instrument.
  it('has its placements pinned by the exemplar-bleed check', () => {
    for (const { body, sign } of EXEMPLAR_PLACEMENTS) {
      expect(SCENE_EXEMPLAR).toMatch(new RegExp(`\\b${body}\\b[\\s\\S]{0,24}\\b${sign}\\b`, 'i'))
    }
    // A section asserting the example's chart against a chart that lacks it.
    const foreign = checkExemplarBleed(
      '### Mercury in Aries, House 12\n\nYou draft the argument on the walk.',
      'Mercury 14.2° Gemini (House 3)\nMars 3.1° Cancer (House 4)',
    )
    expect(foreign.map(f => f.match)).toContain('Mercury in Aries')
    expect(foreign.every(f => f.severity === 'hard')).toBe(true)
    // And the reader whose chart genuinely carries it is not flagged.
    expect(checkExemplarBleed('### Mercury in Aries, House 12', 'Mercury 2.1° Aries (House 12)')).toEqual([])
  })

  it('keeps PART 1 stating the rules, so the example supplements rather than replaces them', () => {
    const part1 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 1 — THE SCENE')).split('── PART 2')[0]
    expect(part1).toMatch(/Fold each situation into the interpretation/)
    expect(part1).toMatch(/Invent no durations, counts,\s*\n?\s*jobs, named people or circumstances/)
    expect(part1).toMatch(/Placements explain; they do not act in a life/)
  })
})

// ── v10.38: the scene is narrated in the present tense ──────────────────────
// v10.37's run produced three hard `prediction` breaches — "you will feel the
// pull", "You will feel the conviction" — and all three came from the scene
// finally being attempted: narrating a recurring moment pulls toward the future
// tense, so the breach arrives exactly when PART 1 is being obeyed. PART 4 bans
// predictions, so the two PARTs were pulling against each other with nothing
// saying which tense to use.
describe('PART 1 — the moment is written in the present tense (v10.38)', () => {
  const part1 = SHARED_RULES
    .slice(SHARED_RULES.indexOf('PART 1 — THE SCENE REQUIREMENT'))
    .split('── PART 2')[0]

  it('states the present tense as the rule', () => {
    expect(part1).toMatch(/Write situations in the PRESENT tense, as habits/)
  })

  it('names the banned future forms, so the rule is checkable from the text', () => {
    expect(part1).toMatch(/you will feel the pull/)
    expect(part1).toMatch(/you will find/)
  })

  it('cross-references the PART that actually bans predictions', () => {
    // PART 4, not 3 — asserted because a wrong cross-reference sends the model
    // looking for a rule that is not where it was told.
    expect(part1).toMatch(/which PART 4 bans/)
    const part4 = SHARED_RULES.slice(SHARED_RULES.indexOf('PART 4 — VOICE')).split('── PART 5')[0]
    expect(part4).toMatch(/Banned outright: predictions/)
  })

  it('is obeyed by the exemplar, or the prompt models what it forbids again', () => {
    // The v10.34/v10.35 failure mode: a rule whose own example breaches it.
    expect(SCENE_EXEMPLAR).not.toMatch(/\byou will\b|\byou'll\b/i)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The dilution probe. SHARED_RULES_LEAN is DERIVED from SHARED_RULES, so the
// one thing these tests have to guarantee is that it is a slice and not a
// second copy of the doctrine: a hand-written lean variant would drift, and a
// drifted probe measures its own drift instead of the hypothesis.
describe('SHARED_RULES_LEAN — the dilution probe is derived, not duplicated', () => {
  it('drops the PARTs it names and nothing else', () => {
    expect(SHARED_RULES_LEAN).not.toContain('── PART 5 — PROSE FAILURE MODES ──')
    expect(SHARED_RULES_LEAN).not.toContain('── PART 6 — ONE CONTINUOUS READING ──')
    expect(SHARED_RULES_LEAN).not.toContain('── PART 7 — DEPTH AND LENGTH ──')
    expect(SHARED_RULES_LEAN).not.toContain('── APPENDIX — AXIS INTERPRETIVE STANCES ──')
    for (const kept of [
      'PRIORITY 1.', '── PART 1 — THE SCENE REQUIREMENT ──', '── PART 2 — EVIDENCE ──',
      '── PART 3 — HONESTY ──', '── PART 4 — VOICE ──', '── PART 8 — FORMATTING ──',
    ]) expect(SHARED_RULES_LEAN).toContain(kept)
  })

  it('keeps every non-negotiable: the scene, the dual-system facts, unknown birth time', () => {
    expect(SHARED_RULES_LEAN).toContain('Mercury in Aries, House 12')      // the worked example
    expect(SHARED_RULES_LEAN).toContain('WHAT CHANGES BETWEEN TROPICAL AND SIDEREAL')
    expect(SHARED_RULES_LEAN).toContain('WHEN THE BIRTH TIME IS UNKNOWN')
    expect(SHARED_RULES_LEAN).toContain('two accounts in the same tense')   // no ranking
    expect(SHARED_RULES_LEAN).toContain('ENDS ON A CLOSING PARAGRAPH')
  })

  it('is a strict slice of the full block, so no rule exists in only one of them', () => {
    // Every paragraph of the lean block appears verbatim in the full one.
    const paras = SHARED_RULES_LEAN.split('\n\n').map(s => s.trim()).filter(s => s.length > 40)
    expect(paras.length).toBeGreaterThan(20)
    for (const para of paras) expect(SHARED_RULES).toContain(para)
  })

  // v10.57 deleted the appendix's aspect-type definitions (the model pasted
  // them into the prose), so the slice it drops is smaller: 0.7 became 0.75.
  it('is materially shorter, or it is not a probe', () => {
    expect(SHARED_RULES_LEAN.length).toBeLessThan(SHARED_RULES.length * 0.75)
  })
})

// v10.48. v10.47 told the model to average about 18 words a sentence and to
// split anything carrying several facts. The first human reading of that prose
// (Kay, her own chart) found it clipped: sentences cut short and words swapped
// to stay under the limit. The rater had scored it higher, so only a test stops
// the target coming back on the rater's say-so.
describe('PART 4 carries no sentence-length target (v10.48)', () => {
  it('does not set a words-per-sentence average or tell the model to split', () => {
    expect(SHARED_RULES).not.toMatch(/KEEP SENTENCES SHORT/i)
    expect(SHARED_RULES).not.toMatch(/\b18 words\b/)
    expect(SHARED_RULES).not.toMatch(/words a sentence on average/i)
  })
  it('tells the model to finish the thought', () => {
    expect(SHARED_RULES).toContain('FINISH EVERY THOUGHT')
  })
})

// v10.49 — Kay's reading of her own chart (2026-11-10, this chart). Each block
// pins one fault that reached her.
describe('v10.49 — an aspect is walked once, in the first section that owns it', () => {
  const ctx = (planetSection: string, priorPlanetSections?: string[]) =>
    buildInterpretationContext(chart, 'tropical', planetSection, { priorPlanetSections })
  const bullet = (text: string, other: string) =>
    text.split('\n').find(l => l.startsWith('•') && new RegExp(`^• \\w+ ${other} \\(`).test(l)) ?? ''

  it('marks nothing in the opening section', () => {
    expect(ctx('sun', [])).not.toContain('ALREADY READ')
    expect(ctx('sun')).not.toContain('ALREADY READ')
  })

  it('marks the Mars aspects the Sun, Mercury and Venus sections already walked, and only those', () => {
    const mars = ctx('mars', ['sun', 'moon', 'ascendant', 'mercury', 'venus'])
    for (const other of ['Sun', 'Mercury', 'Venus']) expect(bullet(mars, other)).toContain(`ALREADY READ in the ${other} section`)
    for (const other of ['Jupiter', 'Neptune', 'Rahu']) {
      expect(bullet(mars, other)).not.toBe('')
      expect(bullet(mars, other)).not.toContain('ALREADY READ')
    }
    expect(mars).toMatch(/Do not work it again from the start/)
    // v10.57: build on it from this planet's side, as much as that needs.
    expect(mars).toMatch(/Build on it from Mars's side/)
  })

  it('leaves the aspect count, and so the word band, unchanged', () => {
    const prior = ['sun', 'moon', 'ascendant', 'mercury', 'venus']
    expect(countAspectsInContext(ctx('mars', prior))).toBe(countAspectsInContext(ctx('mars')))
    expect(countAspectsInContext(ctx('mars', prior))).toBeGreaterThan(3)
  })

  it('never marks an aspect between the two planets of one section', () => {
    const js = ctx('jupiter_saturn', ['sun', 'moon', 'ascendant', 'mercury', 'venus', 'mars'])
    expect(js).not.toMatch(/ALREADY READ in the (Jupiter|Saturn)/)
    expect(js).toContain('ALREADY READ in the Venus section')
  })
})

describe('v10.49 — the nodes and outer planets carry no dignity label', () => {
  it('does not call Rahu or Neptune peregrine', () => {
    const rahu = buildInterpretationContext(chart, 'tropical', 'rahu_ketu')
    expect(rahu).toMatch(/DIGNITY: NONE \(outside the dignity scheme\)/)
    expect(rahu).toMatch(/It is NOT peregrine/)
    const block = formatEliteChartBlock(chart.tropical, 'tropical')
    for (const body of ['Rahu', 'Ketu', 'Uranus', 'Neptune', 'Pluto']) {
      const line = block.split('\n').find(l => l.startsWith(`${body}:`))!
      expect(line).not.toMatch(/peregrine/i)
    }
    expect(block.split('\n').find(l => l.startsWith('Jupiter:'))).toMatch(/Peregrine/)
  })
})

describe('v10.49 — the prompt no longer hands over the phrasings the reader was shown', () => {
  it('states the wide-aspect and aftermath rules without the echoed wording', () => {
    expect(SHARED_RULES).not.toContain('gets at most a clause')
    expect(SHARED_RULES).not.toContain('a clause each')
    expect(SHARED_RULES).not.toContain('in the same breath')
    expect(SHARED_RULES).not.toContain('what you notice, afterwards')
    expect(buildInterpretationContext(chart, 'tropical', 'moon')).not.toContain('gets at most a clause')
  })

  it('treats narrated allocation and "the plan" as meta-narration', () => {
    expect(detectBannedPhrasings('The pull is wide; it gets at most a clause, but it is worth naming.')).not.toHaveLength(0)
    expect(detectBannedPhrasings('The plan allocates nothing to agreement.')).not.toHaveLength(0)
    expect(detectBannedPhrasings('You plan the week around the one conversation you are avoiding.')).toHaveLength(0)
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/the word never appears in what you write/)
  })

  it('keeps The Divergence off gendered pronouns, in the prompt and in the scan', () => {
    expect(SYNTHESIS_SYSTEM_PROMPT).toMatch(/You do not know the reader's gender/)
    const he = 'This person is not choosing between two versions of one wish. He is running two accounts, and neither decides for him.'
    const hits = scanSectionRules(he, { frame: 'synthesis' }).filter(f => f.rule === 'gendered-pronoun')
    expect(hits).toHaveLength(1)
    expect(hits[0].severity).toBe('hard')
    const thirdParty = 'They hold their ground when their mother asks for an answer. She wants a decision before they are ready to give one.'
    const thirdPartyHits = scanSectionRules(thirdParty, { frame: 'synthesis' }).filter(f => f.rule === 'gendered-pronoun')
    expect(thirdPartyHits).toHaveLength(1)
    expect(thirdPartyHits[0].severity).toBe('soft')
    // With no third party named, the reader is the only person a pronoun can
    // belong to, however the sentence is built.
    for (const misgendered of [
      'This person keeps two ledgers, and he trusts neither.',
      'Saturn in the tenth gives him a public role. His Moon in Cancer wants shelter.',
      'This person carries both accounts. Mars squares her Venus.',
      'She presses them for an answer.',
    ]) {
      expect(scanSectionRules(misgendered, { frame: 'synthesis' }).find(f => f.rule === 'gendered-pronoun')?.severity).toBe('hard')
    }
    // A named third party at the start of the section still softens it.
    expect(scanSectionRules('This person argues with their mother. She wants an answer before they have one.', { frame: 'synthesis' })
      .find(f => f.rule === 'gendered-pronoun')?.severity).toBe('soft')
    // ...but a third party named elsewhere does not excuse an explicit one.
    expect(scanSectionRules('This person keeps two ledgers. He trusts neither.\n\nTheir mother asks for an answer.', { frame: 'synthesis' })
      .find(f => f.rule === 'gendered-pronoun')?.severity).toBe('hard')
    const they = 'This person is not choosing between two versions of one wish. They are running two accounts, and neither decides for them.'
    expect(scanSectionRules(they, { frame: 'synthesis' }).filter(f => f.rule === 'gendered-pronoun')).toHaveLength(0)
    // A natal section may give a third party a pronoun.
    expect(scanSectionRules('You hear his answer and take it as settled.', { frame: 'tropical' }).filter(f => f.rule === 'gendered-pronoun')).toHaveLength(0)
  })

  it('bars a wide aspect from carrying the central tension, and the closing from replaying it', () => {
    expect(renderSectionInstruction('synthesis', 'tension')).toMatch(/labels wide cannot carry the defining tension/)
    expect(renderSectionInstruction('synthesis', 'closing')).toMatch(/Do not replay its situation/)
    expect(renderSectionInstruction('synthesis', 'diverge')).toMatch(/never weaker, unstable/)
    expect(renderSectionInstruction('synthesis', 'agree')).toMatch(/offer no theory of why/)
  })
})

describe('v10.49 — stock phrasings and dash density are reported to the next section', () => {
  const sec = (planetSection: string, text: string): PriorSection => ({ section: 'tropical', planetSection, text })
  const prior = [
    sec('sun', 'You inflate it. You notice afterwards that it became a referendum — a verdict — on your worth.'),
    sec('moon', 'You make the gesture. Afterwards you notice it settled nothing — it only bought time — and the question returns.'),
    sec('mercury', 'You sharpen the phrasing, and afterwards you notice the exchange shifted — from being understood — to being right.'),
  ]

  it('catches the aftermath lead-in across its word orders', () => {
    const tics = overusedTics(prior)
    expect(tics.find(t => t.tic.startsWith('afterwards you notice'))?.count).toBe(3)
    expect(phrasesAlreadyUsedBlock(prior)).toContain('afterwards you notice')
  })

  it('stays silent on a reading that does not repeat it', () => {
    expect(overusedTics([sec('sun', 'You inflate it, and the work becomes a referendum on your worth.')])).toHaveLength(0)
  })

  it('reports em-dash density only once there is enough prose to measure', () => {
    expect(phrasesAlreadyUsedBlock(prior)).not.toContain('DASHES')
    const dense = Array.from({ length: 40 }, () => 'You want the thing — the whole of it — and you say so plainly to them.').join(' ')
    expect(phrasesAlreadyUsedBlock([sec('sun', dense)])).toMatch(/DASHES — the reading so far uses 80 em dashes/)
    const plain = Array.from({ length: 40 }, () => 'You want the whole of the thing, and you say so plainly to them.').join(' ')
    expect(phrasesAlreadyUsedBlock([sec('sun', plain)])).not.toContain('DASHES')
  })
})
