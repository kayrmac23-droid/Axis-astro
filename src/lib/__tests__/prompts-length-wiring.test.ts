// Regression guard for the length-band wiring.
//
// Two bugs, one in each generation of this file.
//
// The first: ~11 sections carried a hand-typed word literal ("300–400 words.")
// instead of rendering from SECTION_WORD_BANDS, so changing a band silently left
// them telling the model the old number. Fixed by routing every section through
// lengthClause(); the literal checks below still guard it.
//
// The second, which the first fix hid: lengthClause() was rendered INTO
// SECTION_INSTRUCTIONS at import, binding every section to its BASE band — while
// the gate's scoreLength scores against the band scaled to the chart's aspect or
// evidence count. The model was told "target 350, range 300–400" for a Venus with
// seven aspects that the gate scored against 450–700, i.e. 3/5 on length for
// perfect compliance. The old tests here could not see it: they compared the
// instruction against wordBandFor() called with NO chart, which is the same base
// band the instruction was built from, so both sides of the assertion were wrong
// together.
//
// The contract now: SECTION_INSTRUCTIONS carries LENGTH_CLAUSE_SLOT, and
// renderSectionInstruction() substitutes the clause per request from the scaled
// band. The load-bearing test is `instruction ↔ gate parity`, which drives real
// charts and asserts the number the model reads IS the number scoreLength acts on.
import { describe, it, expect } from 'vitest'
import { readFileSync } from 'fs'
import {
  SECTION_INSTRUCTIONS, SECTION_WORD_BANDS, LENGTH_CLAUSE_SLOT, renderSectionInstruction,
  wordBandFor, countPlanEvidence,
} from '../prompts'
import { countAspectsInContext, scoreLength, countWords } from '../reading-quality-gate'
import { buildInterpretationContext } from '../interpretation-engine'
import { calculateDualChart, type BirthData } from '../astro-calc'
import { parseBirthDataInput } from '../birth-data-validation'
import { NATAL_SECTION_ORDER } from '../reading-order'
import { buildSectionRequest, type NatalFrame } from '../../../scripts/eval-readings.request'

const WIRING_BIRTH: BirthData = {
  year: 1990, month: 6, day: 15, hour: 14, minute: 30,
  latitude: 51.5074, longitude: -0.1278, timezone: 1,
}

describe('length-band wiring — the clause is a per-request slot, not a baked string', () => {
  for (const key of Object.keys(SECTION_WORD_BANDS)) {
    const [section, planetSection] = key.split(':')
    it(`${key} carries exactly one length slot and renders its band into it`, () => {
      const raw = SECTION_INSTRUCTIONS[section]?.[planetSection]
      expect(raw, `${key} instruction missing`).toBeTruthy()
      expect(raw!.split(LENGTH_CLAUSE_SLOT).length - 1, `${key} slot count`).toBe(1)

      // Unscaled render == the base band, so a section with no chart signal is
      // unchanged from the old behaviour.
      const base = wordBandFor(section, planetSection)
      const text = renderSectionInstruction(section, planetSection)!
      expect(text).not.toContain(LENGTH_CLAUSE_SLOT)
      expect(text).toContain(`Target ${base.target} words`)
      expect(text).toContain(`Acceptable range ${base.fullMin}–${base.fullMax}`)
    })
  }

  it('scaling the band changes the number the instruction states', () => {
    // tropical:venus is aspect-scaled; synthesis:agree is evidence-scaled.
    const venusBase   = renderSectionInstruction('tropical', 'venus')!
    const venusDense  = renderSectionInstruction('tropical', 'venus', { aspectCount: 7 })!
    expect(venusBase).not.toBe(venusDense)
    expect(venusDense).toContain(`Target ${wordBandFor('tropical', 'venus', 7).target} words`)

    const agreeThin = renderSectionInstruction('synthesis', 'agree', { evidenceCount: 1 })!
    expect(agreeThin).toContain(`Target ${wordBandFor('synthesis', 'agree', undefined, 1).target} words`)
  })

  it('renderSectionInstruction is the only supported reader of SECTION_INSTRUCTIONS', () => {
    // A caller that reads the map directly would send the raw slot to the model.
    // prompts.ts itself and the tests are allowed to name it.
    const offenders: string[] = []
    for (const file of [
      'src/app/api/reading/route.ts',
      'scripts/eval-readings.request.ts',
      'scripts/eval-readings.harness.ts',
    ]) {
      const src = readFileSync(file, 'utf8')
      for (const line of src.split('\n')) {
        // Reading the map to CHECK a section exists is fine; using its value is not.
        if (/SECTION_INSTRUCTIONS\[[^\]]+\]\??\.?\[[^\]]+\]/.test(line) && !/^\s*(\/\/|\*)/.test(line) && !/if \(!/.test(line)) {
          offenders.push(`${file}: ${line.trim()}`)
        }
      }
    }
    expect(offenders, 'use renderSectionInstruction() instead').toEqual([])
  })
})

