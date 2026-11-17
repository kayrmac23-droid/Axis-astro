// scripts/bisect-scan.harness.ts — free, no-API scan of a directory of prose.
// Measurement helper for the voice-drift bisect (scratch branch only).
// Runs the doctrine scan of WHATEVER checkout it sits in, so the same file
// copied into an older worktree reports that version's scan.
//   BISECT_SCAN_DIR=dir BISECT_SCAN_OUT=file.json node <vitest> run --config scripts/bisect-scan.vitest.config.ts
import { describe, it } from 'vitest'
import { readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { detectBannedPhrasings } from '@/lib/reading-quality-gate'
import { detectContextualHierarchy } from '@/lib/prompts'

const DIR = process.env.BISECT_SCAN_DIR ?? ''
const OUT = process.env.BISECT_SCAN_OUT ?? ''

// Inter-system vocabulary the brief bans, with variants.
const VOCAB: Record<string, RegExp> = {
  blend:     /\bblend\w*/gi,
  synthesis: /\bsynthes\w*/gi,
  resolve:   /\b(?:un)?resol\w*/gi,
  integrate: /\b(?:dis)?integrat\w*/gi,
  merge:     /\bmerg\w*/gi,
  unify:     /\bunif\w*/gi,
  gap:       /\bgaps?\b/gi,
}
// DOCTRINE.md SMOKE DETECTOR terms not in the brief's list; reported apart.
const DOCTRINE_EXTRA: Record<string, RegExp> = {
  reconcile: /\b(?:ir)?reconcil\w*/gi,
  harmonize: /\bharmoni[sz]\w*/gi,
  bridge:    /\bbridg\w*/gi,
}

describe('bisect scan', () => {
  it('scans', () => {
    const out: Record<string, unknown> = {}
    for (const f of readdirSync(DIR).filter(f => f.endsWith('.md')).sort()) {
      const text = readFileSync(join(DIR, f), 'utf8')
      const vocab: Record<string, string[]> = {}
      for (const [k, re] of Object.entries(VOCAB)) vocab[k] = text.match(re) ?? []
      out[f] = {
        banned: detectBannedPhrasings(text),
        contextual: detectContextualHierarchy(text),
        vocab,
        vocab_total: Object.values(vocab).reduce((a, v) => a + v.length, 0),
        doctrine_extra: Object.fromEntries(Object.entries(DOCTRINE_EXTRA).map(([k, re]) => [k, text.match(re) ?? []])),
      }
    }
    writeFileSync(OUT, JSON.stringify(out, null, 2))
  })
})
