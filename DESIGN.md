---
version: alpha
name: AXIS Dual-System Astrology
description: Precision celestial instrumentation for a dual-system astrology product that keeps Tropical and Sidereal distinct and makes their divergence visible.
colors:
  void: "#02030A"
  background: "#030212"
  deep: "#0A090C"
  surface1: "#0C0B0E"
  surface2: "#131114"
  surface3: "#1A171B"
  readingSurface: "#061230"
  border: "#1A1940"
  borderStrong: "#282660"
  borderBright: "#3E3C80"
  text: "#EAE8F8"
  textSecondary: "#A8A4C8"
  textTertiary: "#9490C4"
  textMuted: "#625E90"
  copper: "#B87333"
  copperBright: "#D89455"
  copperLight: "#F0B978"
  copperDim: "#5A2F18"
  cyan: "#2CC8C0"
  cyanDim: "#0A4845"
  violet: "#7844FF"
  violetLight: "#C8B3FF"
  danger: "#DC4040"
  dangerText: "#E07070"
  success: "#4AA840"
  info: "#4A90D4"
typography:
  wordmark:
    fontFamily: Cinzel
    fontSize: 64px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.16em
  heroThesis:
    fontFamily: Cormorant Garamond
    fontSize: 52px
    fontWeight: 400
    lineHeight: 1.08
    letterSpacing: -0.01em
  sectionTitle:
    fontFamily: Cormorant Garamond
    fontSize: 36px
    fontWeight: 400
    lineHeight: 1.15
    letterSpacing: 0em
  readingTitle:
    fontFamily: Cormorant Garamond
    fontSize: 30px
    fontWeight: 500
    lineHeight: 1.2
    letterSpacing: 0em
  body:
    fontFamily: Cormorant Garamond
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.75
    letterSpacing: 0em
  reading:
    fontFamily: Cormorant Garamond
    fontSize: 18px
    fontWeight: 400
    lineHeight: 1.9
    letterSpacing: 0em
  uiLabel:
    fontFamily: Courier Prime
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1.3
    letterSpacing: 0.14em
  telemetry:
    fontFamily: Courier Prime
    fontSize: 12px
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: 0.08em
  buttonLabel:
    fontFamily: Courier Prime
    fontSize: 11px
    fontWeight: 700
    lineHeight: 1
    letterSpacing: 0.12em
spacing:
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  xxl: 48px
  section: 80px
  major: 120px
rounded:
  none: 0px
  micro: 2px
  pill: 9999px
components:
  primaryButton:
    background: "{colors.copper}"
    text: "{colors.void}"
    border: "{colors.copper}"
    typography: "{typography.buttonLabel}"
  secondaryButton:
    background: "{colors.void}"
    text: "{colors.text}"
    border: "{colors.copperBright}"
    typography: "{typography.buttonLabel}"
  activeControl:
    text: "{colors.cyan}"
    border: "{colors.cyan}"
    typography: "{typography.uiLabel}"
  readingPanel:
    background: "{colors.readingSurface}"
    text: "{colors.text}"
    border: "{colors.border}"
    typography: "{typography.reading}"
---

# AXIS Design System

## Overview

AXIS is not a conventional horoscope app. It is a precision reading instrument for people who take astrology seriously enough to care about methodology, calculation provenance, and interpretive discipline.

The central product idea must be visible in the interface: **Tropical and Sidereal are two distinct frames. The divergence between them is the product.** Never visually collapse them into a single answer, a blended identity, or a resolved truth.

The desired feeling is **celestial instrumentation rebuilt as live telemetry**: dark, exact, intelligent, slightly uncanny, and premium without becoming ornamental. Think mission control viewing an astrolabe, not a velvet-draped fortune-teller table. The product can feel mysterious, but it must never feel vague.

The visual identity is built from four forces:

1. **Void** — near-black ground, silence, negative space, restraint.
2. **Copper** — identity, ritual, calibrated emphasis, geometric offset.
3. **Cyan** — live computation, focus, selection, streaming, active state.
4. **Violet** — contradiction, dissonance, unresolved interpretive tension.

The interface should feel deliberately authored rather than assembled from generic SaaS cards. Use typography, alignment, hairlines, measurement marks, data readouts, and negative space to establish hierarchy before reaching for containers.

### Brand personality

- Precise, serious, literate, restrained.
- Technical without looking like developer tooling.
- Mystical without fantasy kitsch.
- Editorial without looking like a magazine template.
- Premium without glossy gradients or oversized luxury clichés.
- Dense where the information is technical; spacious where the user is meant to contemplate.

### Target experience

