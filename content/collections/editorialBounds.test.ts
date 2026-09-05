import { describe, expect, it } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { EDITORIAL_BOUNDS, ID_MAX_LENGTH, ID_PATTERN } from '../../src/content/editorialBounds'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import { legalDocsCollection } from './legalDocs.collection'
import { servicesCollection } from './services.collection'
import { blogPostsCollection } from './blogPosts.collection'
import caseFixtures from '../fixtures/caseStudy.json'
import districtFixtures from '../fixtures/district.json'
import serviceFixtures from '../fixtures/service.json'
import blogFixtures from '../fixtures/blogPost.json'
import legalFixtures from '../fixtures/legalDoc.json'

/**
 * The bounds both sides of the CMS enforce, tested at the edge and one past it.
 *
 * A bound written down and never exercised is a bound nobody knows the sign of.
 * `> max` versus `>= max` is a one-character difference that no reader catches
 * and no fixture reaches, because fixtures are written comfortably inside every
 * limit. So every entry in `EDITORIAL_BOUNDS` that a mapper applies is checked
 * twice here: exactly at the bound, which must pass, and one character or one
 * item past it, which must not.
 *
 * The last suite is the other half — that the Studio still reads the same table
 * rather than a literal that happens to agree today.
 */

const clone = <T>(v: T): T => structuredClone(v)

type Mapper = {
  map: (record: unknown, index: number) => { ok: boolean; problems?: Array<{ path: string }> }
}

/** Maps one record and returns the problem paths, or [] when it succeeded. */
function problemsFor(collection: Mapper, record: unknown): string[] {
  const result = collection.map(record, 0)
  return result.ok ? [] : (result.problems ?? []).map((p) => p.path)
}

/** `n` characters of ordinary prose — never markup, which the mapper strips. */
const text = (n: number) => 'a'.repeat(n)

/**
 * Both sides of one bound, in one case.
 *
 * `mutate` writes a value of the given size into a valid record; the record is
 * rebuilt each time so the two calls cannot interfere.
 */
function boundary(
  label: string,
  max: number,
  build: () => Record<string, unknown>,
  mutate: (record: Record<string, unknown>, size: number) => void,
  collection: Mapper,
  problemPath: string,
) {
  it(label + ': accepts exactly ' + max, () => {
    const record = build()
    mutate(record, max)
    expect(problemsFor(collection, record)).toEqual([])
  })

  it(label + ': rejects ' + (max + 1), () => {
    const record = build()
    mutate(record, max + 1)
    // Matched on the SUFFIX: a mapper scopes each problem under the record's own
    // id, so the path reads `satellite-01.summary`. Asserting the field rather
    // than "it failed somehow" is the point — a record can fail for reasons the
    // mutation did not cause.
    const problems = problemsFor(collection, record)
    expect(
      problems.some((path) => path === problemPath || path.endsWith('.' + problemPath)),
      'expected a problem on ' + problemPath + ', got ' + JSON.stringify(problems),
    ).toBe(true)
  })
}

describe('the fixtures these cases start from map cleanly', () => {
  // Every case below breaks exactly one field of a valid record. If the record
  // were not valid to begin with, "rejects max + 1" would pass for the wrong
  // reason and "accepts max" would fail for one.
  it.each([
    ['caseStudy', caseStudiesCollection, caseFixtures[0]],
    ['district', districtsCollection, districtFixtures[0]],
    ['service', servicesCollection, serviceFixtures[0]],
    ['blogPost', blogPostsCollection, blogFixtures[0]],
    ['legalDoc', legalDocsCollection, legalFixtures[0]],
  ] as ReadonlyArray<readonly [string, Mapper, unknown]>)('%s', (_label, collection, fixture) => {
    expect(problemsFor(collection, clone(fixture))).toEqual([])
  })
})

describe('case study', () => {
  const build = () => clone(caseFixtures[0]) as Record<string, unknown>
  const B = EDITORIAL_BOUNDS.caseStudy

  boundary('name', B.name, build, (r, n) => { r.name = text(n) }, caseStudiesCollection, 'name')
  boundary('sector', B.name, build, (r, n) => { r.sector = text(n) }, caseStudiesCollection, 'sector')
  boundary('summary', B.summary, build, (r, n) => { r.summary = text(n) }, caseStudiesCollection, 'summary')
  boundary(
    'one detail line',
    B.detailLine,
    build,
    (r, n) => { r.details = [text(n)] },
    caseStudiesCollection,
    'details[0]',
  )
  boundary(
    'the number of details',
    B.details,
    build,
    (r, n) => { r.details = Array.from({ length: n }, () => 'punto') },
    caseStudiesCollection,
    'details',
  )
})

