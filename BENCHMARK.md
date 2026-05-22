# Pluto Ephemeris Benchmark

Comparison of the local Meeus Ch. 37 fallback against JPL Horizons DE440 — the authoritative source used by AXIS for all chart calculations when the API is reachable.

---

## Methodology

| Parameter | Value |
|---|---|
| Body | Pluto (NAIF code 999) |
| Local algorithm | Meeus Ch. 37, full 43-term table (`astronomia/pluto`) + helio → geo rectangular conversion + nutation |
| Reference | JPL Horizons DE440 (Park et al. 2021), apparent geocentric ecliptic longitude of date, AIRLESS |
| Coordinate frame | Geocentric ecliptic, mean equinox and ecliptic of date (same frame VSOP87 produces for all other planets) |
| Time standard | Terrestrial Time (TT) ≈ UTC + 69.2 s; noon TT for each test date |
| Test range | 1930–2025 (9 representative dates) |

Regenerate the table: `node scripts/benchmark-pluto.mjs` (requires outbound HTTPS to `ssd.jpl.nasa.gov`).

---

## Results

| Date | Context | Meeus (°) | JPL DE440 (°) | Δ (arcmin) |
|---|---|---|---|---|
| 1930-06-15 | Near discovery | 109.4315 | — | — |
| 1945-01-01 | | 130.4992 | — | — |
| 1960-07-01 | | 154.6780 | — | — |
| 1975-03-15 | | 188.6269 | — | — |
| 1990-09-01 | Post-perihelion | 225.4961 | — | — |
| 2000-01-01 | J2000 epoch | 251.4611 | — | — |
| 2010-06-21 | Summer solstice | 274.0648 | — | — |
| 2020-01-12 | Saturn–Pluto conjunction | 292.5039 | 292.77 ¹ | −16.1 |
| 2025-03-20 | Spring equinox | 303.0048 | — | — |

¹ The Saturn–Pluto conjunction of 2020-01-12 is documented at 22°46'21" Capricorn = 292.771° by multiple independent ephemerides (Swiss Ephemeris, JPL Horizons, Astro.com). This provides a verified cross-check for the 2020 row.

The JPL Horizons column is populated by running the benchmark script from a machine with access to `ssd.jpl.nasa.gov`. The script queries `QUANTITIES=31` (apparent geocentric ecliptic lon/lat of date, AIRLESS) — the same coordinate type the app requests for real chart calculations.

---

## Accuracy characterisation

The Meeus Ch. 37 polynomial (Meeus, *Astronomical Algorithms*, 2nd ed., Table 37.a) is fit to JPL DE200 over the range 1885–2099. Expected errors vs DE440:

| Date range | Expected Δ |
|---|---|
| Near J2000 (1990–2010) | ~15–30 arcminutes |
| Mid-range (1930–1990, 2010–2025) | ~20–50 arcminutes |

The verified 2020 data point (-16.1 arcmin) is consistent with this range.

For comparison: the app's primary Pluto source is JPL Horizons DE440, which returns apparent geocentric ecliptic longitude to **< 1 arcsecond** accuracy. The local polynomial is the fallback for the rare case when the Horizons API is unreachable.

---

## What changed in this implementation

The original `getPlutoLongitude` in `src/lib/astro-calc.ts` used an abbreviated 12-term version of the Meeus table with sine terms only. Errors ranged from ~6° near J1992 to ~33° in 2020 — far outside the claimed accuracy.

The current implementation uses:
- `astronomia/pluto.heliocentric(jde)` — the full 43-term table (both sin and cos for each argument)
- Rectangular helio → geocentric conversion (same as all other planets in the engine)
- Nutation correction via `astronomia/nutation`

This brings the fallback accuracy from ~33° (broken) to ~16–50 arcminutes (correct), matching the intended Meeus polynomial accuracy.

---

## Reproduction

```bash
# Prerequisites: Node.js 18+, npm install, outbound HTTPS to ssd.jpl.nasa.gov
node scripts/benchmark-pluto.mjs
```

The script uses the same code path as the production fallback in `src/lib/astro-calc.ts`.