The user should feel that they are **calibrating an instrument, observing a measurement, then opening a dossier**. The journey is not “fill in a form → receive content.” It is:

**orientation → calibration → computation → frame shift → reading → divergence**.

### Product doctrine that design must preserve

- Tropical and Sidereal never merge, reconcile, harmonise, or resolve into one truth.
- The third reading is always named **The Divergence**.
- “Offset” is geometric only: the live Lahiri angular quantity.
- The results experience uses **one frame-shift wheel**, not two functional wheels side by side.
- One reading panel follows the active Tropical/Sidereal frame.
- Positional data for both systems remains visible in every state through the readout table and persistent offset indicator.
- The Divergence is frame-independent and always appears below the frame-specific reading.
- The production results wheel uses the **Stellar** treatment only.
- Sign-boundary cusp mysticism is not part of AXIS and should never appear as a visual feature.

## Colors

The palette is deliberately narrow. Most screens should be visually dominated by the void, star-white text, and thin neutral/copper geometry. Accent colors are semantic, not decorative.

### Ground and surfaces

- **Void `{colors.void}`** is the page floor. It should read almost black, not obviously blue.
- **Background `{colors.background}`** is a secondary near-black blue-black used only where a tiny tonal distinction helps.
- **Deep / Surface 1–3** are neutral lifted tiers. Do not create raised surfaces by simply lightening the blue-black floor; that turns the product into a generic navy dashboard.
- **Reading Surface `{colors.readingSurface}`** is a deliberate exception for sustained long-form reading. Use it behind reading prose so the dossier is comfortable to read for several minutes.

### Copper hierarchy

Copper is the primary AXIS identity accent.

- **Base copper `{colors.copper}`**: wordmark detail, primary CTA fill, major section rituals, symbolic emphasis, the Lahiri offset wedge/arc.
- **Bright copper `{colors.copperBright}`**: 1px hairlines, chart ticks, tiny mono labels, fine geometry on void.
- **Light copper `{colors.copperLight}`**: rare high-contrast fine detail, active pinpoints, or delicate glow edges.
- **Dim copper `{colors.copperDim}`**: subdued borders, inactive copper geometry, shadowed emphasis.

**Never use base copper for tiny 1px lines on the void. It is too low-contrast. Fine linework must use bright or light copper.**

### Cyan

Use cyan only when something is **live, active, selected, calculating, focused, or streaming**. It is not a second brand color.

Good uses:
- active Tropical/Sidereal frame state;
- focus ring;
- live calculation status;
- active planet or selected row;
- streaming/progress indicator;
- current measurement point.

Bad uses:
- decorative section headings;
- large backgrounds;
- general illustration color;
- passive icons.

### Violet

Violet marks **unresolved tension**. Reserve it for contradiction, dissonance, and the liminal conceptual territory of The Divergence. It should be rarer than cyan.

### Text

- Primary: `{colors.text}`.
- Support: `{colors.textSecondary}`.
- Metadata and labels: `{colors.textTertiary}`.
- De-emphasised technical text: `{colors.textMuted}`.

Normal text must remain WCAG AA legible. Tiny labels are allowed only for non-essential instrument annotation; anything the user needs to understand or act on should be at least 12px equivalent with adequate contrast.

### Background atmosphere

A faint starfield, orbital arcs, sparse constellation geometry, and low-opacity grain can exist as environmental texture. They must behave like atmosphere, not content.

- Keep stars sparse and low contrast behind text.
- Constellation lines may be barely visible.
- Never place readable constellation names or strong silhouettes behind body copy.
- Copper orbital arcs should be extremely faint and peripheral.
- Grain should be subtle enough to disappear at a glance.

## Typography

AXIS uses exactly three typographic voices.

### 1. Cormorant Garamond — interpretation and thesis

Cormorant Garamond carries the intellectual and editorial voice. Use it for:

- hero thesis;
- section titles;
- long-form reading prose;
- interpretive statements;
- elegant large-number or pull-quote moments where appropriate.

Long-form reading text should feel book-like but not archaic. Maintain generous line-height and a readable measure.

### 2. Courier Prime — instrument chrome

Courier Prime carries the operating system of AXIS:

- navigation;
- buttons;
- labels;
- coordinates;
- timestamps;
- offset values;
- technical metadata;
- table headers;
- ephemeris provenance;
- status and loading language.

Uppercase is appropriate for short labels, but avoid entire paragraphs in uppercase.

### 3. Cinzel — trace identity only

Cinzel is a trace element, not the default display font. Restrict it to:

