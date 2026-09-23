import { describe, it, expect, vi } from 'vitest'
import { withMediaMirror } from '../lib/mirror'
import type { BlogPost, CaseStudy, DistrictContent, SiteSeo, SiteSettings, TowerScreenContent } from '../../src/content/types'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import { servicesCollection } from './services.collection'
import { siteSettingsCollection } from './siteSettings.collection'
import { SITE_SEO_FALLBACKS, siteSeoCollection } from './siteSeo.collection'
import { towerScreenCollection } from './towerScreen.collection'
import { blogPostsCollection } from './blogPosts.collection'
import { legalDocsCollection } from './legalDocs.collection'
import { COLLECTIONS } from './index'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import caseFixtures from '../fixtures/caseStudy.json'
import districtFixtures from '../fixtures/district.json'
import serviceFixtures from '../fixtures/service.json'
import settingsFixtures from '../fixtures/siteSettings.json'
import towerFixtures from '../fixtures/towerScreen.json'
import blogFixtures from '../fixtures/blogPost.json'

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

describe('editable cookie copy', () => {
  it('preserves edited labels and refuses blank or oversized copy', () => {
    const source = structuredClone(settingsFixtures[0])
    source.cookieCopy.preferencesTitle = 'Recordar mi experiencia'
    const result = siteSettingsCollection.map(source, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value as SiteSettings).cookieCopy?.preferencesTitle).toBe('Recordar mi experiencia')
    source.cookieCopy.save = ''
    expect(siteSettingsCollection.map(source, 0).ok).toBe(false)
    source.cookieCopy.save = 'x'.repeat(51)
    expect(siteSettingsCollection.map(source, 0).ok).toBe(false)
  })
})

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

  it('a remote brand-mark URL, by degrading it to null rather than failing', () => {
    // content/lib/mirror.ts rewrites a CMS upload to a local path BEFORE the
    // mapper sees it, and only the Sanity source is wrapped. A remote URL
    // reaching here therefore means a source that does not mirror — a fixture
    // someone hand-edited — and that must cost the panel its artwork (the drawn
    // plate stays), never the deployment. A remote URL from Sanity that cannot
    // be fetched never gets this far: the mirror fails the build first.
    //
    // BOTH are degraded together, which is what keeps the pairing rule below
    // satisfied: one surviving alone would fail the record instead.
    const record = validCase()
    record.logo = 'https://cdn.sanity.io/images/p1/production/abc-1024x512.png'
    record.isotype = 'https://cdn.sanity.io/images/p1/production/def-512x512.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as unknown as CaseStudy).logo).toBeNull()
      expect((result.value as unknown as CaseStudy).isotype).toBeNull()
    }
  })

  it('nothing about brand marks that are already local paths', () => {
    const record = validCase()
    record.logo = '/logos/mango.png'
    record.isotype = '/logos/mango-isotype.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as unknown as CaseStudy).logo).toBe('/logos/mango.png')
      expect((result.value as unknown as CaseStudy).isotype).toBe('/logos/mango-isotype.png')
    }
  })

  // The panel rests on the isotype and unfolds into the logo, so half the pair
  // would morph from a real trademark into a drawn placeholder mid-animation.
  // The two fields sit apart in the Studio and an editor filling one sees
  // nothing wrong — which is exactly why this fails the build rather than
  // degrading quietly.
  it('a logo with no isotype, by failing the record', () => {
    const record = validCase()
    record.logo = '/logos/mango.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.map((p) => p.message).join(' ')).toMatch(/isotype/)
    }
  })

  it('an isotype with no logo, by failing the record', () => {
    const record = validCase()
    record.isotype = '/logos/mango-isotype.png'
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems.map((p) => p.message).join(' ')).toMatch(/logo/)
    }
  })

  // A remote logo degrades to null; a LOCAL isotype survives. The pair is then
  // half-filled through no fault of the editor, and the record must still fail
  // rather than ship a satellite that unfolds into a placeholder.
  it('a pair split by one half degrading, by failing the record', () => {
    const record = validCase()
    record.logo = 'https://cdn.sanity.io/images/p1/production/abc-1024x512.png'
    record.isotype = '/logos/mango-isotype.png'
    expect(caseStudiesCollection.map(record, 0).ok).toBe(false)
  })

  it('a summary longer than the panel is designed for', () => {
    const record = validCase()
    record.summary = 'a'.repeat(401)
    expect(problemsFor(caseStudiesCollection, record)).toContain('satellite-01.summary')
  })

  it('takes as many metrics as the row holds; none, one or absent are editorial', () => {
    for (const metrics of [[], [{ label: 'a', value: '1' }], null, undefined]) {
      const record = validCase()
      record.metrics = metrics
      expect(problemsFor(caseStudiesCollection, record)).toEqual([])
    }
    // Three was refused until 2026-09-21, when the row became a grid that wraps
    // and the count became the editor's. What is left is a safety net against an
    // array that never passed through the Studio — a restored backup, an import,
    // the HTTP API — rather than a judgement about how many read well.
    const metric = (i: number) => ({ label: 'm' + i, value: String(i) })
    const many = validCase()
    many.metrics = Array.from({ length: EDITORIAL_BOUNDS.caseStudy.metrics }, (_, i) => metric(i))
    expect(problemsFor(caseStudiesCollection, many)).toEqual([])

    const past = validCase()
    past.metrics = Array.from({ length: EDITORIAL_BOUNDS.caseStudy.metrics + 1 }, (_, i) => metric(i))
    expect(problemsFor(caseStudiesCollection, past)).toContain('satellite-01.metrics')
  })

  it('no chart at all — absent, null, or the untouched Studio default — maps to null', () => {
    for (const chart of [undefined, null, { type: 'line' }, { type: 'line', title: '', values: [] }]) {
      const record = validCase()
      record.chart = chart
      const result = caseStudiesCollection.map(record, 0)
      expect(result.ok, JSON.stringify(chart)).toBe(true)
      if (result.ok) expect((result.value as unknown as { chart: unknown }).chart).toBeNull()
    }
  })

  it('a chart that was started but not finished: one point, or no title', () => {
    const one = validCase()
    one.chart = { type: 'line', title: 'x', values: [1] }
    expect(problemsFor(caseStudiesCollection, one)).toContain('satellite-01.chart.values')
    const untitled = validCase()
    untitled.chart = { type: 'line', title: '', values: [1, 2] }
    expect(problemsFor(caseStudiesCollection, untitled)).toContain('satellite-01.chart.title')
  })

  it('sector, location and year may each be empty or absent', () => {
    const record = validCase()
    record.sector = ''
    record.location = null
    delete record.year
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.value).toMatchObject({ sector: '', location: '', year: '' })
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
    for (const colour of ['red', '#fff', 'rgb(1,2,3)', '   x']) {
      const record = validCase()
      record.brandColor = colour
      expect(problemsFor(caseStudiesCollection, record), colour).toContain('satellite-01.brandColor')
    }
  })

  it('a missing brandColor, by defaulting it to white rather than failing', () => {
    // A brand with no colour of its own is a designed state (the Studio field is
    // optional and says so), and the app reads a guaranteed hex string, so the
    // default is resolved here — once — rather than in every consumer.
    for (const absent of [undefined, null, '', '   ']) {
      const record = validCase()
      if (absent === undefined) delete record.brandColor
      else record.brandColor = absent
      const result = caseStudiesCollection.map(record, 0)
      expect(result.ok, String(absent)).toBe(true)
      if (result.ok) expect((result.value as unknown as CaseStudy).brandColor).toBe('#ffffff')
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

  it('a particle colour that is not #rrggbb, on the district or a service', () => {
    const record = validDistrict()
    record.particleColor = 'blue'
    expect(problemsFor(districtsCollection, record)).toContain('servicios.particleColor')
    const other = validDistrict()
    ;(other.services as Array<Record<string, unknown>>)[0].particleColor = '#12345'
    expect(problemsFor(districtsCollection, other)).toContain('servicios.services[0].particleColor')
  })

  it('a figure caption or a list of measures over its bound, or a measure row left blank', () => {
    const services = (record: Record<string, unknown>) => record.services as Array<Record<string, unknown>>
    const long = validDistrict()
    services(long)[0].figureCaption = 'a'.repeat(111)
    expect(problemsFor(districtsCollection, long)).toContain('servicios.services[0].figureCaption')
    const many = validDistrict()
    services(many)[0].measures = ['Uno', 'Dos', 'Tres', 'Cuatro']
    expect(problemsFor(districtsCollection, many)).toContain('servicios.services[0].measures')
    const blank = validDistrict()
    services(blank)[0].measures = ['Coste por conversión', '']
    expect(problemsFor(districtsCollection, blank)).toContain('servicios.services[0].measures[1]')
  })

  it('a symbol or a figure the campus cannot draw', () => {
    // Only the API can deliver these: the Studio offers closed lists built from
    // the same table this validates against. Failing the build is the point —
    // falling back would hide a disagreement between the two lists, which is
    // the whole reason the table is shared.
    const services = (record: Record<string, unknown>) => record.services as Array<Record<string, unknown>>
    const symbol = validDistrict()
    services(symbol)[0].symbol = 'spiral'
    expect(problemsFor(districtsCollection, symbol)).toContain('servicios.services[0].symbol')
    const figure = validDistrict()
    services(figure)[0].figure = 'spiral'
    expect(problemsFor(districtsCollection, figure)).toContain('servicios.services[0].figure')
  })
})

// The two fields that decide what a service looks like around the lake.
//
// They were a developer's table keyed by the service's slug until 2026-09-21,
// and a published service the table did not list rejected the WHOLE campus
// document — the section went to scenery and the build stopped. They are
// optional Studio fields now, and the asymmetry below is the design: a symbol
// has a default because a stop has to form something and a symbol asserts
// nothing, a figure has none because it draws the mechanism its copy argues.
describe('district service shapes', () => {
  const mapped = (record: unknown): DistrictContent => {
    const result = districtsCollection.map(record, 0)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    return result.value as DistrictContent
  }

  it('keep what the editor chose', () => {
    const district = mapped(validDistrict())
    expect(district.services[0]!.symbol).toBe('magnifier')
    expect(district.services[0]!.figure).toBe('compound')
  })

  it('resolve an absent or blank symbol to the default, and an absent figure to none', () => {
    // Every service published before the fields existed arrives without them,
    // which is the state all five were in the day this landed.
    const record = validDistrict()
    const services = record.services as Array<Record<string, unknown>>
    delete services[0].symbol
    delete services[0].figure
    services[1].symbol = '  '
    services[1].figure = null
    const district = mapped(record)
    expect(district.services[0]!.symbol).toBe('mark')
    expect(district.services[0]!.figure).toBeNull()
    expect(district.services[1]!.symbol).toBe('mark')
    expect(district.services[1]!.figure).toBeNull()
  })

  it('let a whole section publish with no figure chosen anywhere', () => {
    const record = validDistrict()
    for (const service of record.services as Array<Record<string, unknown>>) {
      delete service.figure
    }
    expect(problemsFor(districtsCollection, record)).toEqual([])
    expect(mapped(record).services.every((s) => s.figure === null)).toBe(true)
  })
})

describe('district figure captions and measures', () => {
  const mapped = (record: unknown): DistrictContent => {
    const result = districtsCollection.map(record, 0)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    return result.value as DistrictContent
  }

  it('read as none when a document predates them or leaves them blank', () => {
    // Every service published before the fields existed arrives without them.
    const record = validDistrict()
    const services = record.services as Array<Record<string, unknown>>
    delete services[0].figureCaption
    delete services[0].measures
    services[1].figureCaption = '  '
    services[1].measures = null
    const district = mapped(record)
    expect(district.services[0]!.figureCaption).toBeNull()
    expect(district.services[0]!.measures).toEqual([])
    expect(district.services[1]!.figureCaption).toBeNull()
    expect(district.services[1]!.measures).toEqual([])
  })

  it('keep what the editor wrote', () => {
    const district = mapped(validDistrict())
    expect(district.services[0]!.figureCaption).toMatch(/orgánico/)
    expect(district.services[0]!.measures).toHaveLength(3)
  })
})

describe('district particle colours', () => {
  const mapped = (record: unknown): DistrictContent => {
    const result = districtsCollection.map(record, 0)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    return result.value as DistrictContent
  }

  it('resolve an empty district colour to the site blue, and an empty service colour to the district\'s', () => {
    const record = validDistrict()
    delete record.particleColor
    const services = record.services as Array<Record<string, unknown>>
    services[0].particleColor = ''
    services[1].particleColor = null
    const district = mapped(record)
    expect(district.particleColor).toBe('#1c67ff')
    expect(district.services[0]!.particleColor).toBe('#1c67ff')
    expect(district.services[1]!.particleColor).toBe('#1c67ff')
  })

  it('keep a set colour, lowercased', () => {
    const record = validDistrict()
    ;(record.services as Array<Record<string, unknown>>)[0].particleColor = '#FFB020'
    expect(mapped(record).services[0]!.particleColor).toBe('#ffb020')
  })
})

describe('the highlighted case', () => {
  it('maps an absent value to false, so documents older than the field still build', () => {
    const record = validCase()
    delete record.highlighted
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value as unknown as CaseStudy).highlighted).toBe(false)
  })

  it('keeps an explicit true', () => {
    const record = validCase()
    record.highlighted = true
    const result = caseStudiesCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.value as unknown as CaseStudy).highlighted).toBe(true)
  })

  it('rejects a value that is not a boolean rather than guessing', () => {
    const record = validCase()
    record.highlighted = 'yes'
    expect(problemsFor(caseStudiesCollection, record)).toContain('satellite-01.highlighted')
  })

  it('is required exactly once across the collection', () => {
    // It rides orbit-02 and anchors the hover tutorial: none leaves the globe
    // with no example, two gives the tutorial two targets.
    const item = (id: string, highlighted: boolean) => ({ id, highlighted })
    expect(caseStudiesCollection.audit([item('a', true), item('b', false)])).toEqual([])
    expect(caseStudiesCollection.audit([item('a', false), item('b', false)]).length).toBeGreaterThan(0)
    const two = caseStudiesCollection.audit([item('a', true), item('b', true)])
    expect(two.map((p) => p.message).join(' ')).toContain('a, b')
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

  // The label is OPTIONAL (2026-09-04), which is a claim about three separate
  // things: a phone written without one still maps, a blank one is treated as
  // absent rather than carried as '', and the key is omitted rather than set to
  // undefined — the same shape an image caption has.
  describe('the phone label', () => {
    const phones = (record: Record<string, unknown>) => {
      const result = siteSettingsCollection.map(record, 0)
      if (!result.ok) throw new Error(result.problems.map((p) => p.path).join(', '))
      // `collection()` erases the entity type to `{ id: string }` so the
      // generator can hold a heterogeneous list (types.ts, AnyCollection), so
      // every reader of a mapped value casts at the edge. This one does what
      // the generator does.
      return (result.value as SiteSettings).phones
    }

    it('is carried through when the editor writes one', () => {
      const record = validSettings()
      record.phones = [{ label: 'Madrid', display: '+34 600 000 000', tel: '+34600000000' }]
      expect(phones(record)[0].label).toBe('Madrid')
    })

    it('is absent, not empty, when the field is blank, null or missing', () => {
      // Clearing the field in the Studio leaves '' behind, not undefined. All
      // three have to mean the same thing, or the renderer would show a stray
      // colon for one of them.
      for (const label of ['', null, undefined]) {
        const record = validSettings()
        record.phones = [{ label, display: '+34 600 000 000', tel: '+34600000000' }]
        const [phone] = phones(record)
        expect(phone.label, String(label)).toBeUndefined()
        expect('label' in phone, String(label)).toBe(false)
      }
    })

    it('rejects one long enough to be a sentence', () => {
      const record = validSettings()
      record.phones = [{ label: 'x'.repeat(25), display: '+34 600 000 000', tel: '+34600000000' }]
      expect(problemsFor(siteSettingsCollection, record)).toContain('site.phones[0].label')
    })

    it('still accepts a phone that predates the field', () => {
      // The two-field shape is what every phone in the live dataset looks like
      // until someone opens the Studio. It must keep mapping.
      const record = validSettings()
      record.phones = [{ display: '+34 600 000 000', tel: '+34600000000' }]
      expect(problemsFor(siteSettingsCollection, record)).toEqual([])
    })
  })
})

