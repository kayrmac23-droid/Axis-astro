# AXIS — Dual-System Astrology

> *Tropical maps the psychological architecture of a self. Sidereal maps the incarnational conditions it navigates. The divergence is where this chart actually lives — AXIS holds both open.*

Live: [axis-astro.vercel.app](https://axis-astro.vercel.app)

---

## What it is

AXIS generates natal chart readings using both the Western Tropical and Vedic Sidereal zodiac systems simultaneously — and never merges them. The two systems disagree by the ayanamsa (~23.85°), and that disagreement is the product: AXIS computes both charts in full and holds open the distance between them. Divergence is not noise to be averaged out; it is the most informative part of the chart.

Most astrology apps pick one system. AXIS treats them as two maps of different layers of a person that do not resolve into one picture:

- **Tropical** — the symbolic architecture of conscious identity: how the psychological self has been organised through experience, relationships, and self-construction. Ego structure, relational patterns, cognitive style, the shape of a person's defences.
- **Sidereal** — incarnational patterning: the body, circumstances, and inherited tendencies a person arrived with; karmic emphases, deep instinctive orientations, and the time-conditioned unfolding of a life. Not fate — the specific terrain.
- **The Divergence** — the third reading, and the reason AXIS exists: how does this particular psychological interior navigate these particular incarnational conditions? Where both systems point at the same theme, the insight is load-bearing. Where they diverge, the reading names the divergence exactly and lets it stand — it is the specific terrain of this person's life, not an error to be reconciled.

AXIS is written for readers who take astrology seriously — students of the technical literature, therapy-adjacent practitioners, those formed by the contemplative traditions. The interpretive vocabulary assumes a working understanding of both the Tropical and Sidereal frameworks before arriving. The chart is read once at depth rather than re-explained across a daily push notification.

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
| Pluto | **JPL Horizons DE440** (fallback: Meeus Ch. 37, ~15–60 arcmin) | **< 1 arcsecond** |
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
| AI backend | Anthropic Claude (`claude-sonnet-4-6`) via streaming API with prompt caching |
| Planetary calculations | VSOP87 (astronomia) + ELP2000 Moon + JPL Horizons DE440 Pluto |
| Geocoding | OpenStreetMap Nominatim |
| Timezone | tz-lookup (offline IANA lookup) |
| Deployment | Vercel |
| Fonts | Cormorant Garamond · Cinzel · Courier Prime |

---

## Design system

AXIS uses a restrained dark-void palette. **Copper is the primary accent, ratified July 2026** (the copper→gold migration is cancelled; there is no gold token). Cyan signals active computation, selected states, streaming, and focus. Violet marks unresolved tension, dissonance, and liminal states.

| Token | Value | Role |
|---|---|---|
| `--void` | `#010108` | True background black-blue |
| `--bg` | `#030212` | Page base |
| `--surface` | `#090820` | Panels and form surfaces |
| `--surface-2` | `#0F0E2C` | Raised cards |
| `--reading-surface` | `#061230` | Raised surface behind long-form reading prose only (see DOCTRINE.md) |
| `--text` | `#EAE8F8` | Primary star-white text |
| `--text-2` | `#A8A4C8` | Body support text |
| `--text-3` | `#9490C4` | Labels and metadata |
| `--copper` | `#B87333` | Base identity accent — wordmark, primary CTAs, offset wedge, section rituals, symbolic emphasis |
| `--copper-bright` | `#D89455` | Fine linework, hairlines, chart ticks, small mono labels on void |
| `--copper-light` | `#F0B978` | Finest / dimmest-context lines; rare highlight or glow edge |
| `--copper-dim` | `#5A2F18` | Borders, shadows, subdued rules |
| `--copper-glow` | `rgba(184, 115, 51, 0.18)` | Soft ambient accent |
| `--cyan` | `#2CC8C0` | Active computation and focus state |
| `--violet` | `#7844FF` | Dissonance, contradiction, liminal insight |

**Two-tier linework rule:** base copper `#B87333` is too dim for 1px lines and tiny type on the void. ALL fine linework, hairlines, chart ticks, and small mono labels use `--copper-bright` (or `--copper-light` for the finest/dimmest contexts). Only identity elements — wordmark, primary CTA fill, the offset wedge, section ritual rules — stay base `--copper`. No gradient blends two accent colours. All tokens are defined in `src/app/globals.css`.

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                 — main app shell, form → chart → reading flow
│   ├── layout.tsx               — root layout
│   ├── globals.css              — design system tokens
│   ├── page.module.css          — layout styles
│   ├── method/                  — methodology page (dual-system rationale)
│   ├── guides/                  — how-to-read guides page
│   ├── sample/                  — static sample reading page
│   ├── synastry/                — two-chart synastry page
│   └── api/
│       ├── geocode/             — Nominatim proxy for birth location coordinates
│       ├── timezone/            — offline IANA timezone lookup (tz-lookup), rate-limited
│       ├── calculate/           — chart calculation endpoint (Tropical + Sidereal)
│       ├── reading/             — Claude streaming endpoint (natal reading)
│       └── synastry/            — synastry calculation endpoint (inter-aspects + composite)
├── components/
│   ├── BirthForm.tsx            — date/time/location input with birth-time-unknown toggle
│   ├── ChartWheel.tsx           — SVG chart wheel (Whole Sign, clickable planets, MC marker)
│   ├── DualChartWheel.tsx       — side-by-side tropical + sidereal wheels
│   ├── FrameShiftWheel.tsx      — animated tropical↔sidereal frame-shift wheel
│   ├── ChartFactsPanel.tsx      — tropical vs sidereal comparison table (hidden in print)
│   ├── ReadingPanel.tsx         — streaming reading display with per-section retry
│   ├── SynastryReadingPanel.tsx — streaming reading display for synastry sections
│   ├── SynastryAspectsPanel.tsx — inter-aspect table for two charts
│   ├── AxisTensionSummary.tsx   — central-tension callout panel for The Divergence
│   ├── DossierHeader.tsx        — per-chart dossier header with key placements
│   ├── SiteHeader.tsx           — top navigation bar
│   ├── MethodologyStrip.tsx     — compact methodology disclosure strip
│   ├── MethodPremise.tsx        — explanatory premise block (AXIS dual-system rationale)
│   ├── SampleDossier.tsx        — static sample reading for the landing page
│   ├── AstrolabeDecor.tsx       — decorative astrolabe SVG element
│   ├── HeroWheel.tsx            — decorative hero SVG (purely presentational)
│   └── landing/                 — PreviewLanding landing-page composition
└── lib/
    ├── astro-calc.ts            — full VSOP87 + ELP2000 calculation engine
    ├── synastry-calc.ts         — inter-aspect computation + composite chart builder
    ├── interpretation-engine.ts — structured reasoning layer between calc and Claude
    ├── prompts.ts               — system prompts (v10.4; SHARED_RULES prompt-cached)
    ├── reading-cache.ts         — Upstash Redis KV cache (30-day TTL)
    ├── reading-quality-gate.ts  — post-generation evaluator + single repair pass for readings
    ├── route-rate-limiter.ts    — Redis-backed per-route rate limiter (falls back to in-memory)
    ├── cusps.ts                 — astrological cusp data and detection
    ├── jpl-horizons.ts          — JPL Horizons DE440 Pluto fetch with module-level cache
    ├── planet-descriptors.ts   — planet descriptor text for all reading types (incl. synastry)
    ├── zodiac-constants.ts      — centralised ZODIAC_SIGNS array (shared source of truth)
    ├── analytics.ts             — PostHog thin wrapper (no-op when key absent)
    └── tz.ts                    — DST-aware UTC offset from IANA timezone name
```

### Chart Calculation

Both Tropical and Sidereal charts use **Whole Sign houses** throughout — for planet assignments, the chart wheel, and the interpretation engine. The MC (Midheaven) is computed separately as the ecliptic projection of the meridian and is displayed as an independent angle, not as the 10th-house cusp.

### Interpretation Engine

`lib/interpretation-engine.ts` sits between raw chart data and the Claude prompt. For each section it derives first-principles facts — essential dignity, sign modification, house environment, dispositor chain, aspects with applying/separating status, and a weighted evidence block for psychological axes (attachment/detachment, emotional suppression, etc.) — and formats them as a structured context block injected into every reading request.

The evidence-weighted approach (rather than categorical rules) means Claude receives the chart evidence, not pre-formed verdicts. For example, the Moon cross-reference for Sun and Mars sections lists specific attachment and detachment indicators with their weights, then states the evidence balance — so the interpretation can name the genuine tension rather than defaulting to a sign-element cliché.

### Reading Generation

Four reading types, each composed of sequential per-planet streaming requests to the Claude API. Per-section retry (2 attempts) prevents a single failed request from blocking the rest of the reading. Failed sections produce a visible placeholder so the readable portions remain intact.

Each reading passes through a server-side **quality gate** (`lib/reading-quality-gate.ts`): the first-pass generation is evaluated, and if it fails the rubric a single repair pass is run before the text reaches the client — within a wall-clock budget so the route stays under its `maxDuration`. Only validated (non-truncated, gate-passing) output is written to the cache.

1. **Tropical** — psychological interior, sign positions and psychological meaning. Sections: Sun, Moon, Ascendant, Mercury, Venus, Mars, Jupiter/Saturn, Key aspects, Rahu/Ketu.
2. **Sidereal** — incarnational patterning, karmic emphases, nakshatras. Sections: Lagna, Sun, Moon, Mercury, Venus, Mars, Jupiter/Saturn, Rahu/Ketu.
3. **The Divergence** (legacy internal reading-type identifier: `synthesis`, kept for cache-key stability) — Concordance, Where They Part, Central Tension, Living the Divergence. Its context block includes thematic concordance/divergence analysis: element continuity, dignity direction concordance, dispositor chain convergence, and house domain analysis. The reading names where the systems agree and where they pull apart; it never averages the two charts into one answer.
4. **Synastry** — inter-chart compatibility reading for two people. `synastry-calc.ts` computes inter-aspects (orb-limited, 5 major aspects) and a midpoint composite chart from both natal charts. For the composite-focused sections (`composite_chart`, `integration`), an elite chart block for the composite — dignity labels, chart ruler, and direction — is appended to the prompt context alongside the position table. The `/api/synastry` route handles calculation; `SynastryReadingPanel` streams the interpretation.

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

Both API routes set their `maxDuration` via `export const` in the route file itself — `/api/reading` declares 60 s (the Vercel Hobby ceiling), `/api/calculate` declares 30 s (covers the Horizons API call plus chart computation). This is the canonical Next.js App Router pattern; `vercel.json` only declares the framework.

---

## Production hardening notes

This section describes what is hardened now and what requires distributed infrastructure for true production scale.

**Hardened (current state):**
- **HTTP security headers** applied to every route via `next.config.js` `headers()`: a scoped Content-Security-Policy (`default-src 'self'`, `frame-ancestors 'none'`, `object-src 'none'`, `base-uri 'self'`, allow-listed to the app's real external surface — PostHog and Vercel Insights), plus `X-Frame-Options: DENY`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `Permissions-Policy` (camera/microphone/geolocation denied), and `Strict-Transport-Security` (2-year HSTS with `includeSubDomains; preload`)
- `/api/reading` validates section and planetSection against explicit allow-lists before processing
- `/api/reading` recomputes chart positions server-side from validated birth data rather than trusting client-supplied positions, preventing cache poisoning via forged planet data
- `/api/reading` enforces a 16 KB payload size limit
- `/api/reading` applies a Redis-backed per-IP rate limiter (20 req / 60s fixed window via Upstash, with an atomic Lua INCR+EXPIRE; in-memory fallback when Redis env vars are absent)
- `/api/calculate` and `/api/synastry` enforce a 16 KB payload size limit with explicit JSON parse guard (reject oversized or malformed bodies before any processing)
- `/api/calculate` applies a Redis-backed per-IP rate limiter (30 req / 60s); `/api/synastry` applies 20 req / 60s
- `/api/geocode` enforces a 200-character query length limit and a Redis-backed per-IP rate limiter (30 req / 60s); results are field-whitelisted rather than forwarding raw Nominatim output
- `/api/timezone` applies a Redis-backed per-IP rate limiter (60 req / 60s) so the offline lookup cannot be used as an unbounded compute or scraping surface
- All internal error messages are scrubbed from client-facing responses (server-side logging only)
- Per-section streaming retry (2 attempts) with visible failure fallback
- Truncated responses (`stop_reason: max_tokens`) are not cached and surface an inline notice to the user
- **Reading cache:** Upstash Redis via REST API (`@upstash/redis`). Persists across cold starts and is shared between concurrent serverless instances. 30-day TTL. Requires `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN` env vars; falls back to no-op when absent.

**Distributed — no warm-instance bypass:**
- **Rate limiter:** Redis-backed fixed window via Upstash (same connection as the reading cache). All serverless instances share a single counter per IP, so the 20 req / 60s limit is enforced globally. Falls back to the previous in-memory behaviour when Redis env vars are absent.

**External service dependencies:**
- Anthropic API — one call per planet section, 8–9 calls per full reading. Each full reading costs approximately 8–9 × (Claude output tokens × price per token). API key must be set in Vercel environment variables.
- JPL Horizons (`ssd.jpl.nasa.gov`) — one HTTP call per chart calculation for the Pluto position. Falls back to the local Meeus Ch. 37 polynomial (~15–60 arcmin vs DE440 across 1930–2025; see [BENCHMARK.md](BENCHMARK.md)) if unreachable.
- OpenStreetMap Nominatim — geocoding for birth location. Subject to Nominatim usage policy (1 req/s, no bulk use).

---

## Known limitations and accuracy notes

- **Pluto** uses JPL Horizons DE440 (< 1 arcsecond) when available. If the Horizons API is unreachable at chart calculation time, the engine falls back to the local Meeus Ch.37 polynomial (full 43-term table via `astronomia/pluto`; ~15–60 arcminutes vs DE440) and the chart header displays "⚠ local fallback." The fallback is noted so users know the accuracy tier their chart used. See [BENCHMARK.md](BENCHMARK.md).
- **Rahu/Ketu** use the **true (osculating) lunar node** — Meeus Ch. 22 mean node plus 4 dominant periodic correction terms. Matches Swiss Ephemeris to <0.05° over 1900–2100. The node oscillates ±1.5° around the mean with a ~173-day period; the position given is the instantaneous osculating node.
- **Lahiri ayanamsa** is computed via a linear precession formula. Difference from the full polynomial calculation is < 0.01° for dates 1900–2100.
- **Birth time** accuracy directly affects Ascendant, MC, house placements, Moon degree, and dasha timing. AXIS flags this explicitly in the UI when time is unknown.
- **JPL Horizons availability:** AXIS requires one outbound HTTP call to `ssd.jpl.nasa.gov` per chart calculation for the Pluto position. If the endpoint is unreachable (downtime, network policy), the fallback engine activates transparently.

---

## Roadmap

- [x] Guides page — how to read each system, what The Divergence means
- [x] Synastry reading — inter-aspects + midpoint composite chart for two people
- [ ] Swiss Ephemeris for Pluto (requires dedicated compute layer outside Vercel)
- [ ] Monetisation gate — free chart generation, paid ongoing access
- [ ] Dasha timeline view — visualise active Jyotish planetary periods
- [ ] Save / share reading — persistent URL for generated readings
