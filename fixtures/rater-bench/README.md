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

## What it is not

Not a quality bar. These sections are not exemplary — they are a fixed sample,
useful because they are fixed. Do not mine them for prose to imitate, and do
not treat `scores_v10_40` as ground truth: it is the measurement under
examination.