describe('blog category, reading time and SEO', () => {
  const post = (over: Record<string, unknown> = {}) => {
    const found = blogFixtures.find((entry) => entry.id === 'como-medimos-el-seo')
    if (found === undefined) throw new Error('fixture como-medimos-el-seo is missing')
    return { ...(structuredClone(found) as Record<string, unknown>), ...over }
  }
  const mapped = (record: Record<string, unknown>) => {
    const result = blogPostsCollection.map(record, 0)
    if (!result.ok) {
      throw new Error('expected a valid post, got: ' + JSON.stringify(result.problems))
    }
    return result.value as unknown as BlogPost
  }

  it('keeps a category that dereferenced to a service', () => {
    expect(mapped(post()).category).toEqual({ id: 'seo', label: 'SEO', shortLabel: 'SEO' })
  })

  it('leaves the category null when the post predates the field', () => {
    // The Studio requires it; the build does not, because posts written before
    // the field exist and failing every deployment until someone opens each one
    // is not a migration plan.
    expect(mapped(post({ category: null })).category).toBeNull()
    expect(mapped(post({ category: undefined })).category).toBeNull()
  })

  it('never guesses a category from tags', () => {
    // The first tag here is 'seo', which happens to BE a service id — so a
    // mapper that guessed would look correct on this record and be wrong on the
    // next. A category carries a visible label, and map() cannot check that a
    // guess names a real service: it receives one record at a time by design.
    expect(mapped(post({ category: null, tags: ['seo', 'analitica'] })).category).toBeNull()
  })

  it('rejects a category whose id would not survive a url segment', () => {
    const problems = problemsFor(
      blogPostsCollection,
      post({ category: { id: 'Con Mayúsculas', label: 'X', shortLabel: 'X' } }),
    )
    expect(problems.length).toBeGreaterThan(0)
  })

  it('computes reading time rather than reading it from the record', () => {
    // An authored value must not win, or the number drifts the moment the body
    // is edited and nothing reports it.
    expect(mapped(post({ readingTime: 99 })).readingTime).toBe(1)
  })

  it('falls back to the post title and the excerpt for search results', () => {
    const value = mapped(post())
    expect(value.seo.title).toBe(value.title)
    expect(value.seo.description).toBe(value.excerpt)
  })

  it('prefers the editor SEO fields when they are filled in', () => {
    const value = mapped(
      post({ seoTitle: 'Medir SEO por ingresos', metaDescription: 'Cómo lo medimos.' }),
    )
    expect(value.seo.title).toBe('Medir SEO por ingresos')
    expect(value.seo.description).toBe('Cómo lo medimos.')
  })

  it('treats a blank SEO field as unset rather than as an empty value', () => {
    // Clearing a field in the Studio leaves an empty string behind, not
    // undefined, and an empty <title> is worse than a fallback.
    const value = mapped(post({ seoTitle: '', metaDescription: '' }))
    expect(value.seo.title).toBe(value.title)
    expect(value.seo.description).toBe(value.excerpt)
  })

  it('does NOT fail on an over-long SEO field', () => {
    // 60 and 160 are where Google truncates, not where content stops being
    // valid. The Studio warns; the build publishes. A Studio that says "fine"
    // and a deploy that then fails is the worst arrangement available.
    const long = 'a'.repeat(400)
    const value = mapped(post({ seoTitle: long, metaDescription: long }))
    expect(value.seo.title).toBe(long)
    expect(value.seo.description).toBe(long)
  })

  it('cuts the excerpt fallback at a word boundary', () => {
    const excerpt =
      'Una posición no paga facturas y por eso conectamos cada consulta de búsqueda con los ingresos que un negocio puede reconocer al final del trimestre sin discutirlo.'
    const value = mapped(post({ excerpt }))
    expect(value.seo.description.length).toBeLessThanOrEqual(161)
    // Ends on a whole word plus an ellipsis, never mid-word: a search result
    // ending "...puede rec" reads as a broken site rather than a truncated field.
    expect(value.seo.description.endsWith('…')).toBe(true)
    expect(value.seo.description).not.toMatch(/\s…$/)
    expect(excerpt.startsWith(value.seo.description.slice(0, -1))).toBe(true)
  })

  it('resolves an og:image for every fixture post', () => {
    // BlogSeo.image is never null, which is what lets the emitted shells require
    // exactly one og:image instead of tolerating its absence.
    for (const entry of blogFixtures) {
      const value = mapped(structuredClone(entry) as Record<string, unknown>)
      expect(value.seo.image, entry.id).not.toBeNull()
      expect(value.seo.image.width, entry.id).toBeGreaterThan(0)
    }
  })

  it('prefers ogImage, then cover, then the site default', () => {
    const og = {
      src: 'https://cdn.sanity.io/images/x/y/aaaa-1200x630.jpg',
      width: 1200,
      height: 630,
      alt: 'og',
    }
    const cover = {
      src: 'https://cdn.sanity.io/images/x/y/bbbb-1600x900.jpg',
      width: 1600,
      height: 900,
      alt: 'cover',
    }
    expect(mapped(post({ ogImage: og, cover })).seo.image.alt).toBe('og')
    expect(mapped(post({ ogImage: null, cover })).seo.image.alt).toBe('cover')
    expect(mapped(post({ ogImage: null, cover: null })).seo.image.src).toBe('/og-default.png')
  })

  it('rejects an image field that has a description but no upload, in ONE sentence', () => {
    // What the Studio leaves in the document when an editor writes the
    // description and never uploads the file. The GROQ projection cannot return
    // null for it — every asset-derived member comes back null instead — and
    // this shape reaching production as three "expected a string, got null"
    // problems about src, width and height is how a build failure ends up
    // naming fields no editor has ever seen. Counting the problems is the
    // assertion that matters: three IS the bug.
    const assetless = { src: null, width: null, height: null, alt: 'a', caption: null }
    const result = blogPostsCollection.map(post({ ogImage: assetless }), 0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].path).toBe('como-medimos-el-seo.ogImage')
    expect(result.problems[0].message).toContain('no image was uploaded')
  })

  it('rejects the same residue once the description has been cleared too', () => {
    // Emptying the description does not necessarily remove the object; a bare
    // `{_type: 'imageMedia'}` projects to all-null as well, and the message has
    // to stay true when there is no description left to mention.
    const empty = { src: null, width: null, height: null, alt: null, caption: null }
    const result = blogPostsCollection.map(post({ ogImage: empty }), 0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].path).toBe('como-medimos-el-seo.ogImage')
  })

  it('holds the cover to the same rule', () => {
    // Same projection, same optional field, same latent defect.
    const assetless = { src: null, width: null, height: null, alt: 'portada', caption: null }
    const result = blogPostsCollection.map(post({ cover: assetless }), 0)
    expect(result.ok).toBe(false)
    if (result.ok) return
    expect(result.problems).toHaveLength(1)
    expect(result.problems[0].path).toBe('como-medimos-el-seo.cover')
  })

  it('carries an image caption through, and omits it when blank', () => {
    const withCaption = {
      src: 'https://cdn.sanity.io/images/x/y/cccc-1600x900.jpg',
      width: 1600,
      height: 900,
      alt: 'alt text',
      caption: 'Pie de foto',
    }
    expect(mapped(post({ cover: withCaption })).cover?.caption).toBe('Pie de foto')
    expect(mapped(post({ cover: { ...withCaption, caption: '' } })).cover?.caption).toBeUndefined()
  })
})

