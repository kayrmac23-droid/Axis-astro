// The reading thread — what makes a natal reading one continuous document
// instead of ~21 disconnected essays.
//
// Every section is still its own /api/reading request (so no single request
// carries the whole reading's generation time), but each one is now written
// knowing everything the reader has already read. The client opens a thread with
// a random id when a chart's reading starts; the route stores each section's text
// under that id the moment it has streamed it, and loads the earlier sections
// back when writing the next one.
//
// Why the server holds the text rather than the client sending it back:
//   - the route's 16 KB payload guard would reject the request by about the fifth
//     section, and
//   - text the browser supplies would go straight into the prompt — an injection
//     path, and a way to poison the cache for someone else's chart.
// The thread key binds the id to the chart's birth data, so an id replayed with a
// different chart reads and writes a different, empty thread.
//
// Stored text is exactly what the reader saw (the first pass, or the cached text
// on a cache hit), never the quality gate's later repair: continuity is with what
// was read. Entries expire after 24h.

import { createHash } from 'crypto'
import Anthropic from '@anthropic-ai/sdk'
import type { BirthData } from '@/lib/astro-calc'
import { getRedis, makeCacheKey } from '@/lib/reading-cache'
import { priorSectionsFor, type SectionRef } from '@/lib/reading-order'

const THREAD_TTL_SECONDS = 24 * 60 * 60

// Client-generated (crypto.randomUUID()). Strict shape so an id can never carry
// anything into a Redis key but what we expect.
const THREAD_ID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

export function parseThreadId(value: unknown): string | null {
  return typeof value === 'string' && THREAD_ID_RE.test(value) ? value.toLowerCase() : null
}

export interface ThreadScope {
  threadId:     string
  birth:        BirthData
  plutoSource?: string
}

function threadKey({ threadId, birth, plutoSource }: ThreadScope, ref: SectionRef): string {
  // makeCacheKey already normalises birth data (and carries the prompt version),
  // so reuse it as the chart fingerprint rather than keeping a second normaliser.
  const chart = makeCacheKey({ birth, section: '_thread', planetSection: '_', plutoSource })
  const bind  = createHash('sha256').update(`${threadId}|${chart}`).digest('hex').slice(0, 40)
  return `axis:thread:${bind}:${ref.section}:${ref.planetSection}`
}

// ── In-memory fallback (local dev without Redis) ─────────────────────────────
// Per-instance only; on a multi-instance deployment Redis is what makes the
// thread visible to the next request. Capped so it can never grow unbounded.
const MEMORY_CAP = 2000
const memory = new Map<string, { text: string; expires: number }>()

function memoryGet(key: string): string | null {
  const hit = memory.get(key)
  if (!hit) return null
  if (hit.expires < Date.now()) { memory.delete(key); return null }
  return hit.text
}

function memorySet(key: string, text: string): void {
  if (memory.size >= MEMORY_CAP) {
    const oldest = memory.keys().next().value
    if (oldest !== undefined) memory.delete(oldest)
  }
  memory.set(key, { text, expires: Date.now() + THREAD_TTL_SECONDS * 1000 })
}

// Test hook — the fallback store is module state.
export function _resetThreadMemoryForTests(): void {
  memory.clear()
}

export interface PriorSection extends SectionRef {
  text: string
}

// Loads every earlier section this thread holds, in reading order. A section that
// failed, was never generated, or has expired is simply absent — the next section
// is written after whatever the reader actually has. Never throws.
export async function loadPriorSections(
  scope: ThreadScope,
  section: string,
  planetSection: string,
): Promise<PriorSection[]> {
  const refs = priorSectionsFor(section, planetSection)
  if (refs.length === 0) return []
  const keys = refs.map(ref => threadKey(scope, ref))

  let texts: (string | null)[]
  const redis = getRedis()
  if (redis) {
    try {
      texts = await redis.mget<(string | null)[]>(...keys)
    } catch (err) {
      console.error('[AXIS_THREAD] Redis MGET error:', err instanceof Error ? err.message : err)
      return []
    }
  } else {
    texts = keys.map(memoryGet)
  }

  const prior: PriorSection[] = []
  refs.forEach((ref, i) => {
    const text = texts[i]
    if (typeof text === 'string' && text.trim()) prior.push({ ...ref, text })
  })
  return prior
}

