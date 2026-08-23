import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COLLECTIONS } from '../collections/index'
import { generate } from './generate'
import { SourceError, fileSource, type ContentSource } from './source'

const FIXTURES = path.join(process.cwd(), 'content', 'fixtures')

let outDir: string
beforeEach(() => {
  outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-content-'))
})
afterEach(() => {
  fs.rmSync(outDir, { recursive: true, force: true })
})

const run = (source: ContentSource) =>
  generate({ collections: COLLECTIONS, source, outDir })

describe('the content build', () => {
  it('writes one module per collection from the fixtures', async () => {
    const result = await run(fileSource(FIXTURES, 'fixtures'))
    expect(result.ok).toBe(true)
    expect(fs.existsSync(path.join(outDir, 'caseStudies.ts'))).toBe(true)
    expect(fs.existsSync(path.join(outDir, 'districts.ts'))).toBe(true)
  })

  it('is deterministic, so an unchanged collection produces an unchanged file', async () => {
    // The property the whole design leans on: it is what makes a content diff
    // mean something, what keeps Vite's chunk hashes stable across a no-op sync,
    // and what lets the build report "nothing changed" as a fact.
    const first = await run(fileSource(FIXTURES, 'fixtures'))
    const written = fs.readFileSync(path.join(outDir, 'caseStudies.ts'), 'utf8')

    const second = await run(fileSource(FIXTURES, 'fixtures'))
    expect(fs.readFileSync(path.join(outDir, 'caseStudies.ts'), 'utf8')).toBe(written)

    expect(first.ok && first.changed).toEqual(['caseStudies.ts', 'districts.ts'])
    // Second run: same bytes, so nothing is reported as changed.
    expect(second.ok && second.changed).toEqual([])
  })

  it('carries no timestamp or other per-run value', async () => {
    await run(fileSource(FIXTURES, 'fixtures'))
    const written = fs.readFileSync(path.join(outDir, 'caseStudies.ts'), 'utf8')
    // A year is the cheapest proxy for "someone added a date". Content years are
    // inside quoted JSON values, so a bare 20xx in the banner would be new.
    expect(written.split('\n').slice(0, 12).join('\n')).not.toMatch(/20\d\d/)
  })
})

describe('failure policy', () => {
  it('reports problems and writes NOTHING when a record is invalid', async () => {
    // All-or-nothing at the collection level: publishing five of six case
    // studies because the sixth had a bad chart is a silent content outage.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-bad-'))
    const cases = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'caseStudy.json'), 'utf8'))
    cases[2].brandColor = 'not-a-colour'
    fs.writeFileSync(path.join(dir, 'caseStudy.json'), JSON.stringify(cases))
    fs.copyFileSync(path.join(FIXTURES, 'district.json'), path.join(dir, 'district.json'))

    const result = await run(fileSource(dir, 'broken'))
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.failures[0].key).toBe('caseStudies')
      expect(result.failures[0].problems[0].path).toContain('brandColor')
    }
    // Not even the collection that WAS valid.
    expect(fs.existsSync(path.join(outDir, 'caseStudies.ts'))).toBe(false)
    expect(fs.existsSync(path.join(outDir, 'districts.ts'))).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('leaves a previous generation untouched when a later one fails', async () => {
    // The transaction that matters in practice: a good build, then a bad sync.
    // The bad one must not half-replace the good one.
    await run(fileSource(FIXTURES, 'fixtures'))
    const good = fs.readFileSync(path.join(outDir, 'caseStudies.ts'), 'utf8')

    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-bad2-'))
    fs.writeFileSync(path.join(dir, 'caseStudy.json'), JSON.stringify([{ id: 'broken' }]))
    fs.copyFileSync(path.join(FIXTURES, 'district.json'), path.join(dir, 'district.json'))

    const result = await run(fileSource(dir, 'broken'))
    expect(result.ok).toBe(false)
    expect(fs.readFileSync(path.join(outDir, 'caseStudies.ts'), 'utf8')).toBe(good)
    fs.rmSync(dir, { recursive: true, force: true })
  })

  it('throws a SourceError, distinct from a content problem, when the source is unreachable', async () => {
    // "The CMS is down" and "this case study has no summary" want completely
    // different responses from whoever reads the build log, so they are
    // different failure types rather than one list of strings.
    await expect(run(fileSource('/no/such/directory', 'missing'))).rejects.toBeInstanceOf(SourceError)
  })

  it('rejects an empty collection rather than publishing nothing', async () => {
    // An empty REST response is an outage or a misconfigured post type, not an
    // editorial decision to delete every case study.
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'vertigo-empty-'))
    fs.writeFileSync(path.join(dir, 'caseStudy.json'), '[]')
    fs.copyFileSync(path.join(FIXTURES, 'district.json'), path.join(dir, 'district.json'))
    const result = await run(fileSource(dir, 'empty'))
    expect(result.ok).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})
