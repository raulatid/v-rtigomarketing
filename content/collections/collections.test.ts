import { describe, it, expect } from 'vitest'
import type { CaseStudy } from '../../src/content/types'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import { servicesCollection } from './services.collection'
import { siteSettingsCollection } from './siteSettings.collection'
import { COLLECTIONS } from './index'
import caseFixtures from '../fixtures/caseStudy.json'
import districtFixtures from '../fixtures/district.json'
import serviceFixtures from '../fixtures/service.json'
import settingsFixtures from '../fixtures/siteSettings.json'

/**
 * Hostile-input tests for the mappers.
 *
 * The valid-input case is covered by the first suite below, which maps every
 * committed fixture and asserts it comes through clean, and by
 * `src/content/generated.test.ts`, which re-checks the emitted modules against
 * the same invariants. What is left, and what is here, is the behaviour that
 * only shows up when a CMS sends something nobody designed for.
 */

const validCase = () => structuredClone(caseFixtures[0]) as Record<string, unknown>
const validDistrict = () => structuredClone(districtFixtures[0]) as Record<string, unknown>

/** Maps one record and returns the problem paths, or [] when it succeeded. */
function problemsFor(collection: typeof caseStudiesCollection, record: unknown): string[] {
  const result = collection.map(record, 0)
  return result.ok ? [] : result.problems.map((p) => p.path)
}

describe('the fixtures themselves map cleanly', () => {
  // If this fails, every negative test below is meaningless — they all start
  // from a valid record and break one thing.
  it('accepts every committed case-study fixture', () => {
    caseFixtures.forEach((record, i) => {
      expect(problemsFor(caseStudiesCollection, record), 'fixture ' + i).toEqual([])
    })
  })

  it('accepts every committed service fixture', () => {
    serviceFixtures.forEach((record, i) => {
      expect(problemsFor(servicesCollection, record), 'fixture ' + i).toEqual([])
    })
  })

  it('accepts every committed district fixture', () => {
    districtFixtures.forEach((record, i) => {
      expect(problemsFor(districtsCollection, record), 'fixture ' + i).toEqual([])
    })
  })
})

describe('case study mapping rejects', () => {
  it('markup in a text field, by stripping it rather than failing', () => {
    // Stripping is the designed behaviour: a CMS rich-text field returns markup as
    // HTML and the mapper's job is to hand the UI plain text. What must NOT
    // happen is markup reaching a component.
    const record = validCase()
    record.summary = '<p>Hola <script>alert(1)</script>mundo</p>'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      // The registry erases the entity type so the generator can hold a
      // heterogeneous list; the test knows which collection it is asking about.
      const value = result.value as unknown as CaseStudy
      expect(value.summary).toBe('Hola mundo')
      expect(value.summary).not.toContain('<')
    }
  })

  it('a remote logo URL, by degrading it to null rather than failing', () => {
    // content/lib/mirror.ts rewrites a CMS upload to a local path BEFORE the
    // mapper sees it, and only the Sanity source is wrapped. A remote URL
    // reaching here therefore means a source that does not mirror — a fixture
    // someone hand-edited — and that must cost the panel its artwork (the drawn
    // plate stays), never the deployment. A remote URL from Sanity that cannot
    // be fetched never gets this far: the mirror fails the build first.
    const record = validCase()
    record.logo = 'https://cdn.sanity.io/images/p1/production/abc-512x512.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as unknown as CaseStudy).logo).toBeNull()
    }
  })

  it('nothing about a logo that is already a local path', () => {
    const record = validCase()
    record.logo = '/logos/mango.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as unknown as CaseStudy).logo).toBe('/logos/mango.png')
    }
  })

  it('a summary longer than the panel is designed for', () => {
    const record = validCase()
    record.summary = 'a'.repeat(401)
    expect(problemsFor(caseStudiesCollection, record)).toContain('satellite-01.summary')
  })

  it('a metrics list that is not exactly two', () => {
    // The panel's metric row is a fixed two-up grid, and the type claims a
    // two-tuple that a REST response cannot honour. This is where the claim is
    // actually kept.
    for (const metrics of [[], [{ label: 'a', value: '1' }]]) {
      const record = validCase()
      record.metrics = metrics
      expect(problemsFor(caseStudiesCollection, record).length).toBeGreaterThan(0)
    }
    const three = validCase()
    three.metrics = [
      { label: 'a', value: '1' },
      { label: 'b', value: '2' },
      { label: 'c', value: '3' },
    ]
    expect(problemsFor(caseStudiesCollection, three)).toContain('satellite-01.metrics')
  })

  it('a chart type outside the union', () => {
    const record = validCase()
    ;(record.chart as Record<string, unknown>).type = 'pie'
    expect(problemsFor(caseStudiesCollection, record)).toContain('satellite-01.chart.type')
  })

  it('non-numeric chart values', () => {
    // NaN coordinates produce an invalid SVG path, which renders as nothing at
    // all with no error anywhere — the quietest possible failure.
    const record = validCase()
    ;(record.chart as Record<string, unknown>).values = [1, 'x', null]
    expect(problemsFor(caseStudiesCollection, record).length).toBeGreaterThan(0)
  })

  it('an empty string where a number belongs, rather than coercing it to zero', () => {
    // `Number('')` is 0, so a blank CMS field would silently become a real data
    // point sitting on the axis.
    const record = validCase()
    ;(record.chart as Record<string, unknown>).values = [1, '', 3]
    expect(problemsFor(caseStudiesCollection, record).length).toBeGreaterThan(0)
  })

  it('a bars or donut chart with no labels', () => {
    const record = validCase()
    record.chart = { type: 'bars', title: 'x', values: [1, 2] }
    expect(problemsFor(caseStudiesCollection, record)).toContain('satellite-01.chart.labels')
  })

  it('a brandColor that is not #rrggbb', () => {
    // parseInt on a non-hex string gives NaN, and canvas ignores an unparseable
    // fillStyle silently — the plate comes out the wrong colour, not blank.
    for (const colour of ['red', '#fff', 'rgb(1,2,3)', '']) {
      const record = validCase()
      record.brandColor = colour
      expect(problemsFor(caseStudiesCollection, record), colour).toContain('satellite-01.brandColor')
    }
  })

  it('an id that would not survive being used as a DOM id', () => {
    for (const id of ['has space', 'Uppercase', '-leading', 'trailing_underscore!']) {
      const record = validCase()
      record.id = id
      expect(problemsFor(caseStudiesCollection, record).length, id).toBeGreaterThan(0)
    }
  })

  it('a record that is not an object at all', () => {
    for (const record of [null, [], 'text', 42]) {
      expect(problemsFor(caseStudiesCollection, record).length).toBeGreaterThan(0)
    }
  })

  it('reports several problems at once rather than stopping at the first', () => {
    // A content editor fixing four fields should not need four build failures to
    // find them.
    const record = validCase()
    record.brandColor = 'red'
    record.summary = ''
    ;(record.chart as Record<string, unknown>).type = 'pie'
    expect(problemsFor(caseStudiesCollection, record).length).toBeGreaterThanOrEqual(3)
  })
})

