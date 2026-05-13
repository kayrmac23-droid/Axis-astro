# AXIS — Precision Dual-System Astrology

> *Tropical maps your inner architecture. Sidereal maps your outer karma. The axis is their synthesis.*

Live: [axis-astro.vercel.app](https://axis-astro.vercel.app)

---

## What it is

AXIS generates natal chart readings using both the Western Tropical and Vedic Sidereal zodiac systems simultaneously — then synthesises them into a single interpretive framework.

Most astrology apps pick one system. AXIS treats them as complementary maps of different layers of a person:

- **Tropical** — the psychological interior. How your mind organises reality, emotional patterns, identity structure, internal conflicts, and the shape of your defences.
- **Sidereal** — the karmic exterior. Material life trajectory, inherited patterns, the conditions of your incarnation, and timing of events via the Jyotish dasha system.
- **Synthesis** — the only question worth asking: *how does this psychological interior navigate these particular outer karmic circumstances?* The tension between the two systems is not an error. It is the terrain.

Readings are written in continuous analytical prose. No bullet points. No generic affirmations. No predictions. Every sentence earns its place.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| AI backend | Anthropic Claude (`claude-opus-4-5`) via streaming API |
| Chart calculations | Pure TypeScript astronomical engine — no external ephemeris dependency |
| Geocoding | OpenStreetMap Nominatim |
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
│       ├── calculate/           — chart calculation endpoint (Tropical + Sidereal)
│       └── reading/             — Claude streaming endpoint
├── components/
│   ├── BirthForm.tsx            — date/time/location input with geocoding
│   ├── ChartWheel.tsx           — SVG dual chart wheel renderer
│   └── ReadingPanel.tsx         — streaming reading display with section tabs
└── lib/
    ├── astro-calc.ts            — full astronomical calculation engine
    ├── interpretation-engine.ts — structured reasoning layer between calc and Claude
    ├── prompts.ts               — system prompts (v7.0)
    ├── cusps.ts                 — astrological cusp data and detection
    └── planet-descriptors.ts   — planet descriptor text for all three reading types
```

### Chart Calculation

Calculations are performed entirely in TypeScript using VSOP87-derived algorithms — no pyswisseph, no external API dependency. Produces accurate planet longitudes, house cusps (Whole Sign), Ascendant, and Midheaven for both systems simultaneously.

Sidereal positions are derived from Tropical using the Lahiri ayanamsa (~23.85° calibrated to J2000), the standard ayanamsa in Jyotish.

### Interpretation Engine

`lib/interpretation-engine.ts` sits between the raw chart data and the Claude prompt. For each planet section it derives first-principles astrological facts — essential dignity, sign modification, house environment, dispositor chain, aspects, and contradictions — and formats them as a structured context block injected into every reading request. This means Claude interprets from a grounded scaffold rather than reconstructing facts from scratch.

### Reading Generation

Three reading types, each composed of sequential per-planet streaming requests to the Claude API:

1. **Tropical** — psychological interior, using exact placements translated into concrete psychological meaning. No folklore, no generic sign descriptions. Sections: Sun, Moon, Ascendant, Mercury, Venus, Mars, Jupiter/Saturn, key aspects.
2. **Sidereal** — karmic exterior and material life trajectory. No inner psychology, no personality description. Sections: Lagna, Sun, Moon, Mercury, Venus, Mars, Jupiter/Saturn, Rahu/Ketu.
3. **Synthesis** — three operations in sequence: Concordance (where both systems confirm the same truth), Dissonance (where they pull in opposite directions — these are growth axes, not errors), Integration (how this interior navigates this exterior), and a Closing observation.

The synthesis closing line is held to a specific standard: the sharpest observation in the entire reading, naming the exact navigation mechanism of this person's specific tension — not in general terms.

### Voice

Readings are written by the model as a precise, unsentimental analyst. The constraints are strict:

- No predictive language ("you will", "this will bring")
- No prescriptive language ("you should", "try to")
- No vague affirmations ("your sensitivity is a gift")
- No psychological framework labels (Jung, archetypes, shadow — the concepts are used, never named)
- No bullet points, no sub-headers, no summaries
- Never open with a greeting, never close with encouragement
- End on an observation, not a resolution

---

## Environment variables

| Variable | Description |
|---|---|
| `ANTHROPIC_API_KEY` | Required. Set in Vercel dashboard under project settings → Environment Variables. |

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

## Roadmap

- [ ] Monetisation gate — free chart generation, paid ongoing access
- [ ] Guides page — how to read each system, what the synthesis means
- [ ] Dasha timeline view — visualise active Jyotish planetary periods
- [ ] Compatibility synthesis — dual-system chart overlay for two people
- [ ] Save / share reading — persistent URL for generated readings
