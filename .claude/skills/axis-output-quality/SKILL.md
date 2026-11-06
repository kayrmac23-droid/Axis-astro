---
name: axis-output-quality
description: >
  Governs the quality rules for AXIS astrology reading output — Kay's dual-system astrology web app.
  Use this skill for ANY task involving AXIS: writing or reviewing AI-generated reading copy, crafting
  or refining section prompts, evaluating output from the Claude API, debugging language drift in readings,
  or discussing what an AXIS reading should say. Trigger on mentions of "AXIS," "reading copy," "Sun section,"
  "Moon section," "chart reading," "astrology prompt," or any request to write or review astrological interpretation
  text. These rules override Claude's default astrological voice. The shipped prompts in the AXIS repo
  (src/lib/prompts.ts) are the source of truth; this skill summarises them and defers to them.
---

# AXIS Output Quality Rules

Rules for the language and interpretive logic of AXIS reading output.

**Source of truth.** These rules summarise what the product actually ships: `SHARED_RULES`, `SHADOW_RULES` and the system prompts in `src/lib/prompts.ts`, enforced by the quality gate in `src/lib/reading-quality-gate.ts`. If this skill and the repo disagree, **the repo wins** — read the current prompt text before changing or judging output, and update this skill to match. This skill lives in the repo at `.claude/skills/axis-output-quality/`: change it in the same PR as any prompt change it describes, so the two are reviewed together. (An earlier version of this skill drifted from the prompts and told readers to do things the product had deliberately banned.)

## Priority Order

`SHARED_RULES` opens with five things that decide whether a section is good, in order; where two rules appear to conflict, the lower number wins:
1. Every claim is anchored to a named chart factor.
2. Every pattern is shown in a concrete recurring moment, from inside the person's experience.
3. Nothing is made more palatable than it is.
4. No claim that would be true of almost any reader.
5. The section is this person's, continuous with what they have already read.

**The scene requirement comes first.** Every section contains at least one recurring moment told from the inside: what sets it off, what the person does, what they register once it has passed. The moment is how the claim is made, not an illustration added to it. Build it only from chart factors the context names; a fabricated duration, job, count or person is worse than an abstraction. Where the chart supports it, also name when the pattern goes quiet.

## Core Interpretive Logic

**Read the placement through what modifies it before reaching for the archetype.**
House, dignity, aspects received and the condition of the sign's ruler all shape how a sign expresses. The same sign in different houses produces different expressions, so never lead with a sign archetype on its own.
- Leo in the 4th house: the drive is privatised into home and intimate relationships, not public stages.
- Sagittarius in the 12th house: expansiveness turned inward and out of sight, toward private meaning rather than outward exploration.

**Cross-reference every claim — strengths as much as difficulties.**
Before stating any placement as fact, check whether another major placement contradicts, qualifies or amplifies it. When one does, name both sides and describe what it is like to live with that contradiction. The cross-reference is more accurate than either side alone. This is a check for modifiers, not a requirement to find a confirming one: a claim the chart contradicts must be stated together with that contradiction, not dropped.

**Shadow coverage is not a quota.**
- Never present a quality as if it has no shadow. The rule bans one-sided praise; it does not require you to add darkness.
- A shadow is the *same* quality under stress or running unconsciously. Leo warmth hardening into needing to be central is coverage. "Leo warmth, but also secretly anxious" is manufacture: an unrelated flaw added to look balanced. **A manufactured shadow is worse than an absent one.**
- If the distortion is genuinely mild, say so briefly and do not inflate it.
- Write real shadow inline, as roughly one clause riding on the quality. Never collect it into a dark block, and vary how the clause is built so it doesn't become a repeated rhythm.

**Nothing may be made more palatable than it is.** Difficulty stays difficulty, ease stays ease, divergence stays divergent. Three moves are banned:
1. **Difficulty → gift.** Rescuing a hard placement into resilience, depth or a hidden gift in the same breath that named it. A difficulty can be stated as a cost and left standing. What follows it is consequence (what it costs, and when it shows up), not consolation. A real strength located elsewhere in the chart is portrait, not rescue.
2. **Ease → hidden strength.** A clause appended to a strength that adds reassurance but no astrological information. Test: if deleting the clause leaves the astrological claim intact, it was flattery.
3. **Divergence → hierarchy.** See the Synthesis section below.

