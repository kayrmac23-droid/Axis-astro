# Rater bench — 21 real first-pass sections, with the scores they were given

A frozen corpus for testing **the evaluator**, not the prose.

## Why this exists

`eval-output/` is gitignored and cloud containers are ephemeral, so every
session that wanted to examine real output had to regenerate it. Worse, the
open question about this pipeline is not only "is the prose good" but "is the
rater measuring anything" — and that question is answerable **without
generating a single word**, by re-scoring prose that already exists.

These are the 21 first-pass natal sections of `control-chicago-1987` from the
2026-11-07 gated run under prompt `v10.40`, exactly as generated, paired in
`scores.json` with the scores `claude-sonnet-5-5` gave them.

## The finding that motivated pinning them

On this corpus the evaluator awarded **zero 5s across 189 prose scores**, and 34
fours. Section averages cluster between 2.80 and 3.40 against a
`MIN_PASS_AVERAGE` of 3.40 — mean **3.10** — so the first-pass pass rate is
**1 of 21**.

That rate is NOT produced by a weak criterion. Raising `specificity` by a whole
point on every section takes it from 1/21 to **2/21**; dropping
`MIN_INDIVIDUAL` from 3 to 2 also gives 2/21. The distribution simply sits
below the bar, flat. Four consecutive prompt interventions aimed at
`specificity` (v10.35, v10.37, v10.40, v10.42) moved it 2.24 → 2.33 and could
not have moved the pass rate regardless.

⚠ This is a REPEAT. `v10.31` rewrote every rubric anchor because the evaluator
"awarded zero 5s across 540 prose scores", and dropped `MIN_PASS_AVERAGE` from
3.75 to an **interim 3.40** with a note to restore it "once an eval run shows
the rater using 4 and 5". It still does not.

## How to use it

Re-score these files with a revised `EVAL_SYSTEM_PROMPT` and diff against
`scores.json`. The prose is identical by construction, so **any score movement
is the rater and nothing else** — the cleanest experiment available here, and
it costs evaluation calls only, no generation.

If a rubric revision makes the rater use 4 and 5 on prose it previously scored
3, the pass rate was substantially an instrument artefact. If the scores barely
move, the prose is genuinely mid and the work belongs in the prompt.

## Measured on it, 2026-11-07

`npm run rescore` is the harness. Every rubric below was run TWICE on the same
21 files, so the noise floor was known before any diff was read: per-criterion
mean within-section spread **0.00–0.19**, max 1. Anything above ~0.2 is signal.

| rubric | 4s / 378 | 5s / 378 | mean section avg |
|---|---|---|---|
| v10.40 as pinned | 57 | **0** | 3.074 |
| + scoring procedure + evidence field | 80 | **0** | 3.133 |
| + de-quantified 5 anchors | 106 | **0** | 3.219 |

The harness replicates `scores_v10_40` to within ±0.19 per criterion, which is
what validates the reconstruction of the chart context and the priors.

**The instrument was broken, structurally.** Six of the nine 5 anchors were
universally quantified over the whole section ("every substantive claim",
"every strength", "every subsection", "nothing performs depth"). One
counter-example anywhere in a 1000-word section falsifies that, so 5 was
unreachable by construction — and the 4 tier, which permitted exactly one
defect, nearly so. Both earlier attempts (v10.31's anchors, v10.40's "5 is
attainable" paragraph) left the quantifier alone. De-quantifying them nearly
doubled the 4s on prose that could not vary.

`falsifiability` was the clearest case: exactly 3 in 21 of 21, sd **0.00**. Its
4 tier allowed one universally-endorsable *secondary* claim in an 800-word
section, which no section of that length can satisfy — and the rater said so
itself in every entry ("the central claim inverts cleanly, but …"). It was
applying the anchor correctly.

**What is left is not a wording problem.** 5s stayed at exactly zero under all
three rubrics, and 43% of the 106 fours carry an `evidence` entry naming no
shortfall at all — several asserting the 5 condition outright ("nothing is
rescued", "no sign clichés"). The rater affirms the condition and withholds the
mark. Treat a fifth rubric rewrite as the weakest available move.

**What is genuinely the prose.** 36 of 42 scored sections are blocked by one
sub-3 criterion and 27 of those ONLY by `specificity` and/or `voice_quality`:

- `specificity` moved −0.02 across every revision. The rater names a concrete
  absence in all 21 sections and quotes the gestured-at phrase. No scene in 13
  of 21 — tropical 3–4, sidereal and synthesis uniformly 2.
- `voice_quality` is largely a deterministic clamp. `--audit` (no API) shows
  **10 of 21 sections over the scaled antithesis cap** on first pass, one at
  6/1, and 7 of the 9 twos are that clamp rather than a rater reading. Three
  sections also carry `prediction` hard rule breaches.

And `MIN_PASS_AVERAGE` is not the binding parameter: sweeping it 2.90 → 3.40
moves the pass rate 14% → 10%, while `MIN_INDIVIDUAL` decides everything.

## What it is not

Not a quality bar. These sections are not exemplary — they are a fixed sample,
useful because they are fixed. Do not mine them for prose to imitate, and do
not treat `scores_v10_40` as ground truth: it is the measurement under
examination.
