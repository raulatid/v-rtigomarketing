import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { COLLECTIONS } from '../collections/index'
import { generate } from './generate'
import { SourceError, fileSource, wordPressSource, type ContentSource } from './source'

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
    const cases = JSON.parse(fs.readFileSync(path.join(FIXTURES, 'case_study.json'), 'utf8'))
    cases[2].brandColor = 'not-a-colour'
    fs.writeFileSync(path.join(dir, 'case_study.json'), JSON.stringify(cases))
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
    fs.writeFileSync(path.join(dir, 'case_study.json'), JSON.stringify([{ id: 'broken' }]))
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
    fs.writeFileSync(path.join(dir, 'case_study.json'), '[]')
    fs.copyFileSync(path.join(FIXTURES, 'district.json'), path.join(dir, 'district.json'))
    const result = await run(fileSource(dir, 'empty'))
    expect(result.ok).toBe(false)
    fs.rmSync(dir, { recursive: true, force: true })
  })
})

describe('the WordPress source', () => {
  /** A fake REST endpoint that paginates like WordPress does. */
  function fakeWp(records: unknown[], perPage = 100, overrides: Record<string, string> = {}) {
    const calls: string[] = []
    const impl = (async (url: string) => {
      calls.push(url)
      const page = Number(new URL(url).searchParams.get('page') ?? '1')
      const slice = records.slice((page - 1) * perPage, page * perPage)
      const headers = new Headers({
        'X-WP-Total': String(records.length),
        'X-WP-TotalPages': String(Math.max(1, Math.ceil(records.length / perPage))),
        ...overrides,
      })
      return new Response(JSON.stringify(slice), { status: 200, headers })
    }) as unknown as typeof fetch
    return { impl, calls }
  }

  const spec = { postType: 'case_study' }

  it('follows every page rather than stopping at the first', async () => {
    // Today's collections are six records and one. The registry is meant to
    // carry collections that are not, and a source that silently returned the
    // first hundred would be correct until the day it quietly was not.
    const records = Array.from({ length: 250 }, (_, i) => ({ i }))
    const { impl, calls } = fakeWp(records)
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    expect(await source.fetchAll(spec)).toHaveLength(250)
    expect(calls).toHaveLength(3)
  })

  it('requests a stable order, so two pulls of unchanged content match', async () => {
    const { impl, calls } = fakeWp([{ a: 1 }])
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    await source.fetchAll(spec)
    expect(calls[0]).toContain('orderby=slug')
  })

  it('fails when the reported total disagrees with what arrived', async () => {
    // A mismatch means the collection changed between page requests, so the
    // snapshot is torn — a record duplicated across the boundary or missed. A
    // build is cheap to retry; a wrong deployment is not.
    const { impl } = fakeWp([{ a: 1 }], 100, { 'X-WP-Total': '99' })
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    await expect(source.fetchAll(spec)).rejects.toThrow(/torn/)
  })

  it('fails loudly on a non-2xx rather than treating it as no content', async () => {
    const impl = (async () => new Response('nope', { status: 503, statusText: 'Unavailable' })) as unknown as typeof fetch
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    await expect(source.fetchAll(spec)).rejects.toBeInstanceOf(SourceError)
  })

  it('fails on malformed JSON', async () => {
    const impl = (async () => new Response('<html>error</html>', { status: 200 })) as unknown as typeof fetch
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    await expect(source.fetchAll(spec)).rejects.toBeTruthy()
  })

  it('gives up rather than spinning when the server never terminates', async () => {
    // A server that returns a constant X-WP-TotalPages would otherwise hold the
    // build forever.
    const impl = (async () =>
      new Response('[]', {
        status: 200,
        headers: new Headers({ 'X-WP-Total': '0', 'X-WP-TotalPages': '999999' }),
      })) as unknown as typeof fetch
    const source = wordPressSource({ baseUrl: 'https://cms.test/wp-json/wp/v2', fetchImpl: impl })
    await expect(source.fetchAll(spec)).rejects.toThrow(/not terminating/)
  })

  it('times out instead of hanging', async () => {
    const impl = ((_url: string, init: RequestInit) =>
      new Promise((_resolve, reject) => {
        init.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as unknown as typeof fetch
    const source = wordPressSource({
      baseUrl: 'https://cms.test/wp-json/wp/v2',
      fetchImpl: impl,
      timeoutMs: 10,
    })
    await expect(source.fetchAll(spec)).rejects.toThrow(/timed out/)
  })
})
