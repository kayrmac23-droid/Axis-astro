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

**Data flow:** `BirthForm` → `/api/geocode` + `/api/timezone` → `/api/calculate` → `DualChartData` → `ChartWheel` + `ChartFactsPanel` + `ReadingPanel` → `/api/reading` (sequential streaming, one per planet section)

### API routes

- **`/api/calculate`** (`maxDuration=30`): validates birth data, derives DST-accurate UTC offset via `Intl.DateTimeFormat`, fetches Pluto from JPL Horizons DE440 (5s timeout, falls back to local Meeus), calls `calculateDualChart()`. Returns `DualChartData` with `plutoSource`.
- **`/api/timezone`**: GET `?lat=&lon=` → `{ tzName }`. Uses `tz-lookup` (offline, no external calls).
- **`/api/reading`** (`maxDuration=60`): rate-limited (20 req/60s, Redis-backed), validates section/planetSection, checks Redis cache, calls `buildInterpretationContext()` + `formatEliteChartBlock()`, streams Claude response. Model: `claude-sonnet-4-6`, `TEMPERATURE=0.2`. Caches accumulated result on success.

Planet sections — **tropical**: sun, moon, ascendant, mercury, venus, mars, jupiter_saturn, key_aspects · **sidereal**: lagna, sun, moon, mercury, venus, mars, jupiter_saturn, rahu_ketu · **synthesis**: agree, diverge, tension, closing

### Core libs

- **`lib/astro-calc.ts`**: VSOP87B (planets), VSOP87+nutation (Sun), ELP2000 (Moon) via `astronomia`. Meeus Ch.37 for Pluto. Lahiri ayanamsa (~23.85°). Whole Sign houses. Exports `calculateDualChart(BirthData, overrides?)` → `DualChartData`.
- **`lib/interpretation-engine.ts`**: derives astrological facts from chart data; formats structured context injected into every reading request. Data-driven via `PLANET_CORE`, `SIGN_DATA`, `HOUSE_DATA`, `DIGNITIES`, `NAKSHATRA_DATA` constants. Per-planet context emits symmetric evaluative blocks — `GIFTS / CAPACITIES` (`buildStrengths`, uses `PLANET_CORE.gift`) and `TENSIONS / CONTRADICTIONS` (`buildConflicts`) — plus a `SITUATIONAL FRAME` (`buildSituationalFrame`), so readings portray the whole person rather than skewing to struggle.
- **`lib/prompts.ts`**: system prompts at **v10.1**. `SHARED_RULES` is prompt-cached (ephemeral). `SECTION_INSTRUCTIONS` map keyed by section→planetSection. Load-bearing constraints: cusp rule (±3° of sign boundary), SELF-COMPLETE SECTIONS rule (each `/api/reading` call is stateless — no conversation history, so sections must be self-complete and must NOT reference other sections' prose), WHOLE-PERSON PORTRAIT rule (render the full spectrum — gifts/warmth/talent with equal weight to shadow; struggle is one colour, not the whole; precision not affirmation), SITUATIONAL MANIFESTATION rule (anchor every named pattern to the condition that activates it — *when* it shows up, not only *where* the struggle lives), PROSE FAILURE MODES rule (four hard errors that make prose perform depth instead of deliver it: 1 cadence-over-content / the em-dash aphorism tic, 2 repetition dressed as development, 3 the observer-frame inversion — appraising the native through the audience's eyes, 4 pseudo-synthesis / flattening a navigated tension into "carries both simultaneously"), depth targets (550–750 words Sun/Moon/ASC, 300–400 secondaries) — the lower bound is a genuine floor (a short major section has under-delivered), but length must be *earned through substance*, not the padding/cadence/repetition banned by PROSE FAILURE MODES. **Always bump `READING_PROMPT_VERSION` after structural changes.**
- **`lib/reading-cache.ts`**: Upstash Redis KV cache, 30-day TTL. `READING_PROMPT_VERSION = 'v10.1'` — bump to invalidate all prior cached readings.
- **`lib/cusps.ts`**: `getCuspForPlanet(sign, degree)` — returns `CuspData` when within 3° of sign boundary.
- **`lib/jpl-horizons.ts`**: fetches Pluto longitude from JPL Horizons REST API. Module-level cache (500 entries, FIFO). Returns `null` on any error.
- **`lib/planet-descriptors.ts`**: `TROPICAL_DESCRIPTORS`, `SIDEREAL_DESCRIPTORS`, `SYNTHESIS_DESCRIPTORS` — name/keywords/description per section.

### React components

- **`BirthForm.tsx`**: geocode search (Nominatim, debounced), `birthTimeUnknown` toggle, AM/PM→24h.
- **`ChartWheel.tsx`**: SVG chart wheel renderer.
- **`ChartFactsPanel.tsx`**: tropical vs sidereal comparison table. Hidden in `@media print`.
- **`ReadingPanel.tsx`**: sequential streaming per section, accumulates text into section map.
- **`HeroWheel.tsx`**: decorative hero SVG. Purely presentational.

## Tests

`src/lib/__tests__/astro-calc.test.ts` — shape, ayanamsa, Whole Sign houses, leap years, extreme coords, JPL override, Rahu/Ketu. `@` alias → `src/` (vitest.config.ts).

## Deployment

Vercel, auto-deploys from `main`. Set `ANTHROPIC_API_KEY` in project Environment Variables. `maxDuration` is declared via `export const` in each route file.
