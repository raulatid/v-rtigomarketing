import { mkdirSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

const studio = fileURLToPath(new URL('../', import.meta.url))
mkdirSync(new URL('../.out/', import.meta.url), {recursive: true})
const cli = fileURLToPath(new URL('../node_modules/sanity/bin/sanity', import.meta.url))
const result = spawnSync(process.execPath, [cli, 'schema', 'extract', '--path', '.out/schema-check.json'], {
  cwd: studio,
  stdio: 'inherit',
})
if (result.error) console.error(result.error.message)
process.exit(result.status ?? 1)
