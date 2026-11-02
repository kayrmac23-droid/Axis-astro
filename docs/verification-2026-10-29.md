# AXIS Verification Pass — 2026-10-29

Read-only. No code edits made. Every finding below cites the exact command and
its raw output. `gh` CLI is not available in this environment; GitHub checks
used the GitHub MCP server (`mcp__github__pull_request_read`) instead, noted where used.

---

## V1 — PR #133
STATUS: CONFIRMED (exists; NOT merged)
EVIDENCE:
```
$ git log --all --grep="#133" --oneline
(no match — empty output)
```
```
$ mcp__github__pull_request_read method=get owner=kayrmac23-droid repo=axis-astro pullNumber=133
{"number":133,"title":"Add falsifiability criterion to reading quality gate",
 "state":"closed","draft":true,"merged":false,"mergeable_state":"dirty",
 "html_url":"https://github.com/kayrmac23-droid/Axis-astro/pull/133",
 "head":{"ref":"claude/reading-quality-gate-investigation-qv2rtw",
         "sha":"ff77f5e38f2e1e23edbfea41d49dcbe63153d04e"},
 "base":{"ref":"main","sha":"7c0e9d2cd0009fcf33dea49a4e9133c65163606d"},
 "additions":44,"deletions":10,"changed_files":3,"commits":1,
 "created_at":"2026-08-19T02:43:12Z","closed_at":"2026-08-19T09:46:59Z"}
```
```
$ git branch -a
* claude/jolly-clarke-7g0i6m
  main
  remotes/origin/claude/jolly-clarke-7g0i6m
  remotes/origin/main
```
FINDING: PR #133 ("Add falsifiability criterion to reading quality gate") exists
but is **closed, draft, and NOT merged** (`merged:false`, closed 2026-08-19);
its head branch `claude/reading-quality-gate-investigation-qv2rtw`
(3 files, +44/-10) is absent locally and no commit references `#133`. The
falsifiability code now in `main` therefore landed through a *different* path, not
this PR — see V3.

---

## V2 — GIFTS → STRENGTHS rename
STATUS: DISPROVEN (as a full purge); the rename is partial by design
EVIDENCE:
```
$ git grep -n -i "gifts" -- '*.ts' '*.tsx' '*.md'
src/lib/prompts.ts:492:A reading exists to show a whole person ... go back and give the gifts their due.
src/lib/reading-quality-gate.ts:308:6. psychological_depth — Does it explain defence patterns, relational dynamics, self-perception, blind spots, gifts, and shadow ...
```
```
$ git grep -n -i "strengths" -- '*.ts' '*.tsx' '*.md'
.claude/skills/axis-output-quality/SKILL.md:26: ...strengths as much as difficulties.
src/lib/interpretation-engine.ts:1001:function buildStrengths(planet: PlanetPosition, aspects: Aspect[]): string[] {
src/lib/interpretation-engine.ts:1342: ...push('STRENGTHS / CAPACITIES ...')
src/lib/prompts.ts:493:- The STRUCTURED INTERPRETATION CONTEXT now names strengths explicitly (STRENGTHS / CAPACITIES blocks ...)
(plus further hits in interpretation-engine.ts, prompts.ts, SKILL.md)
```
FINDING: The STRENGTHS/CAPACITIES framing IS in committed code (`buildStrengths`,
`STRENGTHS / CAPACITIES` blocks, prompt lines). But `gifts` remains in
`prompts.ts:492` and `reading-quality-gate.ts:308`, and the singular `gift` persists
widely (`PLANET_CORE.gift`, prompt instructions). This is not a leftover: CLAUDE.md
states the word is *deliberately not purged* — only the "gift-as-rescue-of-difficulty"
move is banned. So a wholesale GIFTS→STRENGTHS rename did not happen and was never
the intent; the task's premise that any `gifts` leftover means a failed rename does
not match the documented design.

---

## V3 — Barnum / falsifiability gate
STATUS: CONFIRMED (intact and consistent)
EVIDENCE — definition is single-source, never redefined:
```
$ sed -n '26,35p' src/lib/prompts.ts
export const BANNED_BARNUM_PHRASINGS = [
  'you feel most like yourself when things are in proportion, when the exchange is mutual',
  'the sense of self can go with it when the relational field is unclear',
  'you need both connection and independence',
  'you feel things deeply',
  'you want to be understood',
] as const
export const BANNED_BARNUM_LIST = BANNED_BARNUM_PHRASINGS.map(p => `"${p}"`).join('; ')
```
```
$ git grep -n "BANNED_BARNUM" -- '*.ts' '*.tsx'
src/lib/prompts.ts:26:export const BANNED_BARNUM_PHRASINGS = [        <- sole definition
src/lib/prompts.ts:35:export const BANNED_BARNUM_LIST = ...            <- derived from it
src/lib/prompts.ts:554:- Banned as written: ${BANNED_BARNUM_LIST}.      <- prompt import site
src/lib/reading-quality-gate.ts:60:  BANNED_BARNUM_LIST,              <- gate import site (import, not redefinition)
src/lib/reading-quality-gate.ts:311:9. falsifiability — ... ${BANNED_BARNUM_LIST} ...
src/lib/__tests__/reading-quality-gate.test.ts:22-23,448-459             <- test import site
```
No second `export const BANNED_BARNUM_PHRASINGS = ` exists; the gate and tests
`import` the one in prompts.ts, so prompt and gate cannot drift.

