# CLAUDE.md

> **Canonical for:** commands, architecture, API routes, core libs, the reading pipeline (models, gate, cost), tests, deployment — **as they are now**. **Lives elsewhere:** product law → `DOCTRINE.md` (binding; it wins on what the product may say or do); human-facing overview, methodology and accuracy → `README.md`; why each rule exists and what was measured when it landed → `docs/PIPELINE-HISTORY.md`; `AGENTS.md` is only a pointer to this file — edit here, never there. See *Docs map*.

**Keep this file to current state.** It is loaded into every agent session, so every paragraph here is paid for on every task. State what the code does and the constraint an editor must not break, in a sentence or two. The story of how a rule was arrived at, eval numbers and version-by-version narrative go in `docs/PIPELINE-HISTORY.md` (append a dated entry there), or in a comment beside the code. Do not restate the prompt version here: it is `READING_PROMPT_VERSION` in `lib/reading-cache.ts`.

## Commands

```bash
npm run dev          # Dev server at http://localhost:5000
npm run build        # Production build
npm start            # Production server on port 5000
npm run lint         # ESLint (eslint.config.mjs)
npm run test         # Vitest unit tests (src/lib/__tests__/) — no API calls
npm run test:smoke   # ONE real, billable generation call (needs AXIS_LIVE_SMOKE=1 + a real key)
npm run eval         # Batch eval harness over scripts/eval-charts.json — real spend
npm run openers      # Cross-chart opener diversity for one section — real spend
npm run rescore      # Re-score the 21 frozen sections in fixtures/rater-bench/ (evaluator calls only)
npm run rescore -- --audit   # Same bench, deterministic checks only, NO API
```

Requires `.env.local`: `ANTHROPIC_API_KEY=your_key_here`

### Environment

Read in code; grep `process.env` to confirm. Integer vars go through `intEnv` (`lib/env.ts`), which falls back to the default on a non-integer.

| Variable | Effect |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Placeholder values from the docs are rejected as missing. |
| `UPSTASH_REDIS_REST_URL`/`_TOKEN` or `KV_REST_API_URL`/`_TOKEN` | Cache, rate limits, reading thread. In-memory / no-op fallback when absent. |
| `AXIS_READINGS_ENABLED=false` | Kill switch for all AI reading generation. |
| `AXIS_GATE_ENABLED=false` | Disables the quality gate; a clean, non-truncated first pass is cached as-is. |
| `AXIS_PREFLIGHT_ENABLED=true` | Hot-path deterministic pre-flight. Off by default (it forces buffering). |
| `AXIS_INLINE_GATE=true` | Gates non-opening sections before serving. Off by default; see *Delivery*. |
| `AXIS_LEAN_RULES=true` | Swaps in `SHARED_RULES_LEAN`. **Experiment only**; never in production without a measurement and a version bump. |
| `AXIS_DAILY_READING_CALL_CAP` | Global daily model-call cap, default 2000, per Australia/Melbourne day, keyed by `VERCEL_ENV`. |
| `AXIS_READING_RATE_LIMIT_MAX` | Per-IP `/api/reading` limit per 60s, default 20. |
| `AXIS_READING_DAILY_PER_IP` / `_PER_CHART` | Uncached requests per day, defaults 120 / 40. |
| `NEXT_PUBLIC_POSTHOG_KEY`/`_HOST` | Analytics; no-op when absent. |

## Architecture

Next.js 16 App Router, TypeScript. Vercel, auto-deploys from `main`.

**Data flow:** `BirthForm` → `/api/geocode` + `/api/timezone` → `/api/calculate` → `DualChartData` → the dossier (`DossierHeader` + `FrameControl` + `FrameShiftWheel` + `ReadoutRail` + `ReadingPanel`) → `/api/reading`, one request per section, sequential. Synastry: two births → `/api/synastry` → `SynastryAspectsPanel` + `SynastryReadingPanel`.

Page routes: `/` (main app), `/method`, `/guides`, `/sample`, `/synastry`, `/privacy`.

**Sections.** Tropical: sun, moon, ascendant, mercury, venus, mars, jupiter_saturn, key_aspects, rahu_ketu · Sidereal: lagna, sun, moon, mercury, venus, mars, jupiter_saturn, rahu_ketu · Synthesis (The Divergence): agree, diverge, tension, closing · Synastry: luminaries, venus_mars, outer_planets, composite_chart, central_dynamic, navigation. A natal reading is 21 sections, read in that order (`NATAL_SECTION_ORDER`).