**Whole person, anchored to situations.** Give strengths, warmth and talent the same weight and precision as shadow; struggle is one colour, not the whole picture. Anchor every pattern to the condition that activates it, so the reader knows *when* it shows up, not only where the difficulty lives.

## Language Rules

**Self-frame, not observer-frame.**
Write from inside the native looking out. Other people's perception may appear only routed back through the native's own experience: something they notice, brace for, manage or are surprised by. Banned:
- Opening on what other people notice first ("the first thing people register is…", "this reads as confident").
- Measuring the native against others ("more than most people", "where others would…").
- Praise in the audience's voice ("a quality other people experience as rare"). This is the hardest form to catch, because it flatters.

**Specificity over archetype.**
- Wrong: "As a Leo, you are naturally charismatic and creative."
- Right: "With the Sun in Leo in the 4th house, the drive to shine is real, but it runs through the closest relationships, not public performance."

**Falsifiable, not Barnum.** Every claim must be one whose negation would sound wrong for this chart. "You want to be understood" fails, because anyone would agree with it.

**Facts come only from the chart data.**
- No superlatives the data doesn't state.
- No house-distance arithmetic ("four houses away").
- Orb class sets the weight: a wide aspect gets a clause, never a theme.
- A placement within 3° of a sign boundary is a normal placement in its sign (DOCTRINE.md: SIGN-BOUNDARY CUSPS — DEREGISTERED). Do not name the neighbouring sign or read it into the placement. The only boundary point a reading may make is the cross-system one: a body near a boundary in one frame and away from one in the other, which belongs in The Divergence.

**When the birth time is unknown** (the context carries ⚠ BIRTH TIME UNKNOWN), houses, the Midheaven and dasha timing are unreliable in *every* section, not only the angles. Read the placement from sign, dignity, aspects and nakshatra, or mark a house reading as conditional in the sentence that makes it. Never build a scene or a close on a house, and never describe a house's arena without the number ("how they are known professionally" is a 10th-house claim). Say it once, then stop.

**Length follows the band.** Primary sections (Sun, Moon, Ascendant/Lagna) develop every subsection fully. Secondary sections (Mercury, Venus, Mars, Jupiter/Saturn, Rahu/Ketu, key aspects) run about two to three sentences per evidence layer, and that is the correct shape, not a shortfall. When the chart offers more than the band carries, work the tightest aspect fully and give the rest a clause each. Where depth and the band conflict, the band wins.

**Prose failure modes** (each makes prose perform depth instead of delivering it):
1. Cadence over content: the dash-and-aphorism paragraph ending, used more than once.
2. Repetition dressed as development.
3. Observer frame (above).
4. Pseudo-synthesis: flattening a tension the native has to navigate into "carries both simultaneously".

