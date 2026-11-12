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

**Source of truth.** These rules summarise what the product actually ships: `SHARED_RULES`, `SHADOW_RULES` and the system prompts in `src/lib/prompts.ts`, measured offline by the quality gate in `src/lib/reading-quality-gate.ts` (`npm run eval -- --gate`, `npm run rescore`). The gate is not on the live path: production caches the first pass, vetoed only by the deterministic truncation and doctrine scans, so where this skill says the gate "enforces" a rule, read "scores it in an eval". If this skill and the repo disagree, **the repo wins** — read the current prompt text before changing or judging output, and update this skill to match. This skill lives in the repo at `.claude/skills/axis-output-quality/`: change it in the same PR as any prompt change it describes, so the two are reviewed together. (An earlier version of this skill drifted from the prompts and told readers to do things the product had deliberately banned.)

## Priority Order

`SHARED_RULES` opens with five things that decide whether a section is good, in order; where two rules appear to conflict, the lower number wins:
1. Every claim is anchored to a named chart factor.
2. Every pattern is shown in a concrete recurring moment, from inside the person's experience.
3. Nothing is made more palatable than it is.
4. No claim that would be true of almost any reader.
5. The section is this person's, continuous with what they have already read.

**The scene requirement comes first, where the evidence can carry it.** A section whose evidence names a TRIGGER — an aspect in the Tropical frame, a drishti received in the Sidereal — contains at least one recurring moment told from the inside: what sets it off, what the person does, what it leaves them holding once it is done (stated as the thing itself, never announced with a stock "afterwards you notice"). Where the evidence names no trigger (sign status, lordship and same-sign conjunction describe the arena, not a moment inside it), write no scene: name the arena, the condition under which the pattern is live, and when it goes quiet. The Divergence takes a third-person form of the moment, built from an aspect its plan lists. Which applies is computed per section (`scene-expectation.ts`) and stated to both the writer (SCENE) and the evaluator (`scene_expected`). Finish every thought: a sentence runs as long as its thought needs and is never clipped to save length (v10.48 removed v10.47's 18-word target after the first human reading found the prose clipped). The moment is how the claim is made, not an illustration added to it. Build it only from chart factors the context names; a fabricated duration, job, count or person is worse than an abstraction. Where the chart supports it, also name when the pattern goes quiet.

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
- Orb class sets the weight: a wide aspect is mentioned once, briefly, and never anchors a theme, a central tension or a close. The prose never says how much space an aspect is being given.
- An aspect is walked once, in the first section that owns it. A later planet section is told which of its aspects are ALREADY READ and states each in a sentence from its own side (v10.49).
- The nodes and the outer planets have no Western dignity and are never called peregrine.
- A placement within 3° of a sign boundary is a normal placement in its sign (DOCTRINE.md: SIGN-BOUNDARY CUSPS — DEREGISTERED). Do not name the neighbouring sign or read it into the placement. The only boundary point a reading may make is the cross-system one: a body near a boundary in one frame and away from one in the other, which belongs in The Divergence.

**When the birth time is unknown** (the context carries ⚠ BIRTH TIME UNKNOWN), houses, the Midheaven and dasha timing are unreliable in *every* section, not only the angles. Read the placement from sign, dignity, aspects and nakshatra, or mark a house reading as conditional in the sentence that makes it. Never build a scene or a close on a house, and never describe a house's arena without the number ("how they are known professionally" is a 10th-house claim). Say it once, then stop.

**Length follows the band.** Primary sections (Sun, Moon, Ascendant/Lagna) develop every subsection fully. Secondary sections (Mercury, Venus, Mars, Jupiter/Saturn, Rahu/Ketu, key aspects) run a short paragraph per evidence layer, three or four sentences (v10.49 raised every natal band 1.2×), and that is the correct shape, not a shortfall. When the chart offers more than the band carries, work the tightest aspect fully and name the rest in passing. Where depth and the band conflict, the band wins.

**Prose failure modes** (each makes prose perform depth instead of delivering it):
1. Cadence over content: the dash-and-aphorism paragraph ending, used more than once.
2. Repetition dressed as development.
3. Observer frame (above).
4. Pseudo-synthesis: flattening a tension the native has to navigate into "carries both simultaneously".

**The antithesis is limited by DENSITY, not by a total per section.** "X rather than Y", and its variants "not X but Y", "less X than Y" and a standalone "X, not Y", may appear **at most once in any one paragraph**, and across a section no more often than **once every two paragraphs**. Twice in a single paragraph is a fault; three times in one paragraph is a failure. Past the allowance, state what is and leave what it is not unsaid. The rule is stated to the model in that section's own instruction under **CADENCE ALLOWANCE** — never in `SHARED_RULES`, which is prompt-cached and must stay byte-identical across all ~21 sections; as of v10.45 the clause states no number, so it is byte-identical everywhere too. **Why density and not a count (v10.45):** v10.39 scaled a per-section cap to the word band (one use per ~450 words of target) and it did not hold — 10 of the 21 frozen bench sections breached it, 6 hard. Two things were wrong. The integer the formula produced was not a density: the allowance it bought ranged from 2.0 to 4.4 uses per 1000 words across the band table, so `tropical/moon` (4 uses in 1056 words) hard-failed while `synthesis/closing` (1 in 265) was clean at **the identical rate** — and the longest sections got the tightest rule. And the count was measuring the wrong thing: in a domain whose subject is contrast, most occurrences are ordinary English naming where a placement operates and where it does not ("public standing rides into House 6 on the back of emotional instinct rather than ambition"), while what a reader actually hears as a template is **adjacent** repetition — three in one paragraph, six in 441 words. `reading-rule-scan.ts` measures it (`antithesisVerdict`, reported as `antithesis-tic`) and **the gate enforces it on that same measurement**: a deduction clamps `voice_quality` to the individual pass bar (it drags the average and the critique names every instance), and three in one paragraph clamps below it, forcing a full-section repair. *(v10.34 clamped below the bar at one over a flat cap, which made a two-instance slip a hard failure in 39 of 63 sections — each taking a repair that, landing on two again, fails its re-score and caches provisionally for 24h, so the section regenerates daily for every reader. v10.39 graduated it; v10.45 fixed what is counted. Measured on frozen prose with the rater's pre-clamp scores held fixed, first-pass pass rate went 2 of 21 → 4 of 21.)* It was the most-cited fault on the 2026-11-03 eval run — 11 of 21 evaluator critiques, 15 scan findings — while the scan reported it `soft` and fed nothing. Varying the wording while keeping the contrastive shape does not satisfy the rule; it is the cadence half of PROSE FAILURE MODES #1. ⚠ The rule's own prose and the rendered clause are held to the limit they state — `reading-review-fixes.test.ts` fails the build if either uses the construction outside the forms it quotes, because this prompt has twice been taught the wrong thing by its own example.

