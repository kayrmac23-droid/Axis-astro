# AXIS — Codebase Audit

**Date:** 2026-08-23
**Scope:** Full audit — security, correctness, code quality, dependencies, test coverage.
**Commit audited:** `2ae17a8` (branch `main` at time of audit)
**Method:** Static review of all `src/` API routes and libs, `next.config`, dependency
tree (`npm audit` / `npm outdated`), full test + lint run, and empirical verification
of the timezone finding.

At audit time: **129 unit tests pass, ESLint clean, TypeScript strict**. The
foundations are solid; the findings below are prioritized fixes and hardening, not
a rescue job.

---

## Resolution status

**All findings addressed** in the follow-up commit(s) on this branch. After the fixes:
**148 unit tests pass (+19), ESLint clean, `npm run build` green on Next 16.3.2,
`npm audit` reports 0 vulnerabilities.** Each row below carries its status; the
detailed sections are the original assessment and remain as the rationale.

| # | Severity | Area | Finding | Status |
|---|----------|------|---------|--------|
| 1 | **High** | Dependencies | Known-vulnerable deps (Next.js, postcss, sharp, nanoid) — 6 high advisories | ✅ Fixed — `npm audit fix`, next→16.3.2, 0 vulns |
| 2 | **Medium** | Correctness | DST-edge timezone offset is wrong by 1h for births just after a transition | ✅ Fixed — iterative offset resolution + regression tests |
| 3 | **Medium** | Architecture / Docs | Reading quality gate is dead code at runtime, but docs claim it runs | ✅ Docs corrected — CLAUDE.md + both module headers now state it's off the request path. Product decision (re-enable / async / retire) left to the team (see note) |
| 4 | **Low** | Correctness | Julian Day uses proleptic Gregorian for all dates (wrong pre-1582) | ✅ Fixed — Julian-calendar branch for pre-1582 + tests |
| 5 | **Low** | Docs | Synastry section-name drift: docs say `integration`, code uses `central_dynamic` | ✅ Fixed — CLAUDE.md corrected |
| 6 | **Low** | Code quality | Dead keep-alive / `gating` scaffolding in the reading route | ✅ Fixed — removed |
| 7 | **Low** | Housekeeping | `attached_assets/` — 18 stale bootstrap duplicate files committed | ✅ Fixed — directory deleted |
| 8 | **Low** | Tests | No DST regression test; no route-level validation tests | ✅ Fixed — DST + Julian regression tests, route-validation test file added |
| 9 | **Info** | Security | `getClientIp` trusts `x-forwarded-for` (fine on Vercel; document the assumption) | ✅ Fixed — trusted-proxy assumption documented in code |
| 10 | **Info** | Security | No auth/CSRF on the paid `/api/reading`; cost control rests on rate-limit + daily cap | ◻︎ Acknowledged — accepted design for a public tool; no change (see note) |

> **Note on #3 and #10 (deliberately not changed):** Re-enabling the quality gate on
> the request path was intentionally removed for latency (it breached the 60s ceiling),
> so this pass corrected the *documentation* rather than re-adding it — whether to run
> it async/sampled or formally retire it is a product call. #10 is an accepted design
> tradeoff (rate-limit + daily cap + kill switch); no code change was warranted.

## Summary of findings (original assessment)

| # | Severity | Area | Finding |
|---|----------|------|---------|
| 1 | **High** | Dependencies | Known-vulnerable deps (Next.js, postcss, sharp, nanoid) — 6 high advisories |
| 2 | **Medium** | Correctness | DST-edge timezone offset is wrong by 1h for births just after a transition |
| 3 | **Medium** | Architecture / Docs | Reading quality gate is dead code at runtime, but docs claim it runs |
| 4 | **Low** | Correctness | Julian Day uses proleptic Gregorian for all dates (wrong pre-1582) |
| 5 | **Low** | Docs | Synastry section-name drift: docs say `integration`, code uses `central_dynamic` |
| 6 | **Low** | Code quality | Dead keep-alive / `gating` scaffolding in the reading route |
| 7 | **Low** | Housekeeping | `attached_assets/` — 18 stale bootstrap duplicate files committed |
| 8 | **Low** | Tests | No DST regression test; no route-level validation tests |
| 9 | **Info** | Security | `getClientIp` trusts `x-forwarded-for` (fine on Vercel; document the assumption) |
| 10 | **Info** | Security | No auth/CSRF on the paid `/api/reading`; cost control rests entirely on rate-limit + daily cap |