describe('blog mapping rejects', () => {
  // Selected by id, not by position: the fixture array is ordered
  // `publishedAt desc` to match what the collection asks Sanity for, so adding
  // a newer post silently moved index 0 and every assertion below started
  // naming the wrong entry.
  const validPost = () => {
    const found = blogFixtures.find((post) => post.id === 'como-medimos-el-seo')
    if (found === undefined) throw new Error('fixture como-medimos-el-seo is missing')
    return structuredClone(found) as Record<string, unknown>
  }
  const textBlock = (text: string) => ({ _type: 'block', style: 'normal', children: [{ _type: 'span', text }] })

  it('a slug that would not survive being used as a url segment', () => {
    for (const id of ['Con Mayúsculas', 'con espacio', '']) {
      const record = validPost()
      record.id = id
      expect(problemsFor(blogPostsCollection, record).length, id).toBeGreaterThan(0)
    }
  })

  it('a publish date that is not a real ISO instant', () => {
    // Ordering is `publishedAt desc`. A value that does not parse would sort
    // somewhere arbitrary rather than fail, and the emitted array would stop
    // being stable.
    for (const when of ['2026-08-18', 'ayer', '2026-19-45T09:00:00.000Z', '']) {
      const record = validPost()
      record.publishedAt = when
      expect(problemsFor(blogPostsCollection, record), when).toContain(
        'como-medimos-el-seo.publishedAt',
      )
    }
  })

  it('an embed from a host that is not the provider it claims', () => {
    // Stored as provider + url so a renderer can build its own iframe. That is
    // only safe if the url really belongs to the provider.
    const record = validPost()
    record.body = [
      textBlock('intro'),
      { _type: 'embedMedia', provider: 'youtube', url: 'https://evil.example/watch?v=1' },
    ]
    const problems = problemsFor(blogPostsCollection, record)
    expect(problems.length).toBeGreaterThan(0)
  })

  it('an embed provider nobody implements', () => {
    const record = validPost()
    record.body = [
      textBlock('intro'),
      { _type: 'embedMedia', provider: 'tiktok', url: 'https://www.tiktok.com/@x/video/1' },
    ]
    expect(problemsFor(blogPostsCollection, record).length).toBeGreaterThan(0)
  })

  it('an accepted embed', () => {
    const record = validPost()
    record.body = [
      textBlock('intro'),
      { _type: 'embedMedia', provider: 'vimeo', url: 'https://vimeo.com/123456' },
    ]
    expect(problemsFor(blogPostsCollection, record)).toEqual([])
  })

  it('an image with no alt text', () => {
    // An image whose meaning is decorative does not belong in the CMS.
    const record = validPost()
    record.body = [
      textBlock('intro'),
      {
        _type: 'imageMedia',
        src: 'https://cdn.sanity.io/images/p1/production/abc-800x600.png',
        width: 800,
        height: 600,
      },
    ]
    expect(problemsFor(blogPostsCollection, record).length).toBeGreaterThan(0)
  })

  it('an image served from anywhere but the CMS CDN', () => {
    const record = validPost()
    record.body = [
      textBlock('intro'),
      {
        _type: 'imageMedia',
        src: 'https://evil.example/x.png',
        alt: 'x',
        width: 8,
        height: 8,
      },
    ]
    expect(problemsFor(blogPostsCollection, record).length).toBeGreaterThan(0)
  })

  it('an SVG image', () => {
    const record = validPost()
    record.body = [
      textBlock('intro'),
      {
        _type: 'imageMedia',
        src: 'https://cdn.sanity.io/images/p1/production/abc-1x1.svg',
        alt: 'x',
        width: 8,
        height: 8,
      },
    ]
    expect(problemsFor(blogPostsCollection, record).length).toBeGreaterThan(0)
  })

  it('a body block type outside the vocabulary', () => {
    const record = validPost()
    record.body = [textBlock('intro'), { _type: 'rawHtml', html: '<iframe src="x"></iframe>' }]
    expect(problemsFor(blogPostsCollection, record).length).toBeGreaterThan(0)
  })

  it('nothing about a mixed body in the right order', () => {
    // Runs of text blocks are converted together so a list spanning several of
    // them stays one list; custom objects are mapped on their own. Order holds.
    const record = validPost()
    record.body = [
      textBlock('uno'),
      { _type: 'embedMedia', provider: 'youtube', url: 'https://youtu.be/abc' },
      textBlock('dos'),
    ]
    const result = blogPostsCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      const post = result.value as unknown as BlogPost
      expect(post.body.map((b) => b.kind)).toEqual(['paragraph', 'embed', 'paragraph'])
    }
  })

  it('an empty collection', () => {
    expect(blogPostsCollection.audit([]).length).toBeGreaterThan(0)
  })
})

