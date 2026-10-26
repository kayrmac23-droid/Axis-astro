// Vitest config for the batch eval harness only (scripts/eval-readings.mjs).
// Kept separate from the root vitest.config.ts so the harness is collected ONLY
// when launched deliberately: the ordinary `npm test` never sees it.
import { defineConfig } from 'vitest/config'
import path from 'path'

const root = path.resolve(__dirname, '..')

export default defineConfig({
  root,
  test: {
    environment: 'node',
    include: ['scripts/eval-readings.harness.ts'],
    // A full gated run is hours of sequential model calls; no per-test ceiling.
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    silent: false,
  },
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
})
