import { describe, it, expect } from 'vitest'
import {
  scanSectionRules, summariseRuleScan, countSentences, formatRuleScanLog,
  detectAntithesisTic, antithesisTicExceeded, ANTITHESIS_PER_SECTION_LIMIT,
  ANTITHESIS_HARD_MARGIN, antithesisHardThresholdFor,
  hasRegisterDrift, registerFor,
} from '@/lib/reading-rule-scan'
import { antithesisCapFor, SECTION_WORD_BANDS, wordBandFor } from '@/lib/prompts'

const rules = (text: string) => scanSectionRules(text).map(f => f.rule)
const has   = (text: string, rule: string) => rules(text).includes(rule)

// Prose written in AXIS's actual register, used as the false-positive control.
// Every rule below must stay silent on it: a scanner that cries wolf on real
// readings is a scanner that gets switched off.
const CLEAN_SECTION = `## The Sun

### The Sun in Leo

Your Sun sits in Leo in the fourth house, and the fourth house privatises the
Leo drive entirely. Recognition matters, but it is recognition from the few
people inside the door.

### Sun in the Fourth House

Mars rules this Sun from the ninth, so what you can deliver depends on whether
the belief holds. Under pressure your warmth contracts instead of performing.

The cost is a long memory for who showed up. You notice it surfacing when a
family decision gets made without you.`

describe('reading-rule-scan — false positives', () => {
  it('finds nothing in clean AXIS-register prose', () => {
    expect(scanSectionRules(CLEAN_SECTION)).toEqual([])
  })

  it('does not flag ordinary words that only breach as second-person directives', () => {
    // "consider", "work on", "will" and "must" all appear innocently in prose.
    const ok = 'Saturn works on the same axis, and the pattern will often surface when something is at stake. The chart must be read as a whole.'
    expect(has(ok, 'prescription')).toBe(false)
    expect(has(ok, 'prediction')).toBe(false)
  })

  it('does not flag British-adjacent words that are not Americanisms', () => {
    const ok = 'The size of the orb, the glamour of the placement, and an hour either way all change the prize.'
    expect(has(ok, 'american-spelling')).toBe(false)
  })

  // "judgement" is the British spelling; it used to be reported as American.
  it('does not flag the British "judgement"', () => {
    expect(has('Your judgement of a room is quick and rarely revised.', 'american-spelling')).toBe(false)
  })

  it('does not flag astrological "merger" or a conjunction described as merging', () => {
    const ok = 'The conjunction is a merger: the two planets operate as a single intensified unit. Scorpio needs transformation through total depth and merger.'
    expect(has(ok, 'smoke-detector')).toBe(false)
  })

  it('does not flag qualified tendency claims the prompt actually requires', () => {
    const ok = 'You will often recognise this the moment a plan is questioned.'
    expect(has(ok, 'prediction')).toBe(false)
  })
})

describe('reading-rule-scan — prescriptions and predictions', () => {
  it('flags second-person prescriptions', () => {
    expect(has('You should work on this before the next cycle.', 'prescription')).toBe(true)
    expect(has('You need to let the attachment go.', 'prescription')).toBe(true)
    expect(has('The work here is to notice the pattern.', 'prescription')).toBe(true)
  })

  it('flags predictions', () => {
    expect(has('You will meet someone who changes this.', 'prediction')).toBe(true)
    expect(has('This will bring a reckoning.', 'prediction')).toBe(true)
    expect(has('In the coming years the pressure lifts.', 'prediction')).toBe(true)
  })
})