describe('the case-study projection hands the mirror what it expects', () => {
  // The mapper tests cannot see GROQ, which is how a bare `logo` — Sanity's
  // image OBJECT, not a url — shipped, typechecked, and would have failed the
  // first build with a logo attached: "expected a string, got object". A string
  // assertion is crude, but it is the only place that can hold the line between
  // what the Studio stores and what content/lib/mirror.ts reads.
  it('resolves the logo asset to a url', () => {
    expect(caseStudiesCollection.source.projection).toContain('"logo": logo.asset->url')
    expect(caseStudiesCollection.source.projection).not.toMatch(/^\s*logo,\s*$/m)
  })

  it('resolves the isotype asset to a url', () => {
    expect(caseStudiesCollection.source.projection).toContain('"isotype": isotype.asset->url')
    expect(caseStudiesCollection.source.projection).not.toMatch(/^\s*isotype,\s*$/m)
  })

  it('declares both brand marks as fields to mirror', () => {
    // Order is not meaningful to the mirror, which loops the array, but both
    // must be there: an unmirrored field stays a cdn.sanity.io URL, which the
    // mapper then degrades to null — artwork silently vanishing rather than
    // failing.
    expect([...caseStudiesCollection.source.mirror!].sort()).toEqual(['isotype', 'logo'])
  })

  it('gives each brand mark a format and geometry rule', () => {
    // Same reasoning as the assertion above, one layer further in. Every fixture
    // and seed logo is null, so a `mediaRules` entry that stopped being applied
    // — renamed, or keyed off something other than the field name — would break
    // nothing locally and let a JPEG or a 300x300 symbol onto the deployment.
    const rules = caseStudiesCollection.source.mediaRules!
    expect(Object.keys(rules).sort()).toEqual(['isotype', 'logo'])
    for (const mark of ['isotype', 'logo'] as const) {
      expect(rules[mark].extensions).toEqual(['png', 'webp'])
    }
    // No size floor: below the atlas box a mark draws soft, which the Studio
    // advises on rather than the build refusing (mirror.ts, assertGeometry).
    expect(rules.isotype).not.toHaveProperty('minWidth')
    expect(rules.logo).not.toHaveProperty('minWidth')
    // The bands themselves, not merely their sign. A loose assertion
    // ("minAspect < 1") passes however far this and the Studio's copy drift,
    // which is the one failure a hand-duplicated pair actually has.
    //
    // The isotype's is DERIVED from the drawn-size floor, so the assertion is
    // the derivation rather than two more literals: a mark at exactly the
    // ceiling draws `minDrawn` tall, and one at the floor draws `minDrawn` wide.
    const { brandMarkBox, brandMarkMinDrawn } = EDITORIAL_BOUNDS.caseStudy
    expect(brandMarkBox.isotype.width / rules.isotype.maxAspect).toBe(brandMarkMinDrawn)
    expect(brandMarkBox.isotype.height * rules.isotype.minAspect).toBe(brandMarkMinDrawn)
    // 2.35:1 is the widest real brand asset delivered so far. It has to pass, or
    // the floor is not where this says it is.
    expect(512 / 218).toBeLessThan(rules.isotype.maxAspect)
    expect(rules.logo.minAspect).toBe(1.5)
    expect(rules.logo.maxAspect).toBe(5)
  })
})