**What's already strong** (see [Security posture](#security-posture-whats-working)):
thorough input validation, contained SSRF surface, layered rate-limiting + global
spend cap + kill switch, centralized secret handling with no committed secrets, a
strong CSP/HSTS header set, and server-side chart recomputation that prevents
cache poisoning.

---

## Detailed findings

### 1. [High] Known-vulnerable dependencies

`npm audit` reports **7 vulnerabilities (1 moderate, 6 high)**:

- **`next` 16.2.6** — multiple high advisories including SSRF in Server Actions on
  custom servers, SSRF via rewrites, DoS in Server Actions, response-body cache
  confusion, and *unauthenticated disclosure of internal Server Function endpoints*.
- **`postcss`** — path-traversal / arbitrary `.map` file disclosure.
- **`sharp` / libvips** — CVE-2026-33327/33328/35590/35591 (image processing).
- **`nanoid`** — non-secure generator infinite-loop DoS.

**Impact:** AXIS uses the App Router on Vercel (not a custom server), which narrows
some of the Next.js advisories, but several apply regardless of deployment shape and
the image-optimization SVG DoS is reachable if any image path is exposed.

**Fix:** `npm audit fix` resolves all seven — it bumps `next` 16.2.6 → 16.3.2 (a
patch within the same minor, low regression risk), plus transitive `postcss`,
`sharp`, `nanoid`. Run it, then `npm run test && npm run lint && npm run build` to
confirm. This is the single highest-value action in this audit.

---

### 2. [Medium] DST-edge timezone offset error

**File:** `src/lib/tz.ts` → `tzNameToOffset()`

The function builds the local wall-clock time as an ISO string *marked `Z` (UTC)*,
then asks the target zone for its offset **at that instant**. But the wall-clock
value is local, not UTC, so it queries the zone at a point up to `|offset|` hours
away from the true instant. Away from DST boundaries the offset is constant so the
answer is right; **within roughly `|offset|` hours after a spring-forward
transition it returns the pre-transition offset.**

Verified empirically:

```
America/New_York 2023-03-12 (spring forward at 02:00 → 03:00)
  01:30 local  → -5  ✓ (EST)
  03:30 local  → -5  ✗  should be -4 (EDT)
  05:30 local  → -5  ✗  should be -4 (EDT)
  2023-07-01 12:00 → -4 ✓ (EDT, away from boundary)
```

**Impact:** A birth in that post-transition window is computed one hour too far
west. One hour of RAMC moves the Ascendant ~15° (up to half a sign), which can
flip the ascending sign — and with Whole Sign houses that re-lays the **entire
house grid** and the sidereal Lagna, and shifts everything downstream (dasha
framing, yogas keyed to the Lagna, the reading itself). Real births land in this
window twice a year in every DST zone.

**Fix:** Resolve the offset iteratively. Compute a first-guess UTC instant from the
naive offset, look up the offset at that instant, then refine once (a second pass
converges for all standard DST rules):

```ts
// guess UTC from a first offset, then re-query the zone at the refined instant
let off = offsetAt(tzName, wallAsUtcMs)        // first pass (current behaviour)
off = offsetAt(tzName, wallAsUtcMs - off*3.6e6) // refine at the true instant
```

Add the NY spring-forward case above as a regression test (see finding 8).

