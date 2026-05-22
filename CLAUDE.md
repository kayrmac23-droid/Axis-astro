# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5000
npm run build    # Production build
npm start        # Start production server on port 5000
npm run lint     # ESLint (eslint.config.mjs)
npm run test     # Vitest unit tests (src/lib/__tests__/)
```

Requires `.env.local`:
```
ANTHROPIC_API_KEY=your_key_here
```

## Architecture

Next.js 14 App Router, TypeScript. Four API routes + five React components + six core libs.

### Data flow

1. `BirthForm` collects date/time/location, calls `/api/geocode` (Nominatim proxy) for coordinates, then `/api/timezone` for the IANA tz name
2. `/api/calculate` receives birth data + IANA tz name, resolves the DST-aware UTC offset via `Intl.DateTimeFormat`, fetches Pluto from JPL Horizons (falls back to local Meeus), and returns `DualChartData`
3. `page.tsx` stores `DualChartData`, renders `ChartWheel`, `ChartFactsPanel`, and passes to `ReadingPanel`
4. `ReadingPanel` fires sequential streaming requests to `/api/reading` — one per planet section — accumulating text into a section map

### `/api/calculate` — chart computation

`maxDuration = 30`. Validates all birth fields, derives the DST-accurate UTC offset from `tzName` (IANA) via `Intl.DateTimeFormat` with `longOffset` format, then attempts a JPL Horizons DE440 fetch for Pluto (5s timeout, no throw). Calls `calculateDualChart(birthData, { plutoLongitude?, plutoSource })`. Returns `DualChartData` including a `plutoSource` field: `'jpl-horizons-de440'` / `'jpl-horizons-de441'` or `'local-meeus'`.

### `/api/timezone` — offline tz resolution

GET `?lat=&lon=` → `{ tzName }`. Uses `tz-lookup` (bundled ~400KB grid database, no external calls). Called by `BirthForm` after geocoding to populate the IANA tz name before form submit.

### `/api/reading` — Claude streaming

`maxDuration = 60`. Each request is a single planet section within one of three reading types (`tropical` | `sidereal` | `synthesis`). The route:
1. Validates IP rate limit (20 req / 60s fixed window, Redis-backed via Upstash — distributed across all instances; falls back to in-memory when Redis is absent)
2. Enforces 64KB payload ceiling
3. Validates `section` and `planetSection` against explicit allow-lists
4. Checks the Upstash Redis reading cache (keyed by SHA-256 of birth data + section + `READING_PROMPT_VERSION`)
5. Calls `buildInterpretationContext()` + `formatEliteChartBlock()` from `lib/interpretation-engine.ts`
6. Streams raw text back via `ReadableStream`; caches the accumulated result on success
7. Sends keep-alive spaces every 5s before first token

Model config (centralised constants at top of route):
- `MODEL = 'claude-sonnet-4-5'`
- `MAX_TOKENS_PER_SECTION` — per-section budget map (sun/moon/ascendant: 2500; secondaries: 1500–1800; synthesis: 1500–2500); falls back to 2000 for unlisted keys
- `TEMPERATURE = 0.2`

Planet sections per reading type:
- **tropical**: sun, moon, ascendant, mercury, venus, mars, jupiter_saturn, key_aspects
- **sidereal**: lagna, sun, moon, mercury, venus, mars, jupiter_saturn, rahu_ketu
- **synthesis**: agree, diverge, tension, closing

### `lib/astro-calc.ts` — Astronomical engine (astronomia package)

Uses the `astronomia` npm package (VSOP87B ephemeris via `astronomia/planetposition` + `astronomia/data/vsop87B*`) for all planets Mercury–Neptune, `astronomia/solar` (VSOP87 + nutation + aberration) for the Sun, and `astronomia/moonposition` (ELP2000 series) for the Moon. Nutation corrections applied via `astronomia/nutation`; light-time corrections via `astronomia/base`. Planet objects are instantiated once at module load. Pluto uses Meeus Ch. 37 polynomials (not in VSOP87) with an optional JPL Horizons override. Sidereal positions are derived from Tropical via Lahiri ayanamsa (~23.85° calibrated to J2000). House system is Whole Sign. Exports `calculateDualChart(BirthData, overrides?)` → `DualChartData`.

`BirthData` includes optional `tzName: string` (IANA tz) and `birthTimeUnknown: boolean` (forces noon for house-agnostic readings). `DualChartData` includes `plutoSource` string and `birthData`.

### `lib/jpl-horizons.ts` — JPL Horizons DE440 ephemeris

Fetches geocentric ecliptic longitude for Pluto (and other bodies) from `ssd.jpl.nasa.gov` REST API. Uses DE440 (1550–2650) or DE441 for extreme dates. Only Pluto is used in production. Has a module-level minute-resolution cache. Falls back gracefully — `getHorizonsEclipticLon()` returns `null` on any error. The benchmark script `scripts/benchmark-pluto.mjs` compares this against local Meeus Ch.37; expected error is ~10–20 arcminutes across 1930–2025.

### `lib/reading-cache.ts` — Upstash Redis response cache

Persisted KV cache via `@upstash/redis` (REST API). Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars; falls back gracefully (no-op reads/writes) when absent. Cache key is SHA-256 of: normalized birth data, section, planetSection, `READING_PROMPT_VERSION`, ayanamsa, house system. Entries carry a 30-day TTL. **Bump `READING_PROMPT_VERSION`** (currently `v9.2`) whenever prompts are intentionally changed — this invalidates all prior cached readings.

### `lib/interpretation-engine.ts` — Structured reasoning layer

Sits between `astro-calc.ts` (raw positions) and the Claude prompt. Derives first-principles astrological facts and formats them as a structured context block injected into every `/api/reading` request. Contains knowledge constants for planets, signs, houses, essential dignities, traditional rulerships, nakshatras, and aspect definitions. Key exports:

- `buildInterpretationContext(chartData, section, planetSection)` — main entry point; returns the context block as a formatted string
- `formatEliteChartBlock(chartData, system)` — formats the raw chart positions block prepended to the user message

Internal helpers: `computeDignity`, `computeAspects`, `getDispositor`, `buildConflicts`, `formatPlanetBlock`, `formatAscendantBlock`, `formatSynthesisBlock`.

To extend: add entries to the knowledge constants (`PLANET_CORE`, `SIGN_DATA`, `HOUSE_DATA`, `DIGNITIES`, `NAKSHATRA_DATA`) — the engine functions are data-driven so additions propagate automatically.

### `lib/cusps.ts` — Astrological cusp data

Exports `CUSPS` (array of 12 named cusp periods with psychological descriptions) and `getCuspForPlanet(sign, degree)` which returns the relevant `CuspData` when a planet is within 3° of a sign boundary, or `null` otherwise.

### `lib/planet-descriptors.ts` — Planet descriptor text

Exports `TROPICAL_DESCRIPTORS`, `SIDEREAL_DESCRIPTORS`, and `SYNTHESIS_DESCRIPTORS` — structured name/keywords/description objects for each planet and synthesis section, used by prompts to provide consistent framing language.

### `lib/prompts.ts` — System prompts

`SHARED_RULES` is the exported shared voice/constraint layer (no predictions, no bullet points, cross-chart accuracy rules, cusp detection, depth requirements). It is passed as the first block of the system prompt array with `cache_control: { type: 'ephemeral' }` so it is prompt-cached across all requests. Three top-level system prompts (`TROPICAL_SYSTEM_PROMPT`, `SIDEREAL_SYSTEM_PROMPT`, `SYNTHESIS_SYSTEM_PROMPT`) and a `SECTION_INSTRUCTIONS` map keyed by section → planetSection. Prompts are currently at v9.2.

When editing prompts: the cusp rule (±3° of sign boundary), cross-chart accuracy section, and depth requirements (500–700 words for Sun/Moon/Ascendant, 300–400 for secondaries) are load-bearing constraints — the reading quality depends on them. Always bump `READING_PROMPT_VERSION` in `lib/reading-cache.ts` after structural prompt changes.

### React components

- **`BirthForm.tsx`** — Collects date/time/location. Debounced geocode search (Nominatim) with keyboard-navigable suggestions. Calls `/api/timezone` after location selection. Supports `birthTimeUnknown` toggle. Passes AM/PM → 24h conversion before submit.
- **`ChartWheel.tsx`** — SVG renderer for a single chart wheel. Takes a `ChartData` and renders planets, signs, and house divisions.
- **`ChartFactsPanel.tsx`** — Tabular side-by-side view of tropical vs sidereal planet positions. Shows sign, degree, house, retrograde status, essential dignity (domicile/exaltation/detriment/fall), and nakshatra/pada for sidereal. Highlights sign shifts (≠) between systems. Footer shows Pluto data source (JPL or local Meeus fallback).
- **`ReadingPanel.tsx`** — Manages sequential streaming requests per planet section. Accumulates streamed text into a per-section map. Handles `[AXIS_STREAM_ERROR: ...]` sentinel from the server.
- **`AstrolabeDecor.tsx`** — Decorative SVG astrolabe shown in the hero section. Inner sidereal platter animates to the Lahiri offset (−23.85°) via CSS. Purely presentational.

## Tests

Vitest tests live in `src/lib/__tests__/astro-calc.test.ts`. They cover output shape, sidereal ayanamsa shift, Whole Sign houses, leap years, extreme coordinates, JPL Pluto override, and the Rahu/Ketu axis. Run with `npm run test`. The `@` alias resolves to `src/` (configured in `vitest.config.ts`).

## Deployment

Vercel — auto-deploys from `main`. `ANTHROPIC_API_KEY` must be set in Vercel project settings → Environment Variables.

`vercel.json` sets `maxDuration: 60` for the reading route only. Do not add a top-level `functions` block — it conflicts with Next.js App Router's native function routing.

The `/api/calculate` route has `maxDuration = 30` via the `export const` in the route file (accommodates the Horizons API call).