describe('district mapping rejects', () => {
  it('a summary too long to survive the mobile peek stop', () => {
    const record = validDistrict()
    record.summary = 'a'.repeat(141)
    expect(problemsFor(districtsCollection, record)).toContain('servicios.summary')
  })

  it('a district with no services, which would open to nothing', () => {
    const record = validDistrict()
    record.services = []
    expect(problemsFor(districtsCollection, record)).toContain('servicios.services')
  })

  it('a service id that would break the accordion for screen readers', () => {
    // The id wires `aria-controls` to its region. A CMS slug containing a
    // space points the header at nothing, and only a screen-reader user notices.
    const record = validDistrict()
    ;(record.services as Array<Record<string, unknown>>)[0].id = 'web analysis'
    expect(problemsFor(districtsCollection, record).length).toBeGreaterThan(0)
  })

  it('duplicate service ids within one district', () => {
    const record = validDistrict()
    const services = record.services as Array<Record<string, unknown>>
    services[1].id = services[0].id
    expect(problemsFor(districtsCollection, record).length).toBeGreaterThan(0)
  })
})

describe('collection audits', () => {
  it('reject a duplicate id across the collection', () => {
    const problems = caseStudiesCollection.audit([{ id: 'a' }, { id: 'a' }])
    expect(problems.length).toBeGreaterThan(0)
  })

  it('reject an empty collection', () => {
    // An empty response is an outage or a misconfigured post type, not an
    // editorial decision to delete every case study.
    expect(caseStudiesCollection.audit([]).length).toBeGreaterThan(0)
    expect(districtsCollection.audit([]).length).toBeGreaterThan(0)
  })
})

