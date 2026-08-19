#!/usr/bin/env bash
#
# verify-state.sh — ground-truth verification for AXIS.
#
# Asserts that specific, already-ratified rulings are correctly reflected in
# main. Decisions made in conversation have repeatedly been logged as "shipped"
# without landing in code; this script is the smoke detector that catches that
# drift. It is NOT a fixer — it never edits anything.
#
# The entire value of this script is distinguishing REAL regressions from
# LEGITIMATE uses that superficially resemble them. It must never flag
# legitimate house-cusp geometry or the DOCTRINE-exempted `synthesis`
# identifier. A dishonest passing check is worse than no check.
#
# Usage (from repo root):  bash scripts/verify-state.sh
# Exit 0 iff every non-INFO check passes; exit 1 if any FAIL. INFO checks are
# open questions awaiting a ruling and never affect the exit code.
#
# Pure bash: grep -rniE and file-existence tests only. No node, no deps.

set -u

FAILS=0

header() { printf '\n== %s ==\n' "$1"; }
pass()   { printf 'PASS %s\n' "$1"; }
fail()   { printf 'FAIL %s — %s\n' "$1" "$2"; FAILS=$((FAILS + 1)); }
info()   { printf 'INFO %s — %s\n' "$1" "$2"; }

# ---------------------------------------------------------------------------
# PLUTO
# ---------------------------------------------------------------------------
header PLUTO

READING_ROUTE="src/app/api/reading/route.ts"

# Client hints threaded through: both plutoLongitude AND plutoSource present.
if [ -f "$READING_ROUTE" ] \
  && grep -qE 'plutoLongitude' "$READING_ROUTE" \
  && grep -qE 'plutoSource' "$READING_ROUTE"; then
  pass "pluto-client-hints-threaded"
else
  fail "pluto-client-hints-threaded" \
    "expected both 'plutoLongitude' and 'plutoSource' in $READING_ROUTE; one or both absent"
fi

# Regex guard PLUTO_SOURCE_RE matching jpl-horizons-de44[01]|local-meeus.
if [ -f "$READING_ROUTE" ] \
  && grep -qE 'PLUTO_SOURCE_RE' "$READING_ROUTE" \
  && grep -qF 'jpl-horizons-de44[01]|local-meeus' "$READING_ROUTE"; then
  pass "pluto-source-guard-regex"
else
  fail "pluto-source-guard-regex" \
    "expected PLUTO_SOURCE_RE guard matching 'jpl-horizons-de44[01]|local-meeus' in $READING_ROUTE; absent"
fi

# ---------------------------------------------------------------------------
# CUSPS  (deregistration was SIGN-BOUNDARY cusps only — house cusps are
# legitimate geometry and MUST remain. Never grep the bare word "cusp".)
# ---------------------------------------------------------------------------
header CUSPS

# The named-cusp reference module must not exist.
if [ ! -e "src/lib/cusps.ts" ]; then
  pass "cusps-module-absent"
else
  fail "cusps-module-absent" "src/lib/cusps.ts must not exist, but it is present"
fi

# No named-cusp strings anywhere in src/. These are the deregistered concept,
# NOT house-cusp geometry (which uses the bare word "cusp" — deliberately not
# grepped here).
NAMED_CUSP_HITS="$(grep -rniE 'Cusp of Oscillation|Cusp of|CUSP RULE|CUSP NOTE' src/ 2>/dev/null)"
if [ -z "$NAMED_CUSP_HITS" ]; then
  pass "named-cusp-strings-absent"
else
  fail "named-cusp-strings-absent" \
    "named-cusp strings reintroduced in src/: $(printf '%s' "$NAMED_CUSP_HITS" | cut -d: -f1 | sort -u | tr '\n' ' ')"
fi

# DOCTRINE still records the deregistration ruling.
if [ -f "DOCTRINE.md" ] \
  && grep -qiE 'SIGN-BOUNDARY CUSPS — DEREGISTERED' DOCTRINE.md; then
  pass "doctrine-sign-boundary-deregistered"
else
  fail "doctrine-sign-boundary-deregistered" \
    "expected 'SIGN-BOUNDARY CUSPS — DEREGISTERED' section in DOCTRINE.md; absent"
fi

# ---------------------------------------------------------------------------
# VOCABULARY  (banned inter-system reconciliation vocab in READING OUTPUT.
# This check confirms the GUARD is PRESENT — not that the phrase is absent.
# The authoring verb "integrate"/"Integrate" is legitimate and NOT flagged.)
# ---------------------------------------------------------------------------
header VOCABULARY

# The anti-synthesis guard cites "carries both" inside its banned/failure-mode
# text (PROSE FAILURE MODES + the sidereal overlay rule). Presence = guard live.
if [ -f "src/lib/prompts.ts" ] \
  && grep -qiE 'carries both' src/lib/prompts.ts; then
  pass "anti-synthesis-guard-present"
else
  fail "anti-synthesis-guard-present" \
    "expected the 'carries both' anti-synthesis guard text in src/lib/prompts.ts; absent"
fi