**Apply the rules silently.** The reader has never heard of a plan, a context block or an allocation, and The Divergence refers to the reader as "they", never "he" or "she" (v10.49). The prose never announces its own compliance — no sentence whose only job is to say that a difficulty is not about to be redeemed, that the frames are not being ranked, or that an observation is structural. It makes the plain claim instead. Every rule is satisfied by the shape of the prose, never by a sentence describing the shape of the prose. ⚠ As of v10.40 the generation prompt no longer QUOTES the specimen phrasings for this (or for the rescue clause, resolution-by-hierarchy, Barnum, or the banned opener) — see *What v10.40 changed* below. The gate still holds every list, and `reading-rule-scan.ts` and `detectBannedPhrasings` still scan for them.

## Known Drift Patterns to Watch

1. Observer-frame language, especially when it flatters.
2. Behavioural claims stated without checking the rest of the chart.
3. Archetype-first interpretation.
4. One-sided praise, **and its overcorrection: manufactured or inflated shadow.**
5. Rescue moves: difficulty → gift, and reassurance clauses on strengths.
6. Ranking or stacking the two systems.
7. Meta-narration of the rules.
8. Refrains repeated across sections. A reading is one continuous document: each section builds on what the reader has already read rather than re-explaining it.
9. Sections converging on one shape. The Sun, Moon, Mercury, Venus and Mars sections each have their own opening and closing mode (`OPENER_MODES` / `CLOSER_MODES` in prompts.ts). ⚠ **v10.44: an opener mode names a chart quantity to LOOK UP, never a thing to invent.** Mercury selects a dignity, Venus the smallest-orb aspect, Mars a named placement — each varies with the chart because the instruction points at something the context states. `tropical:sun` used to say "a concrete behavioural moment", which names no chart quantity, so nothing in it differed chart to chart and the model filled the gap from `SCENE_EXEMPLAR`. Measured across five charts and five Sun signs: 5 of 5 opened on a second-person scene and 5 of 5 closed it on "you notice". The Sun now selects its dignity (else its sign ruler's state) and says "NOT a scene", as the Moon mode already did. **The section still needs a scene — it is no longer the cold open.** The opening slot is the worst place for one: the chart supplies placements, dignities and orbs, not "someone in the room raises a philosophical argument", so a scene there puts the most invented content first and the evidence after, in the position where a Barnum claim does most damage. No section opens on the existential frame ("There is a particular…", "There is a kind of…", "There is something…", "There are moments…"); that frame is legal mid-paragraph. No section closes on the struck aphoristic fragment by default.
10. The headed summary close. A section's closing paragraph carries **no heading**: it runs on from the last sub-section. Never head it "Putting It Together", "Synthesis", "In Summary", "The Core", "Bringing It Together" or any variant. Until v10.30 twelve of the seventeen natal sections were *required* to head their close "### Putting It Together" while the same prompt classified a Putting It Together that re-lists placements as a hard error — a heading that announces a summary gets a summary, and it also overrode the per-section closing modes in (9). The close still does synthesising work; it just does not advertise itself.

    ⚠ **v10.34 — the close is REQUIRED, not merely unheaded.** Removing the heading left PART 8 stating only the prohibition, and 4 of 21 sections on the 2026-11-03 eval run then ended on their last aspect sub-section with no close at all (`synthesis` 2.48, 11 of 21 below the pass bar). The heading had been load-bearing scaffolding. Every section now ends on a closing paragraph: a full paragraph naming ONE live tension the section's evidence established and what inhabiting it costs — the thing the person is most likely to misread about themselves. A section that stops on its last sub-section has not closed, and a one-line sign-off is not a closing paragraph. It still re-lists nothing.
11. Moon and Venus blurring. The Moon covers what the person needs in order to feel emotionally safe; Venus covers what they find worth giving and having. The two never share a concrete image (the noticed domestic detail, the remembered coffee order, the small thing quietly fixed).

## What v10.46 changed

A compression pass, and one new instrument. **The prompt surface came down 15% (127,348 → 108,811 chars, ≈ −4,750 tokens) with no rule deleted.** What came out was the prompt's own *rationale* — the sentences explaining to the model why a rule exists, which are addressed to engineers and spend attention at generation time — plus duplicated statements of one rule, plus the appendix's restatements of standard technique. Resolution-by-hierarchy, for instance, had been stated in PART 3, in the Sidereal frame prompt, in the Divergence frame prompt and in six section instructions; it is now stated once per frame. The Sidereal frame prompt absorbed the per-section boilerplate (open on the FRAME SHIFT line, read the Sidereal placement beside the Tropical one and never beneath it, close under no heading), so the seven Sidereal section instructions no longer repeat it.

**Two things got longer, deliberately.** The Divergence frame prompt now enumerates the three banned forms by name — RANKING, STACKING, FLATTENING — and adds an operational test on the finished sentence: *delete one frame's clause, and if what remains reads as the conclusion instead of half the account, you have ranked them.* The Sidereal frame prompt's coverage list ("spend the words on the shifted sign, the sign status, the lordships, the drishti…"), which this file records as the likely cause of the sidereal scene collapse, now says explicitly that the Jyotish evidence is the MATERIAL for the section's required moment and never a substitute for it: the sign status is the condition the pattern runs inside, the lordships are the arenas it surfaces in, the drishti is what triggers it, the dasha is when. A section that lists the evidence and draws no moment has failed PART 1 whatever it covered.

**The evaluator is now a judge and not a second interpreter.** Four of its nine criteria had been re-teaching the doctrine they score, with their own worked examples; the recurring failures are defined once in a PARADIGM FAULTS block and each criterion points at the one it owns. Every banned-phrase list still lives in the gate and still stays out of the generation prompt.

**And the compression found the thing worth knowing about this prompt: 21% is the ceiling on the shared rules without deleting a rule.** Every rule in that block is in the repo's record because something measurably broke without it. So compression is not the lever for the dilution hypothesis — `SHARED_RULES_LEAN` is. It is the shared rules with PARTs 5, 6 and 7 and the appendix sliced out (≈6,900 tokens, derived from the one source so nothing can drift), behind `AXIS_LEAN_RULES=true`, off by default. It exists to run the experiment this file has pointed at for four versions and never run: strip the rules and see whether `specificity` RISES. That is the measurement, not the ship.

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
- the antithesis kept inside the CADENCE ALLOWANCE (at most once in any paragraph, and no more than once per two paragraphs across the section), and a close naming best and worst conditions as two situations, under no heading.

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

## The scene requirement is per-frame (v10.42)

The 2026-11-07 gated eval split `specificity` by frame and found the scene requirement was never failing evenly:

| frame | at or above the bar | mean |
|---|---|---|
| tropical | **7 of 9** | 2.78 |
| sidereal | **1 of 8** | 2.12 |
| synthesis | **1 of 4** | 2.25 |

It is not length — `sidereal/jupiter_saturn` has a bigger band target than `tropical/mercury` and scores lower. It is not rater calibration — the critique is *"no concrete scene anywhere"*, absence rather than thinness. What distinguishes Tropical is that **it is the only frame that was shown an example**. v10.37 established that example is what moves this model and then applied that finding to one frame out of three; the other two were left with rule prose ~11,000 tokens upstream *and* a nearer, competing instruction in their own frame prompt — sidereal's *"spend the words on … the shifted sign, the Jyotish sign status, the house lordships, the drishti, the nakshatra, the Lagna lord, the dasha"* and synthesis's *"spend the words on the relationship between the frames"*. Neither mentioned a scene; both read as a coverage list.

⚠ **A worked example for each failing frame was tried (v10.42) and REVERTED — it did not work.** Both frames were given a worked example in their own frame prompt, beside the competing instruction, and re-measured on the same chart with the priors held byte-identical. Like-for-like on those 12 sections: `specificity` 2.17 → 2.33 (+0.17, noise on n=12), while `synthesis` 2.83 → 2.58, `psychological_depth` 3.00 → 2.75 and `voice_quality` 2.58 → 2.33 all moved DOWN by 0.25. Reading the output confirms the rater rather than contradicting it: The Divergence still closes on abstraction with no trigger, action or aftermath.

**What the attempt did establish**, and the reason it is recorded rather than deleted: the examples WERE read and imitated, just not on the dimension intended. Length discipline improved sharply on exactly the sections that got one — `sidereal/moon` 1.49 → 0.99 of band max, `sidereal/mars` 1.42 → 0.89, `sidereal/rahu_ketu` 1.37 → 0.83. So "the model ignored the example" is ruled out. **A worked example transmits FORM — length, heading shape, which evidence to name — and does not transmit the hardest thing in it.** Adding a third and fourth example is not the move.

**Do not retry this.** `specificity` has now survived four interventions unchanged: the v10.35 register fix, the v10.37 exemplar, the v10.40 fencing and the v10.42 frame exemplars (2.24 → 2.38 → 2.43 → 2.33). Two of those were "add an example", the repo's own best-evidenced lever. The remaining hypotheses are that ~13,500 tokens of rules compete and the scene loses (testable by going the other way — strip `SHARED_RULES` to the priorities, PART 1 and the section instruction, and see whether specificity goes UP), or that the rater is measuring something the prose cannot satisfy (free to test: score sections by hand and compare).