/**
 * The confirmation copy, editable since 2026-09-04 (plan 012).
 *
 * It moved into the CMS for the same reason the phone numbers did: it is a
 * sentence a client will want to reword — "te responderemos en menos de 24
 * horas" is a promise about their own working week — and the alternative to a
 * field is a deploy for a sentence.
 */
/**
 * The audit form's billing ranges (2026-09-14): the options of a dropdown the
 * client fills in, and at once the values the server accepts.
 */
describe('the audit form\'s billing ranges', () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>
  const rangesOf = (record: Record<string, unknown>): string[] => {
    const result = siteSettingsCollection.map(record, 0)
    if (!result.ok) throw new Error('expected a valid record, got ' + JSON.stringify(result.problems))
    return (result.value as SiteSettings).revenueRanges
  }

  it('carries the fixture\'s ranges through, in order', () => {
    expect(rangesOf(validSettings())).toEqual(settingsFixtures[0].revenueRanges)
  })

  it('falls back to placeholder ranges when the CMS has none', () => {
    // A dataset that predates the field must still build, and the dropdown
    // must never render empty.
    const fallback = rangesOf({ ...validSettings(), revenueRanges: undefined })
    expect(fallback.length).toBeGreaterThan(0)
    for (const blank of [null, []]) {
      expect(rangesOf({ ...validSettings(), revenueRanges: blank }), JSON.stringify(blank)).toEqual(
        fallback,
      )
    }
  })

  it('refuses a present list the dropdown could not use', () => {
    const cases: Array<[unknown, string]> = [
      [['Menos de 100.000 €', ''], 'site.revenueRanges[1]'],
      [['a'.repeat(61)], 'site.revenueRanges[0]'],
      [Array.from({ length: 9 }, (_, i) => 'Rango ' + i), 'site.revenueRanges'],
      [['Igual', 'Igual'], 'site.revenueRanges[1]'],
      ['Menos de 100.000 €', 'site.revenueRanges'],
    ]
    for (const [revenueRanges, path] of cases) {
      expect(
        problemsFor(siteSettingsCollection, { ...validSettings(), revenueRanges }),
        JSON.stringify(revenueRanges),
      ).toContain(path)
    }
  })
})

/**
 * The monthly-budget brackets (2026-09-18): the billing ranges' arrangement
 * again, on a second field, so the same three claims hold.
 */
describe('the audit form\'s monthly-budget brackets', () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>
  const bracketsOf = (record: Record<string, unknown>): string[] => {
    const result = siteSettingsCollection.map(record, 0)
    if (!result.ok) throw new Error('expected a valid record, got ' + JSON.stringify(result.problems))
    return (result.value as SiteSettings).budgetRanges
  }

  it('carries the fixture\'s brackets through, in order', () => {
    expect(bracketsOf(validSettings())).toEqual(settingsFixtures[0].budgetRanges)
  })

  it('falls back to placeholder brackets when the CMS has none', () => {
    const fallback = bracketsOf({ ...validSettings(), budgetRanges: undefined })
    expect(fallback.length).toBeGreaterThan(0)
    for (const blank of [null, []]) {
      expect(bracketsOf({ ...validSettings(), budgetRanges: blank }), JSON.stringify(blank)).toEqual(
        fallback,
      )
    }
  })

  it('refuses a present list the dropdown could not use', () => {
    const cases: Array<[unknown, string]> = [
      [['Menos de 1.000 €', ''], 'site.budgetRanges[1]'],
      [['a'.repeat(61)], 'site.budgetRanges[0]'],
      [Array.from({ length: 9 }, (_, i) => 'Rango ' + i), 'site.budgetRanges'],
      [['Igual', 'Igual'], 'site.budgetRanges[1]'],
      ['Menos de 1.000 €', 'site.budgetRanges'],
    ]
    for (const [budgetRanges, path] of cases) {
      expect(
        problemsFor(siteSettingsCollection, { ...validSettings(), budgetRanges }),
        JSON.stringify(budgetRanges),
      ).toContain(path)
    }
  })
})

describe('the forms\' confirmation copy', () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>

  const FIELDS = [
    'auditSuccessTitle',
    'auditSuccessBody',
    'contactSuccessTitle',
    'contactSuccessBody',
  ] as const

  it('carries all four strings through from the fixture', () => {
    const result = siteSettingsCollection.map(validSettings(), 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const value = result.value as SiteSettings
    for (const field of FIELDS) {
      expect(typeof value[field], field).toBe('string')
      expect(value[field].length, field).toBeGreaterThan(0)
    }
  })

  it('falls back to the shipped copy when the CMS has never been given one', () => {
    // A new field arriving in a dataset that predates it must not fail the
    // build, or the first deploy after this change is blocked on somebody
    // opening the Studio. The fallbacks are the exact strings the two panels
    // rendered before the copy became editable, so an untouched dataset
    // behaves identically. The collection file records the full reasoning.
    for (const field of FIELDS) {
      for (const blank of [undefined, null, '']) {
        const record = validSettings()
        record[field] = blank
        const result = siteSettingsCollection.map(record, 0)
        expect(result.ok, field + '=' + String(blank)).toBe(true)
        if (result.ok) {
          expect((result.value as SiteSettings)[field].length).toBeGreaterThan(0)
        }
      }
    }
  })

  it('still refuses a value that is present and wrong', () => {
    // The fallback is for ABSENCE. Anything actually written is validated.
    const record = validSettings()
    record.auditSuccessTitle = 'a'.repeat(61)
    expect(problemsFor(siteSettingsCollection, record)).toContain('site.auditSuccessTitle')
  })

  it('bounds the titles and the bodies at different lengths', () => {
    // A title is a heading in a panel and a body is two lines under it. The
    // point of the bound is that neither can silently become a paragraph.
    const record = validSettings()
    record.auditSuccessTitle = 'a'.repeat(61)
    expect(problemsFor(siteSettingsCollection, record)).toContain('site.auditSuccessTitle')

    const longBody = validSettings()
    longBody.contactSuccessBody = 'a'.repeat(241)
    expect(problemsFor(siteSettingsCollection, longBody)).toContain('site.contactSuccessBody')
  })

  it('strips markup out of copy that is rendered as text', () => {
    // These land in a `<p>` and an `<h2>` as plain strings, so no tag may
    // survive the mapper. Stripped rather than refused, which is the contract
    // every other CMS text field in this repository already has (`text()` in
    // content/lib/validate.ts): an editor pasting from a document gets the
    // words, and the renderer never receives markup it would have to trust.
    const record = validSettings()
    record.contactSuccessBody = 'Gracias <b>de verdad</b> por <script>alert(1)</script>escribirnos.'
    const result = siteSettingsCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    const body = (result.value as SiteSettings).contactSuccessBody
    expect(body).not.toMatch(/</)
    expect(body).toContain('de verdad')
    expect(body).not.toContain('alert(1)')
  })

  it('decodes an entity rather than shipping it to a text node', () => {
    // `&amp;` reaching an `<h2>` renders as `&amp;`. Decoding is `text()`'s job
    // and `content/lib/html.test.ts` owns the rule; this only proves these four
    // fields go through it rather than around it.
    const record = validSettings()
    record.auditSuccessTitle = 'Solicitud &amp; recibida'
    const result = siteSettingsCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.value as SiteSettings).auditSuccessTitle).toBe('Solicitud & recibida')
    }
  })
})

