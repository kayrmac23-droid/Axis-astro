import { describe, it, expect } from 'vitest'
import {
  scanSectionRules, summariseRuleScan, countSentences, formatRuleScanLog,
} from '@/lib/reading-rule-scan'

const rules = (text: string) => scanSectionRules(text).map(f => f.rule)
const has   = (text: string, rule: string) => rules(text).includes(rule)

// Prose written in AXIS's actual register, used as the false-positive control.
// Every rule below must stay silent on it: a scanner that cries wolf on real
// readings is a scanner that gets switched off.
const CLEAN_SECTION = `## The Sun

### The Sun in Leo

The Sun sits in Leo in the fourth house, and the fourth house privatises the
Leo drive entirely. Recognition matters, but it is recognition from the few
people inside the door.

### Sun in the Fourth House

Mars rules this Sun from the ninth, so what the Sun can deliver depends on
whether the belief holds. Under pressure the warmth contracts rather than
performs.

The cost is a long memory for who showed up. That tends to surface when a
family decision is made without them.`

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