**The antithesis is capped per section, and the cap scales with the section’s length.** "X rather than Y", and its variants "not X but Y", "less X than Y" and a standalone "X, not Y", may appear at most ONCE in most sections — and at most TWICE in the three long ones (tropical Sun, tropical Moon, The Divergence). Past the allowance, state what is and leave what it is not unsaid. The number is **one use per ~450 words of the section’s word-band target** (`antithesisCapFor`, derived from `SECTION_WORD_BANDS`, so a band change moves the cap with it) and it is stated to the model in that section’s own instruction under **CADENCE ALLOWANCE** — never in `SHARED_RULES`, which is prompt-cached and must stay byte-identical across all ~21 sections. **Why it scales (v10.39):** the fault is density. A flat cap of one stopped being a density when v10.36 put a 3.4× spread across the bands (Sun/Moon 450→760, `key_aspects` still ~230), so a 780-word comparative section with two contrasts was failed as if it were a 230-word one with two. The rate is chosen so that under the *v10.30* bands every natal section yields exactly one — the cap that was actually ratified — so this is not a loosening: the cap simply was never rescaled when the bands were. Before v10.31 it averaged more than two per section; `reading-rule-scan.ts` counts it (`antithesis-tic`), and **as of v10.34 the gate enforces it**, on the same detector, against the same band-scaled cap: **one over** the allowance clamps `voice_quality` to the individual pass bar (a deduction — it drags the average and the critique names every instance), and **two or more over** clamps below it, which forces a full-section repair. *(v10.34 clamped below the bar at one over, which made a two-instance slip a hard failure in 39 of 63 sections — each taking a repair that, landing on two again, fails its re-score and caches provisionally for 24h, so the section regenerates daily for every reader. v10.39 graduated it and the rubric prose now agrees with the clamp.)* It was the most-cited fault on the 2026-11-03 eval run — 11 of 21 evaluator critiques, 15 scan findings — while the scan reported it `soft` and fed nothing. Varying the wording while keeping the contrastive shape does not satisfy the rule; it is the cadence half of PROSE FAILURE MODES #1. ⚠ The rule’s own prose and the rendered clause are held to the cap they state — `reading-review-fixes.test.ts` fails the build if either uses the construction outside the forms it quotes, because this prompt has twice been taught the wrong thing by its own example.

**Apply the rules silently.** The prose never announces its own compliance — no sentence whose only job is to say that a difficulty is not about to be redeemed, that the frames are not being ranked, or that an observation is structural. It makes the plain claim instead. Every rule is satisfied by the shape of the prose, never by a sentence describing the shape of the prose. ⚠ As of v10.40 the generation prompt no longer QUOTES the specimen phrasings for this (or for the rescue clause, resolution-by-hierarchy, Barnum, or the banned opener) — see *What v10.40 changed* below. The gate still holds every list, and `reading-rule-scan.ts` and `detectBannedPhrasings` still scan for them.

## Known Drift Patterns to Watch

1. Observer-frame language, especially when it flatters.
2. Behavioural claims stated without checking the rest of the chart.
3. Archetype-first interpretation.
4. One-sided praise, **and its overcorrection: manufactured or inflated shadow.**
5. Rescue moves: difficulty → gift, and reassurance clauses on strengths.
6. Ranking or stacking the two systems.
7. Meta-narration of the rules.
8. Refrains repeated across sections. A reading is one continuous document: each section builds on what the reader has already read rather than re-explaining it.
9. Sections converging on one shape. The Sun, Moon, Mercury, Venus and Mars sections each have their own opening and closing mode (`OPENER_MODES` / `CLOSER_MODES` in prompts.ts). No section opens on the existential frame ("There is a particular…", "There is a kind of…", "There is something…", "There are moments…"); that frame is legal mid-paragraph. No section closes on the struck aphoristic fragment by default.
10. The headed summary close. A section's closing paragraph carries **no heading**: it runs on from the last sub-section. Never head it "Putting It Together", "Synthesis", "In Summary", "The Core", "Bringing It Together" or any variant. Until v10.30 twelve of the seventeen natal sections were *required* to head their close "### Putting It Together" while the same prompt classified a Putting It Together that re-lists placements as a hard error — a heading that announces a summary gets a summary, and it also overrode the per-section closing modes in (9). The close still does synthesising work; it just does not advertise itself.

    ⚠ **v10.34 — the close is REQUIRED, not merely unheaded.** Removing the heading left PART 8 stating only the prohibition, and 4 of 21 sections on the 2026-11-03 eval run then ended on their last aspect sub-section with no close at all (`synthesis` 2.48, 11 of 21 below the pass bar). The heading had been load-bearing scaffolding. Every section now ends on a closing paragraph: a full paragraph naming ONE live tension the section's evidence established and what inhabiting it costs — the thing the person is most likely to misread about themselves. A section that stops on its last sub-section has not closed, and a one-line sign-off is not a closing paragraph. It still re-lists nothing.