describe('length-band wiring — no hand-typed word-count literals remain', () => {
  it('no SECTION_INSTRUCTIONS value carries a bare "NNN–NNN words" or "words total" literal', () => {
    for (const [section, planetSections] of Object.entries(SECTION_INSTRUCTIONS)) {
      for (const [planetSection, text] of Object.entries(planetSections)) {
        expect(
          /\d{3}–\d{3} words/.test(text),
          `${section}/${planetSection} still contains a bare "NNN–NNN words" literal`,
        ).toBe(false)
        expect(
          /words total\./.test(text),
          `${section}/${planetSection} still contains a "words total." literal`,
        ).toBe(false)
      }
    }
  })
})

// ── The load-bearing one ─────────────────────────────────────────────────────
// Drives every natal section of every eval chart and asserts that the band the
// instruction states is the band the gate scores against. This is the test that
// would have caught the baked-clause drift.
describe('instruction ↔ gate parity — the model is told the band it is scored on', () => {
  const { charts } = JSON.parse(readFileSync('scripts/eval-charts.json', 'utf8')) as {
    charts: Array<{ id: string; birth: Record<string, unknown> }>
  }

  for (const spec of charts) {
    it(`${spec.id}: every section states the band scoreLength uses`, () => {
      const parsed = parseBirthDataInput(spec.birth, { label: 'birth', resolveTzName: true })
      expect(parsed.ok, `${spec.id} birth data`).toBe(true)
      if (!parsed.ok) return
      const dual = calculateDualChart(parsed.data)

      for (const [section, planetSections] of Object.entries(NATAL_SECTION_ORDER)) {
        for (const planetSection of planetSections) {
        // No thread: the prior sections change the repeat block, never the band.
        const req = buildSectionRequest(dual, section as NatalFrame, planetSection, [])

        // What the gate will do, from the userContent the route hands it.
        const gateBand = wordBandFor(
          section, planetSection,
          countAspectsInContext(req.userContent),
          countPlanEvidence(req.userContent, planetSection) ?? undefined,
        )
        const label = `${spec.id} ${section}/${planetSection}`

        // 1. The band the request was built from is the band the gate derives.
        //    (Counting on the context prefix must equal counting on the whole.)
        expect(req.band, label).toEqual(gateBand)

        // 2. The prose the model reads states exactly those numbers.
        expect(req.userContent, label).toContain(`Target ${gateBand.target} words`)
        expect(req.userContent, label).toContain(
          `Acceptable range ${gateBand.fullMin}–${gateBand.fullMax}`,
        )
        expect(req.userContent, label).not.toContain(LENGTH_CLAUSE_SLOT)

        // 3. A section written to the stated target scores full marks on length.
        expect(scoreLength(gateBand.target, gateBand), `${label} target scores 5`).toBe(5)
        }
      }
    })
  }
})