- the AXIS wordmark;
- the three conceptual movement labels when a ceremonial marker is useful: TROPICAL, SIDEREAL, THE DIVERGENCE.

Do not use Cinzel across ordinary headings, body text, forms, cards, or navigation. Overuse makes the product look antique and theatrical.

### Reading typography

The dossier is a reading experience, not dashboard microcopy.

- Target measure: roughly **60–68 characters per line**.
- Reading line-height: **1.8–1.9**.
- Use primary star-white text on the reading-surface navy.
- Paragraph spacing should be generous enough to breathe but should not fragment continuous analytical prose into cardlets.
- Avoid bullet-heavy interpretation. Readings are continuous analytical prose.

## Layout

### Global grid

Desktop should feel architectural rather than centered-card generic.

- Max content width: approximately **1280–1360px**.
- Primary horizontal padding: **48–72px desktop**, **24–32px tablet**, **18–20px mobile**.
- Use a 12-column mental grid on desktop.
- Prefer asymmetric splits such as 5/7 or 7/5 when they create productive tension.
- Major sections should use large vertical intervals, typically **80–120px**.
- Hairline rules may extend farther than the body copy to make sections feel instrument-like.

### Landing / home composition

The home screen should establish the thesis before asking for birth data.

**Hero**
- Left: AXIS wordmark, small “DUAL-SYSTEM ASTROLOGY” label, thesis, concise explanatory lede, two CTAs, technical microcopy.
- Right: a large celestial instrument visual. On the landing page, a dual-ring explanatory instrument is allowed because it communicates the relationship between the two zodiacs before a personal chart exists.
- The instrument should feel like a working measurement device: ticks, degree marks, offset wedge, sparse stars, precise annotation.
- Preserve meaningful negative space around the wheel. Do not cram it into a card.

**Two Maps section**
- Present Tropical and Sidereal as parallel but unequal columns separated by a strong `≠` or equivalent visual tension marker.
- The layout must communicate distinction without implying opposition, “good vs bad,” or “inner vs outer.”

**Calibration section**
- The birth form should feel like instrument calibration, not account signup.
- Keep the form visually integrated with the page using rules and dark surfaces rather than a floating rounded card.
- Include clear technical helper copy around location/time accuracy.

### Results composition

This is the most important AXIS screen.

1. **Dossier header / chart identity**
   - Name or neutral chart identifier.
   - Birth data summary and location.
   - Ephemeris provenance as quiet mono metadata.
   - Avoid excessive personal-data prominence.

2. **Frame-shift instrument**
   - One large functional wheel.
   - A Tropical/Sidereal segmented control or two-state switch lives close to the wheel.
   - Switching frames rotates the zodiac band by the live Lahiri ayanamsa rather than replacing the whole interface.
   - The rotation is the signature interaction and should be visually legible.
   - A persistent `Δ / LAHIRI OFFSET` chip remains visible in both states.
   - The active state is cyan; the offset geometry is copper.

3. **Always-visible dual readout**
   - Every body has Tropical and Sidereal positions plus a delta/change indication.
   - Never hide the inactive system’s positional data.
   - The table should feel like an instrument readout: compact, highly aligned, mono labels, precise rules, no rounded data cards.

4. **Single active-frame reading panel**
   - One reading column, not two side-by-side reading columns.
   - Tropical frame shows Tropical reading sections.
   - Sidereal frame shows Sidereal reading sections.
   - Use the raised reading surface and editorial typography.

5. **The Divergence**
   - Full-width or visually dominant below the frame-specific reading.
   - Never toggles off.
   - May use a sparse violet signal alongside copper geometry to communicate unresolved tension.
   - It should feel like the culmination of the dossier, not another tab.

6. **Exit / repeat action**
   - “Cast another chart” should be secondary and quiet after the reading.

### Method page

Treat methodology like a technical field manual.

- Strong thesis opening.
- Clear Tropical / Sidereal / Divergence conceptual separation.
- Measurement diagrams and source notes are welcome.
- Tables should be precise, flat, and legible.
- Avoid turning the method into a marketing benefits page.

### Sample dossier

The sample should resemble the actual reading result, not a promotional mock card.

- Use real-looking structural hierarchy without inventing testimonials, ratings, usage numbers, or social proof.
- Emphasise reading comfort and the frame-shift concept.

### Synastry

Synastry should remain inside the AXIS instrument language rather than switching to romance-app visual tropes.

- Two subject identifiers may be represented with neutral technical markers.
- Use connection/aspect geometry rather than hearts.
- Preserve copper/cyan/violet semantics.
- Keep composite or inter-aspect evidence visually subordinate to the core analysis rather than turning the page into a compatibility score dashboard.

