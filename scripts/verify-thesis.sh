#!/usr/bin/env bash
#
# verify-thesis.sh — source-side doctrine check for AXIS.
#
# The runtime `detectBannedPhrasings` gate governs LLM READING OUTPUT only. It
# never sees hand-authored, user-facing copy — the "ungoverned React" gap: the
# .tsx pages, components, and static descriptor strings a person wrote by hand.
# This script closes that gap. It scans hand-authored source for
# resolution-by-hierarchy framing — the doctrine that the Tropical/Sidereal
# divergence must NEVER be resolved by depth-ranking one system as the "real"
# self beneath the other's "performance" (see NOTHING MAY BE MADE MORE PALATABLE
# THAN IT IS — resolution-by-hierarchy in prompts.ts).
#
# It is a smoke detector, NOT a fixer — it never edits anything.
#
# Scope of the scan (hand-authored source only):
#   INCLUDE  src/**/*.tsx, src/components/**/*.ts, src/lib/planet-descriptors.ts,
#            page files under src/app/**/*.tsx
#   EXCLUDE  src/lib/prompts.ts, src/lib/reading-quality-gate.ts, *.module.css,
#            *.css — these are the GOVERNANCE files that DEFINE and describe the
#            ban. They legitimately contain every banned phrase. Flagging them is
#            a false positive that gets the whole check disabled.
#
# Usage (from repo root):  bash scripts/verify-thesis.sh
# Exit 0 iff every non-INFO check passes; exit 1 if any FAIL. INFO checks are
# open judgment calls awaiting a ruling and never affect the exit code.
#
# Pure bash: grep -rniE and file-existence tests only. No node, no deps.

set -u

FAILS=0

header() { printf '\n== %s ==\n' "$1"; }
pass()   { printf 'PASS %s\n' "$1"; }
fail()   { printf 'FAIL %s — %s\n' "$1" "$2"; FAILS=$((FAILS + 1)); }
info()   { printf 'INFO %s — %s\n' "$1" "$2"; }

# ---------------------------------------------------------------------------
# scan PATTERN — grep the hand-authored include set for an ERE, EXCLUDING the
# governance files. Prints matching file:line:content, one per line. Empty
# output means clean.
#
# The include set is the union of:
#   * every *.tsx under src/            (covers src/components + src/app pages)
#   * every *.ts under src/components/
#   * src/lib/planet-descriptors.ts     (the one hand-authored lib string file)
# The recursive greps additionally --exclude the governance files defensively,
# so prompts.ts / reading-quality-gate.ts can never be scanned even if a future
# refactor moves them under an included path.
# ---------------------------------------------------------------------------
scan() {
  local pat="$1"
  {
    grep -rniE --include='*.tsx' \
      --exclude='*.module.css' --exclude='*.css' \
      --exclude='prompts.ts' --exclude='reading-quality-gate.ts' \
      "$pat" src/ 2>/dev/null
    grep -rniE --include='*.ts' \
      --exclude='*.module.css' --exclude='*.css' \
      --exclude='prompts.ts' --exclude='reading-quality-gate.ts' \
      "$pat" src/components/ 2>/dev/null
    if [ -f src/lib/planet-descriptors.ts ]; then
      grep -niE "$pat" src/lib/planet-descriptors.ts 2>/dev/null \
        | sed 's|^|src/lib/planet-descriptors.ts:|'
    fi
  }
}

# check CHECK-ID PATTERN DESCRIPTION — pass iff the scan finds nothing; on a hit,
# fail and print the offending file:line(s) so the fix is one grep away.
check() {
  local id="$1" pat="$2" desc="$3" hits
  hits="$(scan "$pat")"
  if [ -z "$hits" ]; then
    pass "$id"
  else
    fail "$id" "$desc — $(printf '%s' "$hits" | tr '\n' '|')"
  fi
}

# ---------------------------------------------------------------------------
# HAND-AUTHORED COPY — RESOLUTION BY HIERARCHY (ban-list literals)
#
# The literal phrasings enumerated in BANNED_HIERARCHY_PHRASINGS (prompts.ts,
# lines 43–55) that a person could type into hand-authored copy. Each depth-ranks
# one system beneath the other — banned.
# ---------------------------------------------------------------------------
header "HAND-AUTHORED COPY — RESOLUTION BY HIERARCHY (ban-list literals)"