describe('reading-rule-scan — spelling, formatting, sign-offs', () => {
  it('flags American spellings and names the British form', () => {
    const f = scanSectionRules('The behavior is colored by a defense of the center.')
      .filter(x => x.rule === 'american-spelling')
    expect(f.length).toBe(4)
    expect(f.map(x => x.match).join(' ')).toContain('→ behaviour')
    expect(f.map(x => x.match).join(' ')).toContain('→ centre')
  })

  it('flags bullet lists but not prose beginning with a dash-led clause', () => {
    expect(has('- Venus in Libra\n- Mars in Aries', 'bullet-list')).toBe(true)
    expect(has('1. The first pattern\n2. The second', 'bullet-list')).toBe(true)
    expect(has('The warmth contracts — and the account stays open.', 'bullet-list')).toBe(false)
  })

  it('flags greetings and sign-offs', () => {
    expect(has('Welcome to your reading.', 'greeting')).toBe(true)
    expect(has('In conclusion, the Sun carries the weight.', 'sign-off')).toBe(true)
    expect(has('I hope this lands.', 'sign-off')).toBe(true)
  })

  it('flags a summary heading — the v10.30 unheaded-close rule', () => {
    expect(has('### Putting It Together\n\nThe Sun holds.', 'summary-heading')).toBe(true)
    expect(has('### Synthesis\n\nThe Sun holds.', 'summary-heading')).toBe(true)
    expect(has('### Sun in the Fourth House\n\nThe Sun holds.', 'summary-heading')).toBe(false)
  })
})

describe('reading-rule-scan — doctrine', () => {
  it('flags a smoke-detector term used of the inter-system relationship', () => {
    const hit = 'The Tropical and Sidereal readings integrate into a single account of the person.'
    expect(has(hit, 'smoke-detector')).toBe(true)
    expect(scanSectionRules(hit)[0].severity).toBe('doctrine')
  })

  it('scopes the smoke-detector test to the sentence carrying the term', () => {
    // "resolve" here is about a tension inside one frame; the Tropical mention
    // is a different sentence, so it must not drag the term into scope.
    const ok = 'The Tropical chart puts Mars on the Descendant. The standoff does not resolve.'
    expect(has(ok, 'smoke-detector')).toBe(false)
  })

  it('flags claim-level LAW failures that contain no banned word', () => {
    expect(has('Together they give the complete picture.', 'law-claim')).toBe(true)
    expect(has('This is the full story of who you are.', 'law-claim')).toBe(true)
    expect(scanSectionRules('Together they give the complete picture.')[0].severity).toBe('doctrine')
  })
})

describe('reading-rule-scan — paragraph length', () => {
  it('counts sentences without splitting on decimals or abbreviations', () => {
    expect(countSentences('Sun square Saturn (orb 3.2°, applying). That is the tightest.')).toBe(2)
    expect(countSentences('Venus, e.g. in Libra, softens it.')).toBe(1)
  })

  it('flags a paragraph past the stated maximum as soft, not hard', () => {
    const long = 'One. Two. Three. Four. Five. Six.'
    const f = scanSectionRules(long).filter(x => x.rule === 'long-paragraph')
    expect(f.length).toBe(1)
    expect(f[0].severity).toBe('soft')
    expect(f[0].match).toContain('6 sentences')
  })

  it('leaves a four-sentence paragraph alone', () => {
    expect(has('One. Two. Three. Four.', 'long-paragraph')).toBe(false)
  })
})

describe('reading-rule-scan — antithesis cap', () => {
  const tic = (text: string) => scanSectionRules(text).filter(f => f.rule === 'antithesis-tic')

  it('leaves a section with exactly one antithesis alone', () => {
    // CLEAN_SECTION already carries one "rather than" and must stay clean.
    expect(tic(CLEAN_SECTION)).toEqual([])
    expect(tic('The warmth contracts rather than performs. The memory is long.')).toEqual([])
  })

  it('does not count bare "rather", concessions, "not only" or ordinary comparatives', () => {
    const ok = [
      'She would rather not say so. It is rather good at holding.',
      'You may not say so, but it is felt. You do not leave, but you go quiet.',
      'It is not only warm but also exacting.',
      'The Moon moves less often than the Sun suggests, and spends less time than expected.',
    ].join('\n\n')
    expect(tic(ok)).toEqual([])
  })

  it('reports four occurrences as ONE soft finding carrying the count', () => {
    const text = [
      'The warmth contracts rather than performs.',
      'Recognition is sought rather than demanded.',
      'The memory works rather than rests.',
      'The exit is planned rather than taken.',
    ].join('\n\n')
    const f = tic(text)
    expect(f).toHaveLength(1)
    expect(f[0].severity).toBe('soft')
    expect(f[0].match).toMatch(/^4 occurrences \(limit 1\)/)
    expect(f[0].line).toBe(3) // the first occurrence past the cap
  })

  it('counts the "not X but Y" and "less X than Y" variants', () => {
    expect(tic('This is not warmth but obligation. It is less a wound than a habit.')).toHaveLength(1)
    // The struck fragment AND the antithesis: both are real, and this counts.
    expect(tic('The cost stays — not a consolation, but a fact. It is less about control than about safety.')).toHaveLength(1)
  })

  it('is reusable across sections — the /g regexes keep no stale lastIndex', () => {
    const text = 'Sought rather than demanded. Planned rather than taken.'
    expect(tic(text)).toHaveLength(1)
    expect(tic(text)).toHaveLength(1)
  })
})

