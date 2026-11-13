import { describe, it, expect } from 'vitest'
import {
  scanSectionRules, summariseRuleScan, countSentences, formatRuleScanLog,
  detectAntithesisTic, antithesisTicExceeded, antithesisVerdict,
  ANTITHESIS_PARAGRAPH_DEDUCT, ANTITHESIS_PARAGRAPH_HARD,
  hasRegisterDrift, registerFor,
} from '@/lib/reading-rule-scan'

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
    // v10.45: four uses across four paragraphs, none adjacent — the SECTION
    // backstop, so the finding states the spread rather than a cap.
    expect(f[0].match).toMatch(/^4 occurrences across 4 paragraphs \(allowance 2\)/)
    expect(f[0].line).toBe(1) // anchored on the first instance
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
describe('detectAntithesisTic / antithesisVerdict — the gate clamp surface', () => {
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

  // ⚠ v10.45 — the rule is DENSITY IN A PARAGRAPH, not a total per section.
  // These cases are the whole of it, and they are the regression that matters:
  // the v10.39 per-section cap failed 10 of 21 frozen bench sections, 6 of them
  // hard, while ranking ordinary comparative prose alongside the two sections a
  // reader would actually hear as a template.
  it('is clean when the construction is used sparsely and never adjacent to itself', () => {
    const spread = [
      '## The Sun',
      '',
      'You assert rather than ask, and the room hears it before you do.',
      '',
      'The ruler sits in the twelfth, so the assertion arrives already settled.',
      '',
      'Saturn squares it, and the settling costs you the chance to be argued with.',
      '',
      'What you notice is the silence after, which you read as agreement.',
    ].join('\n')
    const v = antithesisVerdict(spread)
    expect(v.maxPerParagraph).toBe(1)
    expect(v.severity).toBe('clean')
    expect(antithesisTicExceeded(spread)).toBeNull()
  })

  it('DEDUCTS at two in one paragraph', () => {
    const dense = [
      '## Venus',
      '',
      'Venus gives rather than receives, and it chooses depth rather than breadth.',
    ].join('\n')
    const v = antithesisVerdict(dense)
    expect(v.maxPerParagraph).toBe(ANTITHESIS_PARAGRAPH_DEDUCT)
    expect(v.severity).toBe('deduct')
    expect(v.cause).toBe('paragraph')
    expect(antithesisTicExceeded(dense)).toHaveLength(2)
  })

  it('FAILS at three in one paragraph — the construction is the paragraph shape', () => {
    const tic = [
      '## Mars',
      '',
      'It pushes rather than waits, it leads rather than follows, and it corrects rather than concedes.',
    ].join('\n')
    const v = antithesisVerdict(tic)
    expect(v.maxPerParagraph).toBeGreaterThanOrEqual(ANTITHESIS_PARAGRAPH_HARD)
    expect(v.severity).toBe('hard')
  })

  it('has a section backstop at one use per two paragraphs, for the diffuse case', () => {
    // Four paragraphs, two uses, never adjacent: allowance 2, at it, clean.
    const spread = [
      '## Mercury', '',
      'You draft rather than speak, and the draft is where the thinking happens.', '',
      'The ruler is peregrine, so it borrows its standing from Venus.', '',
      'Venus sits in Scorpio, which tests a thing before it trusts it.', '',
      'So the draft is revised rather than sent, and revision feels like progress.',
    ].join('\n')
    const v = antithesisVerdict(spread)
    expect(v.paragraphs).toBe(4)
    expect(v.allowance).toBe(2)
    expect(v.maxPerParagraph).toBe(1)
    expect(v.severity).toBe('clean')

    // ⚠ The backstop's whole job: ONE use in EVERY paragraph is still a
    // template, even though no paragraph is individually dense. Four uses
    // against an allowance of two is a deduction, never a hard failure — the
    // construction has not taken over any single paragraph.
    const everyPara = [
      '## Mercury', '',
      'You draft rather than speak, and the draft is where the thinking happens.', '',
      'The ruler is peregrine, so it borrows rather than owns its standing.', '',
      'Venus tests a thing rather than trusting it on sight.', '',
      'So the draft is revised rather than sent, and revision feels like progress.',
    ].join('\n')
    const e = antithesisVerdict(everyPara)
    expect(e.hits).toHaveLength(4)
    expect(e.maxPerParagraph).toBe(1)
    expect(e.allowance).toBe(2)
    expect(e.severity).toBe('deduct')
    expect(e.cause).toBe('section')
  })

  it('never reports an allowance below one, so a single-paragraph section keeps the construction', () => {
    const one = '## Closing\n\nYou hold the standard rather than the outcome, and that is the whole of it.'
    const v = antithesisVerdict(one)
    expect(v.allowance).toBe(1)
    expect(v.severity).toBe('clean')
  })

  it('stays clean on the clean control section', () => {
    expect(antithesisTicExceeded(CLEAN_SECTION)).toBeNull()
    expect(antithesisVerdict(CLEAN_SECTION).severity).toBe('clean')
  })

  it('agrees with the scan: a clamp fires exactly when the scan reports the tic', () => {
    const dense = [
      '## Venus',
      '',
      'Venus gives rather than receives, and it chooses depth rather than breadth.',
    ].join('\n')
    expect(antithesisTicExceeded(dense)).not.toBeNull()
    expect(rules(dense)).toContain('antithesis-tic')
    // And the converse, which is the regression that matters: no clamp without
    // a scan finding, or the two surfaces have drifted.
    expect(antithesisTicExceeded(CLEAN_SECTION)).toBeNull()
    expect(rules(CLEAN_SECTION)).not.toContain('antithesis-tic')
  })

  it('is reusable across sections (no stale regex lastIndex)', () => {
    const dense = '## Mars\n\nIt pushes rather than waits, and it leads rather than follows.'
    expect(antithesisTicExceeded(dense)).toEqual(antithesisTicExceeded(dense))
  })

  it('the verdict is a pure function of the text — no band, no word constant', () => {
    expect(antithesisVerdict.length).toBe(1)
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

// ── v10.48: relative/subordinate "you will", counterfactual "should have" ───
// The 2026-11-08 three-chart eval (v10.47 prompts, more second person) took hard
// prediction/prescription findings 6 → 13, and read one by one nearly all were
// relative or subordinate clauses describing a disposition, not a forecast or
// advice. Each phrase below is verbatim from that run.
describe('prediction/prescription — clausal false positives (2026-11-08 eval)', () => {
  const quiet = (t: string) => {
    const r = rules(`## X\n\n${t}`)
    return !r.includes('prediction') && !r.includes('prescription')
  }

  it('"rerouted into something you will privately resent"', () => {
    expect(quiet('rerouted into something you will privately resent')).toBe(true)
  })
  it('"filed as something you will carry rather than something you said"', () => {
    expect(quiet('filed as something you will carry rather than something you said')).toBe(true)
  })
  it('"draft material for how you will be known and who you will be known alongside"', () => {
    expect(quiet('draft material for how you will be known and who you will be known alongside')).toBe(true)
  })
  it('"making someone prove they want the depth before you\'ll admit you do too"', () => {
    expect(quiet("making someone prove they want the depth before you'll admit you do too")).toBe(true)
  })
  it('"what you can prove you deserve, materially, before you\'ll believe it"', () => {
    expect(quiet("what you can prove you deserve, materially, before you'll believe it")).toBe(true)
  })
  it('"the insistence on perfecting it before you\'ll trust it"', () => {
    expect(quiet("the insistence on perfecting it before you'll trust it")).toBe(true)
  })
  it('"quietly reconstructing the argument you should have made first" (counterfactual)', () => {
    expect(quiet('quietly reconstructing the argument you should have made first')).toBe(true)
  })
  it('"safety something you have to locate" (descriptive necessity)', () => {
    expect(quiet('safety something you have to locate')).toBe(true)
  })
  // ⚠ The fragment "you have to build the case for it, slowly" begins AT the
  // modal, so on its own it is lexically identical to the directive "you have to
  // stop doing that" — no regex can exempt one without the other. It is quiet
  // when the relative head that made it descriptive is present, and the bare
  // fragment stays flagged on purpose.
  it('"you have to build the case for it, slowly" — quiet inside its relative clause', () => {
    expect(quiet('worth is something you have to build the case for, slowly')).toBe(true)
    expect(quiet('the case you have to build for it, slowly')).toBe(true)
    expect(quiet('you have to build the case for it, slowly')).toBe(false)
  })

  it('still catches genuine predictions and prescriptions', () => {
    const loud = (t: string, rule: string) => has(`## X\n\n${t}`, rule)
    expect(loud('You will meet someone who changes this.', 'prediction')).toBe(true)
    expect(loud("You'll find the answer next spring.", 'prediction')).toBe(true)
    // A gap between the introducer and "you" is a main clause after a fronted
    // subordinate one — the prediction itself — so it is NOT exempted.
    expect(loud('When this transit ends you will meet someone.', 'prediction')).toBe(true)
    // Bare "that" is not an introducer: the complementiser is the prediction shape.
    expect(loud('The chart suggests that you will move abroad.', 'prediction')).toBe(true)
    expect(loud('You should work on this.', 'prescription')).toBe(true)
    expect(loud('You should have a plan before you speak.', 'prescription')).toBe(true)
    expect(loud('You have to stop doing that.', 'prescription')).toBe(true)
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
describe('the antithesis allowance is text-intrinsic (v10.45)', () => {
  // ⚠ The v10.39 band-derived cap (`antithesisCapFor`, one use per 450 words of
  // target, min 1) is GONE, and these are the two properties that condemned it.
  // Measured on fixtures/rater-bench before the change: 10 of 21 sections
  // breached it, 6 hard, and it was not tracking density at all.
  it('does not quantise: two sections at the same rate get the same verdict', () => {
    // `tropical/moon` ran 4 uses in 1056 words and `synthesis/closing` 1 in 265
    // — both 3.8 per 1000 — and the old integer cap hard-failed the first and
    // cleared the second. At the same RATE, the verdict must now agree.
    const used  = 'You assert rather than ask, and the room hears it first.'
    const plain = 'The ruler sits in the twelfth, so it arrives already settled.'
    // One use per two paragraphs, at two paragraphs and at eight.
    const short = ['## Closing', '', used, '', plain].join('\n')
    const long  = ['## The Moon', '', used, '', plain, '', used, '', plain,
                   '', used, '', plain, '', used, '', plain].join('\n')
    expect(antithesisVerdict(short).severity).toBe('clean')
    expect(antithesisVerdict(long).severity).toBe('clean')
    expect(antithesisVerdict(long).hits).toHaveLength(4)
  })

  it('is monotonic in density: adding a use to one paragraph only ever worsens the verdict', () => {
    const rank = { clean: 0, deduct: 1, hard: 2 } as const
    const clause = ' It leads rather than follows.'
    let body = '## Mars\n\nIt pushes rather than waits.'
    let last = -1
    for (let i = 0; i < 3; i++) {
      const sev = rank[antithesisVerdict(body).severity]
      expect(sev).toBeGreaterThanOrEqual(last)
      last = sev
      body += clause
    }
    expect(antithesisVerdict(body).severity).toBe('hard')
  })

  it('the band table no longer carries a cadence allowance', async () => {
    const prompts = await import('@/lib/prompts')
    expect('antithesisCapFor' in prompts).toBe(false)
    expect('ANTITHESIS_WORDS_PER_USE' in prompts).toBe(false)
  })
})

// "fulfilled" / "fulfilling" are British as well as American; only the bare
// verb, its -s form and "fulfillment" are Americanisms. The scan used to send
// correct prose to a rewrite (Chicago, 2026-11-12, sidereal/rahu_ketu).
describe('american-spelling — fulfil', () => {
  it('does not flag "fulfilled" or "fulfilling"', () => {
    expect(has('You feel fulfilled only once the work is checked, and find the checking fulfilling.', 'american-spelling')).toBe(false)
  })
  it('still flags "fulfill", "fulfills" and "fulfillment"', () => {
    for (const w of ['fulfill', 'fulfills', 'fulfillment']) {
      expect(has(`You call it ${w} and move on.`, 'american-spelling'), w).toBe(true)
    }
  })
})
