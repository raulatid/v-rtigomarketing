import { describe, it, expect } from 'vitest'
import type { BlogPost, CaseStudy } from '../../src/content/types'
import { caseStudiesCollection } from './caseStudies.collection'
import { districtsCollection } from './districts.collection'
import { servicesCollection } from './services.collection'
import { siteSettingsCollection } from './siteSettings.collection'
import { blogPostsCollection } from './blogPosts.collection'
import { COLLECTIONS } from './index'
import caseFixtures from '../fixtures/caseStudy.json'
import districtFixtures from '../fixtures/district.json'
import serviceFixtures from '../fixtures/service.json'
import settingsFixtures from '../fixtures/siteSettings.json'
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
    // The floors are the atlas boxes in createBrandAtlas.ts: a 512² cell padded
    // by 40, a 1024×512 cell padded by 64/56. If those change, these follow.
    expect(rules.isotype.minWidth).toBe(432)
    expect(rules.isotype.minHeight).toBe(432)
    expect(rules.logo.minWidth).toBe(900)
    expect(rules.logo.minHeight).toBe(400)
    // Square-ish for the resting panel, landscape for the 2:1 expanded one.
    expect(rules.isotype.minAspect).toBeLessThan(1)
    expect(rules.isotype.maxAspect).toBeGreaterThan(1)
    expect(rules.logo.minAspect).toBeGreaterThan(1)
  })
})
