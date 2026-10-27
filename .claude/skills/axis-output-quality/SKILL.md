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

**Prose failure modes** (each makes prose perform depth instead of delivering it):
1. Cadence over content: the dash-and-aphorism paragraph ending, used more than once.
2. Repetition dressed as development.
3. Observer frame (above).
4. Pseudo-synthesis: flattening a tension the native has to navigate into "carries both simultaneously".

**Apply the rules silently.** The prose never announces its own compliance ("this is not a hidden virtue", "these are not mask and face"). It makes the plain claim instead.

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
10. Moon and Venus blurring. The Moon covers what the person needs in order to feel emotionally safe; Venus covers what they find worth giving and having. The two never share a concrete image (the noticed domestic detail, the remembered coffee order, the small thing quietly fixed).

## Synthesis Layer Rules (Tropical + Sidereal)

AXIS holds both systems simultaneously: two maps of one person drawn on different coordinates.
- **Tropical** reads the life as psychological architecture: how the person is built internally.
- **Sidereal**, read with Jyotish technique, reads the conditions the person lives inside: the circumstances the Lagna and its lord describe, the arenas the house lords tie together, the timing of the current dasha, and the orientations the nakshatras name.

The divergence is something the native **navigates**, not merely observes, and it does not close. Never resolve it. Three forms are banned:
- **Ranking.** One system is deeper, truer, more real, the essence or the mask, or lives "underneath" the other.
- **Stacking.** One frame is built "on top of" the other, is its core, base, engine or foundation, or is what the person "actually" wants. Neither came first.
- **Flattening.** "Carries both at once" or a blended midpoint.

Name what each system produces and hold the two side by side.

**Dual-system facts.** Sign, degree-within-sign, dignity, nakshatra, the chart ruler / Lagna lord and occasionally the house all change between systems. The sign ruler is never a separate point of disagreement: it changes only because the sign changed. Never import one system's chart ruler into the other, and never claim a placement is "the same in both" unless the data shows it.

## Kay's Chart (Reference for Calibration)

Born 23 July 1999, 11:45 PM AEST (UTC+10), Epping VIC, Australia. Positions below are as AXIS computes them: Whole Sign houses, Lahiri ayanamsa.

| | Tropical | Sidereal (Lahiri) |
|---|---|---|
| Sun | 0°17′ Leo, 5th house (within 3° of the boundary in this frame only) | 6°26′ Cancer, 5th house |
| Moon | 5°24′ Sagittarius, **9th house** | 11°34′ Scorpio, 9th house |
| Ascendant | 18°02′ Aries | 24°12′ Pisces |

The **Moon is in the 9th house, not the 8th**, in both frames. With an Aries Ascendant under Whole Sign houses, Sagittarius is the 9th house. The 8th-house placement in earlier versions of this skill came from a different house system, not from AXIS. Calibrate against what the product computes.

Use this chart as the test case when calibrating reading output. It is also the chart pinned by the regression suite (`src/lib/__tests__/reading-review-fixes.test.ts`).
