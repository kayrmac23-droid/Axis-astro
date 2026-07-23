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
- **`lib/prompts.ts`**: system prompts at **v10.4**. `SHARED_RULES` is prompt-cached (ephemeral). `SECTION_INSTRUCTIONS` map keyed by section→planetSection; separate `SYNASTRY_SYSTEM_PROMPT`. Load-bearing constraints: cusp rule (±3° of sign boundary), SELF-COMPLETE SECTIONS rule (each `/api/reading` call is stateless — no conversation history, so sections must be self-complete and must NOT reference other sections' prose), WHOLE-PERSON PORTRAIT rule (render the full spectrum — gifts/warmth/talent with equal weight to shadow; struggle is one colour, not the whole; precision not affirmation), SITUATIONAL MANIFESTATION rule (anchor every named pattern to the condition that activates it — *when* it shows up, not only *where* the struggle lives), PROSE FAILURE MODES rule (four hard errors that make prose perform depth instead of deliver it: 1 cadence-over-content / the em-dash aphorism tic, 2 repetition dressed as development, 3 the observer-frame inversion — appraising the native through the audience's eyes, 4 pseudo-synthesis / flattening a navigated tension into "carries both simultaneously"), depth targets (550–750 words Sun/Moon/ASC, 300–400 secondaries) — the lower bound is a genuine floor (a short major section has under-delivered), but length must be *earned through substance*, not the padding/cadence/repetition banned by PROSE FAILURE MODES. **Always bump `READING_PROMPT_VERSION` after structural changes.**
- **`lib/reading-quality-gate.ts`**: post-generation evaluator. Scores the first-pass reading against the rubric and, if it fails, runs a single repair pass before the text reaches the client — bounded by a wall-clock budget so the route stays under `maxDuration`.
- **`lib/route-rate-limiter.ts`**: Redis-backed per-IP fixed-window rate limiter (atomic Lua INCR+EXPIRE via Upstash); falls back to in-memory when Redis env vars are absent.
- **`lib/reading-cache.ts`**: Upstash Redis KV cache, 30-day TTL. `READING_PROMPT_VERSION = 'v10.4'` — bump to invalidate all prior cached readings.
- **`lib/cusps.ts`**: `CUSPS` (the 12 named cusps with psychological descriptions) and `getCuspForPlanet(sign, degree)` — returns the matching `CuspData` when a placement is within `CUSP_ORB_DEG` (3°) of a sign boundary, else `null`. `interpretation-engine.ts` calls it (via `formatCuspNote`) in every planet block, the ascendant/lagna block, and the synthesis divergence map, so each reading's STRUCTURED INTERPRETATION CONTEXT carries a named `CUSP NOTE` — the note the prompt's CUSP RULE relies on.
- **`lib/jpl-horizons.ts`**: fetches Pluto longitude from JPL Horizons REST API. Module-level cache (500 entries, FIFO). Returns `null` on any error.
- **`lib/zodiac-constants.ts`**: centralised `ZODIAC_SIGNS` array — shared source of truth.
- **`lib/tz.ts`**: DST-aware UTC offset from an IANA timezone name.
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