describe('reading-rule-scan — summary and logging', () => {
  it('aggregates by severity and rule', () => {
    const s = summariseRuleScan('You should work on this. The behavior is colored.')
    expect(s.hard).toBeGreaterThanOrEqual(3)
    // Two prescriptions, not one: SHARED_RULES lists "you should" and "work on"
    // as separate banned constructions, and this sentence uses both. Counting
    // each matched construction is what makes the eval harness's totals mean
    // "banned constructions used", not "sentences that had a problem".
    expect(s.byRule['prescription']).toBe(2)
    expect(s.byRule['american-spelling']).toBe(2)
    expect(s.total).toBe(s.findings.length)
  })

  it('emits one greppable line in the [AXIS_*] family', () => {
    const line = formatRuleScanLog('tropical/sun', summariseRuleScan('You should stop.'))
    expect(line).toMatch(/^\[AXIS_RULES\] section=tropical\/sun hard=\d+ doctrine=\d+ soft=\d+/)
  })

  it('ignores the truncation sentinel as pipeline metadata', () => {
    expect(scanSectionRules(`${CLEAN_SECTION}\n\n[AXIS_TRUNCATED]`)).toEqual([])
  })

  it('is reusable across sections — module-level regexes are not left mid-scan', () => {
    const bad = 'You should go. You will see.'
    const first  = scanSectionRules(bad)
    const second = scanSectionRules(bad)
    expect(second).toEqual(first)
    expect(first.length).toBeGreaterThan(0)
  })
})

// ── The exported antithesis detector ────────────────────────────────────────
// The quality gate clamps `voice_quality` on THIS function (v10.34), so it is
// no longer only a reporting input: a change in what it matches changes what
// the pipeline repairs and caches. The scan's own false-positive controls above
// cover the regexes; these pin the exported surface and the cap boundary.
describe('detectAntithesisTic / antithesisTicExceeded — the gate clamp surface', () => {
  it('counts every occurrence, in document order, with whitespace collapsed', () => {
    const text = [
      '## The Sun',
      '',
      'The Sun acts rather than waits.',
      '',
      'It is not a stance but a reflex, and it moves less a decision than',
      'a habit.',
    ].join('\n')
    const hits = detectAntithesisTic(text)
    expect(hits.length).toBeGreaterThanOrEqual(3)
    expect(hits.map(h => h.line)).toEqual([...hits.map(h => h.line)].sort((a, b) => a - b))
    // Collapsed: a construction broken across a line wrap must not carry \n
    // into the critique the gate builds from these strings.
    for (const h of hits) expect(h.match).not.toMatch(/\n/)
  })

  it('returns null AT the cap and hits above it, so a compliant section is never clamped', () => {
    const atCap = '## The Sun\n\nThe Sun asserts rather than asks. It is direct and it is early.'
    expect(detectAntithesisTic(atCap)).toHaveLength(ANTITHESIS_PER_SECTION_LIMIT)
    expect(antithesisTicExceeded(atCap)).toBeNull()

    const overCap = `${atCap} The Moon reflects rather than initiates.`
    expect(antithesisTicExceeded(overCap)).not.toBeNull()
    expect(antithesisTicExceeded(overCap)!.length).toBe(ANTITHESIS_PER_SECTION_LIMIT + 1)
  })

  it('stays null on the clean control section', () => {
    expect(antithesisTicExceeded(CLEAN_SECTION)).toBeNull()
  })

  it('agrees with the scan: a clamp fires exactly when the scan reports the tic', () => {
    const overCap = [
      '## Venus',
      '',
      'Venus gives rather than receives, and it chooses depth rather than breadth.',
    ].join('\n')
    expect(antithesisTicExceeded(overCap)).not.toBeNull()
    expect(rules(overCap)).toContain('antithesis-tic')
    // And the converse, which is the regression that matters: no clamp without
    // a scan finding, or the two surfaces have drifted.
    expect(antithesisTicExceeded(CLEAN_SECTION)).toBeNull()
    expect(rules(CLEAN_SECTION)).not.toContain('antithesis-tic')
  })

  it('is reusable across sections (no stale regex lastIndex)', () => {
    const overCap = '## Mars\n\nIt pushes rather than waits, and it leads rather than follows.'
    const first  = antithesisTicExceeded(overCap)
    const second = antithesisTicExceeded(overCap)
    expect(second).toEqual(first)
  })
})

