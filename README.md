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

Readings are 850–1000 words per section, written in continuous analytical prose. No bullet points. No generic affirmations. No predictions. Every sentence earns its place.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 14 (App Router) |
| Language | TypeScript |
| AI backend | Anthropic Claude (claude-opus-4) via streaming API |
| Chart calculations | Pure TypeScript astronomical engine — no external ephemeris dependency |
| Geocoding | OpenStreetMap Nominatim |
| Deployment | Vercel |
| Fonts | Cormorant Garamond · Space Mono |

---

## Architecture

```
src/
├── app/
│   ├── page.tsx                 — main app shell, form → chart → reading flow
│   ├── globals.css              — design system tokens (midnight blue palette)
│   ├── page.module.css          — layout styles
│   └── api/
│       ├── calculate/           — chart calculation endpoint (Tropical + Sidereal)
│       └── reading/             — Claude streaming endpoint
├── components/
│   ├── BirthForm.tsx            — date/time/location input with geocoding
│   ├── ChartWheel.tsx           — SVG dual chart wheel renderer
│   └── ReadingPanel.tsx         — streaming reading display with section tabs
└── lib/
    ├── astro-calc.ts            — full astronomical calculation engine
    └── prompts.ts               — production system prompts (v4.0)
```

### Chart Calculation

Calculations are performed entirely in TypeScript using VSOP87-derived algorithms — no pyswisseph, no external API dependency. Produces accurate planet longitudes, house cusps (Whole Sign), Ascendant, and Midheaven for both systems simultaneously.

Sidereal positions are derived from Tropical using the Lahiri ayanamsa (~23.85° as of 2025), the standard ayanamsa in Jyotish.

### Reading Generation

Three separate streaming requests to the Claude API, each with a distinct system prompt:

1. **Tropical prompt** — instructs the model to read only the psychological interior, using exact placements translated into concrete psychological meaning. No folklore, no generic sign descriptions.
2. **Sidereal prompt** — instructs the model to read only the karmic exterior and material life trajectory. No inner psychology, no personality description.
3. **Synthesis prompt** — runs three interpretive operations in sequence: Concordance (where both systems confirm the same truth), Dissonance (where they pull in opposite directions — these are growth axes, not errors), and Integration (how this particular interior navigates this particular exterior).

The synthesis closing line is held to a specific standard: the sharpest observation in the entire reading, naming the navigation mechanism of this person's specific tension — not in general terms, as the exact lived mechanism.

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

Do not add a `functions` block to `vercel.json` for Next.js App Router — it conflicts with the framework's native function handling.

---

## Roadmap

- [ ] Monetisation gate — free chart generation, paid ongoing access
- [ ] Guides page — how to read each system, what the synthesis means
- [ ] Dasha timeline view — visualise active Jyotish planetary periods
- [ ] Compatibility synthesis — dual-system chart overlay for two people
- [ ] Save / share reading — persistent URL for generated readings
