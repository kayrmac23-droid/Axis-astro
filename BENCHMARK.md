# Pluto Ephemeris Benchmark

Comparison of the local Meeus Ch. 37 fallback against JPL Horizons — the authoritative source used by AXIS for all chart calculations when the API is reachable.

---

## Methodology

| Parameter | Value |
|---|---|
| Body | Pluto (NAIF code 999) |
| Local algorithm | Meeus Ch. 37, full 43-term table (`astronomia/pluto`, J2000 frame) − Earth `position2000` → light-time → precession J2000 → date → nutation → annual aberration |
| Reference | JPL Horizons (`QUANTITIES=31`, `CENTER='500@399'`, `APPARENT=AIRLESS`) — apparent geocentric ecliptic longitude of date |
| Reference solution | PLU060/DE440 for all dates; Horizons response header sometimes labels the same data as DE441, so the parsed `ephemeris` field surfaces verbatim what the API returned |
| Coordinate frame | Geocentric ecliptic, mean equinox and ecliptic of date (same frame VSOP87 produces for all other planets) |
| Time standard | Terrestrial Time (TT) ≈ UTC + 69.2 s; noon TT for each test date |
| Test range | 1930–2025 (9 representative dates) |

Regenerate the table: `node scripts/benchmark-pluto.mjs` (requires outbound HTTPS to `ssd.jpl.nasa.gov`).

---

## Results

The JPL column was captured 2026-05-23 via direct Horizons API calls (`scripts/fetch-horizons.py`). Δ = local − Horizons. The "local (pre-fix)" column is what the fallback returned until the November 2026 audit; "local (current)" is `calculateDualChart` today, pinned by `astro-calc.test.ts`.

| Date | Context | Local, pre-fix (°) | Local, current (°) | JPL DE440 (°) | Δ pre-fix (arcmin) | Δ current (arcmin) |
|---|---|---|---|---|---|---|
| 1930-06-15 | Near discovery | 109.4315 | 108.4753 | 108.4753 | +57.4 | −0.00 |
| 1945-01-01 | | 130.4992 | 129.7166 | 129.7165 | +47.0 | +0.00 |
| 1960-07-01 | | 154.6780 | 154.1305 | 154.1303 | +32.9 | +0.01 |
| 1975-03-15 | | 188.6269 | 188.2722 | 188.2723 | +21.3 | −0.01 |
| 1990-09-01 | Post-perihelion | 225.4961 | 225.3638 | 225.3637 | +7.9 | +0.01 |
| 2000-01-01 | J2000 epoch | 251.4611 | 251.4549 | 251.4548 | +0.4 | +0.01 |
| 2010-06-21 | Summer solstice | 274.0648 | 274.2205 | 274.2203 | −9.3 | +0.01 |
| 2020-01-12 | Saturn–Pluto conjunction | 292.5039 | 292.7692 | 292.7691 | −15.9 | +0.00 |
| 2025-03-20 | Spring equinox | 303.0048 | 303.3478 | 303.3475 | −20.6 | +0.02 |

The 2020-01-12 row matches the documented Saturn–Pluto conjunction position of 22°46'21" Capricorn = 292.771° to within 0.01°, providing an independent cross-check against Swiss Ephemeris and Astro.com.

The JPL column is populated by running the benchmark script from a machine with access to `ssd.jpl.nasa.gov`. The script queries `QUANTITIES=31` (apparent geocentric ecliptic lon/lat of date, AIRLESS) — the same coordinate type the app requests for real chart calculations.

---

## Accuracy characterisation

**The current fallback agrees with DE440 to under 0.03 arcminutes across 1930–2025.**

The pre-fix error was not a limit of the Meeus polynomial. `astronomia/pluto.heliocentric()` returns Pluto referred to the ecliptic and equinox of **J2000**, but Earth was taken from `position()`, which is referred to the equinox **of date**. Subtracting vectors in two different frames leaves the accumulated general precession (~50.3″ per year) in the result — which is exactly the "steady linear drift" the earlier version of this file attributed to the polynomial: +57′ in 1930, ~0 at J2000, −21′ in 2025. Doing the subtraction in J2000 (Earth from `position2000()`) and precessing only the resulting direction to the date removes it; adding light-time and annual aberration brings the remaining residual under a second of arc.

Consequence: the JPL Horizons call is no longer needed for accuracy. It is still made, and still preferred when it answers, but a Horizons outage now costs nothing measurable.

---

## What changed in this implementation

The original `getPlutoLongitude` in `src/lib/astro-calc.ts` used an abbreviated 12-term version of the Meeus table with sine terms only. Errors ranged from ~6° near J1992 to ~33° in 2020 — far outside the claimed accuracy.

The next implementation used `astronomia/pluto.heliocentric(jde)` — the full 43-term table — with a rectangular helio → geocentric conversion and nutation. That brought the error from ~33° to ~15–60 arcmin, but mixed a J2000 Pluto with an of-date Earth (see above).

The current implementation (November 2026):
- `astronomia/pluto.heliocentric(jde)` — the full 43-term table, J2000 frame
- Earth from `position2000(jde)`, so the geocentric subtraction happens in one frame
- One light-time iteration
- Precession of the geocentric direction from J2000 to the equinox of date (`astronomia/precess`)
- Nutation in longitude and annual aberration

Result: < 0.03 arcmin vs DE440 on every benchmark date.

---

## Reproduction

```bash
# Prerequisites: Node.js 18+, npm install, outbound HTTPS to ssd.jpl.nasa.gov
node scripts/benchmark-pluto.mjs
```

The script uses the same code path as the production fallback in `src/lib/astro-calc.ts`. Alternatively, `scripts/fetch-horizons.py` populates only the JPL column when the Meeus values are already known — useful for regenerating the table without a full Node toolchain.