/**
 * The booking link, editable since 2026-09-04.
 *
 * Same argument as the phone numbers: which slot the client opens for a first
 * call is theirs to change, and the alternative to a field is a deploy for a
 * URL. It began pinned to calendly.com; the client books there today and is
 * moving to another platform, so the pin WAS the deploy it was meant to avoid.
 *
 * The HOST IS DELIBERATELY NOT CHECKED. What the code does with this value is
 * render a visible `<a rel="noopener noreferrer">` that the visitor reads
 * before they click — the same authority a link in a blog post carries, and
 * `safeHref` gives those any host on https. The repository's host allowlists
 * are for the cases where code TRUSTS a host: an iframe it builds (`embed`) or
 * media it loads (`remoteMediaUrl`). Nothing trusts this one. So every rule
 * below is about SHAPE, and none of them needs editing when the platform
 * changes — which is the whole point of the field.
 */
describe("the client's booking link", () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>

  it('carries the booking link through from the fixture', () => {
    const result = siteSettingsCollection.map(validSettings(), 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value as SiteSettings).bookingUrl).toBe('https://calendly.com/vertigo/30min')
  })

  it('omits the field when the CMS has never been given one', () => {
    // A new field arriving in a dataset that predates it must not fail the
    // build — the same rule the confirmation copy above lives by. There is no
    // sensible default URL, so absence is absence: the button simply does not
    // render, and the phones below it are unchanged.
    for (const blank of [undefined, null, '']) {
      const record = validSettings()
      record.bookingUrl = blank
      const result = siteSettingsCollection.map(record, 0)
      expect(result.ok, String(blank)).toBe(true)
      if (!result.ok) continue
      expect((result.value as SiteSettings).bookingUrl, String(blank)).toBeUndefined()
    }
  })

  it('refuses anything that is not a complete https address', () => {
    // The scheme cases are the point, and they are why this PARSES the URL
    // rather than matching it. `javascript://calendly.com/%0aalert(1)` parses
    // cleanly — it has a familiar host and a path — and a check that looked for
    // the string "https://", or trusted a familiar-looking host, would wave it
    // through. The protocol is read off the parse, so it does not.
    for (const url of [
      'http://calendly.com/vertigo/30min',
      'http://reservas.vertigomkt.com/cita',
      'javascript:alert(1)',
      'javascript://calendly.com/%0aalert(1)',
      'data:text/html,<script>alert(1)</script>',
      'mailto:hola@vertigomkt.com',
      '//calendly.com/vertigo',
      'calendly.com/vertigo',
    ]) {
      const record = validSettings()
      record.bookingUrl = url
      expect(problemsFor(siteSettingsCollection, record), url).toContain('site.bookingUrl')
    }
  })

  it('refuses a link whose credentials hide where it really goes', () => {
    // `https://calendly.com@attacker.net/x` parses with calendly.com as the
    // USERNAME and attacker.net as the host, and reads as Calendly to anybody
    // skimming the Studio field. The origin allowlist used to catch this as a
    // side effect; it is now refused on its shape, which keeps holding whatever
    // platform the client moves to.
    for (const url of [
      'https://calendly.com@attacker.net/vertigo',
      'https://user:pass@attacker.net/vertigo',
    ]) {
      const record = validSettings()
      record.bookingUrl = url
      expect(problemsFor(siteSettingsCollection, record), url).toContain('site.bookingUrl')
    }
  })

  it('refuses a bare origin, which books nothing', () => {
    // A platform's own marketing homepage, not anybody's booking page. The
    // hosts here are deliberately not calendly.com: nothing in this block
    // should read as a rule about one provider.
    for (const url of ['https://reservas.vertigomkt.com', 'https://reservas.vertigomkt.com/']) {
      const record = validSettings()
      record.bookingUrl = url
      expect(problemsFor(siteSettingsCollection, record), url).toContain('site.bookingUrl')
    }
  })

  it('accepts a booking page on any platform, custom domains included', () => {
    // This list IS the requirement. The last two earn their place: a query
    // string must not confuse the path rule, and a custom domain — which most
    // of these platforms sell — is exactly what the old allowlist refused.
    for (const url of [
      'https://calendly.com/vertigo/30min',
      'https://www.calendly.com/vertigo/30min',
      'https://cal.com/vertigo/30min',
      'https://meetings.hubspot.com/vertigo',
      'https://tidycal.com/vertigo/30-minute-meeting',
      'https://vertigo.zohobookings.eu/portal/vertigo',
      'https://outlook.office.com/bookwithme/user/abc?anonymous',
      'https://reservas.vertigomkt.com/cita-30min',
    ]) {
      const record = validSettings()
      record.bookingUrl = url
      expect(problemsFor(siteSettingsCollection, record), url).toEqual([])
    }
  })
})

/**
 * The booking button's words, editable since 2026-09-05.
 *
 * A FALLBACK field, not an optional one — the same arrangement as the
 * confirmation copy above, and for the same reason. It was a literal in the JSX
 * until the client asked to be able to change scheduling platform: the button
 * may need to name whatever they land on. So the shipped wording moved into the
 * build, as the value a dataset that predates the field resolves to.
 */
describe("the booking button's words", () => {
  const validSettings = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>

  it('falls back to the shipped wording when the CMS has none', () => {
    for (const blank of [undefined, null, '']) {
      const record = validSettings()
      record.bookingLabel = blank
      const result = siteSettingsCollection.map(record, 0)
      expect(result.ok, String(blank)).toBe(true)
      if (!result.ok) continue
      expect((result.value as SiteSettings).bookingLabel, String(blank)).toBe('Agenda una cita')
    }
  })

  it('carries the wording the client chose through untouched', () => {
    const record = validSettings()
    record.bookingLabel = 'Reserva tu hueco'
    const result = siteSettingsCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value as SiteSettings).bookingLabel).toBe('Reserva tu hueco')
  })

  it('refuses a label too long for the button it has to fit in', () => {
    const record = validSettings()
    record.bookingLabel = 'Agenda una cita con nuestro equipo comercial hoy mismo'
    expect(problemsFor(siteSettingsCollection, record)).toContain('site.bookingLabel')
  })

  it('flattens pasted markup instead of putting tags on the button', () => {
    // `text()` STRIPS tags silently — an editor pasting out of a formatted
    // document gets their words, not a build failure, which is how every other
    // text field in this file behaves. Asserted rather than assumed, because
    // the length bound is measured on what survives the strip.
    const record = validSettings()
    record.bookingLabel = '<b>Agenda</b> una cita'
    const result = siteSettingsCollection.map(record, 0)
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect((result.value as SiteSettings).bookingLabel).toBe('Agenda una cita')
  })

  it('refuses an entity that survives decoding', () => {
    // What `text()` does fail on: a double-encoded entity, which is markup that
    // would reach the button as visible `&amp;` rather than as a character.
    const record = validSettings()
    record.bookingLabel = 'Agenda &amp;amp; cita'
    expect(problemsFor(siteSettingsCollection, record)).toContain('site.bookingLabel')
  })
})