# ---------------------------------------------------------------------------
# COLOR
# ---------------------------------------------------------------------------
header COLOR

# July 2026 copper reinstatement recorded.
if [ -f "DOCTRINE.md" ] && grep -qiE 'copper ratified' DOCTRINE.md; then
  pass "doctrine-copper-ratified"
else
  fail "doctrine-copper-ratified" \
    "expected 'copper ratified' in DOCTRINE.md; absent"
fi

# Gold token #FFC030 is decanonicalized — must not appear in src/ nor in any
# .css/.ts/.tsx file anywhere in the tree.
GOLD_HITS="$( { grep -rniE '#FFC030' src/ 2>/dev/null; \
  grep -rniE --include='*.css' --include='*.ts' --include='*.tsx' '#FFC030' . 2>/dev/null; } \
  | cut -d: -f1 | sort -u )"
if [ -z "$GOLD_HITS" ]; then
  pass "gold-token-decanonicalized"
else
  fail "gold-token-decanonicalized" \
    "gold token #FFC030 reintroduced in: $(printf '%s' "$GOLD_HITS" | tr '\n' ' ')"
fi

# ---------------------------------------------------------------------------
# IDENTIFIERS
# ---------------------------------------------------------------------------
header IDENTIFIERS

# `synthesis` internal key is DOCTRINE-EXEMPTED. Its presence in the code is
# CORRECT. This fails ONLY if the code identifier exists while the DOCTRINE
# exemption text is missing.
SYNTHESIS_IN_CODE=0
if [ -f "src/lib/prompts.ts" ] && grep -qE 'synthesis' src/lib/prompts.ts; then
  SYNTHESIS_IN_CODE=1
fi
DOCTRINE_SYNTHESIS_EXEMPT=0
if [ -f "DOCTRINE.md" ] \
  && grep -qiE 'synthesis' DOCTRINE.md \
  && grep -qiE 'identifier' DOCTRINE.md \
  && grep -qiE 'exempt' DOCTRINE.md; then
  DOCTRINE_SYNTHESIS_EXEMPT=1
fi
if [ "$SYNTHESIS_IN_CODE" -eq 1 ] && [ "$DOCTRINE_SYNTHESIS_EXEMPT" -eq 1 ]; then
  pass "synthesis-identifier-exempted"
elif [ "$SYNTHESIS_IN_CODE" -eq 1 ] && [ "$DOCTRINE_SYNTHESIS_EXEMPT" -eq 0 ]; then
  fail "synthesis-identifier-exempted" \
    "'synthesis' identifier present in src/lib/prompts.ts but DOCTRINE.md lacks its identifier exemption text"
else
  # Identifier absent from code — nothing to exempt; not the failure this
  # check guards against.
  pass "synthesis-identifier-exempted (identifier not present in code; nothing to exempt)"
fi

# `integration` synastry key — UNRESOLVED. INFO only, never affects exit code.
INTEGRATION_FILES=""
for f in src/components/SynastryReadingPanel.tsx src/lib/prompts.ts src/lib/synastry-calc.ts; do
  if [ -f "$f" ] && grep -qE 'integration' "$f"; then
    INTEGRATION_FILES="$INTEGRATION_FILES ${f##*/}"
  fi
done
DOCTRINE_INTEGRATION_EXEMPT="no"
# An explicit exemption parallel to synthesis would name "integration" alongside
# exemption language. Currently DOCTRINE only banned-lists it (line ~21).
if [ -f "DOCTRINE.md" ] \
  && grep -qiE 'integration' DOCTRINE.md \
  && grep -qiE 'integration.*exempt|exempt.*integration' DOCTRINE.md; then
  DOCTRINE_INTEGRATION_EXEMPT="yes"
fi
info "integration-identifier-unresolved" \
  "live in code (${INTEGRATION_FILES:- none}), display label 'Central Dynamic'; DOCTRINE exemption parallel to synthesis: ${DOCTRINE_INTEGRATION_EXEMPT}. integration identifier live in code but banned-listed in DOCTRINE without exemption — ruling required: rename to central_dynamic OR add DOCTRINE exemption."

# ---------------------------------------------------------------------------
# TIMEOUT
# ---------------------------------------------------------------------------
header TIMEOUT

if [ -f "$READING_ROUTE" ] && grep -qE 'maxDuration = 60' "$READING_ROUTE"; then
  pass "reading-maxduration-60"
else
  ACTUAL="$(grep -niE 'maxDuration' "$READING_ROUTE" 2>/dev/null | grep -iE '=' | head -1)"
  info "reading-maxduration-60" \
    "expected 'maxDuration = 60' in $READING_ROUTE; found: ${ACTUAL:-<no maxDuration assignment>} (plan-dependent, not a regression per se)"
fi

# ---------------------------------------------------------------------------
printf '\n'
if [ "$FAILS" -eq 0 ]; then
  printf 'ALL CHECKS PASSED (INFO items are open questions, not regressions)\n'
  exit 0
else
  printf '%d CHECK(S) FAILED\n' "$FAILS"
  exit 1
fi
