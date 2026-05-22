# AXIS — Dual-System Astrology

> *Tropical maps the psychological architecture of a self. Sidereal maps the incarnational conditions it navigates. The synthesis is where both truths meet.*

Live: [axis-astro.vercel.app](https://axis-astro.vercel.app)

---

## What it is

AXIS generates natal chart readings using both the Western Tropical and Vedic Sidereal zodiac systems simultaneously — then synthesises them into a unified interpretive framework.

Most astrology apps pick one system. AXIS treats them as complementary maps of different layers of a person:

- **Tropical** — the symbolic architecture of conscious identity: how the psychological self has been organised through experience, relationships, and self-construction. Ego structure, relational patterns, cognitive style, the shape of a person's defences.
- **Sidereal** — incarnational patterning: the body, circumstances, and inherited tendencies a person arrived with; karmic emphases, deep instinctive orientations, and the time-conditioned unfolding of a life. Not fate — the specific terrain.
- **Synthesis** — the only question that matters: how does this particular psychological interior navigate these particular incarnational conditions? Where both systems converge, the insight is load-bearing. Where they diverge, that is the specific terrain of this person's life.

Readings are written in continuous analytical prose. No bullet points. No generic affirmations. No predictions. Every sentence earns its place.

---

## Methodology

| Parameter | Choice | Rationale |
|---|---|---|
| House system | Whole Sign | Consistent for both Tropical and Sidereal; used throughout code, wheel, and interpretation engine |
| Ayanamsa | Lahiri | IAU standard for Jyotish; ~23.85° at J2000, precessing at 50.2564"/yr |
| Lunar nodes | True (osculating) node | Meeus Ch. 22 mean node + 4-term periodic corrections; matches Swiss Ephemeris to <0.05°. Oscillates ±1.5° around the mean with a ~173-day period. |
| Dasha system | Vimshottari | Used for current-chapter contextualisation, not event prediction |
| Midheaven | Shown as separate angle | MC is NOT the Whole Sign 10th-house cusp — displayed independently on the wheel |

**Birth time sensitivity:** Ascendant, house placements, MC, Moon degree, and dasha timing all depend on an accurate birth time. AXIS flags readings with an unknown birth time and discloses which elements are unreliable.

---

## Calculation accuracy

AXIS uses two complementary ephemeris sources:

**1. Local VSOP87 / ELP2000 engine** (`astronomia` package) — Sun, Moon, Mercury through Neptune, Rahu/Ketu. Full VSOP87 planetary theory and ELP2000 lunar theory. These are the same algorithms used in professional desktop astrology software.

**2. JPL Horizons REST API** — Pluto position. JPL Horizons (operated by NASA/JPL) returns positions computed from the JPL DE440 planetary ephemeris (Park et al. 2021), the current standard for solar system dynamics. DE440 accuracy for Pluto: < 1 arcsecond. AXIS fetches the Pluto position at chart calculation time via a single HTTP call to the Horizons API, with automatic fallback to the local Meeus polynomial if the API is unavailable.

| Body | Method | Accuracy (1800–2050) |
|---|---|---|
| Sun | VSOP87 via `solar.apparentVSOP87` (nutation + aberration included) | < 1 arcsecond |
| Moon | ELP2000 + nutation correction | < 10 arcseconds |
| Mercury–Neptune | VSOP87 heliocentric + geocentric conversion + light-time + nutation | < 1 arcminute |
| Pluto | **JPL Horizons DE440** (fallback: Meeus Ch. 37, ~15–50 arcmin) | **< 1 arcsecond** |
| Rahu/Ketu | True node: Meeus Ch. 22 + periodic corrections | < 0.05° vs. Swiss Ephemeris osculating node |
| Lahiri ayanamsa | Linear precession formula | Within ~0.01° of the IAU reference value |

Every generated chart displays the active Pluto ephemeris source ("JPL Horizons DE440" or "⚠ local fallback") in the reading header so users know which source was used.

### Pluto: what Horizons returns

AXIS requests **apparent geocentric ecliptic longitude of date** (Horizons OBSERVER quantity 31, CENTER=geocenter, APPARENT=AIRLESS). This is the same coordinate frame VSOP87 + nutation produces for all other planets — mean ecliptic and equinox of the tabulation date, light-time corrected, aberration included, no atmospheric refraction. The values are directly comparable and substitutable.

Horizons currently uses **DE440** for dates in the 1550–2650 range. DE440 is the successor to DE431, published by Park et al. (2021). It is not Swiss Ephemeris (which wraps DE431/DE441 in a C library), but it uses the same underlying JPL integration and is at the same accuracy level.

### Why not Swiss Ephemeris?

`swisseph` (the npm wrapper for Swiss Ephemeris) requires a native C binary compiled for the target platform. Vercel Lambda runs in a read-only environment where pre-compiled C binaries cannot be shipped as part of a Next.js bundle. Additionally, JPL ephemeris data files are 30–180MB, exceeding Vercel's 50MB compressed bundle limit. These are hard architectural constraints, not tradeoffs.

The JPL Horizons API is the practical equivalent — same JPL data, same accuracy — accessed via HTTP instead of a native binary. For the 10 planets calculated via VSOP87/ELP2000, the current engine is already at Swiss Ephemeris accuracy. Horizons brings Pluto up to the same standard.

**Ephemeris benchmark:** `node scripts/benchmark-pluto.mjs` compares Meeus Ch.37 vs Horizons DE440 across representative dates (1930–2025) and reports the difference in arcminutes per date. See [BENCHMARK.md](BENCHMARK.md) for the full methodology and pre-computed Meeus values.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16.x (App Router) |
| Language | TypeScript |
| AI backend | Anthropic Claude (`claude-sonnet-4-5`) via streaming API with prompt caching |
| Planetary calculations | VSOP87 (astronomia) + ELP2000 Moon + JPL Horizons DE440 Pluto |
| Geocoding | OpenStreetMap Nominatim |
| Timezone | tz-lookup (offline IANA lookup) |
| Deployment | Vercel |
| Fonts | Cormorant Garamond · Cinzel · Space Mono |

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                 — main app shell, form → chart → reading flow
│   ├── globals.css              — design system tokens
│   ├── page.module.css          — layout styles
│   └── api/
│       ├── geocode/             — Nominatim proxy for birth location coordinates
│       ├── timezone/            — offline IANA timezone lookup (tz-lookup)
│       ├── calculate/           — chart calculation endpoint (Tropical + Sidereal)
│       └── reading/             — Claude streaming endpoint
├── components/
│   ├── BirthForm.tsx            — date/time/location input with birth-time-unknown toggle
│   ├── ChartWheel.tsx           — SVG chart wheel (Whole Sign, clickable planets, MC marker)
│   └── ReadingPanel.tsx         — streaming reading display with per-section retry
└── lib/
    ├── astro-calc.ts            — full VSOP87 + ELP2000 calculation engine
    ├── interpretation-engine.ts — structured reasoning layer between calc and Claude
    ├── prompts.ts               — system prompts (v9.2; SHARED_RULES prompt-cached)
    ├── cusps.ts                 — astrological cusp data and detection
    └── planet-descriptors.ts   — planet descriptor text for all three reading types
```

### Chart Calculation

Both Tropical and Sidereal charts use **Whole Sign houses** throughout — for planet assignments, the chart wheel, and the interpretation engine. The MC (Midheaven) is computed separately as the ecliptic projection of the meridian and is displayed as an independent angle, not as the 10th-house cusp.

### Interpretation Engine

`lib/interpretation-engine.ts` sits between raw chart data and the Claude prompt. For each section it derives first-principles facts — essential dignity, sign modification, house environment, dispositor chain, aspects with applying/separating status, and a weighted evidence block for psychological axes (attachment/detachment, emotional suppression, etc.) — and formats them as a structured context block injected into every reading request.

The evidence-weighted approach (rather than categorical rules) means Claude receives the chart evidence, not pre-formed verdicts. For example, the Moon cross-reference for Sun and Mars sections lists specific attachment and detachment indicators with their weights, then states the evidence balance — so the interpretation can name the genuine tension rather than defaulting to a sign-element cliché.

### Reading Generation

Three reading types, each composed of sequential per-planet streaming requests to the Claude API. Per-section retry (2 attempts) prevents a single failed request from blocking the rest of the reading. Failed sections produce a visible placeholder so the readable portions remain intact.

1. **Tropical** — psychological interior, sign positions and psychological meaning. Sections: Sun, Moon, Ascendant, Mercury, Venus, Mars, Jupiter/Saturn, Key aspects.
2. **Sidereal** — incarnational patterning, karmic emphases, nakshatras. Sections: Lagna, Sun, Moon, Mercury, Venus, Mars, Jupiter/Saturn, Rahu/Ketu.
3. **Synthesis** — Concordance, Divergence, Central Tension, Integration. The synthesis context block includes thematic convergence analysis: element continuity, dignity direction concordance, dispositor chain convergence, and house domain analysis.

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Set in Vercel dashboard → Environment Variables. |
| `UPSTASH_REDIS_REST_URL` | Recommended. Upstash Redis REST endpoint for the reading cache. Create a free database at [console.upstash.com](https://console.upstash.com). Falls back to no-op (no caching) when absent. |
| `UPSTASH_REDIS_REST_TOKEN` | Recommended. Upstash Redis REST token (paired with the URL above). |

---

## Local development

```bash
git clone https://github.com/kayrmac23-droid/Axis-astro.git
cd Axis-astro
npm install
```

Create a `.env.local` file:
```
ANTHROPIC_API_KEY=your_key_here
```

```bash
npm run dev        # development server at http://localhost:5000
npm test           # run test suite (vitest)
npm run lint       # ESLint
npm run build      # production build
```

App runs at `http://localhost:5000`.

---

## Deployment

Deployed via Vercel connected to this GitHub repo. Every push to `main` triggers an automatic production deployment.

Do not add a `functions` block to `vercel.json` for Next.js App Router — it conflicts with the framework's native function handling. The existing config sets `maxDuration` for the reading route (60s) and the calculate route (30s, which covers the Horizons API call + computation).

---

## Production hardening notes

This section describes what is hardened now and what requires distributed infrastructure for true production scale.

**Hardened (current state):**
- `/api/reading` validates section and planetSection against explicit allow-lists before processing
- `/api/reading` enforces a 64 KB payload size limit
- `/api/reading` applies an in-memory per-IP rate limiter (20 req / 60s sliding window)
- `/api/geocode` enforces a 200-character query length limit
- All internal error messages are scrubbed from client-facing responses (server-side logging only)
- Per-section streaming retry (2 attempts) with visible failure fallback
- Truncated responses (`stop_reason: max_tokens`) are not cached and surface an inline notice to the user
- **Reading cache:** Upstash Redis via REST API (`@upstash/redis`). Persists across cold starts and is shared between concurrent serverless instances. 30-day TTL. Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars; falls back to no-op when absent.

**Distributed — no warm-instance bypass:**
- **Rate limiter:** Redis-backed fixed window via Upstash (same connection as the reading cache). All serverless instances share a single counter per IP, so the 20 req / 60s limit is enforced globally. Falls back to the previous in-memory behaviour when Redis env vars are absent.

**External service dependencies:**
- Anthropic API — one call per planet section, 8–9 calls per full reading. Each full reading costs approximately 8–9 × (Claude output tokens × price per token). API key must be set in Vercel environment variables.
- JPL Horizons (`ssd.jpl.nasa.gov`) — one HTTP call per chart calculation for the Pluto position. Falls back to local Meeus polynomial (~0.3° error) if unreachable.
- OpenStreetMap Nominatim — geocoding for birth location. Subject to Nominatim usage policy (1 req/s, no bulk use).

---

## Known limitations and accuracy notes

- **Pluto** uses JPL Horizons DE440 (< 1 arcsecond) when available. If the Horizons API is unreachable at chart calculation time, the engine falls back to the local Meeus Ch.37 polynomial (full 43-term table via `astronomia/pluto`; ~15–50 arcminutes vs DE440) and the chart header displays "⚠ local fallback." The fallback is noted so users know the accuracy tier their chart used. See [BENCHMARK.md](BENCHMARK.md).
- **Rahu/Ketu** use the **true (osculating) lunar node** — Meeus Ch. 22 mean node plus 4 dominant periodic correction terms. Matches Swiss Ephemeris to <0.05° over 1900–2100. The node oscillates ±1.5° around the mean with a ~173-day period; the position given is the instantaneous osculating node.
- **Lahiri ayanamsa** is computed via a linear precession formula. Difference from the full polynomial calculation is < 0.01° for dates 1900–2100.
- **Birth time** accuracy directly affects Ascendant, MC, house placements, Moon degree, and dasha timing. AXIS flags this explicitly in the UI when time is unknown.
- **JPL Horizons availability:** AXIS requires one outbound HTTP call to `ssd.jpl.nasa.gov` per chart calculation for the Pluto position. If the endpoint is unreachable (downtime, network policy), the fallback engine activates transparently.

---

## Roadmap

- [ ] Swiss Ephemeris for Pluto (requires dedicated compute layer outside Vercel)
- [ ] Monetisation gate — free chart generation, paid ongoing access
- [ ] Guides page — how to read each system, what the synthesis means
- [ ] Dasha timeline view — visualise active Jyotish planetary periods
- [ ] Compatibility synthesis — dual-system chart overlay for two people
- [ ] Save / share reading — persistent URL for generated readings
