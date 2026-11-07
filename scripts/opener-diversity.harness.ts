// scripts/opener-diversity.harness.ts — how much does the OPENING PARAGRAPH of a
// section change when the CHART changes?
//
// WHY THIS EXISTS. Every quality instrument in this pipeline is scoped to one
// section of one reading. `phrasesAlreadyUsed` catches a refrain repeated ACROSS
// sections of the same reading; `OPENER_MODES` (v10.27) was added because five
// sections of one reading converged on one opener. Nothing anywhere compares two
// DIFFERENT CHARTS. So the failure this measures was invisible by construction:
// on 2026-11-07 three charts with three different Sun signs — Scorpio,
// Sagittarius and Leo — opened their Sun sections on the same scene (a room, the
// word "perform", an involuntary act, a delayed noticing, a closing doubt about
// one's own sincerity). `specificity` cannot see it: a template scene still has a
// trigger, an action and an aftermath, so it scores as a scene. `anti_cliche`
// cannot see it: it is defined against SIGN keywords, not against the pipeline's
// own habits. `falsifiability` should see it and is pinned at 3.
//
// WHAT IT MEASURES. One section, generated for several charts, with the chart as
// the only thing that varies. Two numbers over the opening paragraphs:
//
//   jaccard   mean pairwise overlap of CONTENT words, after stopwords and all
//             chart vocabulary (sign, planet, house, dignity words) are removed.
//             Chart vocabulary is stripped deliberately: two Sun sections SHOULD
//             share the word "Sun", and differing sign names would flatter the
//             score. What is left is the writing, so a high number means the
//             prose is the same prose with the facts swapped.
//   markers   how many openers contain each beat of the template observed on
//             2026-11-07. Descriptive and admittedly post-hoc — it names the
//             specific thing to watch rather than scoring it. Lead on jaccard.
//
// Lower jaccard is better. There is no absolute target: it is a BEFORE/AFTER
// instrument for a change to an opener instruction, like the rater bench is for
// a change to the rubric.
//
// Only the FIRST section of a reading is generated, so there are no priors to
// seed and no thread to hold — one call per chart, and the arms are comparable
// without `--thread-from`.
import { describe, it, expect } from 'vitest'
import Anthropic from '@anthropic-ai/sdk'
import { execSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { calculateDualChart, type DualChartData } from '@/lib/astro-calc'
import { parseBirthDataInput } from '@/lib/birth-data-validation'
import { buildSectionRequest, type NatalFrame } from './eval-readings.request'

const ROOT   = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const CHARTS = join(ROOT, 'scripts', 'eval-charts.json')

const LABEL   = process.env.OPENER_LABEL   || 'run'
const OUT_DIR = process.env.OPENER_OUT     || join(ROOT, 'eval-output', `opener_${LABEL}`)
const FRAME   = (process.env.OPENER_FRAME  || 'tropical') as NatalFrame
const PLANET  = process.env.OPENER_PLANET  || 'sun'
const IDS     = (process.env.OPENER_CHARTS || 'control-chicago-1987,control-mumbai-1972,control-sao-paulo-2001,sun-cusp-toronto-1977,stellium-delhi-1962').split(',')

// Words that are legitimately shared because the subject is shared, or that vary
// only because the chart varies. Removing them leaves the prose itself.
const CHART_VOCAB = new Set([
  'sun','moon','mercury','venus','mars','jupiter','saturn','uranus','neptune','pluto','rahu','ketu','node','nodes',
  'aries','taurus','gemini','cancer','leo','virgo','libra','scorpio','sagittarius','capricorn','aquarius','pisces',
  'house','houses','first','second','third','fourth','fifth','sixth','seventh','eighth','ninth','tenth','eleventh','twelfth',
  'sign','degree','degrees','orb','conjunction','opposition','square','trine','sextile','aspect','aspects',
  'exalted','exaltation','detriment','fall','peregrine','dignity','ruler','rules','ruled','dispositor','retrograde',
  'tropical','sidereal','ascendant','lagna','nakshatra','chart',
])
const STOPWORDS = new Set([
  'the','a','an','and','or','but','of','to','in','is','it','that','this','you','your','yours','with','for','on','as','at','by',
  'not','no','be','been','being','are','was','were','has','have','had','do','does','did','so','if','then','than','what','which',
  'who','when','where','how','there','here','its','their','they','them','he','she','his','her','from','into','out','up','down',
  'about','over','under','again','more','most','some','any','all','own','same','just','very','can','could','will','would',
  'already','yet','still','even','only','also','because','while','before','after','one','two','something','someone','anything',
])

function words(text: string): Set<string> {
  return new Set(
    text.toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/)
      .map(w => w.replace(/^['-]+|['-]+$/g, ''))
      .filter(w => w.length > 2 && !STOPWORDS.has(w) && !CHART_VOCAB.has(w)),
  )
}
function jaccard(a: Set<string>, b: Set<string>): number {
  let inter = 0
  a.forEach(w => { if (b.has(w)) inter++ })
  const union = a.size + b.size - inter
  return union === 0 ? 0 : inter / union
}