// ── Register drift (v10.34) ─────────────────────────────────────────────────
// PART 4 requires a natal section to address the reader as "you". On the
// 2026-11-03 eval run 10 of 17 natal sections contained ZERO second-person
// address — the model reverts to the third person about a placement, which is
// the register of nearly every astrology text. The false-positive constraint
// here is the sharpest in the file: two registers are LEGITIMATE (The
// Divergence is third person by instruction, synastry second person plural),
// so a frame-blind check would fire on correct prose.
describe('register drift — natal sections must address the reader', () => {
  const APPARATUS = `## Mercury

Mercury sits peregrine in Libra, and that condition governs how this mind
reaches a conclusion. This private weighing often never reaches the person it
was about.`

  const ADDRESSED = `## Mercury

Mercury sits peregrine in Libra, and that condition governs how you reach a
conclusion. You turn the disagreement over long after the conversation ended.`

  it('maps frames to registers, and anything unrecognised is exempt', () => {
    expect(registerFor('tropical')).toBe('natal')
    expect(registerFor('sidereal')).toBe('natal')
    expect(registerFor('synthesis')).toBe('synthesis')
    expect(registerFor('synastry')).toBe('synastry')
    expect(registerFor(undefined)).toBe('unknown')
    expect(registerFor('nonsense')).toBe('unknown')
  })

  it('flags a natal section with no second-person address', () => {
    expect(hasRegisterDrift(APPARATUS, 'natal')).toBe(true)
    expect(scanSectionRules(APPARATUS, { frame: 'tropical' }).map(f => f.rule))
      .toContain('register-drift')
    expect(scanSectionRules(APPARATUS, { frame: 'sidereal' }).map(f => f.rule))
      .toContain('register-drift')
  })

  it('stays silent once the section addresses the reader even once', () => {
    expect(hasRegisterDrift(ADDRESSED, 'natal')).toBe(false)
    expect(scanSectionRules(ADDRESSED, { frame: 'tropical' }).map(f => f.rule))
      .not.toContain('register-drift')
  })

  it('exempts the two legitimate non-second-person registers', () => {
    // The Divergence is third person BY INSTRUCTION — flagging it would be the
    // scan contradicting the prompt.
    expect(hasRegisterDrift(APPARATUS, 'synthesis')).toBe(false)
    expect(hasRegisterDrift(APPARATUS, 'synastry')).toBe(false)
    expect(scanSectionRules(APPARATUS, { frame: 'synthesis' }).map(f => f.rule))
      .not.toContain('register-drift')
  })

  it('never fires when the caller did not say which frame it is scanning', () => {
    // A frame-blind call must not guess: it cannot tell a drifted natal section
    // from a correct Divergence one.
    expect(scanSectionRules(APPARATUS).map(f => f.rule)).not.toContain('register-drift')
    expect(summariseRuleScan(APPARATUS).byRule['register-drift']).toBeUndefined()
  })

  it('counts a second-person possessive and reflexive, not just the pronoun', () => {
    for (const t of ['It costs your attention.', 'You find yourself answering.', 'That is yours to carry.'])
      expect(hasRegisterDrift(`## The Sun\n\n${t}`, 'natal')).toBe(false)
  })

  it('ignores second person inside a heading only — prose is what counts', () => {
    // proseLines strips headings; a section whose ONLY "you" is in a heading has
    // still drifted.
    expect(hasRegisterDrift('## What You Bring\n\nThis mind works in private.', 'natal')).toBe(true)
  })

  it('stays silent on the clean control section', () => {
    expect(scanSectionRules(CLEAN_SECTION, { frame: 'tropical' }).map(f => f.rule))
      .not.toContain('register-drift')
  })
})