describe('evidence-scaled Divergence bands', () => {
  it('lowers the floor when the plan allocated little, so a quiet chart is not padded', () => {
    const base  = wordBandFor('synthesis', 'agree')
    const thin  = wordBandFor('synthesis', 'agree', undefined, 1)
    const rich  = wordBandFor('synthesis', 'agree', undefined, 6)
    expect(thin.hardMin).toBeLessThan(base.hardMin)
    expect(thin.fullMin).toBeLessThan(base.fullMin)
    expect(rich.fullMax).toBeGreaterThan(base.fullMax)
    // A rich plan must not raise the hard floor — earned brevity stays legal.
    expect(rich.hardMin).toBe(base.hardMin)
  })

  it('caps how far upward a concordance-rich plan can push the band', () => {
    // Uncapped, a chart with 8 concordances (one of the 12 eval charts) was told
    // to write a 1000-word target about where the systems AGREE — more than The
    // Divergence itself gets (900). Concordance items are individually small;
    // past the cap they are named, not developed.
    const capped = wordBandFor('synthesis', 'agree', undefined, 8)
    const atCap  = wordBandFor('synthesis', 'agree', undefined, 6)  // baseline 3 + cap 3
    expect(capped).toEqual(atCap)
    expect(capped.target).toBeLessThan(wordBandFor('synthesis', 'diverge').target)
    // Downward scaling stays uncapped.
    expect(wordBandFor('synthesis', 'agree', undefined, 0).fullMin)
      .toBeLessThan(wordBandFor('synthesis', 'agree', undefined, 2).fullMin)
  })

  it('never lets a scaled floor collapse below a real section', () => {
    for (const section of ['agree', 'diverge'] as const) {
      const band = wordBandFor('synthesis', section, undefined, 0)
      expect(band.hardMin).toBeGreaterThanOrEqual(90)
      expect(band.hardMin).toBeLessThan(band.fullMin)
      expect(band.fullMin).toBeLessThan(band.fullMax)
    }
  })

  it('leaves every non-Divergence band untouched by evidence scaling', () => {
    for (const [key] of Object.entries(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      if (section === 'synthesis' && (planetSection === 'agree' || planetSection === 'diverge')) continue
      expect(wordBandFor(section, planetSection, undefined, 1))
        .toEqual(wordBandFor(section, planetSection))
    }
  })

  it('reads the plan weight the context block actually prints', () => {
    const ctx = buildInterpretationContext(calculateDualChart(WIRING_BIRTH), 'synthesis', 'agree')
    expect(ctx).toMatch(/^PLAN WEIGHT: \d+ concordance\(s\), \d+ divergence\(s\)/m)
    expect(countPlanEvidence(ctx, 'agree')).toBeGreaterThan(0)
    expect(countPlanEvidence(ctx, 'diverge')).toBeGreaterThan(0)
    // Sections without a plan are left alone.
    expect(countPlanEvidence('no plan here', 'agree')).toBeNull()
    expect(countPlanEvidence(ctx, 'tension')).toBeNull()
  })

  it('a length clause never fakes an aspect entry or a plan-weight line', () => {
    // The route counts aspects/evidence on the context prefix and the gate counts
    // them on the finished userContent; that is only safe while the rendered
    // clause is invisible to both helpers.
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      const text = renderSectionInstruction(section, planetSection, { aspectCount: 9, evidenceCount: 9 })!
      expect(countAspectsInContext(text), key).toBe(0)
      expect(countPlanEvidence(text, planetSection), key).toBeNull()
    }
  })
})

describe('countWords / scoreLength are the pair the clause is written against', () => {
  it('a section at the stated target scores 5 on every typed band', () => {
    for (const key of Object.keys(SECTION_WORD_BANDS)) {
      const [section, planetSection] = key.split(':')
      const band = wordBandFor(section, planetSection)
      const text = Array.from({ length: band.target }, () => 'word').join(' ')
      expect(countWords(text)).toBe(band.target)
      expect(scoreLength(countWords(text), band), key).toBe(5)
    }
  })
})