11. Moon and Venus blurring. The Moon covers what the person needs in order to feel emotionally safe; Venus covers what they find worth giving and having. The two never share a concrete image (the noticed domestic detail, the remembered coffee order, the small thing quietly fixed).

## Synthesis Layer Rules (Tropical + Sidereal)

AXIS holds both systems simultaneously: two maps of one person drawn on different coordinates.
- **Tropical** reads the life as psychological architecture: how the person is built internally.
- **Sidereal**, read with Jyotish technique, reads the conditions the person lives inside: the circumstances the Lagna and its lord describe, the arenas the house lords tie together, the timing of the current dasha, and the orientations the nakshatras name.

The divergence is something the native **navigates**, not merely observes, and it does not close. Never resolve it. Three forms are banned:
- **Ranking.** One system is deeper, truer, more real, the essence or the mask, or lives "underneath" the other.
- **Stacking.** One frame is built "on top of" the other, is its core, base, engine or foundation, or is what the person "actually" wants. Neither came first.
- **Flattening.** "Carries both at once" or a blended midpoint.

Name what each system produces and hold the two side by side.

**Dual-system facts.** Sign, degree-within-sign, dignity, nakshatra, the chart ruler / Lagna lord and the house all change between systems — under Whole Sign the house renumbers whenever the Ascendant changes sign, which is most charts. The sign ruler is never a separate point of disagreement: it changes only because the sign changed. Never import one system's chart ruler into the other, and never claim a placement is "the same in both" unless the data shows it.

## Kay's Chart (Reference for Calibration)

Born 23 July 1999, 11:45 PM AEST (UTC+10), Epping VIC, Australia. Positions below are as AXIS computes them: Whole Sign houses, Lahiri ayanamsa.

| | Tropical | Sidereal (Lahiri) |
|---|---|---|
| Sun | 0°17′ Leo, 5th house (within 3° of the boundary in this frame only) | 6°26′ Cancer, 5th house |
| Moon | 5°24′ Sagittarius, **9th house** | 11°34′ Scorpio, 9th house |
| Ascendant | 18°02′ Aries | 24°12′ Pisces |

The **Moon is in the 9th house, not the 8th**, in both frames. With an Aries Ascendant under Whole Sign houses, Sagittarius is the 9th house. The 8th-house placement in earlier versions of this skill came from a different house system, not from AXIS. Calibrate against what the product computes.

Use this chart as the test case when calibrating reading output. It is also the chart pinned by the regression suite (`src/lib/__tests__/reading-review-fixes.test.ts`).

## Register — address the reader as "you" (v10.35)

A natal section addresses the reader directly, present tense: "you are", "you tend to", "you find". This is a hard constraint, and it was the single most breached rule in the pipeline: on the 2026-11-04 eval run **16 of 17 natal sections contained zero second-person address**.

The model's default — and the register of nearly every astrology text ever written — is the third person about a placement: "this Mercury", "this mind", "the native". A section drifts into it the moment the placement rather than the person becomes the subject of the sentence.

> Not "this mind does its real work alone, turning a disagreement over in solitude" — "you do your real work alone, turning the disagreement over long after the conversation has ended." Same claim, same evidence, same length; one is about an apparatus, one is about your reader.

