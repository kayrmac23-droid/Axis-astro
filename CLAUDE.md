# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev      # Start dev server at http://localhost:5000
npm run build    # Production build
npm start        # Start production server on port 5000
```

No test suite or linter is configured.

Requires `.env.local`:
```
ANTHROPIC_API_KEY=your_key_here
```

## Architecture

Next.js 14 App Router, TypeScript. Three API routes + three React components + two core libs.

### Data flow

1. `BirthForm` collects date/time/location, calls `/api/geocode` (Nominatim proxy) for coordinates
2. On submit, `page.tsx` POSTs to `/api/calculate` → returns `DualChartData` (tropical + sidereal `ChartData`)
3. `ReadingPanel` fires sequential streaming requests to `/api/reading` — one per planet section — accumulating text into a section map

### `/api/reading` — Claude streaming

Each request is a single planet section within one of three reading types (`tropical` | `sidereal` | `synthesis`). The route maps `{ section, planetSection }` to a system prompt from `lib/prompts.ts`, then streams back raw text via `ReadableStream`. The model is `claude-opus-4-5` at `max_tokens: 6000`, `temperature: 0.7`.

Planet sections per reading type:
- **tropical**: sun, moon, ascendant, mercury, venus, mars, jupiter_saturn, key_aspects
- **sidereal**: lagna, sun, moon, mercury, venus, mars, jupiter_saturn, rahu_ketu
- **synthesis**: agree, diverge, tension, closing

Vercel function timeout is 60s (set in `vercel.json` and via `export const maxDuration = 60`). Keep-alive spaces are sent every 5s before first token to prevent connection drops.

### `lib/astro-calc.ts` — Pure TS astronomical engine

No external ephemeris. Uses VSOP87-derived algorithms for planet longitudes. Sidereal positions are derived from Tropical via Lahiri ayanamsa (~23.85° calibrated to J2000). House system is Whole Sign. Exports `calculateDualChart(BirthData)` → `DualChartData`.

### `lib/prompts.ts` — System prompts

`GLOBAL_VOICE` is the shared voice/constraint layer (no predictions, no bullet points, cross-chart accuracy rules, cusp detection, depth requirements). Each planet section has its own dedicated system prompt that imports these constraints. Prompts are currently at v7.0.

When editing prompts: the cusp rule (±3° of sign boundary), cross-chart accuracy section, and depth requirements (500–700 words for Sun/Moon/Ascendant, 300–400 for secondaries) are load-bearing constraints — the reading quality depends on them.

### `ChartWheel.tsx`

SVG renderer for the dual chart wheel. Takes `DualChartData` and renders both systems as concentric wheels.

## Deployment

Vercel — auto-deploys from `main`. `ANTHROPIC_API_KEY` must be set in Vercel project settings → Environment Variables.

Do not add a top-level `functions` block to `vercel.json` for Next.js App Router — it conflicts with the framework's native function routing. The existing config only sets `maxDuration` for the reading route.
