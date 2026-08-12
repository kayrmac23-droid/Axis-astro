# AXIS DOCTRINE

The product thesis: the ~23.85° gap between Tropical and Sidereal **is the deliverable**.
It is never resolved, merged, averaged, or closed. Every line of copy serves that thesis.

## THE LAW (claim-level)

No sentence in user-facing copy or model-facing prompt text may state or imply that the
two systems resolve into one answer, one truth, or one picture.

This is the test every line is judged by. It is a claim-level test, not a word test:
copy containing none of the banned words can still fail it — "the complete picture",
"one truth", "the full story of who you are", "discover your truth" all fail THE LAW
while passing any grep.

## THE SMOKE DETECTOR (word-level)

Grep-able tripwires, when used as achieved states. Banned for the inter-system
relationship (the relationship between the Tropical and Sidereal charts):

> synthesis · synthesize · integrate · integration · merge · reconcile · resolve ·
> unify · blend · harmonize · bridge · "both truths meet"

A hit means: audit the sentence against THE LAW. It does not automatically fail — "the
tension resolves nothing" passes; "the two charts reconcile" fails. A clean grep does
NOT mean the copy passes; the grep finds candidates, THE LAW decides. **The claim-level
test:** any claim implying the two systems resolve into one answer fails, regardless of
wording.

## NAMING

The third reading is **"The Divergence"** (ratified July 2026 — supersedes both the
old "Synthesis" and the interim "The Gap"). Never "Synthesis". Never "Integration".
Never "The Gap".

**Vocabulary hierarchy (strict):**
- **Offset** = the geometric quantity only — the `24°13′ LAHIRI OFFSET` wheel callout,
  the Δ column. Never the meaning.
- **Divergence** = the meaning — the reading layer and the brand term.
- **"Gap" and "distance" are NOT product terms.** Remove them from copy where they name
  the concept. (Ordinary uses of the words in unrelated prose are fine.)

Internal identifiers (the `synthesis` reading-type key, cache keys, exported constant
names) are exempt — renaming them breaks caches and APIs for zero user-visible benefit.
The exemption covers identifiers only, never rendered or prompt-visible text, and never
CSS class names (which are renamed to the Divergence family).

## CO-VISIBILITY

No UI may hide one system while showing the other. Tropical and Sidereal are always
presented together — wheels, fact tables, readings. The Divergence is read after and below
both, because it presupposes both.

## READING SURFACE EXCEPTION

The instrument aesthetic — radius 0, hairline rules, void background, no cards, no
shadows — governs all chrome and the wheel. But the long-form reading column is
optimized for sustained reading:

- measure ~65ch
- line-height ≥ 1.6
- raised-surface navy (`#061230` family) behind text, not raw void
- body type sized for prose

Doctrine everywhere; comfort where the reading lives.

## COLOR SYSTEM (copper ratified — July 2026)

**Copper is the primary accent, ratified July 2026.** The copper→gold migration is
CANCELLED. Gold `#FFC030` is no longer canonical anywhere. There is no gold token.

| Token | Value | Role |
|---|---|---|
| `--copper` | `#B87333` | Base identity accent — wordmark, primary CTAs, the offset wedge, section rituals, symbolic emphasis |
| `--copper-bright` | `#D89455` | Fine linework, hairlines, chart ticks, small mono labels on void |
| `--copper-light` | `#F0B978` | The finest / dimmest-context lines; rare highlight or glow edge |
| `--copper-dim` | `#5A2F18` | Subdued borders, shadows |
| `--copper-glow` | `rgba(184,115,51,0.18)` | Soft ambient accent |
| `--cyan` | `#2CC8C0` | Active computation, selected state, streaming, focus |
| `--violet` | `#7844FF` | Unresolved tension, dissonance, liminal states |

Surfaces: void `#010108`, bg `#030212`. Primary text `#EAE8F8`.

**Two-tier linework rule:** base copper `#B87333` is too dim for 1px lines and tiny
type on void. ALL fine linework, hairlines, chart ticks, and small mono labels use
`--copper-bright` (or `--copper-light` for the finest/dimmest-context lines). Only
identity elements — wordmark, primary CTA fill, the offset wedge, section ritual rules —
stay base `--copper`.

No gradient may blend two accent colors (e.g. copper→cyan). Use a single-accent treatment.

## MOOD (live telemetry, not antique)

Live telemetry, not antique. Mission control, not museum. AXIS reads as spacecraft
instrumentation currently running a measurement; the classical voice is confined to the
reading prose. Cinzel is a trace element (wordmark + the three movement labels only);
mono (Courier Prime) carries all chrome; no curved ring text; no Latin blocks (one trace
line max); motion reads as telemetry (≤400ms, degrades under reduced-motion).

## PROOF (no fabrication)

No invented testimonials, user counts, ratings, or quotes anywhere in the product,
including placeholders. Proof sections ship empty until real data exists.

## WHEEL DIRECTION (forward-looking — superseded July 2026, see amendment)