**Why it matters beyond style.** The scene requirement (priority #2) asks for a recurring moment told *from the inside*. An apparatus cannot be recognised from the inside, so register drift takes the scene requirement down with it — which is why `specificity` never once scored above 3 across 21 sections. Placements explain; they do not act in a life.

Two registers are legitimate exceptions, both by their own instruction: **The Divergence** is third person, and **synastry** is second person plural.

`reading-rule-scan.ts` checks this as `register-drift` (`hard`), frame-aware so the two exceptions are exempt.

**The general lesson, which has now caused three separate failures:** the prompt must state its rules in the register and shape it requires, and must not quote the thing it bans at the model that is about to write. PART 1 described the scene in third person while PART 4 demanded second (v10.35); the antithesis rule used "rather than" while banning it (v10.34); and an audit for v10.40 found the construction five more times in `SHARED_RULES`' own descriptive voice, one of them inside PART 1's exemplar commentary — the most emphatic block in the prompt, telling the model what to imitate. In every case the model followed the example over the instruction. The guard is no longer scoped to the rule that states the cap: `reading-review-fixes.test.ts` now runs `detectAntithesisTic` over the whole cached block with quoted spans stripped.

## The worked section (v10.37)

`SCENE_EXEMPLAR` in `src/lib/prompts.ts` is one complete Mercury section carried inside PART 1. Anyone writing or reviewing AXIS copy should read it first: it is the standard, and it is more use than the rules that describe it.

**Why it exists.** Through v10.36 the prompt described the scene requirement in exhaustive detail and never showed one. The scene was **absent from 14 of 21 sections** on the 2026-11-05 eval run — after the register was fixed (16 of 17 sections had been in the wrong one; that dropped to 1) and after the secondary word budget was raised 1.69×. `specificity` still read 2.33 → 2.38. Rule prose has failed to produce a scene across three prompt versions, two registers and two budgets.

Example is what moves this model. We know because it moved it the wrong way twice: PART 1's own third-person phrasing beat PART 4's second-person rule in 16 of 17 sections, and the antithesis rule's own "rather than" beat its explicit cap.

**What the example demonstrates**, in order of what was failing:
- the reader as grammatical subject throughout, placements as evidence and never as the thing having the experience;
- a complete three-part moment, with the **aftermath in the same breath as the action** — the component that was being delivered zero times;
- dignity read through the dispositor where the placement is peregrine; close aspects worked to their own dynamics; wide aspects given one clause between them, anchoring nothing;
- shadow riding the quality rather than bolted on as a separate flaw;
- the antithesis kept inside the section’s CADENCE ALLOWANCE (once in most sections, twice in Sun/Moon/Divergence), and a close naming best and worst conditions as two situations, under no heading.

**Two things to know if you edit it.** It is held to the rules it teaches — zero findings from `scanSectionRules`, length score 5 — and the tests fail the build otherwise. And its chart is not any real chart in the repo, because a concrete example carries concrete placements and the failure mode is those placements turning up in readings of charts that do not have them.

**v10.40 gave that failure mode a fence and an instrument.** The exemplar is the only block in the prompt formatted exactly like the model's own output — it opens on a `## Planet` heading, which is what the section instructions ask for — so delimiting it with nothing but that heading left the boundary between quoted material and instruction resting on a prose warning. It is now fenced in `<worked_example>` tags, with the warning stated positively and *outside* the fence: your section's facts come from your chart context and nowhere else. And `checkExemplarBleed` in `reading-fact-check.ts` pins the example's placements (Mercury in Aries, Mars in Aquarius) as a compile-time constant and reports a **hard** finding when a section asserts one against a chart whose context does not carry it — headings included, since the sub-header the exemplar models is where a bled placement lands first. The eval harness reports it as `sections_with_exemplar_bleed`. "Whether the warning holds is an eval question" now has a number.

## Two things v10.38 added, both from one eval run

**Write the moment in the present tense.** A recurring moment is something that happens, not something that is going to happen: *"you match their certainty, and hours later you notice…"*, never *"you will feel the pull"*. The future tense turns the same observation into a prediction, which is banned outright — and it is the easiest rule to breach by accident, because the pull toward it comes from narrating a moment at all. It arrives exactly when the scene requirement is being obeyed: v10.37 produced three such breaches, all in sections that were finally attempting a scene.

**Figures are checked against the chart.** `reading-fact-check.ts` now compares every degree in the prose against the context the section was given. The case that prompted it:

> "Venus sits in Scorpio, in detriment, **half a degree from your Sun and Pluto**"

Venus was 18.7° from the Sun. The half-degree pair was Sun–Pluto. The model took a real fact and reassigned it, the prose criteria scored that section 3–4, and the reader got a confident, specific falsehood about their own chart. A figure the context does not state is either invented or miscopied, and a reader cannot tell those apart — so if a claim cannot be traced to a line in the context block, it does not go in the prose.

## What v10.40 changed

Four changes, all from one finding: **this prompt teaches by demonstration, and it had been demonstrating the wrong things.**

**1. The banned-phrase lists left the generation prompt.** `BANNED_RESCUE_PHRASINGS`, `BANNED_HIERARCHY_PHRASINGS`, `BANNED_BARNUM_PHRASINGS`, `BANNED_META_PHRASINGS` and `BANNED_OPENER_PATTERNS` were each rendered into `SHARED_RULES` as "Banned as written: …". Quoting a phrase into the prompt puts that phrase in the writing model's context, in the register it is about to write in — the v10.34 and v10.35 mechanism exactly. The lists exist so the **gate** can scan deterministically, and the gate does not need the writer to have read them. Each ban now states the general form plus a demonstrated positive:

- resolution-by-hierarchy gains the move it never had — two accounts in the same tense, each with its own evidence and consequence ("the Tropical Venus in the 7th makes the imbalance intolerable in the moment; the Sidereal Venus in the 6th makes it something you absorb as work" states both and ranks neither);
- Barnum describes the failing claim *class* (a claim about a universal human want) and what fixes it (which form of it this person cannot tolerate the absence of, and under what conditions);
- the opener rule says what a first sentence DOES instead of quoting the openers to avoid.

⚠ **This is a hypothesis with a measurement attached, not a settled improvement.** It is falsifiable with the existing harness: run `npm run eval -- --gate` and compare the `detectBannedPhrasings` hit rate against the v10.39 run. If hits fall, the lists were teaching the phrasings. If they rise, put the lists back.

**2. The rules stopped modelling the antithesis.** Five own-voice uses rewritten; the test widened from PART 4 to the whole cached block.

**3. The two deterministic instruments now enforce.** `reading-fact-check.ts` and `reading-rule-scan.ts` were both explicitly "a measuring instrument, not a gate", on the reasoning that a false positive makes a section permanently uncacheable — a model call on every page load, forever. That weighed only two options: veto the cache, or do nothing. There is a third, and the opener and antithesis backstops already use it: **clamp the criterion and name the fault in the critique**, so a false positive costs one repair pass. So:

- a `hard` numeric fact finding clamps `chart_evidence` **below** the pass bar, forcing a repair. A confident, specific, false claim about someone's own chart is the worst output this product can produce, and `checkNumericFacts` scored 0 false positives across 84 real sections — better calibrated than the evaluator's own `chart_evidence`, which scored the Venus fabrication 3–4;
- a `hard` stated-rule finding clamps `voice_quality` **to** the bar — a real deduction that drags the average and earns a critique, without making one slip an automatic repair. The more conservative of the two clamps, because the scan carries more rules and its production false-positive rate is unmeasured;
- both run inside `evaluateSection`, so the **repair's re-score** gets them too. A repair that introduced a fabricated degree was previously cacheable for the full 30-day TTL.

`doctrine` and `soft` findings still feed nothing: DOCTRINE.md is explicit that the grep finds candidates and THE LAW decides, and a soft finding is a breach only in aggregate.

**4. The repair prompt stopped putting the failed draft last.** It had ended with ~800 words of the prose the rewrite must discard, in the strongest recency position, with the critique above it — and "rewrite from scratch" contradicting "for reference only". The draft now sits above the instruction inside `<failed_draft>`, the critique inside `<critique>`, and the task is stated last. Watch `repair-failed-recheck` in `summary.json`.

Also in v10.40, for the same reasons: the persona moved into the head of the cached block (it had been duplicated across the three frame prompts and arriving at context position ~13,900, with the thinnest definition on the frame covering 9 of 21 sections); the status flattery went; the five priorities are labelled PRIORITY 1–5, so "the lower number wins" has one referent and cannot be read as PART order; the eval call fences its three text bodies in `<section_meta>` / `<chart_context>` / `<section_under_review>`; and the knowledge base was compressed to the places where AXIS reads a sign, house or aspect **differently** from the textbook — the generic entries were tokens spent telling the model what it already knows, and the Leo line's distinctive phrasing is documented in the repo as having been lifted into live readings.
