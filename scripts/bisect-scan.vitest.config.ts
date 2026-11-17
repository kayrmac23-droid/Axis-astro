// Vitest config for scripts/bisect-scan.harness.ts only (bisect measurement helper).
import { defineConfig } from 'vitest/config'
import path from 'path'

const root = path.resolve(__dirname, '..')

export default defineConfig({
  root,
  test: { environment: 'node', include: ['scripts/bisect-scan.harness.ts'], silent: false },
  resolve: { alias: { '@': path.resolve(root, 'src') } },
})
