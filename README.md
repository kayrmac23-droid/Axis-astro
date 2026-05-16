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
| Lunar nodes | Mean node | Jyotish convention; Rahu/Ketu as mean ascending node (true node ≈ ±1–2° different) |
| Dasha system | Vimshottari | Used for current-chapter contextualisation, not event prediction |
| Midheaven | Shown as separate angle | MC is NOT the Whole Sign 10th-house cusp — displayed independently on the wheel |

**Birth time sensitivity:** Ascendant, house placements, MC, Moon degree, and dasha timing all depend on an accurate birth time. AXIS flags readings with an unknown birth time and discloses which elements are unreliable.

---

## Calculation accuracy

AXIS uses the `astronomia` package, which implements full **VSOP87** planetary theory and **ELP2000** lunar theory. These are the same algorithms used in professional desktop astrology software.

| Body | Method | Accuracy (1800–2050) |
|---|---|---|
| Sun | VSOP87 via `solar.apparentVSOP87` (nutation + aberration included) | < 1 arcsecond |
| Moon | ELP2000 + nutation correction | < 10 arcseconds |
| Mercury–Neptune | VSOP87 heliocentric + geocentric conversion + light-time + nutation | < 1 arcminute |
| Pluto | Meeus Chapter 37 polynomial series | ~0.3° (18 arcminutes) |
| Rahu/Ketu | Mean node formula (Meeus Ch. 24) | ± 0.1° vs. mean node; ≤ 2° vs. true node |
| Lahiri ayanamsa | Linear precession formula | Within ~0.01° of the IAU reference value |

**Pluto limitation:** The Meeus polynomial for Pluto is accurate to ~0.3°. This is adequate for sign assignment (signs are 30° wide) and house assignment (same) but should be noted for chart positions near sign boundaries. All other planets use full VSOP87 accuracy.

### Why not Swiss Ephemeris?

The Swiss Ephemeris (via the `swisseph` Node.js package) provides JPL DE431 accuracy (< 1 arcsecond for Pluto). However, it requires native binary compilation, which is incompatible with standard Vercel serverless function deployments. The ephemeris data files are also 30–180MB depending on scope, exceeding Vercel's function bundle limits.

For teams wanting Swiss Ephemeris accuracy for Pluto specifically, the practical architecture is: a dedicated compute API (long-running server or container) that wraps `swisseph` and exposes a calculation endpoint, with AXIS calling it. This is viable but requires infrastructure outside the current Vercel model. For the 10 planets calculated via VSOP87/ELP2000, the current engine is already at the same accuracy as Swiss Ephemeris.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| AI backend | Anthropic Claude (`claude-opus-4-5`) via streaming API |
| Planetary calculations | VSOP87 (astronomia package) + ELP2000 Moon + Meeus Pluto |
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
    ├── prompts.ts               — system prompts (v9.0)
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
npm run dev
```

App runs at `http://localhost:5000`.

---

## Deployment

Deployed via Vercel connected to this GitHub repo. Every push to `main` triggers an automatic production deployment.

Do not add a `functions` block to `vercel.json` for Next.js App Router — it conflicts with the framework's native function handling. The existing config only sets `maxDuration` for the reading route (60s).

---

## Known limitations and accuracy notes

- **Pluto** position has ~0.3° maximum error from the Meeus polynomial. For all other planets, accuracy is < 1 arcminute (VSOP87).
- **Rahu/Ketu** use the **mean lunar node**, which is the Jyotish convention. The true node differs by up to ≈2°.
- **Lahiri ayanamsa** is computed via a linear precession formula. Difference from the full polynomial calculation is < 0.01° for dates 1900–2100.
- **Birth time** accuracy directly affects Ascendant, MC, house placements, Moon degree, and dasha timing. AXIS flags this explicitly in the UI when time is unknown.

---

## Roadmap

- [ ] Swiss Ephemeris for Pluto (requires dedicated compute layer outside Vercel)
- [ ] Monetisation gate — free chart generation, paid ongoing access
- [ ] Guides page — how to read each system, what the synthesis means
- [ ] Dasha timeline view — visualise active Jyotish planetary periods
- [ ] Compatibility synthesis — dual-system chart overlay for two people
- [ ] Save / share reading — persistent URL for generated readings
