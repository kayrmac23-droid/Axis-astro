# Handoff: voice drift and the Opus voice rewrite (17–18 Nov 2026)

## 0. Round 4 status (18 Nov 2026), read this first

- **Branch:** `ccr-1ceadba5-3tbyjg`, which contains this scratch branch plus round 4. Prompt version `v10.56-exp`. Still scratch, still not for merging.
- **Report:** `voice-arms/round4/ROUND4.md`. Kay's round-4 reading is not in git; it was sent to her directly.
- **What round 4 did:**
  - rewrote `SCENE_EXEMPLAR` (no staged "hours later", no invented specifics, contractions, grouped aspects);
  - added contractions and connected sentences to THE VOICE;
  - stopped the instructions and the context copy seeding phrases the model repeated (sextile "switches it on", "comes live", "distortion is mild", "unwalked", "evidence check");
  - Sidereal: one sub-header and the ORDER BY THE LIFE rule;
  - Divergence: life first, no degree recitals, no case-study voice, boundary note kept with nothing to narrate;
  - appended a tense reminder to every section instruction;
  - added `whether` to the scan's prediction introducers.
- **Decisions waiting on Kay:**
  1. Kay's Tropical Sun read her 0°17′ Leo Sun as "at the very threshold… newly lit". Should one FACT DISCIPLINE line be added against within-sign boundary readings? CLAUDE.md rule 9 currently forbids any boundary rule in the natal prompts.
  2. Contractions are at about 17 per 1,000 words. Keep them, or tone them down? They bring the habitual "you'll": 7 of 42 sections before the tense reminder, 1 of 7 re-runs after.
  3. Paragraphs now run 5–8 sentences. Bring back a soft cap?
- **Then:** if Kay is happy with her reading, the real PR to `main` (§5, step 3). 15 tests fail by design, listed in ROUND4.md.
- **Spend:** round 4 was $6.36, so $13.81 in total.


Scratch branch `ccr-060447b1-55wr0p`, draft PR #266 (**do not merge**). `main` is untouched at `f17bbb3`.

## 1. Where the voice drifted (measured)

Bisect on control-chicago-1987: Tropical Sun, Sidereal Sun and diverge, two samples each, with one fixed prior thread. Full report: `bisect-2026-11-17/REPORT.md`.

- **The drift is A→B, the model switch** (Sonnet 5 with thinking off → Opus 5.5 with adaptive thinking).
  - Mean sentence length 32.5 → 19.8 words; per-file ranges do not overlap.
  - Mean paragraph length 131 → 79 words.
  - Em dashes 4.5 → 0 per 1k words; "rather than" 4.1 → 0.2 per 1k.
- **Effort (B→C) and the v10.52/53 prompt and context edits (C→D) are noise.**
- The evaluator scores Opus +0.56 *higher*. That is the same bias it showed on the short-sentence prose Kay called clipped on 10 Nov. **Do not use the evaluator to judge voice.**
- **The diagnosis.** The prompts were tuned to force a resistant model (Sonnet). Opus follows them literally, so the scaffolding shows in the prose:
  - per-placement headings;
  - "say which account is under more pressure" turned into a scorecard;
  - "live / goes quiet" turned into headings;
  - compliance sentences;
  - jargon recited without explanation.
- DOCTRINE.md has no ratifying amendment for 72617b6 (effort low) or 988eab8 (context copy).

## 2. What Kay said

- The Opus readings are **"less alive"** and feel like **homework**.
- She **wants Opus, not Sonnet**.
- Her ranking: **Sonnet Tropical Sun liked best** (sample A s2). The Opus rewrite came next, **"without the weird headings"** (themed headings such as "When the ground shifts under you" are rejected).
- She **dislikes the staged "moment"**: a set-piece scene of trigger → action → "hours later".
- On her own chart with round 3: **"that's better"**. Not perfect yet.

## 3. Current experiment: v10.55-exp (commit f3c5d65 on the scratch branch)

Changes against main, all in `src/lib/prompts.ts` unless noted:

- **THE VOICE brief** in `SHARED_RULES`, stated positively:
  - a perceptive astrologer talking across a table;
  - chart facts given as the reasons;
  - Jyotish terms explained or left out.
- **Checklist in thinking.** Run the rules while thinking. Their vocabulary (trigger, aftermath, evidence, live, quiet, pressure, plan) stays out of the prose. No sentence exists to report that a rule was kept. Dasha periods are described in the present tense.
- **PART 1.** Situations are folded into the interpretation in a clause or a sentence or two, with no set-up line and varied shapes. The staged three-beat moment is removed. The future-tense examples are kept.
- **PART 4.** Removed: "choose sharp over lyrically evocative", the one-image cap, the 3–4 sentence paragraph cap, the VARY THE ANTITHESIS block, and the CADENCE ALLOWANCE clause (`renderSectionInstruction` no longer appends it).
- **PART 8.** Plain placement headings only; no descriptive titles. The Tropical Sun heading plan is restored.
- **Sun opener.** The first sentence is about the reader's life; the dignity is named later as the reason.
- **Divergence.**
  - Pressure is weighed in thinking and never stated as a verdict.
  - The boundary note is "for you to know".
  - The "gap" example is replaced.