describe('the legal documents are the set the site links to', () => {
  it('names every required document when the collection is empty', () => {
    // Which documents exist is a code decision (legalDocs.collection.ts): the
    // audit panel links `terminos` and `aviso`, the consent banner `cookies`.
    // A dataset missing any of them must fail the build by name, not render a
    // link to nothing.
    const paths = legalDocsCollection.audit([]).map((problem) => problem.path)
    for (const id of ['terminos', 'aviso', 'cookies']) {
      expect(paths, id).toContain('legalDocs.' + id)
    }
  })
})

describe('retired building banner data', () => {
  it('ignores legacy fields without mutating persisted input or emitting the old contract', () => {
    for (const legacy of [
      { bannerEnabled: true, bannerImage: 'https://cdn.sanity.io/images/p/d/old-1600x870.webp' },
      { bannerEnabled: 'invalid legacy switch', bannerImage: { asset: { _ref: 'old-image' } } },
      { bannerEnabled: false, bannerImage: null },
    ]) {
      const record = { ...structuredClone(settingsFixtures[0]), ...legacy }
      const before = structuredClone(record)
      const result = siteSettingsCollection.map(record, 0)
      expect(result.ok).toBe(true)
      if (!result.ok) throw new Error('Legacy banner fields must not block site settings')
      expect(result.value).not.toHaveProperty('buildingBanner')
      expect(result.value).not.toHaveProperty('bannerImage')
      expect(result.value).not.toHaveProperty('bannerEnabled')
      expect(record).toEqual(before)
      expect(siteSettingsCollection.audit([result.value])).toEqual([])
    }
  })

  it('does not request the retired image, even if a source returns legacy data', async () => {
    const record = {
      ...structuredClone(settingsFixtures[0]),
      bannerEnabled: true,
      bannerImage: 'https://cdn.sanity.io/images/p/d/old-1600x870.webp',
    }
    const fetchImage = vi.fn<typeof fetch>().mockRejectedValue(new Error('Retired image was fetched'))
    const source = withMediaMirror({
      describe: 'legacy site settings',
      fetchAll: async () => [record],
    }, {
      dir: 'out/retired-banner-must-not-download',
      publicPath: '/logos',
      allowedOrigin: 'https://cdn.sanity.io',
      fetchImpl: fetchImage,
    })
    const records = await source.fetchAll(siteSettingsCollection.source)
    expect(records).toEqual([record])
    expect(fetchImage).not.toHaveBeenCalled()
    expect(siteSettingsCollection.map(records[0], 0).ok).toBe(true)
    expect(siteSettingsCollection.source.projection).not.toMatch(/bannerImage|bannerEnabled/)
  })
})

describe('the tower screen is a singleton of slides the build proves', () => {
  const validTower = () => structuredClone(towerFixtures[0]) as Record<string, unknown>
  const slideOf = (record: Record<string, unknown>, i = 0) => (record.slides as Record<string, unknown>[])[i]!
  const tower = (mutate: (record: Record<string, unknown>) => void): string[] => {
    const record = validTower()
    mutate(record)
    return problemsFor(towerScreenCollection, record)
  }
  const mapped = (mutate: (record: Record<string, unknown>) => void) => {
    const record = validTower()
    mutate(record)
    const result = towerScreenCollection.map(record, 0)
    return result.ok ? (result.value as TowerScreenContent) : undefined
  }

  it('accepts the committed fixture, with ids taken from position', () => {
    const results = towerFixtures.map((r, i) => towerScreenCollection.map(r, i))
    expect(results.map((r) => (r.ok ? [] : r.problems))).toEqual([[]])
    const value = (results[0] as { ok: true; value: TowerScreenContent }).value
    expect(value.slides.map((slide) => slide.id)).toEqual(['slide-1', 'slide-2'])
    expect(value.slides[0]!.metric).toEqual({ value: 50, suffix: '%' })
    expect(value.slides[1]!.metric).toEqual({ value: 30, prefix: '−', suffix: '%' })
    expect(value.slides[1]!.image?.fit).toBe('contain')
  })

  it('accepts exactly one document, and fails on zero or two', () => {
    expect(towerScreenCollection.audit([{ id: 'tower' }])).toEqual([])
    expect(towerScreenCollection.audit([]).length).toBeGreaterThan(0)
    const two = towerScreenCollection.audit([{ id: 'tower' }, { id: 'tower-2' }])
    expect(two.some((p) => /exactly one/.test(p.message))).toBe(true)
  })

  it('asks the mirror for every slide picture, into a folder of its own', () => {
    expect(towerScreenCollection.source.mirror).toEqual(['slides[].image.src'])
    expect(towerScreenCollection.source.mirrorDir).toBe('media/tower')
    expect(towerScreenCollection.source.mediaRules?.['slides[].image.src']?.extensions).toContain('jpg')
    expect(towerScreenCollection.source.projection).toContain('image.asset->url')
  })

  it('rejects zero slides, and more than the net allows', () => {
    expect(tower((r) => { r.slides = [] })).toContain('tower.slides')
    const many = Array.from({ length: EDITORIAL_BOUNDS.towerScreen.slides + 1 }, () => slideOf(validTower()))
    expect(tower((r) => { r.slides = many })).toContain('tower.slides')
  })

  it('rejects a rotation outside the band or not whole, and accepts a numeric string', () => {
    for (const seconds of [2, 61, 2.5, '', null, 'cinco']) {
      expect(tower((r) => { r.rotationSeconds = seconds }), String(seconds)).toContain('tower.rotationSeconds')
    }
    expect(tower((r) => { r.rotationSeconds = '5' })).toEqual([])
  })

  it('rejects a headline that is missing, blank or wider than the wall', () => {
    const tooWide = 'M'.repeat(EDITORIAL_BOUNDS.towerScreen.headline + 1)
    for (const headline of [undefined, null, '', '   ', tooWide]) {
      expect(tower((r) => { slideOf(r).headline = headline }), String(headline)).toContain('tower.slides[0].headline')
    }
  })

  it('takes up to three list lines, none at all, and refuses a fourth or a blank one', () => {
    expect(tower((r) => { slideOf(r).items = [] })).toEqual([])
    expect(tower((r) => { delete slideOf(r).items })).toEqual([])
    expect(tower((r) => { slideOf(r).items = ['a', 'b', 'c', 'd'] })).toContain('tower.slides[0].items')
    expect(tower((r) => { slideOf(r).items = ['a', ''] })).toContain('tower.slides[0].items[1]')
    const tooWide = 'x'.repeat(EDITORIAL_BOUNDS.towerScreen.listItem + 1)
    expect(tower((r) => { slideOf(r).items = [tooWide] })).toContain('tower.slides[0].items[0]')
  })

  it('takes a whole figure or none, and refuses a decimal, a unit inside it, or an affix with no figure', () => {
    const noMetric = (record: Record<string, unknown>) => {
      delete slideOf(record).metricValue
      delete slideOf(record).metricPrefix
      delete slideOf(record).metricSuffix
    }
    expect(tower(noMetric)).toEqual([])
    expect(mapped(noMetric)?.slides[0]!.metric).toBeNull()
    expect(tower((r) => { slideOf(r).metricValue = 12.5 })).toContain('tower.slides[0].metricValue')
    expect(tower((r) => { slideOf(r).metricValue = '12%' })).toContain('tower.slides[0].metricValue')
    expect(tower((r) => { slideOf(r).metricValue = 1_000_000 })).toContain('tower.slides[0].metricValue')
    expect(tower((r) => { noMetric(r); slideOf(r).metricSuffix = '%' })).toContain('tower.slides[0].metricValue')
    expect(tower((r) => { slideOf(r).metricSuffix = 'euros' })).toContain('tower.slides[0].metricSuffix')
  })

  it('takes captions or leaves them null, and refuses one over its slot', () => {
    const value = mapped((r) => { slideOf(r).caption2 = ''; delete slideOf(r).caption3 })
    expect(value?.slides[0]!.caption2).toBeNull()
    expect(value?.slides[0]!.caption3).toBeNull()
    const wide1 = 'M'.repeat(EDITORIAL_BOUNDS.towerScreen.caption1 + 1)
    const wide3 = 'M'.repeat(EDITORIAL_BOUNDS.towerScreen.caption + 1)
    expect(tower((r) => { slideOf(r).caption1 = wide1 })).toContain('tower.slides[0].caption1')
    expect(tower((r) => { slideOf(r).caption3 = wide3 })).toContain('tower.slides[0].caption3')
  })

  it('lets a slide have no picture, and reads a missing fit as cover', () => {
    const value = mapped((r) => { slideOf(r).image = null; slideOf(r, 1).imageFit = undefined })
    expect(value?.slides[0]!.image).toBeNull()
    expect(value?.slides[1]!.image?.fit).toBe('cover')
  })

  it('refuses a picture that was touched but never uploaded, in one sentence', () => {
    const record = validTower()
    slideOf(record).image = { src: null, width: null, height: null }
    const result = towerScreenCollection.map(record, 0)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.problems).toHaveLength(1)
      expect(result.problems[0]!.message).toMatch(/no image was uploaded/)
    }
  })

  it('refuses a picture the mirror did not bring in, a bad fit, or a shape no fit rescues', () => {
    const picture = (r: Record<string, unknown>) => slideOf(r).image as Record<string, unknown>
    expect(tower((r) => { picture(r).src = 'https://cdn.sanity.io/images/p/d/a-612x344.webp' })).toContain('tower.slides[0].image.src')
    expect(tower((r) => { slideOf(r).imageFit = 'stretch' })).toContain('tower.slides[0].image.fit')
    expect(tower((r) => { picture(r).width = 4000; picture(r).height = 100 })).toContain('tower.slides[0].image')
    expect(tower((r) => { picture(r).width = 0 })).toContain('tower.slides[0].image.width')
  })

  it('strips pasted markup from a slot rather than failing, but refuses an entity that survived', () => {
    expect(mapped((r) => { slideOf(r).headline = '<b>VERT</b>IGO' })?.slides[0]!.headline).toBe('VERTIGO')
    expect(tower((r) => { slideOf(r).headline = 'VER&copy;' })).toContain('tower.slides[0].headline')
  })
})

