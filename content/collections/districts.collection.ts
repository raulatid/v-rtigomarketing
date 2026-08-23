import type { DistrictContent, DistrictService } from '../../src/content/types'
import {
  DISTRICT_SUMMARY_MAX,
  ID_PATTERN,
  collectionProblems,
  districtProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, slug, text } from '../lib/validate'
import { collection } from './types'

/**
 * Districts: the copy behind each interactive area of the city.
 *
 * ── What is NOT here ──
 * No Blender node names, no camera yaw, no world rectangles. Those live in
 * `src/experiences/murcia/scene/cityDistrictBindings.ts` and change when the GLB
 * is re-exported, not when marketing writes. A binding whose `contentId` no
 * longer resolves is caught by `cityDistrictBindings.test.ts`.
 *
 * ── The summary bound is real ──
 * `summary` shows at the mobile peek stop where the sheet is 40% of the viewport.
 * Over-length is rejected rather than truncated: a sentence cut mid-word reads as
 * a rendering bug, and the person who can fix it properly is the person who wrote
 * it.
 */

const LABEL_MAX = 40
const INTRO_MAX = 600
const SERVICE_TITLE_MAX = 60
const SERVICE_BODY_MAX = 900

/**
 * Bounded high rather than tight. The accordion scrolls, so a long service body
 * is a design judgement rather than a broken layout — the cap exists to catch a
 * whole rendered post body arriving in a field meant for two paragraphs.
 */
const SERVICES_MAX = 12

function service(report: Report, path: string, raw: unknown): DistrictService | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an object')
  }
  const source = raw as Record<string, unknown>
  // The id becomes an `aria-controls` value, so the character set is narrower
  // than a CMS slug's. A space here breaks the accordion for screen-reader
  // users and for nobody else, which is why it is asserted rather than reviewed.
  const id = slug(report, path + '.id', source.id, ID_PATTERN)
  const title = text(report, path + '.title', source.title, { max: SERVICE_TITLE_MAX })
  const body = text(report, path + '.body', source.body, { max: SERVICE_BODY_MAX })
  if (id === undefined || title === undefined || body === undefined) return undefined
  return { id, title, body }
}

export const districtsCollection = collection<DistrictContent>({
  key: 'districts',
  source: {
    type: 'district',
    orderBy: 'slug.current asc',
    // Services are an INLINE array here. Phase 4 of the Sanity migration promotes
    // them to first-class documents and this becomes `services[]->{ ... }`; the
    // PROJECTED shape does not change, which is the whole point of putting
    // normalization in GROQ rather than in the mapper.
    projection: `{
      "id": slug.current,
      label,
      summary,
      intro,
      services[]{ "id": slug.current, title, body }
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

    const label = text(scoped, 'label', source.label, { max: LABEL_MAX })
    const summary = text(scoped, 'summary', source.summary, { max: DISTRICT_SUMMARY_MAX })
    const intro = text(scoped, 'intro', source.intro, { max: INTRO_MAX })
    const services = boundedArray(scoped, 'services', source.services, SERVICES_MAX, (r, p, v) =>
      service(r, p, v),
    )

    // All-collapsed reads as a menu rather than as content: buildSections() opens
    // section 0, so a district with no services opens nothing and the panel looks
    // broken rather than empty.
    if (services !== undefined && services.length === 0) {
      scoped.fail('services', 'at least one required')
    }

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      label === undefined ||
      summary === undefined ||
      intro === undefined ||
      services === undefined
    ) {
      return { ok: false, problems }
    }

    const value: DistrictContent = { id, label, summary, intro, services }

    const residual = districtProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    return collectionProblems(items, 'districts')
  },

  emit: {
    file: 'districts.ts',
    exportName: 'DISTRICT_CONTENT',
    typeAnnotation: 'DistrictContent[]',
    typeImport: { names: ['DistrictContent'], from: '../types' },
    description: 'District copy, as published. See content/collections/districts.collection.ts.',
  },
})
