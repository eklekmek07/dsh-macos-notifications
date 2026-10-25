import { build } from 'esbuild'
import { mkdir } from 'node:fs/promises'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('../', import.meta.url))
await mkdir(new URL('../.test-build/', import.meta.url), { recursive: true })
await build({
  absWorkingDir: root, entryPoints: ['tests/ui.test.jsx'], outfile: '.test-build/ui.test.mjs',
  bundle: true, platform: 'node', format: 'esm', target: 'node22', jsx: 'automatic',
  packages: 'external',
})
const result = spawnSync(process.execPath, ['--test', '.test-build/ui.test.mjs'], { cwd: root, stdio: 'inherit' })
if (result.error) throw result.error
process.exitCode = result.status ?? 1