---

### 3. [Medium] Reading quality gate is dead code at runtime

**Files:** `src/app/api/reading/route.ts`, `src/lib/reading-quality-gate.ts`, `CLAUDE.md`

`CLAUDE.md`, the `/api/reading` route header, and `reading-quality-gate.ts`'s own
module header all state that each reading is scored against the rubric and repaired
once *before it reaches the client / is cached*. **The route no longer does this.**
It imports only `isTruncated` from the gate; `evaluateSection` and `repairSection`
are never called on the request path (an inline comment confirms the eval + repair
passes were taken off the synchronous path to stay under the 60s ceiling). At
runtime the only output guards are `isTruncated` and the deterministic
`detectBannedPhrasings` cache-write scan.

**Impact:** This is a correctness-of-belief hazard, not a crash. Anyone reading the
docs (or the 129 green tests, which exercise the gate *in isolation*) will believe
quality enforcement is live when it is not. The nine-criterion rubric, Barnum
inversion test, rescue-clause backstop, etc. currently protect nothing shipped.

**Fix (docs, do now):** Update `CLAUDE.md` and both module headers to state plainly
that the gate is retained for a future async/sampled redesign and is **not** on the
request path; the live guards are `isTruncated` + `detectBannedPhrasings` only.

**Fix (product, plan):** Decide whether to (a) re-enable a bounded gate pass, or
(b) run it async/sampled post-response to repair-and-recache. Until then the prompt
is the sole quality control for what users actually see.

---

### 4. [Low] Julian Day uses proleptic Gregorian for all dates

**File:** `src/lib/astro-calc.ts` → `toJulianDay()`

The Gregorian correction `B = 2 - A + floor(A/4)` is applied unconditionally, so
dates before the 1582-10-15 cutover are computed in the proleptic Gregorian
calendar rather than the Julian calendar used by convention (and by most ephemeris
tooling) for those dates. The app deliberately supports years **1–9999** (`tz.ts`
goes out of its way to keep early-CE births accurate), so this is an internal
inconsistency: those same early births get a calendar mismatch that grows to ~10+
days by year 1.

**Impact:** Only affects pre-1582 births (rare). **Fix:** either branch to the
Julian formula for JD < 2299160.5, or document the proleptic-Gregorian convention
as intended and drop the pretense of Julian-calendar correctness for old dates.

---

### 5. [Low] Synastry section-name documentation drift

`CLAUDE.md` lists synastry planet-sections as `… composite_chart, integration,
navigation`. The code uses **`central_dynamic`**, not `integration`, consistently
across `route.ts`, `prompts.ts`, `synastry-calc.ts`, and `SynastryReadingPanel.tsx`.
Code is internally consistent; the doc is stale. **Fix:** s/integration/central_dynamic/
in `CLAUDE.md`.

---

### 6. [Low] Dead keep-alive / gating scaffolding in the reading route

**File:** `src/app/api/reading/route.ts` (the `ReadableStream` body)

The `phase: 'streaming' | 'gating' | 'done'` state, the `keepAlive` `setInterval`,
and the `'gating'` keep-alive branch are unreachable now that eval/repair are off
the path — the stream closes as soon as first-pass generation finishes (the
comments admit this). Harmless, but it's confusing scaffolding for the next reader.
**Fix:** remove the interval and collapse `phase` to what's used.

---

### 7. [Low] Stale bootstrap duplicates in `attached_assets/`