### API routes

- **`/api/calculate`** (`maxDuration=30`): validates birth data, rate-limited 30/60s, DST-accurate offset via `Intl.DateTimeFormat`. Pluto comes from JPL Horizons only for births outside 1885–2099 (`plutoNeedsJpl`; inside that span local Meeus agrees with DE440 to ~2″), 5s timeout, Meeus fallback. Returns `DualChartData` with `plutoSource`.
- **`/api/synastry`** (`maxDuration=30`): 20/60s. Two natal charts, inter-aspects, midpoint composite.
- **`/api/geocode`**: Nominatim proxy. 30/60s per IP plus one app-wide 1 req/s gate; results cached 30 days. Nominatim forbids autocomplete, so `BirthForm` searches only on Enter or the SEARCH button.
- **`/api/timezone`**: `tz-lookup`, offline. 60/60s.
- **`/api/reading`** (`maxDuration=120`): see *The reading pipeline*.

All routes parse bodies through `lib/request-security.ts` (16 KB cap, content-type check) and birth data through `lib/birth-data-validation.ts`.

## The reading pipeline

### Request order in `/api/reading`

1. Validate section/planetSection against allow-lists; parse birth data; **recompute the chart server-side**. The only client-supplied position is the Pluto hint (longitude + source), range- and enum-checked, and folded into the cache key so a bad hint can only poison its own row.
2. Load the reading thread (earlier sections) — it is part of the cache key.
3. Unknown birth time + `ascendant`/`lagna` → return the deterministic notice (`lib/unknown-time-notice.ts`). No model call.
4. Cache check. A hit is free and bypasses every limit.
5. Per-minute IP limit → per-chart daily quota → per-IP daily quota → global daily budget, **in that order** (a source over its own allowance must be stopped before it can count against the shared cap). Refusals carry `X-Axis-Quota: chart|ip|global`; the panels treat that as fatal for the run (`quotaFailure`). All fail open without Redis.
6. Build the request with `buildSectionRequest` (`lib/reading-request.ts`) — the same builder the eval harness uses. Synastry is assembled inline in the route.
7. Generate, deliver, store in the thread, close the stream, then gate under `after()`.

### Models and request shape

- Generation, repair, doctrine-repair: `claude-sonnet-5` (`MODEL`, `lib/reading-model-config.ts`), `thinking: { type: 'disabled' }`, per-section `max_tokens` from `MAX_TOKENS_PER_SECTION`.
- Evaluation: `claude-sonnet-5-5` (`EVAL_MODEL`), `thinking: { type: 'adaptive' }`, `output_config: { effort: 'medium' }`, `EVAL_MAX_TOKENS` 4000.
- **Never send `temperature`, `top_p` or `top_k`** — these models return a 400. `thinking: disabled` is likewise a 400 on the eval model. `npm run test:smoke` exists because a mocked SDK cannot catch a rejected request shape.
- Prompt caching: system = `[SHARED_RULES, frame prompt]`, both cached; user = one block per earlier section (cache breakpoint on the last) + an uncached tail of chart context, phrases-already-used, section instruction and scene clause. **Only the tail is paid at full price**, so a character cut from a section instruction is worth about ten in `SHARED_RULES`. The real cost term is the reading so far, resent on every later section — i.e. output length.

### Delivery

A section **streams** token by token unless something will inspect it before the reader sees it; then it is **buffered**. Buffer ⇔ a check runs — keep the two coupled. The route sends `X-Axis-Delivery: stream|buffered` and `ReadingPanel` shows its "checked before you see it" note only on `buffered`.

- **Pre-flight** (`lib/reading-preflight.ts`, off by default): runs every deterministic check on the buffered section and regenerates once on a hard finding, serving whichever attempt has fewer findings (`pickBetter`; ties keep the first). The rewrite turn names the faults and does not include the failed draft.
- **Inline gate** (off by default): runs `gateForCache` before serving a non-opening section and serves what it caches. Worst case is ~135s against the 120s ceiling, so it degrades to the first pass after `INLINE_GATE_DEADLINE_MS`. Do not enable without raising `maxDuration` and re-deriving the gate deadlines.
- A mid-stream failure cannot be a status code, so the route writes a sentinel (`lib/reading-stream.ts`): `[AXIS_STREAM_ERROR: generation failed]` is retryable, `[AXIS_STREAM_ERROR: unavailable:<code>]` is fatal (billing/auth — an exhausted balance arrives as a **400**, so the message is read, not just the status) and unwinds the whole run.