// Must be awaited BEFORE the response closes: the client fires the next section
// the moment this one's stream ends, and that request has to find this text.
export async function storeThreadSection(
  scope: ThreadScope,
  section: string,
  planetSection: string,
  text: string,
): Promise<void> {
  if (!text.trim()) return
  const key = threadKey(scope, { section: section as SectionRef['section'], planetSection })
  const redis = getRedis()
  if (!redis) { memorySet(key, text); return }
  try {
    await redis.set(key, text, { ex: THREAD_TTL_SECONDS })
  } catch (err) {
    console.error('[AXIS_THREAD] Redis SET error:', err instanceof Error ? err.message : err)
  }
}

// ── Prompt rendering ─────────────────────────────────────────────────────────

const FRAME_LABEL: Record<string, string> = {
  tropical: 'Tropical reading', sidereal: 'Sidereal reading', synthesis: 'The Divergence',
}
const PART_LABEL: Record<string, string> = {
  sun: 'Sun', moon: 'Moon', ascendant: 'Ascendant', lagna: 'Lagna', mercury: 'Mercury',
  venus: 'Venus', mars: 'Mars', jupiter_saturn: 'Jupiter & Saturn', rahu_ketu: 'Rahu & Ketu',
  key_aspects: 'Key aspects', agree: 'Concordance', diverge: 'Where they part',
  tension: 'The central tension', closing: 'Living the divergence',
}

export const READING_SO_FAR_HEADER =
  'THE READING SO FAR — every section this reader has already read, verbatim and in order. ' +
  'You wrote this prose for this same person. The section you are writing now comes next in ' +
  'the same document: continue it, do not repeat it (see ONE CONTINUOUS READING in the rules).'

export const READING_SO_FAR_FOOTER = '──────────── END OF THE READING SO FAR ────────────'

function sectionHeading(p: SectionRef): string {
  return `──────────── ALREADY READ · ${FRAME_LABEL[p.section] ?? p.section} · ${PART_LABEL[p.planetSection] ?? p.planetSection} ────────────`
}

// One content block per earlier section, so consecutive requests share an
// identical block prefix and prompt caching reuses everything but the newest
// section. The breakpoint sits on the last block; the API's lookback finds the
// previous request's breakpoint one block earlier.
export function priorSectionBlocks(prior: PriorSection[]): Anthropic.TextBlockParam[] {
  if (prior.length === 0) return []
  const blocks: Anthropic.TextBlockParam[] = prior.map((p, i) => ({
    type: 'text',
    text: `${i === 0 ? `${READING_SO_FAR_HEADER}\n\n` : ''}${sectionHeading(p)}\n${p.text.trim()}`,
  }))
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], cache_control: { type: 'ephemeral' } }
  return blocks
}

// The same content as one string, for the quality gate: its evaluator judges
// repetition against it, and its repair pass must continue the same document.
export function priorSectionsText(prior: PriorSection[]): string {
  if (prior.length === 0) return ''
  return `${READING_SO_FAR_HEADER}\n\n${prior.map(p => `${sectionHeading(p)}\n${p.text.trim()}`).join('\n\n')}\n\n${READING_SO_FAR_FOOTER}\n\n`
}

// ── Repeated phrasing ────────────────────────────────────────────────────────
// A refrain survives "do not repeat yourself" because the model does not count:
// one live reading said "chosen" eleven times across both frames (lifted from the
// Leo knowledge-base line) and pasted the same trine caveat onto four sections.
// This finds the phrases the reading so far has already leaned on, so the next
// section can be told by name not to use them again. Deterministic, no model call.

const STOPWORDS = new Set((
  'a an the and or but nor of to in on at for with by from as is are was were be been being it its ' +
  'this that these those not no than then what which who whom whose when where how why into onto over ' +
  'under more most less least so such very just only also even still rather about through before after ' +
  'while because if own same other each both one can could would should will may might must does do did ' +
  'has have had they them their theirs you your yours he she his her we our us there here out up down any ' +
  'all every some much many like without within between against whatever itself themselves yourself ' +
  'something someone anything nothing enough far once twice again too way'
).split(' '))

// Chart vocabulary repeats legitimately ("the Leo Sun", "the 8th house").
const CHART_TERMS = new Set((
  'sun moon mercury venus mars jupiter saturn uranus neptune pluto rahu ketu node nodes nodal ' +
  'aries taurus gemini cancer leo virgo libra scorpio sagittarius capricorn aquarius pisces ' +
  'house houses ascendant lagna rising square squares trine trines sextile opposition opposite conjunct ' +
  'conjunction aspect aspects sign signs chart tropical sidereal nakshatra pada dasha mahadasha antardasha ' +
  'retrograde domicile fall detriment exaltation exalted debilitated peregrine dignity ruler rules lord ' +
  'placement frame frames lord lordship drishti dispositor'
).split(' '))