18 files under `attached_assets/` are old project-bootstrap copies of live source
(`astro-calc_*.ts`, `prompts_*.ts`, `route_*.ts`, `BirthForm_*.tsx`,
`ReadingPanel_*.tsx`, `package_*.json`, `tsconfig_*.json`, CSS, …). They are not
imported anywhere. They add clone weight and — more importantly — a stale
`astro-calc` / `prompts` copy invites someone to read or "fix" the wrong file.
**Fix:** delete the directory (it's recoverable from git history if ever needed).

---

### 8. [Low] Test-coverage gaps

129 tests pass and cover the libs well (astro-calc shape/ayanamsa/houses, tz,
synastry, rate-limiter, interpretation-engine, gate, env). Two gaps stand out:

- **No DST-edge test for `tzNameToOffset`** — which is exactly why finding 2 slipped
  through. Add the NY spring-forward regression case.
- **No route-level tests** for the API handlers. The validation branches
  (range checks, calendar validity, payload-size guard, allow-list rejection,
  rate-limit 429s) are all untested end-to-end. A handful of handler tests would
  lock in the security-relevant validation behaviour.

---

### 9. [Info] `getClientIp` trusts `x-forwarded-for`

**File:** `src/lib/route-rate-limiter.ts`

`getClientIp` takes the first `x-forwarded-for` entry. On Vercel the platform sets
this header, so it's trustworthy there. If AXIS is ever deployed behind a proxy
that forwards a client-supplied XFF, an attacker could spoof it to get a fresh
rate-limit bucket per request. Document the "runs behind a trusted proxy that sets
XFF" assumption next to the function so a future migration doesn't silently break
the limiter. (The `'direct'` fallback bucketing all header-less requests together
is acceptable.)

---

### 10. [Info] No auth/CSRF on the paid `/api/reading`

The entire cost-control model for the money-spending reading endpoint is the per-IP
rate limiter + the global daily call cap (default 2000) + the `AXIS_READINGS_ENABLED`
kill switch. That's a reasonable design for a public tool, and the route correctly
orders per-IP limiting *before* the global counter so a single IP can't exhaust the
global cap with cheap requests. The residual risk is a **distributed** abuser across
many IPs burning the daily cap and denying readings to everyone until the next day.
No action required now; if abuse appears, consider a lightweight challenge (captcha /
proof-of-work) or a signed client token before the model call.

---

## Security posture — what's working

Called out deliberately so these are not weakened by future changes:

- **Input validation** is thorough and consistent across `calculate`, `synastry`,
  and `reading`: numeric range checks, `isValidCalendarDate` rejecting Feb 31 etc.,
  explicit 16 KB payload guards (reading the actual body, not the spoofable
  `Content-Length`), and JSON-parse guards.
- **SSRF surface is contained.** `geocode` proxies only to a fixed Nominatim host
  with `encodeURIComponent` on the query and whitelists response fields; JPL
  Horizons is a fixed URL with an enumerated body-code table. No user-controlled
  host or path anywhere.
- **Layered abuse control:** Redis-backed atomic (Lua) per-IP rate limits with a
  bounded in-memory fallback, a global daily spend cap, and an env kill switch.
- **Secret handling:** `env.ts` centralizes the Anthropic key check and rejects
  docs placeholders; no secrets are committed; `.env*` is gitignored.
- **Response headers:** strong CSP (with a documented rationale for `unsafe-inline`),
  HSTS with preload, `X-Frame-Options: DENY`, `nosniff`, `Referrer-Policy`,
  `Permissions-Policy`.
- **Cache-poisoning prevention:** `/api/reading` recomputes charts server-side from
  validated birth data and never trusts client-supplied planet positions — the only
  client hint (Pluto longitude) is range- and enum-validated, and both fields are
  dropped together on any failure.

---

## Recommended order of action

1. **`npm audit fix`** + re-run test/lint/build (finding 1) — highest value, lowest risk.
2. **Fix the DST-edge offset** and add its regression test (findings 2, 8).
3. **Correct the docs** for the quality gate and synastry section names (findings 3, 5).
4. **Delete `attached_assets/`** and the dead keep-alive scaffolding (findings 7, 6).
5. **Decide the gate's future** — re-enable bounded, run async, or formally retire (finding 3).
6. Address the Julian-calendar convention and route-level tests as backlog (findings 4, 8).