describe('every collection asks Sanity for a stable order', () => {
  it('names an explicit orderBy', () => {
    // Byte-identical output for unchanged content is what the emitter, the
    // "up to date — no file changed" log line and Vite's chunk hashes all lean
    // on. An implicit GROQ order gives it up silently.
    for (const entry of COLLECTIONS) {
      expect(entry.source.orderBy, entry.key).toBeTruthy()
    }
  })

  it('ships fixtures already in that order', () => {
    // fileSource does NOT sort — it returns the file's array verbatim, while
    // sanitySource sorts. If the two disagree, the fixture build and the Sanity
    // build emit different arrays, and the migration parity diff fails for a
    // reason that has nothing to do with the adapter. Array position is also
    // what orbitAssignments.ts and the brand atlas agree on.
    //
    // Valid only while every orderBy sorts by the projected id.
    const ids = (records: ReadonlyArray<{ id: string }>) => records.map((r) => r.id)
    expect(ids(caseFixtures)).toEqual([...ids(caseFixtures)].sort())
    expect(ids(districtFixtures)).toEqual([...ids(districtFixtures)].sort())
    expect(ids(serviceFixtures)).toEqual([...ids(serviceFixtures)].sort())
  })
})

describe('service mapping rejects', () => {
  const validService = () => structuredClone(serviceFixtures[0]) as Record<string, unknown>

  it('an id that would not survive being used as a DOM id', () => {
    // A standalone service id still becomes the district accordion's
    // aria-controls value after dereferencing, so the bound is the same one.
    for (const id of ['has space', 'Uppercase', '-leading']) {
      const record = validService()
      record.id = id
      expect(problemsFor(servicesCollection, record).length, id).toBeGreaterThan(0)
    }
  })

  it('an empty title or body', () => {
    for (const field of ['title', 'body']) {
      const record = validService()
      record[field] = ''
      expect(problemsFor(servicesCollection, record).length, field).toBeGreaterThan(0)
    }
  })

  it('a body longer than the accordion is meant to hold', () => {
    const record = validService()
    record.body = 'a'.repeat(901)
    expect(problemsFor(servicesCollection, record).length).toBeGreaterThan(0)
  })

  it('an empty collection', () => {
    expect(servicesCollection.audit([]).length).toBeGreaterThan(0)
  })
})

describe('a district whose service reference does not resolve', () => {
  it('fails, naming the district and the index rather than the shape', () => {
    // GROQ returns null for a reference it cannot dereference, which happens for
    // exactly two reasons: the document was deleted, or it was never published.
    // "expected an object" would send an editor looking at the district for a
    // problem that is one document away.
    const record = validDistrict()
    ;(record.services as unknown[])[2] = null
    const result = districtsCollection.map(record, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      const problem = result.problems.find((p) => p.path === 'servicios.services[2]')
      expect(problem, 'no problem reported at servicios.services[2]').toBeDefined()
      expect(problem?.message).toMatch(/unresolved service reference/)
      expect(problem?.message).toMatch(/unpublished/)
    }
  })

  it('does not quietly drop the service and render the rest', () => {
    // A panel missing one section looks like an editorial choice. It is not.
    const record = validDistrict()
    ;(record.services as unknown[])[0] = null
    expect(districtsCollection.map(record, 0).ok).toBe(false)
  })
})

describe('site settings is a singleton the build proves', () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>

  it('accepts exactly one document', () => {
    const one = settingsFixtures.map((r) => siteSettingsCollection.map(r, 0))
    expect(one.every((r) => r.ok)).toBe(true)
    expect(siteSettingsCollection.audit([{ id: 'site' }])).toEqual([])
  })

  it('fails on zero documents', () => {
    // An empty response is an outage or a misconfigured type, not an editorial
    // decision to delete the agency's phone number.
    expect(siteSettingsCollection.audit([]).length).toBeGreaterThan(0)
  })

  it('fails on two documents rather than silently using the first', () => {
    // Studio refuses to create a second. A restored backup, a re-run import or
    // the API can all produce one anyway, and site.ts reads [0].
    const problems = siteSettingsCollection.audit([{ id: 'site' }, { id: 'site-2' }])
    expect(problems.length).toBeGreaterThan(0)
    expect(problems.some((p) => /exactly one/.test(p.message))).toBe(true)
  })

  it('rejects an email that would produce a dead mailto: link', () => {
    for (const email of ['holaexample.com', 'hola@', '@example.com', 'hola @example.com', '']) {
      const record = validSettings()
      record.contactEmail = email
      expect(problemsFor(siteSettingsCollection, record), email).toContain('site.contactEmail')
    }
  })

  it('rejects a tel: value that is not dialable', () => {
    // The display string may be formatted however it reads best; this is the one
    // that gets dialled, and a space in it silently does nothing on some handsets.
    for (const tel of ['+34 600 000 000', '600-000-000', 'llamanos', '']) {
      const record = validSettings()
      record.phones = [{ display: '+34 600 000 000', tel }]
      expect(problemsFor(siteSettingsCollection, record), tel).toContain('site.phones[0].tel')
    }
  })

  it('rejects a settings document with no phone at all', () => {
    const record = validSettings()
    record.phones = []
    expect(problemsFor(siteSettingsCollection, record).length).toBeGreaterThan(0)
  })
})