EVIDENCE — MIN_INDIVIDUAL and the 9th criterion wired into the verdict:
```
$ sed -n '159p' src/lib/reading-quality-gate.ts
const MIN_INDIVIDUAL   = 3
```
```
$ sed -n '115,124p' src/lib/reading-quality-gate.ts   (LLM_CRITERIA array)
  'chart_evidence','specificity','synthesis','contradiction_handling',
  'anti_cliche','psychological_depth','practical_usefulness','voice_quality',
  'falsifiability',                 <- 9th criterion present
] as const
const CRITERIA = [...LLM_CRITERIA, 'length'] as const
```
```
$ sed -n '389,398p' + '425,432p' src/lib/reading-quality-gate.ts
export function validateScores(obj): LlmScores | null {
  for (const key of LLM_CRITERIA) {     <- rejects object missing falsifiability
    const v = o[key]; if (typeof v !== 'number' || v < 1 || v > 5) return null }
export function computePassFromScores(scores): boolean {
  const values = CRITERIA.map(k => scores[k])
  return avg >= MIN_PASS_AVERAGE && min >= MIN_INDIVIDUAL }   <- falsifiability<3 ⇒ fail
```
`MIN_PASS_AVERAGE = 3.75`. So `falsifiability` is in the scored set, validated as
required, and a sub-3 falsifiability score trips the individual floor → fail.

EVIDENCE — AXIS_TRUNCATED is a hard failure (cannot pass silently):
```
$ sed -n '283,291p' src/lib/reading-quality-gate.ts
export function isTruncated(text: string): boolean {
  if (text.includes(TRUNCATION_SENTINEL)) return true ...   (TRUNCATION_SENTINEL = '[AXIS_TRUNCATED]')
```
```
$ sed -n '456,464p' src/lib/reading-quality-gate.ts   (evaluateSection)
  if (isTruncated(generatedText)) {
    return { pass:false, rubricPass:false, scores:null,
             critique:'Section is truncated ...', truncated:true } }   <- no eval call, hard fail
```
```
$ sed -n '872,874p' src/lib/reading-quality-gate.ts   (gateForCache)
  if (truncated || firstPassText.trim().length === 0 || isTruncated(firstPassText)) {
    return { cacheText: null, ... reason: 'truncated-or-empty', ... } }   <- never cached
```
```
$ sed -n '375,381p' src/app/api/reading/route.ts
  const truncated = firstMessage.stop_reason === 'max_tokens'
  if (truncated) { controller.enqueue(encoder.encode('\n\n[AXIS_TRUNCATED]')) }
```
EVIDENCE — prompt version:
```
$ sed -n '65p' src/lib/reading-cache.ts
export const READING_PROMPT_VERSION = 'v10.28'
```
FINDING: `MIN_INDIVIDUAL = 3`; the 9th `falsifiability` criterion is present,
required by `validateScores`, and folded into `computePassFromScores` so a
Barnum-only section (falsifiability < 3) hard-fails. `BANNED_BARNUM_PHRASINGS`
(5 entries) is defined once in `prompts.ts` and imported — never redefined — by
both the gate and the tests. Truncation hard-fails before scoring in two places
and is never cached; it cannot pass silently. `READING_PROMPT_VERSION = 'v10.28'`.

---