### Responsive behaviour

Mobile must preserve the conceptual order even when the geometry compresses.

- Stack hero copy above the instrument.
- Keep the wheel large enough to remain legible; allow it to approach viewport width.
- Make the frame control sticky or easy to recover when useful, but do not obscure reading content.
- The dual readout may horizontally scroll if necessary rather than deleting a system column.
- Reading prose should remain single-column with comfortable side padding.
- Reduce decorative stars and peripheral orbital geometry before reducing functional labels.

## Elevation & Depth

AXIS is fundamentally flat. Depth is produced through **tonal layering, borders, local glow, and negative space**, not generic card shadows.

### Allowed depth

- Reading surface lifted from the void with a darker-navy tonal difference.
- Very soft ambient copper glow around rare active symbolic moments.
- Cyan glow around a live focus/measurement point.
- Subtle deep shadow only when a raised panel truly needs separation from an overlapping surface.

### Avoid

- Material-style elevation stacks.
- Soft floating cards everywhere.
- Glassmorphism.
- Frosted blur panels.
- Neon bloom around every accent.
- Thick drop shadows used as the primary hierarchy mechanism.

The chart wheel and most chrome should feel etched into or suspended over the void.

## Shapes

The shape language is **instrument-grade sharpness**.

- Default radius: **0px**.
- Micro radius: **2px** only where browser ergonomics benefit, such as tiny controls or scrollbars.
- Pill shapes are reserved for true chips/status indicators such as `Δ 24°13′` or a compact frame-state control.
- Inputs, panels, tables, and buttons should otherwise remain square or nearly square.
- Use circles because the chart itself is circular, not as a general UI motif.

### Linework

- Hairlines: 1px.
- Major rules: approximately 1–1.5px.
- Fine copper geometry uses bright/light copper.
- Neutral rules use border tokens or low-opacity star-white.
- Dashed lines are acceptable for measurement leaders, orbital references, and technical annotations.

Do not mix highly rounded SaaS components with the sharp instrument language.

## Components

### Site header

- Sparse and thin.
- AXIS wordmark at left.
- Method, Sample, Synastry and relevant navigation in mono labels.
- One restrained primary action at most.
- Prefer a hairline bottom rule over a filled navigation bar.
- On mobile, keep the header compact and do not let navigation overpower the instrument.

### Primary button

- Base copper fill.
- Void text.
- Sharp corners.
- Courier Prime uppercase label.
- Comfortable target size despite the technical aesthetic.
- Hover may brighten copper slightly or reveal a fine copper-light edge.
- Focus state uses cyan, clearly visible.

### Secondary button

- Void or transparent background.
- Bright-copper hairline border.
- Star-white label.
- On hover, use a restrained copper-tinted fill rather than glow-heavy treatment.

### Text link

- Mono or editorial depending on context.
- No default bright blue web-link treatment.
- Use copper-bright for deliberate navigational emphasis; cyan only when the link represents an active state.

### Birth form

The form is calibration hardware.

- Labels in mono uppercase.
- Inputs on neutral dark surfaces with 1px borders.
- Avoid oversized rounded fields.
- Focus border/ring in cyan.
- Error text uses accessible danger text, not just a red border.
- Birth-time-unknown control should be explicit and explain the consequences for Ascendant/houses rather than behaving like a casual checkbox.
- Location suggestions should look like a technical lookup list.

### Loading state

Loading is a **calibration ritual**, not a generic spinner.

Suggested staged language:
- resolving coordinates;
- calculating houses;
- aligning dual map;
- preparing both frames;
- opening dossier.

Use subtle telemetry motion, a thin rotating or aligning orbital marker, and cyan active-state signals. Do not use playful skeleton cards.

### Frame toggle

This control drives the signature result interaction.

- Two states: TROPICAL and SIDEREAL.
- Active state uses cyan.
- Inactive state remains visible, star-white/tertiary.
- The Lahiri offset chip is visually coupled but not a third toggle state.
- Switching should trigger the frame-shift rotation.
- Under `prefers-reduced-motion`, update instantly while preserving static offset geometry.

### Frame-shift wheel

The results wheel is the central instrument.

- One wheel only.
- Stellar treatment only.
- Zodiac band rotates between Tropical and Sidereal frames.
- Planet markers, houses, axis labels, MC marker, and offset arc must remain legible without becoming rainbow-coded.
- Copper shows identity/offset geometry.
- Cyan shows the active/selected/live measurement.
- Tiny annotations use Courier Prime.
- Avoid curved decorative text around rings.
- Avoid Latin filler or antique inscriptions.