### The quality gate (`lib/reading-quality-gate.ts`)

Runs under `after()` once the stream has closed, so it adds no latency and decides only what lands in the cache. **The first reader of an uncached section sees ungated first-pass prose.**

`gateForCache` flow: skip truncated/empty → evaluate → if it passes and the doctrine scan is clean, cache → if only the doctrine scan objects, a 500-token surgical sentence edit, spliced byte-for-byte → otherwise one full repair → deterministic checks on the repair → re-score → cache only if the re-score passes.

- **Pass rule** (`computePassFromScores`): ten criteria, average ≥ `MIN_PASS_AVERAGE` (3.40) and every criterion ≥ `MIN_INDIVIDUAL` (3). Nine are scored by the evaluator; `length` is computed (`scoreLength` against the chart-scaled band). The evaluator is not told the bar and is not asked for a verdict.
- **Deterministic clamps, applied before the pass rule** (so the surgical route cannot cache around them): banned opener → `specificity` below the bar; antithesis density (`antithesisVerdict`) → `voice_quality` to the bar, or below it when severe; `hard` fact finding (`checkNumericFacts`) → `chart_evidence` below the bar; `hard` rule-scan finding → `voice_quality` to the bar; rescue phrasing → `contradiction_handling` below the bar. The same clamps run on the repair's re-score.
- **What gets cached:** a confirmed pass or confirmed repair for 30 days. When the gate cannot confirm (repair failed its re-score, evaluator errored, out of budget) it returns `provisionalText` and the route caches that for `PROVISIONAL_TTL_SECONDS` (24h). Truncated or doctrine-breaching text is never cached.
- **Deadlines**, measured from the top of the handler: no eval starts after 95s, no repair after 70s, every gate call times out at 112s with SDK retries off.
- **Cost per uncached section:** 1 call (generate) + 1 (evaluate), + 1 for a surgical edit, or + 2 for a full repair and its re-score. A natal reading is 42–84 calls. Each call is reserved against the daily cap as it is made and never refunded.
- **Doctrine scan** (`detectBannedPhrasings`): literal lists (`BANNED_HIERARCHY_PHRASINGS`, `BANNED_RESCUE_PHRASINGS`, `BANNED_META_PHRASINGS`) plus a contextual pass (`detectContextualHierarchy`: ordinary words such as "underneath" only within `HIERARCHY_PROXIMITY_CHARS` of identity/system language). Keep bare ordinary words out of the literal lists. `doctrineRepairTargets` must measure that window exactly as the scan does.

**Known state, measured — read before tuning the gate:**

- On the frozen rater bench the evaluator awarded no 5s under three rubrics; treat it as a 2–4 scale. First passes are mostly blocked by one sub-3 criterion (`specificity`, then `voice_quality`).
- In production on 2026-11-07 (29 gated sections): 1 passed, 9 repaired, 19 failed the repair's re-score — and 7 of those 19 had every criterion ≥ 3 and failed on the average alone. So both thresholds bind, at different stages.
- A section that fails its re-score is cached for 24h and then regenerated with new wording, so a returning reader's text changes. A natal chart is almost always re-read by the person it belongs to.
- The stated length targets run about 24% below what is written (2026-11-07, one chart). Not yet corrected.
- The evaluator has not been validated against a human rating. The one human reading on record (2026-11-10) contradicted it on sentence length, which is why PART 4 now says FINISH EVERY THOUGHT. **Do not re-add a sentence-length target without a human reading.**

### Logs

