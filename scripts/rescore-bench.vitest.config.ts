// Vitest config for the rater bench harness only (scripts/rescore-bench.mjs).
// Separate from the root vitest.config.ts for the same reason the eval
// harness's is: `npm test` must never collect something that spends money.
import { defineConfig } from 'vitest/config'
import path from 'path'

const root = path.resolve(__dirname, '..')

export default defineConfig({
  root,
  test: {
    environment: 'node',
    include: ['scripts/rescore-bench.harness.ts'],
    // 21 sequential evaluator calls; no per-test ceiling.
    testTimeout: 0,
    hookTimeout: 0,
    fileParallelism: false,
    silent: false,
    disableConsoleIntercept: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
    },
  },
})