describe('the site-wide head is read from «Ajustes del sitio», with the shipped copy as fallback', () => {
  const validSeo = () => structuredClone(settingsFixtures[0]) as Record<string, unknown>
  const mapped = (record: Record<string, unknown>): SiteSeo => {
    const result = siteSeoCollection.map(record, 0)
    if (!result.ok) throw new Error(JSON.stringify(result.problems))
    return result.value as SiteSeo
  }
  const CDN_IMAGE = {
    src: 'https://cdn.sanity.io/images/p/production/abc-2400x1260.jpg',
    width: 2400,
    height: 1260,
    alt: 'Equipo de Vertigo',
  }

  it('builds yesterday\'s head from a dataset that predates the fields', () => {
    const seo = mapped(validSeo())
    expect(seo.home).toEqual(SITE_SEO_FALLBACKS.home)
    expect(seo.blog).toEqual(SITE_SEO_FALLBACKS.blog)
    expect(seo).not.toHaveProperty('home.image')
    expect(seo).not.toHaveProperty('favicon')
    expect(siteSeoCollection.audit([seo])).toEqual([])
  })

  it('treats a cleared box as blank', () => {
    for (const blank of [undefined, null, '']) {
      const record = { ...validSeo(), homeSeoTitle: blank, homeMetaDescription: blank, blogSeoTitle: blank }
      const seo = mapped(record)
      expect(seo.home.title).toBe(SITE_SEO_FALLBACKS.home.title)
      expect(seo.home.shareDescription).toBe(SITE_SEO_FALLBACKS.home.shareDescription)
      expect(seo.blog.title).toBe(SITE_SEO_FALLBACKS.blog.title)
    }
  })

  it('uses the editor\'s words, one description for search and share alike', () => {
    const seo = mapped({
      ...validSeo(),
      homeSeoTitle: 'Agencia de marketing en Murcia',
      homeMetaDescription: 'Marketing medible.',
      blogSeoTitle: 'Artículos — Vertigo',
      blogMetaDescription: 'Lo que aprendemos.',
      homeOgImage: CDN_IMAGE,
      blogOgImage: CDN_IMAGE,
    })
    expect(seo.home).toEqual({
      title: 'Agencia de marketing en Murcia',
      description: 'Marketing medible.',
      shareDescription: 'Marketing medible.',
      image: CDN_IMAGE,
    })
    expect(seo.blog.shareDescription).toBe('Lo que aprendemos.')
    expect(seo.blog.image).toEqual(CDN_IMAGE)
  })

  it('refuses a present value that is wrong, rather than replacing it', () => {
    const record = { ...validSeo(), homeSeoTitle: 'x'.repeat(2001), blogMetaDescription: 'A &copy; B' }
    const paths = problemsFor(siteSeoCollection, record)
    expect(paths).toContain('site.homeSeoTitle')
    expect(paths).toContain('site.blogMetaDescription')
    expect(problemsFor(siteSeoCollection, { ...validSeo(), homeOgImage: { alt: 'sin archivo' } }))
      .toContain('site.homeOgImage')
  })

  it('accepts a mirrored square PNG of at least the minimum size as the favicon', () => {
    const min = EDITORIAL_BOUNDS.siteSettings.faviconMinSide
    const icon = `/media/site/abc-${min}x${min}.png`
    expect(mapped({ ...validSeo(), favicon: icon }).favicon).toBe(icon)
    for (const favicon of [
      '/media/site/abc-512x400.png',
      `/media/site/abc-${min - 1}x${min - 1}.png`,
      '/media/site/abc-512x512.jpg',
      '/media/site/abc-512x512.svg',
      'https://cdn.sanity.io/images/p/production/abc-512x512.png',
      '//evil.example/abc-512x512.png',
    ]) {
      expect(problemsFor(siteSeoCollection, { ...validSeo(), favicon }), favicon).toContain('site.favicon')
    }
  })

  it('refuses a favicon that is not a square PNG before downloading it', async () => {
    const fetchImage = vi.fn<typeof fetch>().mockRejectedValue(new Error('reached the download'))
    const mirrored = (favicon: string) => withMediaMirror({
      describe: 'site settings',
      fetchAll: async () => [{ ...validSeo(), favicon }],
    }, {
      dir: 'out/favicon-must-not-download',
      publicPath: '/logos',
      publicRoot: 'out/favicon-must-not-download',
      allowedOrigin: 'https://cdn.sanity.io',
      fetchImpl: fetchImage,
    }).fetchAll(siteSeoCollection.source)

    for (const favicon of [
      'https://cdn.sanity.io/images/p/production/abc-512x512.svg',
      'https://cdn.sanity.io/images/p/production/abc-512x512.jpg',
      'https://cdn.sanity.io/images/p/production/abc-800x600.png',
    ]) {
      await expect(mirrored(favicon), favicon).rejects.toThrow()
    }
    expect(fetchImage).not.toHaveBeenCalled()
    // The control: a square PNG is the one that gets as far as the download.
    await expect(mirrored('https://cdn.sanity.io/images/p/production/abc-512x512.png'))
      .rejects.toThrow(/reached the download/)
  })
})