describe('district', () => {
  const build = () => clone(districtFixtures[0]) as Record<string, unknown>
  const B = EDITORIAL_BOUNDS.district

  boundary('label', B.label, build, (r, n) => { r.label = text(n) }, districtsCollection, 'label')
  boundary('summary', B.summary, build, (r, n) => { r.summary = text(n) }, districtsCollection, 'summary')
  boundary('intro', B.intro, build, (r, n) => { r.intro = text(n) }, districtsCollection, 'intro')
})

describe('service', () => {
  const build = () => clone(serviceFixtures[0]) as Record<string, unknown>
  const B = EDITORIAL_BOUNDS.service

  boundary('title', B.title, build, (r, n) => { r.title = text(n) }, servicesCollection, 'title')
  boundary('body', B.body, build, (r, n) => { r.body = text(n) }, servicesCollection, 'body')
})

describe('blog post', () => {
  const build = () => clone(blogFixtures[0]) as Record<string, unknown>
  const B = EDITORIAL_BOUNDS.blogPost

  boundary('title', B.title, build, (r, n) => { r.title = text(n) }, blogPostsCollection, 'title')
  boundary('excerpt', B.excerpt, build, (r, n) => { r.excerpt = text(n) }, blogPostsCollection, 'excerpt')
})

describe('legal document', () => {
  const build = () => clone(legalFixtures[0]) as Record<string, unknown>

  boundary(
    'title',
    EDITORIAL_BOUNDS.legalDoc.title,
    build,
    (r, n) => { r.title = text(n) },
    legalDocsCollection,
    'title',
  )
})

describe('the identifier contract', () => {
  it('accepts an id of exactly the maximum length', () => {
    expect(ID_PATTERN.test('a'.repeat(ID_MAX_LENGTH))).toBe(true)
  })

  it('rejects one character more', () => {
    expect(ID_PATTERN.test('a'.repeat(ID_MAX_LENGTH + 1))).toBe(false)
  })

  it.each(['Analisis', 'analisis web', '-analisis', 'analisis_web', ''])(
    'rejects %o',
    (candidate) => {
      expect(ID_PATTERN.test(candidate)).toBe(false)
    },
  )
})

/**
 * The Studio cannot be imported here — it is a separate package with its own
 * dependency tree — so its schemas are read as TEXT. That is enough for the one
 * question worth asking: are the numbers still coming from the shared table?
 *
 * Written as an ALLOWLIST of the literals that legitimately remain rather than a
 * list of the ones that must be gone. A new hardcoded bound is then a failure by
 * default, which is the direction that catches the case this whole change is
 * about — someone adding a field, typing a number into the schema, and typing a
 * different one into the mapper.
 */
describe('the Studio reads the same table', () => {
  const DIR = 'sanity-studio/schemas'
  const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'))

  /** Bounds that exist only in the Studio, with the reason they stay there. */
  const STUDIO_ONLY: Record<string, number[]> = {
    // Google's display limits: advisory (`.warning`) and about search results
    // rather than about the layout. Nothing in the build applies them.
    'blogPost.ts': [60, 160],
    // `year` is four digits with room for a range, e.g. 2024-2025. Nothing else
    // bounds it.
    'caseStudy.ts': [16],
    // `shortTitle` is a filter chip's label and a Studio-side nudge
    // (`.warning`), not a rule the build applies.
    'service.ts': [24],
    // `bookingLabel` — a button's words, bounded in the Studio and in
    // siteSettings.collection.ts, and not yet in the shared table.
    'siteSettings.ts': [24],
  }

  it.each(files)('%s declares no bound the table does not own', (file) => {
    const src = fs.readFileSync(path.join(DIR, file), 'utf8')
    const literals = [...src.matchAll(/\.(?:max|length)\((\d+)\)/g)].map((m) => Number(m[1]))
    const allowed = STUDIO_ONLY[file] ?? []
    const unexpected = literals.filter((n) => !allowed.includes(n))
    expect(
      unexpected,
      file + ' hardcodes ' + unexpected.join(', ') + ' — import it from ' +
        'src/content/editorialBounds.ts, or add it to STUDIO_ONLY with the reason it is ' +
        'the Studio own',
    ).toEqual([])
  })

  it('every schema that bounds anything imports the shared table', () => {
    const missing = files.filter((file) => {
      const src = fs.readFileSync(path.join(DIR, file), 'utf8')
      if (!/\.(?:max|length)\(/.test(src)) return false
      return !src.includes("from '../../src/content/editorialBounds'")
    })
    expect(missing).toEqual([])
  })
})
