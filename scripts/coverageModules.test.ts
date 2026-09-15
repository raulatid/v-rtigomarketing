import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { expect, it } from 'vitest'
import { coverageModules } from './coverageModules'

it('includes new adjacent TS/TSX modules and contracts, excluding tests and untested code', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'vertigo-coverage-'))
  try {
    mkdirSync(path.join(root, 'nested'))
    for (const name of ['model.ts', 'model.test.ts', 'View.tsx', 'View.test.ts',
      'untested.ts', 'orphan.test.ts', 'nested/control.ts', 'nested/control.test.tsx']) {
      writeFileSync(path.join(root, name), '')
    }
    expect(coverageModules(root)).toEqual([
      'src/View.tsx', 'src/content/invariants.ts', 'src/content/lookup.ts',
      'src/model.ts', 'src/nested/control.ts',
    ])
    writeFileSync(path.join(root, 'untested.test.ts'), '')
    expect(coverageModules(root)).toContain('src/untested.ts')
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
})