### Dual readout table

- Dense but calm.
- Columns: body, Tropical, Sidereal, delta/change marker as required by the live data model.
- Fixed numeric alignment.
- Mono typography for positions and metadata.
- Use thin rules rather than boxed cells.
- Selected/active row may gain a cyan keyline or small cyan point, not a full saturated row fill.

### Reading panel

- Background `{colors.readingSurface}`.
- Max prose measure around 65ch.
- No card-per-paragraph layout.
- Section titles in editorial type.
- Small mono technical header can identify the active frame.
- Retry/error state should be visible but not destroy already successful reading sections.
- Streaming may use a minimal cyan cursor/status cue.

### The Divergence panel

The Divergence is the conceptual culmination.

- It should feel more consequential than a standard section but not like a marketing hero.
- Use full-width composition, stronger typographic hierarchy, and a copper ritual rule.
- A restrained violet cue may mark contradiction or unresolved tension.
- Never visually imply that the section “solves” the two charts.
- Avoid labels such as Synthesis, Integration, Unified Reading, Combined Chart, Complete Picture, or Final Truth.

### Dossier metadata / provenance

- Courier Prime.
- Small but legible.
- Treat JPL/VSOP/ELP provenance as trust-building instrumentation rather than fine-print legal copy.
- Use separators such as centered dots, rules, or aligned columns.

### Tables

- No rounded table container required.
- Thin horizontal rules and strong column alignment.
- Header labels in mono uppercase.
- Body may mix editorial names with mono measurements.
- Highlight exceptional values with a single semantic accent, not heatmap rainbow colors.

### Tooltips

- Dark neutral surface.
- 1px bright-copper or neutral border.
- Short mono label plus concise editorial explanation if needed.
- Appear quickly and disappear cleanly; they should feel like instrument annotations.

### Footer

- Technical, sparse, and aligned.
- May include Lahiri offset reference, ephemeris methods, “NO HOROSCOPES · NO PREDICTIONS,” and route links.
- Avoid newsletter-marketing clutter unless the product actually gains that feature.

## Do's and Don'ts

### Do

- Do make the Tropical/Sidereal distinction visually obvious at all times.
- Do make the **frame shift** the signature interaction of the results page.
- Do keep the live Lahiri offset visible whenever a chart is being interpreted.
- Do use copper with restraint and purpose.
- Do use cyan for active computation, selection, focus, and streaming.
- Do reserve violet for meaningful dissonance.
- Do use bright/light copper for tiny linework on the void.
- Do prioritise typographic hierarchy, grid, rules, and negative space over card containers.
- Do let technical metadata strengthen trust.
- Do make long-form reading materially more comfortable than the surrounding chrome.
- Do preserve accessible contrast and usable tap targets even when the aesthetic is minimal.
- Do make motion look like telemetry: rotations, alignment, measurement, acquisition, focus.
- Do degrade gracefully under reduced-motion preferences.
- Do keep the interface premium through precision rather than decoration.

### Don't

- Don't use gold. Copper is the ratified primary accent.
- Don't create copper-to-cyan, copper-to-violet, or multi-accent gradients.
- Don't use generic purple/blue “astrology app” gradients.
- Don't use glassmorphism, frosted cards, bubbly rounded panels, or soft SaaS shadows.
- Don't cover the page in cards when rules and spacing can create hierarchy.
- Don't use giant copper blobs or large saturated accent backgrounds.
- Don't use antique parchment, zodiac wallpaper, tarot-table styling, candles, crystals, velvet, or fortune-teller clichés.
- Don't overuse Cinzel or decorative serif typography.
- Don't put readable constellation labels behind body content.
- Don't use curved ring text as decoration.
- Don't use hearts or romance-app motifs for synastry.
- Don't show Tropical and Sidereal as two functional results wheels side by side.
- Don't use a two-column Tropical/Sidereal reading layout.
- Don't hide the inactive system’s positional data.
- Don't turn The Divergence into a third toggle state.
- Don't call the third reading Synthesis, Integration, The Gap, Combined Reading, or Unified Reading.
- Don't imply the two systems resolve into one complete answer.
- Don't invent testimonials, star ratings, user counts, reviews, or social proof.
- Don't create compatibility scores or reductive “X% match” UI unless the underlying product explicitly introduces a defensible model for it.
- Don't reintroduce named sign-boundary cusp features.
- Don't let decorative atmosphere compete with data, reading text, or controls.

The final test for any AXIS screen is simple: **does it look like a precise instrument holding two frames open at once, or like a generic astrology website wearing a dark theme?** Only the first passes.