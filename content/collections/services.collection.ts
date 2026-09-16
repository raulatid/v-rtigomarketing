import type { Service } from '../../src/content/types'
import { ID_PATTERN, collectionProblems, serviceProblems } from '../../src/content/invariants'
import { Report, slug, text } from '../lib/validate'
import { collection } from './types'
import { SERVICE_BODY_MAX, SERVICE_TITLE_MAX } from './serviceBounds'

/**
 * Services: what the agency does, as documents rather than as rows.
 *
 * ── Why this exists separately from districts ──
 * A service used to live inline inside the `servicios` district, which made it
 * editable in exactly one place and reusable in none. It is now a document a
 * district REFERENCES, so the same service can appear in more than one district
 * and a future services page can list them without reaching into district copy.
 *
 * ── The projected shape is the district's shape ──
 * `districts.collection.ts` dereferences these into `{ id, title, body }`, which
 * is what the accordion already rendered. That is the point of putting the
 * dereference in GROQ: promoting services to documents changed nothing the UI
 * can observe, so `districtPanel.ts` is untouched.
 *
 * ── Nothing imports SERVICES yet ──
 * Deliberately. The collection is emitted so the data exists the moment a
 * services page does; until then it is a module no bundle pulls in.
 */

export const servicesCollection = collection<Service>({
  key: 'services',
  source: {
    type: 'service',
    // The id IS `slug.current` after projection, so ordering by slug orders the
    // emitted array by the id anything looks a service up by.
    orderBy: 'slug.current asc',
    projection: `{
      "id": slug.current,
      title,
      body
    }`,
  },

  map(raw, index) {
    const report = new Report('')
    if (raw === null || typeof raw !== 'object') {
      report.fail('[' + index + ']', 'expected an object')
      return { ok: false, problems: report.problems }
    }
    const source = raw as Record<string, unknown>

    const id = slug(report, 'id', source.id, ID_PATTERN)
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)

    const title = text(scoped, 'title', source.title, { max: SERVICE_TITLE_MAX })
    const body = text(scoped, 'body', source.body, { max: SERVICE_BODY_MAX, preserveLineBreaks: true })

    const problems = [...report.problems, ...scoped.problems]
    if (problems.length > 0 || id === undefined || title === undefined || body === undefined) {
      return { ok: false, problems }
    }

    const value: Service = { id, title, body }

    const residual = serviceProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    return collectionProblems(items, 'services')
  },

  emit: {
    file: 'services.ts',
    exportName: 'SERVICES',
    typeAnnotation: 'Service[]',
    typeImport: { names: ['Service'], from: '../types' },
    description: 'Services, as published. See content/collections/services.collection.ts.',
  },
})
