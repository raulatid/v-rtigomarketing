import { readdirSync } from 'node:fs'
import path from 'node:path'

/** Browser-source coverage follows adjacent tests, independent of the shell cwd. */
export function coverageModules(sourceRoot: string): string[] {
  const modules = new Set<string>(['src/content/lookup.ts', 'src/content/invariants.ts'])
  function visit(directory: string): void {
    const entries = readdirSync(directory, { withFileTypes: true })
    const files = new Set(entries.filter((entry) => entry.isFile()).map((entry) => entry.name))
    for (const entry of entries) {
      if (entry.isDirectory()) {
        visit(path.join(directory, entry.name))
      } else if (/\.test\.tsx?$/.test(entry.name)) {
        const stem = entry.name.replace(/\.test\.tsx?$/, '')
        for (const extension of ['ts', 'tsx']) {
          const candidate = `${stem}.${extension}`
          if (files.has(candidate)) {
            const relative = path.relative(sourceRoot, path.join(directory, candidate))
            modules.add(`src/${relative.split(path.sep).join('/')}`)
          }
        }
      }
    }
  }
  visit(sourceRoot)
  return [...modules].sort()
}