check "hierarchy-deeper-stratum"        'deeper stratum'        'depth-ranking framing "deeper stratum"'
check "hierarchy-beneath-performance"   'beneath the performance' 'depth-ranking framing "beneath the performance"'
check "hierarchy-beneath-constructed"   'beneath the constructed' 'depth-ranking framing "beneath the constructed"'
check "hierarchy-real-self"             'the real self'         'depth-ranking framing "the real self"'
check "hierarchy-performed-self"        'the performed self'    'depth-ranking framing "the performed self"'
check "hierarchy-surface-versus-essence" 'surface versus essence' 'depth-ranking framing "surface versus essence"'
check "hierarchy-surface-vs-essence"    'surface vs essence'    'depth-ranking framing "surface vs essence"'
check "hierarchy-the-mask"              'the mask'              'depth-ranking framing "the mask"'

# ---------------------------------------------------------------------------
# HAND-AUTHORED COPY — BENEATH / UNDERNEATH (context-bounded)
#
# "beneath" / "underneath" are NOT banned bare — they appear in legitimate
# CSS-comment and layout prose ("the panel sits underneath the rail"). They are
# banned ONLY when adjacent (within 30 chars) to identity/self/constructed
# language, where they re-encode the hierarchy. Both directions are checked.
# ---------------------------------------------------------------------------
header "HAND-AUTHORED COPY — BENEATH / UNDERNEATH (context-bounded)"

check "hierarchy-beneath-then-identity" \
  '(beneath|underneath).{0,30}(the constructed|identity|self|tropical|performance)' \
  'beneath/underneath adjacent to identity language'
check "hierarchy-identity-then-beneath" \
  '(constructed|identity|self).{0,30}(beneath|underneath)' \
  'identity language adjacent to beneath/underneath'

# ---------------------------------------------------------------------------
# HAND-AUTHORED COPY — SYNONYM RE-ENCODINGS (uncaught by the ban list)
#
# The framings the recent purge targeted that BANNED_HIERARCHY_PHRASINGS does
# NOT literally contain — the ones that re-encode the hierarchy through synonyms.
# These are the leaks the runtime gate structurally cannot catch.
# ---------------------------------------------------------------------------
header "HAND-AUTHORED COPY — SYNONYM RE-ENCODINGS (uncaught by the ban list)"

check "reencode-self-beneath"        'self beneath'            'synonym hierarchy "self beneath"'
check "reencode-deeper-layer"        'deeper layer'            'synonym hierarchy "deeper layer"'
check "reencode-pre-date-constructed" 'pre-date the constructed' 'synonym hierarchy "pre-date the constructed"'
check "reencode-before-conditioning" 'before conditioning'     'synonym hierarchy "before conditioning"'
check "reencode-terrain-born"        'the terrain it was born' 'synonym hierarchy "the terrain it was born"'
check "reencode-born-into"           'born into'               'synonym hierarchy "born into"'

# ---------------------------------------------------------------------------
# RESIDUAL KNOWN LEAK (INFO — never affects exit code)
#
# The sidereal system prompt (prompts.ts, ~line 423) reads "…deep instinctive
# orientations that pre-date the constructed identity." This is inside the
# GOVERNANCE file — deliberately excluded from the scan above — and reads as
# incarnational patterning, not resolution-by-hierarchy. But it uses the same
# vocabulary the purge chased out of user-facing copy, so it is an open judgment
# call awaiting a ruling: keep as legitimate temporal framing, or rephrase.
# ---------------------------------------------------------------------------
header "RESIDUAL KNOWN LEAK (INFO)"

PROMPTS="src/lib/prompts.ts"
if [ -f "$PROMPTS" ] \
  && grep -qiE 'pre-date the constructed identity' "$PROMPTS"; then
  LEAK_LINE="$(grep -niE 'pre-date the constructed identity' "$PROMPTS" | head -1 | cut -d: -f1)"
  info "prompts-predate-constructed-identity" \
    "$PROMPTS:${LEAK_LINE:-?} 'pre-date the constructed identity' in the sidereal system prompt — open judgment call (incarnational-patterning framing vs. resolution-by-hierarchy), awaiting a ruling. Not a FAIL: it lives in a governance file, not hand-authored copy."
else
  info "prompts-predate-constructed-identity" \
    "no 'pre-date the constructed identity' string in $PROMPTS — the residual leak this INFO tracks is gone or was rephrased."
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
