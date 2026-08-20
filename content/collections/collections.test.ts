import { describe, it, expect } from 'vitest'
import type { CaseStudy } from '../../src/content/types'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import caseFixtures from '../fixtures/case_study.json'
import districtFixtures from '../fixtures/district.json'

/**
 * Hostile-input tests for the mappers.
 *
 * The valid-input case is covered far more strongly by the fidelity test in
 * `generate.test.ts` — it maps the real fixtures and asserts the result is
 * deep-equal to what the app renders. What is left, and what is here, is the
 * behaviour that only shows up when a CMS sends something nobody designed for.
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

  it('accepts every committed district fixture', () => {
    districtFixtures.forEach((record, i) => {
      expect(problemsFor(districtsCollection, record), 'fixture ' + i).toEqual([])
    })
  })
})

describe('case study mapping rejects', () => {
  it('markup in a text field, by stripping it rather than failing', () => {
    // Stripping is the designed behaviour: WordPress returns `title.rendered` as
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
    // The media mirror that would turn a CMS upload into a local path under
    // /logos/ is not built yet, and the shipped invariant only accepts local
    // paths. Until the mirror exists a remote URL must cost the panel its
    // artwork (the drawn plate stays), never the deployment.
    const record = validCase()
    record.logo = 'https://cms.example.com/wp-content/uploads/2026/08/mango.png'
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
    // The id wires `aria-controls` to its region. A WordPress slug containing a
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