One greppable line each: `[AXIS_USAGE]` (every model call: tokens, cache read/write, stop reason), `[AXIS_GATE]` (outcome + scores; on a failed repair these are the re-score's), `[AXIS_LEN]` (generated words vs band), `[AXIS_RULES]`, `[AXIS_FACTS]`, `[AXIS_PREFLIGHT]`, `[AXIS_INLINE_GATE]`, `[AXIS_QUOTA]`, `[AXIS_GEN_FAIL]`, `[AXIS_DOCTRINE_UNCACHED]`.

## Prompts (`lib/prompts.ts`)

`SHARED_RULES` (cached) is a persona, five numbered PRIORITIES, then eight PARTs: 1 THE SCENE REQUIREMENT (with `SCENE_EXEMPLAR` inside `<worked_example>`), 2 EVIDENCE, 3 HONESTY, 4 VOICE, 5 PROSE FAILURE MODES, 6 ONE CONTINUOUS READING, 7 DEPTH AND LENGTH, 8 FORMATTING, then the AXIS INTERPRETIVE STANCES appendix. Precedence follows the PRIORITY numbers, not the PART numbers. Frame prompts (`TROPICAL_`/`SIDEREAL_`/`SYNTHESIS_`/`SYNASTRY_SYSTEM_PROMPT`) carry only what is specific to the frame.

**Rules for editing prompts.** Each was learned by breaking it; the record is in `docs/PIPELINE-HISTORY.md`.

1. **Bump `READING_PROMPT_VERSION`** after any change to prompt text or context format. `SYNASTRY_PROMPT_REVISION` invalidates synastry rows only.
2. **The prompt must not demonstrate what it bans.** Example outranks rule on this model. Rule prose is written in the register it requires (second person, present tense) and does not use the capped antithesis construction. Tests enforce both.
3. **Banned-phrase lists stay out of the generation prompt.** They are exported for the gate and the scans only; the prompt states the general form and a positive example.
4. **`SCENE_EXEMPLAR` obeys every rule it teaches** (zero rule-scan findings, in band) and its chart is not an eval chart. `EXEMPLAR_PLACEMENTS` in `reading-fact-check.ts` pins its placements for the bleed check — update both together.
5. **Never read `SECTION_INSTRUCTIONS` directly.** Use `renderSectionInstruction`, which substitutes the length clause for the band this chart is scored against and appends the cadence clause.
6. **Nothing per-section goes in `SHARED_RULES`** — it must be byte-identical across a reading or the cache is lost.
7. **Section instructions cite PARTs by name.** Rename a PART and you must rename the citations; `SHARED_RULES_LEAN` is sliced on the same headings.
8. **An opener mode names a chart quantity to look up, never a thing to invent.** `OPENER_MODES`/`CLOSER_MODES` are keyed by frame and planet.
9. **No sign-boundary rule.** `DOCTRINE.md` deregistered cusps; a test and `scripts/verify-state.sh` fail if one returns.
10. **The Divergence is third person and synastry is second person plural**; every other section addresses the reader as "you".
11. **A worked example transmits form, not the hardest thing in it.** Adding an example to fix `specificity` has been tried twice and failed twice.
12. When a prompt rule changes, update the matching skill in `.claude/skills/` in the same PR.

**Scene expectation** (`lib/scene-expectation.ts`): PART 1's moment is required only where the evidence names a trigger. `sceneExpectation` returns `yes` (Tropical with an aspect; Sidereal with a drishti received; synastry), `no` (nothing to build one from; `agree` always), or `third-person` (the other Divergence sections). The generator gets it as `sceneClause` in the uncached tail and the evaluator as `scene_expected`, from the same context.

**Length bands (v10.49, natal bands ×1.2).** `SECTION_WORD_BANDS` is the one table; the prompt's length clause and the gate's `length` score both read it. Edit the table, not the prompt.

| Class | Target | Full-marks band | Hard cap |
|---|---|---|---|
| Sun / Moon | 910 | 770–1055 | 1175 |
| Ascendant | 590 | 485–690 | 780 |
| Sidereal Lagna / Sun / Moon | 480 | 395–560 | 640 |
| Tropical Mercury / Venus / Mars | 505 | 425–590 | 730 |
| Jupiter/Saturn, both frames | 530 | 445–620 | 770 |
| Sidereal Mercury / Venus / Mars / Rahu-Ketu | 370 | 325–430 | 540 |
| Key aspects | 275 | 230–335 | 420 |
| Tropical Rahu/Ketu | 280 | 235–330 | 410 |
| Concordance (`agree`) | 480 | 380–625 | 725 |
| The Divergence (`diverge`) | 935 | 780–1100 | 1210 |
| Central tension | 330 | 265–420 | 510 |
| Closing | 275 | 210–390 | 470 |

Aspect-driven bands scale with the chart's aspect count (`scaleBand`; target, floor and ceiling all move). `agree` and `diverge` scale on plan evidence instead (`scaleBandByEvidence`), in both directions, capped upward; an empty allocation uses `EMPTY_PLAN_BAND`. Synastry bands never scale. Under the floor is a hard fail; over the ceiling costs marks and hard-fails only on runaway length. `countAspectsInContext` parses the `ASPECTS (tightest first):` format — reword it and every scaled band silently zeroes (`aspect-count-coupling.test.ts`).

## Core libs

- **`astro-calc.ts`**: VSOP87B planets, ELP2000 Moon, Meeus Ch.37 Pluto, true node, Lahiri ayanamsa (`lib/ayanamsa.ts`, client-safe), Whole Sign houses. **Planets are evaluated in TT (ΔT added), angles in UT.** Pluto's heliocentric position is J2000-frame: subtract Earth's `position2000()` and precess only the result. Exports `calculateDualChart(BirthData, overrides?)`.
- **`interpretation-engine.ts`**: derives the facts and formats the context block every section is written from.
  - Tropical blocks carry Western aspects with orb classes (tight ≤2°, close ≤4°, moderate ≤6°, wide >6°), `NEAR STATION` flags, and Ascendant aspects at a 5° orb.
  - Sidereal blocks carry Jyotish evidence instead: sign status, house lordships, graha drishti and same-sign conjunction, neecha bhanga conditions, yogas, nakshatra, a `FRAME SHIFT` line. **Western aspects are not sent to the Sidereal frame.**
  - `buildDivergencePlan` is the *only* evidence The Divergence receives. Concordance has two grades (full, and same-sign with the house moved — needed because Whole Sign houses renumber whenever the Ascendant changes sign). Divergences are ranked in code, max 4 worked in depth, the rest named in one clause. `SIGN_RULERS_VEDIC` equals the traditional rulers, so a changed ruler is never independent evidence.
  - **Unknown birth time:** no dasha, no Lagna-derived yogas, no house lordships; cross-chart notes compare signs only.
  - The dasha block marks a `⚠ TRANSITION` within 60 days of a boundary.
- **`synastry-calc.ts`**: inter-aspects and composite. With either birth time unknown it withholds that person's angles and houses and the composite's.
- **`reading-request.ts`**: `buildSectionRequest`, the single assembly of a natal request.
- **`reading-thread.ts`** + **`reading-order.ts`**: the server holds the text of every section the reader has read (Redis, 24h, bound to the chart) and sends it ahead of each later section. Stored **before** the stream closes, because the client requests the next section immediately. Stores what the reader saw, never the gate's later repair. `priorDigest` — in the cache key — digests **which** sections preceded this one, not their text. `phrasesAlreadyUsed`/`overusedTics` name the refrains the next section must not reuse. Synastry is not threaded.
- **`reading-cache.ts`**: Upstash, 30-day TTL. The key carries birth data, section, prompt version, prior digest, `plutoSource` and Pluto longitude (0.01°), and for Sidereal/Divergence the current dasha period.
- **`reading-rule-scan.ts`**: deterministic scan for stated rules that are string facts (prescription, prediction, British spelling, bullets, paragraph length, greetings, summary headings, register drift, antithesis density, smoke-detector terms). Severities `hard` / `doctrine` (candidates only — THE LAW decides) / `soft`. `register-drift` needs `{ frame }` and fails closed. **False positives are the design constraint**: matches are scoped to second-person constructions and exclude relative and subordinate clauses.
- **`reading-fact-check.ts`**: `unstated-degree` (hard), `unsupported-closeness` (soft), `exemplar-bleed` (hard). Checks figures against the context the model was given; it cannot judge interpretation.
- **`route-rate-limiter.ts`**: Redis fixed-window limiter (atomic Lua), daily quotas, the global budget. IPv6 is bucketed by /64.
- **`readout.ts`**: the single source of per-body positions for the wheel, the rail and the placement cards. Omits angles and houses when the birth time is unknown.
- Small modules: `jpl-horizons.ts`, `tz.ts` (DST-aware offsets; years 1–99 handled), `saved-chart.ts` (last chart in `localStorage`, 30 days), `usage-log.ts`, `analytics.ts`, `planet-descriptors.ts`, `zodiac-constants.ts`.

## React components

- **`BirthForm.tsx`**: geocode search, `birthTimeUnknown` toggle, AM/PM → 24h.
- **The dossier** (`app/page.tsx`): `DossierHeader` → `FrameControl` → `FrameShiftWheel` + `ReadoutRail` → `ReadingPanel` → actions row. Frame and selection are page state.
- **`ReadingPanel.tsx`**: sequential fetch per section with one retry; `SECTION_TIMEOUT_MS` must stay above the route's `maxDuration`. The prose is **stacked in reading order** — PART 1 Tropical, PART 2 Sidereal (collapsed by default), PART 3 The Divergence — because each part is written assuming the reader has read the ones before it. **PART 2 is always in the DOM and collapsed with CSS**, never `hidden` or a conditional render: SAVE DOSSIER · PDF is `window.print()`, and anything absent from the DOM is absent from the saved dossier.
- **`FrameShiftWheel.tsx`**, **`ReadoutRail.tsx`**: the instrument and the both-frames readout. No angles or houses with an unknown birth time.
- **`SynastryReadingPanel.tsx`**, **`SynastryAspectsPanel.tsx`**, chrome (`SiteHeader`, `SiteFooter`, `Starfield`, `ComputationInterstitial`), landing (`HeroWheel`, `landing/PreviewLanding`).

## Tests

`npm test` runs everything in `src/lib/__tests__/` with the SDK mocked. Files worth knowing before you edit:

| Editing | Run / read |
|---|---|
| Prompts | `reading-review-fixes`, `prompts-length-wiring`, `divergence-prompts`, `scene-expectation` |
| The gate | `reading-quality-gate` (incl. *scale reachability*), `gate-for-cache` (its own file so the SDK mock cannot leak) |
| The route | `reading-route-budget`, `-quota`, `-thread`, `-preflight`, `-inline-gate`, `eval-harness-parity` |
| Scans | `reading-rule-scan`, `reading-fact-check`, `reading-preflight` — false-positive controls are first-class cases |
| Calculation | `astro-calc` (pinned to JPL reference values), `pluto-source`, `interpretation-engine`, `synastry-calc`, `tz`, `readout` |
| Security / limits | `security-hardening`, `api-routes`, `route-rate-limiter` |

Fixtures that include prose must contain a second-person sentence, or `register-drift` fires on every one.

Outside vitest: `scripts/verify-state.sh` (greps `main` for ratified rulings; do not rename the `DOCTRINE.md` headings it looks for) and `scripts/verify-thesis.sh` (scans hand-authored copy for resolution-by-hierarchy). `.github/workflows/smoke.yml` is manual-only.

**Measuring a change.** Rubric change → `npm run rescore -- --repeats=2` first (noise floor ~0.2 per criterion), then compare; the prose is frozen so any movement is the evaluator. Prompt change → `npm run eval -- --gate --charts=control-chicago-1987` (about $2), or `--through=tropical` for a Tropical-only change. Opener change → `npm run openers`. Change one thing per run.

## Docs map

One fact, one home.

| File | Canonical for | Consumed by |
|---|---|---|
| `CLAUDE.md` | How the code works now (this file) | Claude Code (auto-loaded); hosts the `next dev` agent-rules block |
| `docs/PIPELINE-HISTORY.md` | Why each rule, clamp and band exists; dated measurements | Anyone about to change or delete one. Not loaded by default |
| `AGENTS.md` | Nothing — a pointer stub to this file | Codex and other `AGENTS.md`-reading agents |
| `DOCTRINE.md` | Product law. Binding sections end at its *SUPERSEDED / NON-BINDING DRAFTS* appendix; only Kay ratifies law | Every agent and human; `scripts/verify-state.sh` |
| `README.md` | What AXIS is, methodology, accuracy, design tokens, setup | GitHub visitors and new contributors |
| `AUDIT.md`, `BENCHMARK.md` | Dated snapshots | History |
| `DESIGN.md` | Design direction | Design work |

`AGENTS.md` is a stub, not a symlink or a generated copy: a Windows checkout turns a symlink into a text file, and a copy drifts. The `nextjs-agent-rules` block stays **only** in this file; keep its markers out of `AGENTS.md` or `next dev` will write the block there instead.

## Project skills

`.claude/skills/axis-output-quality/` and `.claude/skills/tropical-sidereal-framework/` summarise the shipped prompts for anyone writing or reviewing reading copy. Both defer to `src/lib/prompts.ts`.

## Deployment

Vercel, auto-deploys from `main`. Set `ANTHROPIC_API_KEY` in project Environment Variables. `maxDuration` is declared via `export const` in each route file.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
