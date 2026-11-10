// lib/scene-expectation.ts
//
// Whether a section's EVIDENCE can carry the recurring moment PART 1 asks for —
// computed from the chart context, never judged, so the writer and the
// evaluator are told the same fact.
//
// WHY THIS EXISTS. PART 1 required a moment in every section: a trigger, what
// you do, what you notice afterwards, built ONLY from chart factors the context
// names. A trigger in this pipeline is a relation that activates a placement:
// an aspect in the Tropical frame, a graha drishti received in the Sidereal
// frame (the Sidereal prompt already maps drishti to "what triggers it"). Sign
// status, lordship and same-sign conjunction describe the ARENA a pattern runs
// in, not a moment inside it. So on a section whose evidence names no trigger,
// the only way to write PART 1's moment was to invent one — which PART 1
// forbids — and the evaluator then scored the honest alternative a 2 and sent
// it to a repair that pushed toward the invention.
//
// Measured on the 2026-11-08 shorter-sentence run of control-chicago-1987: of
// the eight Sidereal sections, all four that reached specificity 3 receive a
// drishti, and three of the four that stayed at 2 receive none (Rahu/Ketu, which
// receives one, is the exception). One chart, eight sections — the reason the
// rule is evidence-shaped and checkable, not the proof that it is right.
//
// The Divergence is third person by its own instruction, so PART 1's moment
// (addressed to "you") was unsatisfiable there by construction. Its plan lists
// aspects as the evidence for each divergence, so a moment CAN be built from
// evidence — in third person.

export type SceneExpectation = 'yes' | 'no' | 'third-person'

// interpretation-engine.ts: "• Receives the 7th-house drishti of Mars (from …)"
// and, on the Lagna block, "• The Lagna receives the 7th-house drishti of …".
const DRISHTI_RECEIVED_RE = /receives the \d+(?:st|nd|rd|th)-house drishti of/i
// buildDivergencePlan evidence ids for aspects: A-MARS-SATURN-SEXTILE.
const PLAN_ASPECT_RE = /\bA-[A-Z]+-[A-Z]+-[A-Z]+\b/

/**
 * @param aspectCount the Tropical major-aspect count for this section, as
 *   countAspectsInContext reports it (passed in, not recomputed, so this module
 *   does not import the gate and both callers use the count they already hold).
 */
export function sceneExpectation(
  section: string,
  planetSection: string,
  context: string,
  aspectCount: number,
): SceneExpectation {
  if (section === 'synthesis') {
    // Every Divergence section receives the WHOLE shared plan, so an aspect
    // anywhere in it says nothing about this section's own evidence. The
    // concordance section is allocated only concordances — sign, dignity and
    // house holding across frames, with no aspect evidence — and its own
    // instruction forbids previewing the divergence, so a "the frames make the
    // person act differently" moment would be both invented and off-brief.
    if (planetSection === 'agree') return 'no'
    return PLAN_ASPECT_RE.test(context) ? 'third-person' : 'no'
  }
  if (section === 'sidereal')  return DRISHTI_RECEIVED_RE.test(context) ? 'yes' : 'no'
  if (section === 'tropical')  return aspectCount > 0 ? 'yes' : 'no'
  // Synastry is built on inter-aspects and keeps PART 1 as it always was.
  return 'yes'
}

/**
 * The generator's half: appended to the section instruction, in the uncached
 * tail beside it, because a nearer instruction is the one this model follows.
 * Written in second person, as the rules it serves require.
 */
export function sceneClause(expectation: SceneExpectation, section: string): string {
  if (expectation === 'third-person') {
    return 'SCENE, IN THIRD PERSON: The Divergence is written in third person, so PART 1\'s moment takes a third-person form here. Draw at least one concrete situation in which the two frames lead this person to act differently. Say what sets it off, using an aspect the plan lists as evidence. Say what they do under each frame\'s account. Say what that costs them afterwards. Build it only from the plan\'s facts.'
  }
  if (expectation === 'yes') {
    const trigger = section === 'sidereal' ? 'a drishti this placement receives' : 'an aspect'
    return `SCENE: this section's evidence names a trigger (${trigger}), so PART 1's recurring moment is required. Build its trigger from that evidence.`
  }
  if (section === 'synthesis') {
    // The Divergence is third person by its own instruction, so the no-scene
    // form keeps that register: "your reader" would contradict it.
    return 'SCENE: this section\'s evidence names no trigger, so a recurring moment would have to be invented, and PART 1 forbids that. Write no scene here. Name instead the arena each finding governs, the condition under which it is live in this person\'s life, and when it goes quiet. Tie each to an entry the plan lists. Keep the third person this section is written in.'
  }
  const missing = section === 'sidereal' ? 'no drishti reaches this placement' : 'no aspect reaches this placement'
  return `SCENE: this section's evidence names no trigger: ${missing}. A recurring moment would have to be invented, and PART 1 forbids that, so write no scene here. Name instead the arena this placement governs, the condition under which its pattern is live, and when it goes quiet. Tie each to a factor the context names. Your reader stays the grammatical subject.`
}