// ── v10.38: the prescription false positive ─────────────────────────────────
// The 2026-11-05 v10.37 run reported a hard `prescription` breach on "a
// conversation that gives you room to draft before you have to speak". That is
// a temporal clause, not advice. This file's stated design constraint is that
// false positives are what matter, "because a scanner that cries wolf gets
// switched off" — and a hard breach is the loudest thing it can say.
//
// "should"/"ought to" are prescriptive anywhere. "need to"/"must"/"have to" are
// also ordinary descriptive English inside a clause introduced by a
// subordinating conjunction, so there they stay silent.
describe('prescription — conditional modals in subordinate clauses', () => {
  const hit = (t: string) => has(`## X\n\n${t}`, 'prescription')

  it('stays silent on a conditional modal after a subordinating conjunction', () => {
    expect(hit('a conversation that gives you room to draft before you have to speak')).toBe(false)
    expect(hit('the pattern holds until you have to choose between them')).toBe(false)
    expect(hit('when you must defend it, the hesitation returns')).toBe(false)
    expect(hit('if you need to be certain first, the moment passes')).toBe(false)
    expect(hit('it costs more than you have to give')).toBe(false)
    expect(hit('once you have to say it aloud, the draft stops helping')).toBe(false)
  })

  it('still catches the genuine prescriptions', () => {
    expect(hit('you have to stop doing that')).toBe(true)
    expect(hit('you need to accept the cost')).toBe(true)
    expect(hit('you must name it plainly')).toBe(true)
  })

  it('never exempts should/ought to, which are prescriptive anywhere', () => {
    expect(hit('before you should speak, the draft is done')).toBe(true)
    expect(hit('you ought to say so')).toBe(true)
    expect(hit('you should work on this')).toBe(true)
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// The cap the SCAN reports from and the threshold the GATE hard-fails on are
// deliberately different numbers. v10.34 conflated them, so the second instance
// of an ordinary cadence construction forced a full-section repair — 39 of the
// 63 sections measured when this rule was written. The scan stays loud (it is a
// measuring instrument and reports from the second); the gate's hard failure
// waits for the third. Pinned so neither drifts onto the other.
// ─────────────────────────────────────────────────────────────────────────────
describe('antithesis thresholds — the scan reports earlier than the gate fails', () => {
  it('reports from one over the cap but reserves the hard failure for two over', () => {
    expect(ANTITHESIS_PER_SECTION_LIMIT).toBe(1)
    expect(ANTITHESIS_HARD_MARGIN).toBe(2)
    expect(antithesisHardThresholdFor(1)).toBe(3)
  })

  // The margin is expressed ABOVE the cap, not as an absolute count, because
  // the cap itself scales with the band. An absolute 3 would be "two over" for
  // a 230-word section and "one over" for a 780-word one, so the severity of a
  // given overrun would depend on the band — backwards.
  it('keeps the hard failure the same distance over the cap at every band', () => {
    for (const cap of [1, 2, 3])
      expect(antithesisHardThresholdFor(cap) - cap).toBe(ANTITHESIS_HARD_MARGIN)
  })

  it('honours a band-scaled cap passed by the caller', () => {
    const two = 'It asserts rather than asks. It leads rather than follows.'
    // At a cap of 1 this is over and reported…
    expect(scanSectionRules(two, { antithesisCap: 1 }).filter(f => f.rule === 'antithesis-tic')).toHaveLength(1)
    // …and at a cap of 2 — the Sun/Moon and Divergence allowance — it is clean.
    expect(scanSectionRules(two, { antithesisCap: 2 }).filter(f => f.rule === 'antithesis-tic')).toHaveLength(0)
    expect(antithesisTicExceeded(two, 2)).toBeNull()
    expect(antithesisTicExceeded(two, 1)).toHaveLength(2)
  })

  it('reports the cap it was given, and the line of the first instance past it', () => {
    const three = 'It asserts rather than asks.\n\nIt leads rather than follows.\n\nIt is not a stance but a reflex.'
    const [f] = scanSectionRules(three, { antithesisCap: 2 }).filter(r => r.rule === 'antithesis-tic')
    expect(f.match).toContain('(limit 2)')
    // The finding anchors on the instance that broke the cap, i.e. the third.
    expect(f.line).toBe(detectAntithesisTic(three)[2].line)
  })

  it('counts every occurrence, leaving the threshold to the caller', () => {
    const two = 'It asserts rather than asks. It leads rather than follows.'
    expect(detectAntithesisTic(two)).toHaveLength(2)
    // Over the cap, so the scan reports it…
    expect(scanSectionRules(two).filter(f => f.rule === 'antithesis-tic')).toHaveLength(1)
    // …and under the gate's hard threshold, so it is a deduction there.
    expect(detectAntithesisTic(two).length).toBeLessThan(antithesisHardThresholdFor(1))
  })
})

// ─────────────────────────────────────────────────────────────────────────────
// THE CAP IS A DENSITY, AND THE RATE IS PINNED BY ITS TABLE.
//
// The derivation is the table, not a story about the constant. Two properties
// make this change defensible, and both are asserted here rather than argued:
//
//   1. Under the v10.30 band table every natal section yields a cap of 1 — the
//      flat cap that was actually ratified. "One per section" and "one per 450
//      words" were the SAME RULE then, because every natal band but Divergence
//      was at or under 450. So this is not a loosening; the cap simply was
//      never rescaled when v10.36 rescaled the bands.
//   2. Under the shipped v10.36 table only the two bands that roughly doubled
//      — Sun/Moon 450→760 and Divergence 650→780 — gain a second use. Every
//      other section keeps the cap it has always had.
//
// A rate change that broke either property would be a real change in what the
// prompt permits, and should fail here and be argued on its own merits.
// ─────────────────────────────────────────────────────────────────────────────
describe('antithesisCapFor — the band-scaled cadence allowance', () => {
  const band = (target: number) => ({ target, fullMin: 0, fullMax: 0, hardMin: 0, hardMax: 0 })

  it('reproduces the flat cap of 1 for every section under the v10.30 bands', () => {
    // The v10.30 targets, the table the flat cap was ratified against.
    const v1030 = {
      'Sun/Moon': 450, Ascendant: 400, 'sidereal primary': 350, 'tropical secondary': 250,
      'sidereal secondary': 200, 'key aspects': 200, 'tropical nodes': 220,
      Concordance: 330, Divergence: 650,
    }
    for (const [name, target] of Object.entries(v1030))
      expect(antithesisCapFor(band(target)), name).toBe(1)
  })

  it('grants a second use only to the two bands v10.36 roughly doubled', () => {
    const caps: Record<string, number> = {}
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      caps[key] = antithesisCapFor(wordBandFor(section, planetSection))
    }
    expect(Object.entries(caps).filter(([, c]) => c > 1).map(([k]) => k).sort())
      .toEqual(['synthesis:diverge', 'tropical:moon', 'tropical:sun'])
    expect(caps['tropical:sun']).toBe(2)
    expect(caps['synthesis:diverge']).toBe(2)
    // The nearest band below the line stays at 1, so the boundary is not
    // accidentally sitting on top of a section.
    expect(caps['tropical:ascendant']).toBe(1)
  })

  it('never returns zero, however short the band', () => {
    // The construction is legitimate once, and the prompt's own worked example
    // uses it — a cap of 0 would ban a shape the rules teach.
    for (const target of [0, 1, 50, 140, 229]) expect(antithesisCapFor(band(target))).toBe(1)
  })

  it('scales with the chart-scaled band, not the base band', () => {
    // A placement dense enough to earn a much longer section earns the room to
    // vary its cadence across those words too. Aspect scaling moves the target,
    // so the cap follows it without a second mechanism.
    const base   = wordBandFor('tropical', 'sun', 0)
    const scaled = wordBandFor('tropical', 'sun', 20)
    expect(scaled.target).toBeGreaterThan(base.target)
    expect(antithesisCapFor(scaled)).toBeGreaterThanOrEqual(antithesisCapFor(base))
  })

  it('is monotonic in band length', () => {
    let last = 0
    for (const target of [100, 300, 450, 700, 900, 1400, 2000]) {
      const cap = antithesisCapFor(band(target))
      expect(cap).toBeGreaterThanOrEqual(last)
      last = cap
    }
  })
})