export const REPEATED_PHRASE_MIN_COUNT = 3

export function phrasesAlreadyUsed(prior: PriorSection[], max = 15): string[] {
  const counts = new Map<string, { total: number; sections: Set<number> }>()
  prior.forEach((p, idx) => {
    const prose = p.text.split('\n').filter(l => !l.trimStart().startsWith('#')).join(' ')
    const words = prose.toLowerCase().replace(/[’']/g, "'").match(/[a-z][a-z'-]*/g) ?? []
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i + n <= words.length; i++) {
        const gram = words.slice(i, i + n)
        if (STOPWORDS.has(gram[0]) || STOPWORDS.has(gram[n - 1])) continue
        if (gram.some(w => CHART_TERMS.has(w))) continue
        const key = gram.join(' ')
        const entry = counts.get(key) ?? { total: 0, sections: new Set<number>() }
        entry.total++
        entry.sections.add(idx)
        counts.set(key, entry)
      }
    }
  })
  const candidates = Array.from(counts.entries())
    .filter(([, e]) => e.total >= REPEATED_PHRASE_MIN_COUNT && e.sections.size >= 2)
    .sort((a, b) => b[0].split(' ').length - a[0].split(' ').length || b[1].total - a[1].total)
  // Keep the longest form of a refrain: "the chosen few" subsumes "chosen few".
  const kept: Array<[string, number]> = []
  for (const [gram, e] of candidates) {
    if (kept.some(([k]) => ` ${k} `.includes(` ${gram} `))) continue
    kept.push([gram, e.total])
  }
  return kept.sort((a, b) => b[1] - a[1]).slice(0, max).map(([g]) => g)
}

// Verbal tics a varied refrain hides behind. The n-gram pass cannot see these:
// "rather than" is all stopwords, and "actually"/"genuine" are single words. The
// v10.24 reading used "rather than" about seventy times in roughly eleven
// thousand words, the X-rather-than-Y antithesis as a sentence template.
const VERBAL_TICS = [
  'rather than', 'actually', 'genuine', 'genuinely', 'specific', 'specifically',
  'simply', 'precisely', 'quietly', 'exactly', 'entirely', 'hunger', 'chosen',
] as const
export const TIC_MIN_COUNT = 6

export function overusedTics(prior: PriorSection[]): Array<{ tic: string; count: number }> {
  const prose = prior.map(p => p.text.split('\n').filter(l => !l.trimStart().startsWith('#')).join(' ')).join(' ').toLowerCase()
  return VERBAL_TICS
    .map(tic => ({ tic, count: (prose.match(new RegExp(`\\b${tic}\\b`, 'g')) ?? []).length }))
    .filter(t => t.count >= TIC_MIN_COUNT)
    .sort((a, b) => b.count - a.count)
}

export function phrasesAlreadyUsedBlock(prior: PriorSection[]): string {
  const phrases = phrasesAlreadyUsed(prior)
  const tics = overusedTics(prior)
  let out = ''
  if (phrases.length > 0) {
    out += `PHRASES ALREADY USED — the reading so far has leaned on each of these at least ${REPEATED_PHRASE_MIN_COUNT} times across sections. None of them may appear in this section; say what THIS placement adds instead:\n${phrases.map(p => `· "${p}"`).join('\n')}\n\n`
  }
  if (tics.length > 0) {
    out += `OVERUSED CONSTRUCTIONS — counts across the reading so far. Use each AT MOST ONCE in this section, and vary the sentence shape (the "X rather than Y" antithesis in particular has become a template):\n${tics.map(t => `· "${t.tic}" ×${t.count}`).join('\n')}\n\n`
  }
  return out
}

// Folded into the reading cache key: a section is only reusable after the exact
// earlier text it was written to follow.
export function priorDigest(prior: PriorSection[]): string {
  if (prior.length === 0) return ''
  const h = createHash('sha256')
  for (const p of prior) h.update(`${p.section}:${p.planetSection}\u0000${p.text}\u0000`)
  return h.digest('hex').slice(0, 32)
}
