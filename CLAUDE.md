# CLAUDE.md

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5000
npm run build    # Production build
npm start        # Start production server on port 5000
npm run lint     # ESLint (eslint.config.mjs)
npm run test     # Vitest unit tests (src/lib/__tests__/)
```

Requires `.env.local`: `ANTHROPIC_API_KEY=your_key_here`

## Architecture

Next.js 16 App Router, TypeScript.

**Data flow:** `BirthForm` → `/api/geocode` + `/api/timezone` → `/api/calculate` → `DualChartData` → `ChartWheel` + `ChartFactsPanel` + `ReadingPanel` → `/api/reading` (sequential streaming, one per planet section). Synastry adds a parallel flow: two births → `/api/synastry` → inter-aspects + composite → `SynastryAspectsPanel` + `SynastryReadingPanel`.

Page routes: `/` (main app), `/method`, `/guides`, `/sample`, `/synastry`.

### API routes

- **`/api/calculate`** (`maxDuration=30`): validates birth data (16 KB payload guard), rate-limited (30 req/60s), derives DST-accurate UTC offset via `Intl.DateTimeFormat`, fetches Pluto from JPL Horizons DE440 (5s timeout, falls back to local Meeus), calls `calculateDualChart()`. Returns `DualChartData` with `plutoSource`.
- **`/api/synastry`** (`maxDuration=30`): rate-limited (20 req/60s, 16 KB guard), computes two natal charts, inter-aspects, and a midpoint composite chart via `synastry-calc.ts`.
- **`/api/geocode`**: Nominatim proxy. 200-char query limit, rate-limited (30 req/60s), field-whitelisted results.
- **`/api/timezone`**: GET `?lat=&lon=` → `{ tzName }`. Uses `tz-lookup` (offline, no external calls). Rate-limited (60 req/60s).
- **`/api/reading`** (`maxDuration=60`): rate-limited (20 req/60s, Redis-backed), validates section/planetSection against allow-lists, recomputes chart server-side from birth data (no client-trusted positions), checks Redis cache, calls `buildInterpretationContext()` + `formatEliteChartBlock()`, streams Claude response, then runs the quality gate (`reading-quality-gate.ts`) with a single repair pass inside the wall-clock budget. Model: `claude-sonnet-4-6`, `TEMPERATURE=0.2`. Only validated (non-truncated, gate-passing) output is cached.

Planet sections — **tropical**: sun, moon, ascendant, mercury, venus, mars, jupiter_saturn, key_aspects, rahu_ketu · **sidereal**: lagna, sun, moon, mercury, venus, mars, jupiter_saturn, rahu_ketu · **synthesis** (The Divergence): agree, diverge, tension, closing · **synastry**: luminaries, venus_mars, outer_planets, composite_chart, integration, navigation

### Core libs

- **`lib/astro-calc.ts`**: VSOP87B (planets), VSOP87+nutation (Sun), ELP2000 (Moon) via `astronomia`. Meeus Ch.37 for Pluto. Lahiri ayanamsa (~23.85°). Whole Sign houses. Exports `calculateDualChart(BirthData, overrides?)` → `DualChartData`.
- **`lib/synastry-calc.ts`**: computes inter-chart aspects (orb-limited, 5 major aspects) between two natal charts and a midpoint composite chart.
- **`lib/interpretation-engine.ts`**: derives astrological facts from chart data; formats structured context injected into every reading request. Data-driven via `PLANET_CORE`, `SIGN_DATA`, `HOUSE_DATA`, `DIGNITIES`, `NAKSHATRA_DATA` constants. Per-planet context emits symmetric evaluative blocks — `GIFTS / CAPACITIES` (`buildStrengths`, uses `PLANET_CORE.gift`) and `TENSIONS / CONTRADICTIONS` (`buildConflicts`) — plus a `SITUATIONAL FRAME` (`buildSituationalFrame`), so readings portray the whole person rather than skewing to struggle.
- **`lib/prompts.ts`**: system prompts at **v10.11**. `SHARED_RULES` is prompt-cached (ephemeral). `SECTION_INSTRUCTIONS` map keyed by section→planetSection; separate `SYNASTRY_SYSTEM_PROMPT`. Positives are framed as "strengths/capacities", not "gifts" — the injected context block is `STRENGTHS / CAPACITIES` (see interpretation-engine.ts); the word "gift" survives only in the banned-move list and the `your sensitivity is a gift` anti-pattern example. Load-bearing constraints: cusp rule (±3° of sign boundary), SELF-COMPLETE SECTIONS rule (each `/api/reading` call is stateless — no conversation history, so sections must be self-complete and must NOT reference other sections' prose), WHOLE-PERSON PORTRAIT rule (render the full spectrum — strengths/warmth/talent with equal weight to shadow; struggle is one colour, not the whole; precision not affirmation), SITUATIONAL MANIFESTATION rule (anchor every named pattern to the condition that activates it — *when* it shows up, not only *where* the struggle lives), PROSE FAILURE MODES rule (four hard errors that make prose perform depth instead of deliver it: 1 cadence-over-content / the em-dash aphorism tic, 2 repetition dressed as development, 3 the observer-frame inversion — appraising the native through the audience's eyes, 4 pseudo-synthesis / flattening a navigated tension into "carries both simultaneously"), UNCOMPENSATED CONSTRAINT rule (a difficulty may be stated as a cost and left standing; banned move: rescuing a hard placement into "resilience/uncommon/rare/gift/depth" in the breath that named it — this does not weaken WHOLE-PERSON PORTRAIT or CONTRADICTIONS AND BOTH SIDES, which still require showing both sides and cross-referencing every quality; a separately-located strength is portrait, manufacturing the upside of a cost is not), length is a typed BAND per section class, not one global target — a floor AND a ceiling. Bands live in `SECTION_WORD_BANDS` (source of truth shared with the gate's `length` criterion; `wordBandFor(section, planetSection)` looks them up, `DEFAULT_WORD_BAND` is the permissive fallback) and the `lengthClause(band)` helper renders the band into each section prompt so prose and gate can't drift. Per-section-type targets: **Sun/Moon** 650 (band 550–750, hard cap 800); **Ascendant** 550 (450–650, cap 700); **sidereal Lagna/Sun/Moon** 500 (400–600, cap 700); **tropical secondaries** (Mercury/Venus/Mars/Jup-Sat) 350 (300–400, cap 500); **The Divergence (diverge)** 900 (750–1050, cap 1150) — a *comparative* section, deliberately larger than a single-placement one, which is why it gets its own budget instead of inheriting the Sun number (the mismatch that made Sun over-run while Diverge truncated). The lower bound is a real floor (a short section under-delivered); the upper bound is a real ceiling (past it means padding/cadence/repetition per PROSE FAILURE MODES). **Always bump `READING_PROMPT_VERSION` after structural changes.**
- **`lib/reading-quality-gate.ts`**: post-generation evaluator. Scores the first-pass reading against the rubric and, if it fails, runs a single repair pass before the text reaches the client — bounded by a wall-clock budget so the route stays under `maxDuration`. The rubric is **10 criteria**: nine scored by the LLM evaluator (`LLM_CRITERIA`) plus a tenth, `length`, scored deterministically in code (`scoreLength(countWords(text), wordBandFor(section, planetSection))` → 5 inside the full band, 3 in the tolerated margin, 1 past the hard edges) and merged into `GateScores` before `computePassFromScores` runs — so an over-long or thin section trips `MIN_INDIVIDUAL` (3) exactly like any prose criterion. `validateScores` parses only the nine LLM scores (`LlmScores`); the LLM is told not to score length. The rubric also catches the compensatory-reframe compulsion (folded into `contradiction_handling`) and Barnum/universally-endorsable claims (the `falsifiability` criterion — scores the inversion test only; anchoring stays in `chart_evidence`, so the two are never double-counted). The banned-Barnum phrasings are a shared const (`BANNED_BARNUM_PHRASINGS`/`BANNED_BARNUM_LIST` in `prompts.ts`) imported by both files so prompt and gate cannot drift; `FALSIFIABILITY_DIVERGENCE_EXAMPLE` is the permanent regression fixture proving `specificity` and `falsifiability` are orthogonal. **Truncation is a pre-scoring hard failure**: `isTruncated(text)` (truncation sentinel present, or prose ending on a non-terminal char) short-circuits `evaluateSection` to `{ pass:false, scores:null, truncated:true }` with no eval call, and the route blocks caching on `gate.truncated` and re-checks the repaired draft — truncated output never reaches the cache or ships as final.
- **`lib/route-rate-limiter.ts`**: Redis-backed per-IP fixed-window rate limiter (atomic Lua INCR+EXPIRE via Upstash); falls back to in-memory when Redis env vars are absent.
- **`lib/reading-cache.ts`**: Upstash Redis KV cache, 30-day TTL. `READING_PROMPT_VERSION = 'v10.11'` — bump to invalidate all prior cached readings.
- **`lib/cusps.ts`**: `CUSPS` — the 12 named sign-boundary cusp descriptions (`CuspData[]`). Reference data, not currently wired into the runtime.
- **`lib/jpl-horizons.ts`**: fetches Pluto longitude from JPL Horizons REST API. Module-level cache (500 entries, FIFO). Returns `null` on any error.
- **`lib/zodiac-constants.ts`**: centralised `ZODIAC_SIGNS` array — shared source of truth.
- **`lib/tz.ts`**: DST-aware UTC offset from an IANA timezone name (`tzNameToOffset`), calendar-date validity (`isValidCalendarDate`), and local-birth→UTC-instant conversion (`birthToUtcMs`). The latter two use `setFullYear`/`setUTCFullYear` so years 1–99 are not remapped to 1900–1999 by the `Date` constructor's legacy two-digit-year rule.
- **`lib/analytics.ts`**: PostHog thin wrapper (no-op when key absent).
- **`lib/planet-descriptors.ts`**: `TROPICAL_DESCRIPTORS`, `SIDEREAL_DESCRIPTORS`, `SYNASTRY_DESCRIPTORS`, `SYNTHESIS_DESCRIPTORS` — name/keywords/description per section.

### React components

- **`BirthForm.tsx`**: geocode search (Nominatim, debounced), `birthTimeUnknown` toggle, AM/PM→24h.
- **`ChartWheel.tsx`** / **`DualChartWheel.tsx`** / **`FrameShiftWheel.tsx`**: SVG chart wheel renderers (single, side-by-side dual, and tropical↔sidereal frame-shift).
- **`ChartFactsPanel.tsx`**: tropical vs sidereal comparison table. Hidden in `@media print`.
- **`ReadingPanel.tsx`**: sequential streaming per section, accumulates text into section map, per-section retry.
- **`SynastryReadingPanel.tsx`** / **`SynastryAspectsPanel.tsx`**: synastry section streaming and inter-aspect table.
- **`AxisTensionSummary.tsx`**, **`DossierHeader.tsx`**, **`SiteHeader.tsx`**, **`MethodologyStrip.tsx`**, **`MethodPremise.tsx`**, **`SampleDossier.tsx`**: layout / disclosure / dossier chrome.
- **`HeroWheel.tsx`**, **`AstrolabeDecor.tsx`**, **`landing/PreviewLanding.tsx`**: decorative / landing presentational elements.

## Tests

`src/lib/__tests__/astro-calc.test.ts` — shape, ayanamsa, Whole Sign houses, leap years, extreme coords, JPL override, Rahu/Ketu. `@` alias → `src/` (vitest.config.ts).

## Deployment

Vercel, auto-deploys from `main`. Set `ANTHROPIC_API_KEY` in project Environment Variables. `maxDuration` is declared via `export const` in each route file.