The functional chart becomes a single concentric dual-ring wheel: outer ring Tropical,
inner ring Sidereal, rotated against each other by the true ayanamsa, so the gap is
visible as geometry. This replaces side-by-side wheels in a later pass.

## AMENDMENT — FRAME-SHIFT WHEEL (ratified July 2026)

This amendment records a ratified product decision and governs the results page. It
supersedes the two-wheels-side-by-side layout and the two-column reading layout.
Future runs must not "correct" the single-panel layout back to two columns.

1. **The frame-shift wheel is the reading wheel.** One wheel; a Tropical/Sidereal
   toggle rotates the zodiac band by the live Lahiri ayanamsa. The rotation IS the
   divergence, rendered kinetically. The earlier **dual-ring (two concentric rings)**
   commitment above is **retired**, as is the **two-wheels-side-by-side** layout.

2. **One reading panel, driven by the toggle.** The two-column Tropical/Sidereal
   reading layout is superseded: a single reading panel shows the active frame's
   prose (Tropical frame → Tropical sections, Sidereal frame → Sidereal sections).

3. **Co-visibility is redefined.** It is satisfied by (a) the always-rendered readout
   table — every body with its Tropical column, Sidereal column, and Δ-sign column,
   shown in *every* toggle state — and (b) the persistent Δ chip / `LAHIRI OFFSET`
   label in the toggle bar. Interpretive **prose** may follow the active frame;
   **positional data never hides.** This is the CO-VISIBILITY section applied to the
   frame-shift wheel: prose can be single-frame precisely because the positional
   readout is not.

4. **The Divergence is frame-independent.** It renders full-width below the reading
   panel, always, in every toggle state — it never swaps and never hides, because it
   presupposes both frames.

5. **Production wheel treatment is locked to Stellar.** The prototype's treatment
   picker (graticule / plate / stellar) is a prototyping control, not a user feature;
   it is removed from the UI. The implementations remain behind a `treatment` prop
   (default `stellar`) so the ruling is reversible without re-porting.

6. **The frame-shift rotation is a ratified exception to the ≤400ms telemetry-motion
   guideline** (MOOD). The shift is the signature interaction and runs longer so the
   divergence is legible in motion; under `prefers-reduced-motion` it is instant, with
   the offset still legible via the static Δ callout arc.

## SIGN-BOUNDARY CUSPS — DEREGISTERED (ratified August 2026)

Sign-boundary cusps — the named-cusp concept ("Cusp of Oscillation", "Cusp of
Power", etc.) — are DEREGISTERED. AXIS reads the divergence between Tropical and
Sidereal systems; within-system boundary mysticism is off-thesis.

PROHIBITED:
- No named sign-boundary cusps in any reading. A planet within 3° of a sign
  boundary is a normal placement in its sign, read through its house.
- No CUSP RULE, CUSP NOTE, or mandated cusp paragraph in prompts.ts or the
  interpretation engine.
- No src/lib/cusps.ts. The named-cusp data set is deleted and must not return.
- Agents must NOT re-introduce cusp naming as a "missing feature." Its absence
  is intentional and ratified.

NOT AFFECTED: House cusps (Whole Sign house boundaries) are unrelated astronomy
and remain fully in use.

RETAINED: The cross-system cusp observation — noting when a planet is
boundary-ambiguous in one system but settled in the other — is retained as
divergence content, since it reads the inter-system relationship rather than
within-system blending.

## COMPATIBILITY (SYNASTRY) — DUAL-SYSTEM BY SIGN-SHIFT OVERLAY (ratified August 2026)

Compatibility (internally "synastry") is dual-system. It was tropical-only; that
assumption is DELETED. It is now read on a TROPICAL SPINE with a SIDEREAL
SIGN-SHIFT DIVERGENCE OVERLAY (Model 3, criterion a).

THE RULING:
- The tropical inter-aspects and composite are the PRIMARY reading and are
  unchanged. Sidereal enters ONLY as an overlay that names where the sidereal
  picture diverges from the tropical one. It is NOT a second parallel synastry.
- Divergence is defined by SIGN-SHIFT and nothing else: a tropical inter-aspect
  contact is flagged divergent when either participating planet occupies a
  different sign in that person's sidereal chart than in their tropical chart.
  The overlay names that shift and what it does to the contact's meaning. The
  tropical reading stands; the two framings are left unreconciled (THE LAW).
- The aspect grid is NOT recomputed on sidereal longitudes. Aspect
  presence/absence divergence between systems (criterion b) is a NAMED FUTURE
  EXTENSION and is deliberately NOT shipped in this version.

COMPOSITE — TROPICAL ONLY BY RULING:
- The composite (midpoint) chart is tropical-only. A midpoint composite in the
  sidereal zodiac is an UNDEFINED astrological object and is EXCLUDED until it is
  explicitly defined. No sidereal composite is computed.

PRECEDENT (general): A sidereal analogue of a tropical-native construct requires
an explicit meaning ruling BEFORE it is computed. Absent that ruling, the
analogue is EXCLUDED, not improvised. Exclusion by ruling is a deliberate state,
not a missing feature; agents must not "complete" it by inventing the undefined
object.