// The beats of the template. ⚠ The FIRST TWO are the load-bearing ones and they
// were added after the 2026-11-07 baseline run, which taught the lesson this
// comment exists to keep: `jaccard` came back at 0.062 — genuinely low, the
// WORDS do vary — while 5 of 5 openers opened on a second-person scene and 5 of
// 5 closed that scene on "you notice". The model varies vocabulary competently
// and holds the SHAPE fixed, so a lexical metric reads a structural template as
// healthy diversity. Lead on `scene-open` and `notice-beat`; treat `jaccard` as
// a check that the wording is not ALSO being copied.
const MARKERS: Array<[string, RegExp]> = [
  // Does the opener open on a narrated moment at all?
  ['scene-open',      /^(you (walk|are|step|sit|hear|get)\b|someone\b|somebody\b|it('s| is) the moment\b|a (colleague|friend|stranger|conversation)\b)/i],
  // The delayed-realisation beat that closes the template's scene.
  ['notice-beat',     /\b(notice[sd]?|noticing|register(s|ed|ing)?|realise[sd]?|realize[sd]?)\b/i],
  ['room',            /\broom\b/i],
  ['perform',         /\bperform(s|ing|ed|ance)?\b/i],
  ['involuntary',     /\bbefore you('ve| have)? (chosen|decided)|without (having )?(chosen|decided)|whether you want|past the point where you meant\b/i],
  ['delayed-noticing',/\b(afterwards?|later|a beat too late|side-note)\b[^.]{0,80}\b(notice|register|realise|realize)|\b(notice|register)\b[^.]{0,40}\b(a beat too late|side-note|afterwards?|later)\b/i],
  ['watched',         /\bbeing watched|watched doing|people (see|watch)|the room (recalibrat|register)/i],
  ['own-sincerity',   /\b(whether|if) you (really |actually )?(believed|meant|wanted)|can'?t (quite )?(remember|recall) (if|whether)\b/i],
]

// The first paragraph of PROSE in the section, whatever headings precede it.
// ⚠ Not "everything before the first `###`": the section format is
// `## Planet → ### Planet in [Sign] → …` with no unheaded lead-in slot of its
// own, so whether the opening paragraph sits above or below the first
// sub-header is the model's choice and varies run to run. An extractor that
// assumed the unheaded slot returned an EMPTY STRING for 4 of 5 charts on the
// first run of this harness — and empty strings score jaccard 0.000 with every
// marker at 0, i.e. the metric reported a perfect result for having measured
// nothing. Read the first real paragraph instead, and treat a short one as a
// signal to go and look at the file.
function opener(section: string): string {
  const paras = section
    .split(/\n\s*\n/)
    .map(p => p.trim())
    .filter(p => p.length > 0 && !/^#{1,6}\s/.test(p))
  return paras[0] ?? ''
}

function castChart(id: string): DualChartData {
  const spec = (JSON.parse(readFileSync(CHARTS, 'utf8')).charts as Array<{ id: string; birth: unknown }>).find(c => c.id === id)
  if (!spec) throw new Error(`Unknown chart id: ${id}`)
  const parsed = parseBirthDataInput(spec.birth, { label: id })
  if (!parsed.ok) throw new Error(parsed.error)
  return calculateDualChart(parsed.data)
}

describe('opener diversity', () => {
  it('generates one section per chart and measures cross-chart overlap', async () => {
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
    let sha = 'unknown'
    try { sha = execSync('git rev-parse --short HEAD', { cwd: ROOT, stdio: ['ignore','pipe','ignore'] }).toString().trim() } catch { /* ignore */ }

    const rows: Array<{ id: string; opener: string; words: number; full: string }> = []
    for (const id of IDS) {
      const req = buildSectionRequest(castChart(id), FRAME, PLANET, [])
      const msg = await client.messages.create(req.params)
      const text = msg.content.filter(b => b.type === 'text').map(b => (b as { text: string }).text).join('')
      const op = opener(text)
      rows.push({ id, opener: op, words: op.split(/\s+/).length, full: text })
      console.log(`\n── ${id} (${op.split(/\s+/).length}w)\n${op}\n`)
    }

    // A too-short opener means the extractor missed, not that the prose is terse.
    // Fail loudly rather than publish a flattering number computed on nothing.
    const empty = rows.filter(r => r.words < 15)
    if (empty.length > 0) {
      throw new Error(
        `opener extraction failed for ${empty.length}/${rows.length} charts (${empty.map(r => r.id).join(', ')}). ` +
        `Inspect the saved .md files before trusting any metric from this run — an empty opener scores a perfect 0.000.`,
      )
    }

    console.log(`\n=== PAIRWISE OVERLAP of opening paragraphs (${FRAME}/${PLANET}) ===`)
    const sets = rows.map(r => words(r.opener))
    const pairs: number[] = []
    for (let i = 0; i < rows.length; i++) {
      for (let j = i + 1; j < rows.length; j++) {
        const s = jaccard(sets[i], sets[j])
        pairs.push(s)
        console.log(`  ${s.toFixed(3)}  ${rows[i].id} × ${rows[j].id}`)
      }
    }
    const mean = pairs.reduce((a, b) => a + b, 0) / pairs.length
    console.log(`\njaccard mean ${mean.toFixed(3)} · max ${Math.max(...pairs).toFixed(3)} · min ${Math.min(...pairs).toFixed(3)}  (lower = more chart-specific)`)

    console.log('\n=== TEMPLATE MARKERS (openers containing each beat) ===')
    console.log('  (scene-open and notice-beat are the load-bearing two — see MARKERS)')
    const markerCounts: Record<string, number> = {}
    for (const [name, re] of MARKERS) {
      const n = rows.filter(r => re.test(r.opener)).length
      markerCounts[name] = n
      console.log(`  ${name.padEnd(18)} ${n} / ${rows.length}`)
    }

    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(join(OUT_DIR, 'openers.json'), JSON.stringify({
      label: LABEL, sha, frame: FRAME, planet: PLANET, at: new Date().toISOString(),
      jaccard_mean: mean, jaccard_pairs: pairs, markers: markerCounts,
      rows: rows.map(({ id, opener, words }) => ({ id, opener, words })),
    }, null, 2))
    for (const r of rows) writeFileSync(join(OUT_DIR, `${r.id}.md`), r.full)
    console.log(`\nwrote ${join(OUT_DIR, 'openers.json')}`)
    expect(rows.length).toBe(IDS.length)
  })
})
