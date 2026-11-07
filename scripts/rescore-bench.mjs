#!/usr/bin/env node
// scripts/rescore-bench.mjs — re-score the pinned rater bench.
//
// The prose in fixtures/rater-bench/ is frozen, so every score this produces is
// the EVALUATOR and nothing else. Use it to test a change to EVAL_SYSTEM_PROMPT
// before touching prompts.ts: a rubric revision that moves these numbers moved
// the instrument, and one that does not has told you the prose is the problem.
//
//   npm run rescore -- --audit            no API: which pinned lows were CLAMPS
//   npm run rescore                       score all 21 (≈21 evaluator calls)
//   npm run rescore -- --label=v10.43     name the output dir
//   npm run rescore -- --repeats=2        run twice: the run-to-run NOISE FLOOR,
//                                         without which no diff is attributable
//   npm run rescore -- --sections=sidereal,tropical/sun
//
// Output: eval-output/rescore_<label>/{rescore.json,clamp-audit.json}
// Reads ANTHROPIC_API_KEY (or API_KEY) from .env.local or the shell.
import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseEnv } from 'node:util'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const args = process.argv.slice(2)
const flag = (name, dflt = '') => {
  const hit = args.find(a => a.startsWith(`--${name}=`))
  return hit ? hit.slice(name.length + 3) : dflt
}

if (args.includes('--help') || args.includes('-h')) {
  process.stdout.write(readFileSync(fileURLToPath(import.meta.url), 'utf8').split('\nimport ')[0] + '\n')
  process.exit(0)
}

const audit = args.includes('--audit')

// .env.local, same as the eval harness.
const env = { ...process.env }
const envFile = join(ROOT, '.env.local')
if (existsSync(envFile)) {
  for (const [k, v] of Object.entries(parseEnv(readFileSync(envFile, 'utf8')))) env[k] ??= v
}
// The environment may carry the key as API_KEY; the code reads ANTHROPIC_API_KEY.
env.ANTHROPIC_API_KEY ||= env.API_KEY || ''

if (!audit && !env.ANTHROPIC_API_KEY) {
  console.error('rescore-bench: no ANTHROPIC_API_KEY (or API_KEY). Use --audit for the no-API clamp audit.')
  process.exit(1)
}

env.AXIS_EVAL = '1'
env.RESCORE_AUDIT    = audit ? '1' : '0'
env.RESCORE_LABEL    = flag('label', audit ? 'audit' : new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19))
env.RESCORE_REPEATS  = flag('repeats', '1')
env.RESCORE_SECTIONS = flag('sections', '')
if (flag('out')) env.RESCORE_OUT = resolve(ROOT, flag('out'))

const require = createRequire(import.meta.url)
const vitest = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs')
const child = spawn(
  process.execPath,
  [vitest, 'run', '--config', join(ROOT, 'scripts', 'rescore-bench.vitest.config.ts')],
  { cwd: ROOT, env, stdio: 'inherit' },
)
child.on('exit', code => process.exit(code ?? 1))
