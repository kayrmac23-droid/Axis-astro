import { defineConfig, configDefaults } from 'vitest/config'
import path from 'path'

export default defineConfig({
  test: {
    environment: 'node',
    // `exclude` REPLACES vitest's defaults rather than merging, so the defaults
    // are spread back in — otherwise dist/ and config files stop being ignored.
    // The sibling-clone patterns keep a nested verification checkout from being
    // globbed into the run and silently doubling the reported test count.
    exclude: [...configDefaults.exclude, '**/axis-fresh/**', '**/axis-verify/**'],
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
})