- **Sidereal.**
  - The frame prompt turns evidence into life in the same voice.
  - `SIDEREAL_CLOSE` is plainer.
  - The Sun timing closer is in the present tense.
- **`scene-expectation.ts`.** Scene clauses rewritten: woven situations, "active / rests" in place of "live / quiet".
- **`interpretation-engine.ts`.** Neecha bhanga context line reworded; the model was repeating "sources weigh these differently".
- `READING_PROMPT_VERSION = 'v10.55-exp'`.
- **14 prompt tests fail by design.** Each one pins the removed wording. CI on #266 is red for that reason, and it was explained once on the PR.

## 4. Remaining problems (seen in round 3 and in Kay's own reading)

1. **Sidereal is still ordered by technique.** Headings like "Lordship and What It Carries", "Same-Sign Companions" and "Timing" come from "work house lordship for every planet".
2. **The Divergence still announces the boundary rule** ("…final degree of Pisces… though it is fully in the sign") and recites degrees at the start of each divergence.
3. **Invented specifics in woven examples** ("a new manager", "in a meeting"). This needs a guardrail.
4. **Small staged scenes survive** ("Someone in your group… Later you find…").
5. **A compliance line** ("This conflict does not resolve."), and the antithesis count is creeping back up.
6. **Long sections still march:** one heading per aspect, every aspect walked.
7. **One future-tense slip** in Kay's Sidereal Jupiter/Saturn ("You will notice…"). The scanner caught it.
8. **Sentences are still about 19 words.** That is Opus's rhythm; the prompt does not move it.

## 5. Next steps (agreed direction; each needs Kay's go-ahead)

1. **Round 4 on the scratch branch:**
   - restructure Sidereal around the reader's life, not the technique order;
   - drop the boundary instruction text entirely;
   - add "examples stay general enough to be true of this chart";
   - let aspects be grouped by theme, with fewer headings in the long Tropical sections;
   - tighten against compliance lines.
2. **Validate on two more eval charts** (for example control-mumbai-1972 and control-sao-paulo-2001), plus Kay's chart. She judges by reading. Use the free scans as an accuracy guardrail.
3. **Only then a real PR to main:**
   - update the pinned tests deliberately;
   - set a real `READING_PROMPT_VERSION`;
   - add a `docs/PIPELINE-HISTORY.md` entry;
   - update `.claude/skills/axis-output-quality` and `tropical-sidereal-framework` (CLAUDE.md rule 12).

## 6. How to run

- **Worktrees** (recreate if the container restarted): A `6ca324a`, B `c2e0fbf`, C `72617b6`, D `f17bbb3` under `/home/user/bisect/`. The fixed priors are `fixtures/rater-bench/*.md` copied to `<dir>/control-chicago-1987/`.
- **Generate one section against the fixed priors:**

  ```
  node scripts/eval-readings.mjs --charts=control-chicago-1987 --sections=tropical/sun --thread-from=<priors dir>
  ```

  Run one invocation per section, so the priors stay byte-identical.
- **API key:** `env -u ANTHROPIC_BASE_URL ANTHROPIC_API_KEY="$API_KEY"`. Kay approved using `API_KEY` for this.
- **Kay's chart:** a charts file with `{"id":"kay-epping-1999","birth":{"year":1999,"month":7,"day":23,"hour":23,"minute":45,"latitude":-37.65,"longitude":145.03,"tzName":"Australia/Melbourne"}}`, run with `AXIS_EVAL_CHARTS_FILE=<file>` and a full generate (21 sections, about $1.70).
- **Helpers on the scratch branch:**
  - `scripts/bisect-scan.*` — doctrine scan plus vocabulary counts, free;
  - `npm run rescore -- --bench=DIR` — evaluator only.

## 7. Spend so far: $7.45

| item | cost |
|---|---|
| Bisect generation | $2.957 |
| Bisect scoring | $0.749 |
| LEAN + rewrite arms | $1.363 |
| Round 3 | $0.680 |
| Kay's full reading | $1.697 |

## 8. Files

- `bisect-2026-11-17/REPORT.md` — the bisect report, blind read first.
- `bisect-2026-11-17/voice-arms/BLIND-READ.md` — HEAD, LEAN, rewrite and Sonnet, with the key.
- `bisect-2026-11-17/voice-arms/round3/ROUND3.md` — the round-3 outputs.
- Kay's own round-3 reading is **not in git**. It is in the session scratchpad only (`kay-reading-v10.55-exp.md`), which may be cleared.
