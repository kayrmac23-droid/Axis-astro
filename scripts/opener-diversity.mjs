#!/usr/bin/env node
// scripts/opener-diversity.mjs — does the OPENING PARAGRAPH change when the chart does?
//
// Generates ONE section for several charts and measures how much their opening
// paragraphs overlap once chart vocabulary is stripped. Nothing else in this
// repo compares two charts: every other instrument is scoped to one section of
// one reading, which is why a template opener shared across three different Sun
// signs went unseen. Use it as a before/after around a change to an opener
// instruction, the way the rater bench is used around a change to the rubric.
//
//   npm run openers -- --label=before
//   npm run openers -- --label=after
//   npm run openers -- --planet=venus --charts=control-chicago-1987,control-mumbai-1972
//
// Only the first section of a reading is generated, so there are no priors and
// the arms are comparable without seeding a thread. ~1 call per chart.
// Output: eval-output/opener_<label>/{openers.json,<chart>.md}
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (n, d = '') => { const h = args.find(a => a.startsWith(`--${n}=`)); return h ? h.slice(n.length + 3) : d }

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n')
  process.exit(0)
}

const env = { ...process.env }
const envFile = join(ROOT, '.env.local')
if (existsSync(envFile)) for (const [k, v] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) env[k] ??= v
env.ANTHROPIC_API_KEY ||= env.API_KEY || ''
if (!env.ANTHROPIC_API_KEY) { console.error('opener-diversity: no ANTHROPIC_API_KEY (or API_KEY).'); process.exit(1) }

env.AXIS_EVAL = '1'
env.OPENER_LABEL  = flag('label', new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))
env.OPENER_FRAME  = flag('frame', 'tropical')
env.OPENER_PLANET = flag('planet', 'sun')
if (flag('charts')) env.OPENER_CHARTS = flag('charts')
if (flag('out'))    env.OPENER_OUT = resolve(ROOT, flag('out'))

const require = createRequire(import.meta.url)
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
spawn(process.execPath, [vitest, 'run', '--config', join(ROOT, 'scripts', 'opener-diversity.vitest.config.ts')],
  { cwd: ROOT, env, stdio: 'inherit' }).on('exit', c => process.exit(c ?? 1))