## V4 — Doc drift (CLAUDE.md vs DOCTRINE.md)
STATUS: UNVERIFIABLE (the "after commit 7c96b1a" framing) / CONFIRMED (Barnum present in CLAUDE.md now)
EVIDENCE:
```
$ git cat-file -t 7c96b1a
fatal: Not a valid object name 7c96b1a
$ git log --oneline --all | grep -i 7c96b1a
(no match — exit 1)
```
```
$ git grep -n -i "barnum\|falsifiab" -- CLAUDE.md
CLAUDE.md:46:- **`lib/reading-quality-gate.ts`** ... BANNED_BARNUM_PHRASINGS ... falsifiability ...
$ git grep -n -i "barnum\|falsifiab" -- DOCTRINE.md
(no match — exit 0, empty)
```
```
$ grep -n "^#" DOCTRINE.md
8:## THE LAW (claim-level)
18:## THE SMOKE DETECTOR (word-level)
32:## NAMING   50:## CO-VISIBILITY   56:## READING SURFACE EXCEPTION
69:## COLOR SYSTEM   94:## MOOD   102:## PROOF   107:## AMENDMENT — FRAME-SHIFT WHEEL
144:## SIGN-BOUNDARY CUSPS — DEREGISTERED   167:## COMPATIBILITY (SYNASTRY) ...
199:## IDENTITY & STORAGE TIERS   250:## SUPERSEDED / NON-BINDING DRAFTS
```
FINDING: Commit `7c96b1a` **does not exist** in this repository, so any claim keyed
to "after commit 7c96b1a" is UNVERIFIABLE. On the substance: the Barnum/falsifiability
gate IS currently documented in `CLAUDE.md:46` and is ABSENT from `DOCTRINE.md`
(zero matches). That split is consistent with the Docs-map ownership rule (DOCTRINE.md
owns ratified product law; the Barnum gate is a prose-quality-gate mechanism, which
CLAUDE.md owns) — DOCTRINE.md's word-level bans live under THE SMOKE DETECTOR, which
does not name "Barnum." No contradiction found between the two on the one rule
cross-checked in full (SIGN-BOUNDARY CUSPS — CLAUDE.md defers to DOCTRINE's DEREGISTERED
ruling). A line-by-line diff of all doctrine was not performed; this reports the
specific verifiable facts only.

---

## V5 — Word-ban enforcement
STATUS: DISPROVEN (no blanket ban exists; grep is a candidate finder, by DOCTRINE)
EVIDENCE:
```
$ git grep -n -E "\b(synthesis|integration|unified|merges|resolution)\b" -- '*.ts' '*.tsx'
(~90 hits — the large majority are the legacy internal reading-type identifier
 'synthesis' used as a code key: route allow-lists, SECTION_INSTRUCTIONS.synthesis,
 reading-order, component tab keys, test fixtures, GateScores.synthesis criterion.)
Prompt-text / template hits of note:
src/lib/prompts.ts:480,669,676: "Read birth charts as unified systems"   (instructional)
src/lib/prompts.ts:534: "4. PSEUDO-SYNTHESIS ... is not synthesis"        (names a banned move)
src/lib/prompts.ts:523: "Do not wrap on a tidy resolution"                (names a banned move)
src/lib/prompts.ts:550: "DIVERGENCE → DEPTH-RANKED HIERARCHY (resolution-by-hierarchy)" (banned move)
src/lib/prompts.ts:987: "No comfort. No resolution."                      (instructional, enforcing THE LAW)
src/lib/planet-descriptors.ts:137: "The integration names the single most defining feature ... cohere"
```
```
$ git grep -n "\bmerges\b" -- '*.ts' '*.tsx'
(no match — exit 1)
```
```
$ sed -n '18,27p' DOCTRINE.md
## THE SMOKE DETECTOR (word-level)
Grep-able tripwires, when used as achieved states. Banned for the inter-system
relationship ...: synthesis · synthesize · integrate · integration · merge ·
reconcile · resolve · unify · blend · harmonize · bridge · "both truths meet"
A hit means: audit the sentence against THE LAW. It does not automatically fail ...
```
FINDING: There is no blanket ban on these words. DOCTRINE's SMOKE DETECTOR bans them
only "when used as achieved states" and only "for the inter-system relationship," and
explicitly says a grep hit is a candidate to audit, not an automatic fail. `merges`
has zero hits. Almost every hit is the legacy `synthesis` code identifier or
instructional vocabulary ("unified systems"), or the prompt NAMING the banned moves
("pseudo-synthesis", "resolution-by-hierarchy", "No resolution"). The one reader-facing
candidate worth a LAW audit is `planet-descriptors.ts:137` ("The integration ... makes
everything else cohere"), where "integration" names the Divergence section's job — a
candidate under the detector, not a confirmed breach. Reporting only; no verdict rendered.

---

## Summary

| Check | Status | One-line finding |
|---|---|---|
| V1 — PR #133 | CONFIRMED (exists, NOT merged) | Closed draft, `merged:false`, head branch absent locally; no commit references #133. |
| V2 — GIFTS→STRENGTHS | DISPROVEN (as full purge) | STRENGTHS blocks shipped, but `gifts`/`gift` deliberately retained per CLAUDE.md — no wholesale rename. |
| V3 — Barnum/falsifiability gate | CONFIRMED | `MIN_INDIVIDUAL=3`; 9th `falsifiability` criterion wired into verdict; BANNED_BARNUM single-source; truncation hard-fails; `v10.28`. |
| V4 — Doc drift | UNVERIFIABLE / CONFIRMED | Commit `7c96b1a` does not exist; Barnum IS in CLAUDE.md:46, absent from DOCTRINE.md (consistent with docs-map split). |
| V5 — Word-ban enforcement | DISPROVEN (premise) | No blanket ban; DOCTRINE treats these as audit candidates; `merges`=0 hits; most hits are the legacy `synthesis` code key. |
