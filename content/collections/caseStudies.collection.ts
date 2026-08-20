import type { CaseChart, CaseStudy, CaseStudyMetric } from '../../src/content/types'
import {
  CASE_DETAILS_MAX,
  CASE_METRICS_REQUIRED,
  CHART_TYPES,
  CHART_VALUES_MAX,
  HEX_COLOR_PATTERN,
  ID_PATTERN,
  LOCAL_MEDIA_PATH,
  caseStudyProblems,
  collectionProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, hexColor, num, oneOf, slug, text } from '../lib/validate'
import { collection } from './types'

/**
 * Case studies: the six brands riding the orbits, and the panel behind each one.
 *
 * ── What is NOT here ──
 * No `orbitId`. Which case occupies which orbit is scene composition and lives in
 * `src/experiences/earth/orbit/orbitAssignments.ts`. A CMS that could author it
 * would be able to rearrange a hand-tuned composition, and an assignment naming a
 * case that was unpublished is caught at build time by `resolveOrbitCases`.
 *
 * ── Field lengths ──
 * The caps below are layout facts, not preferences: `details` is a four-line
 * bullet list, `metrics` is a fixed two-up grid, and `chart.values` is normalised
 * into 340 SVG units. Over-cap is rejected rather than trimmed — a silently
 * shortened case study is a content bug that looks like a rendering bug.
 */

/** Generous, but bounded: the panel is a column, not a page. */
const SUMMARY_MAX = 400
const DETAIL_MAX = 200
const NAME_MAX = 60
const METRIC_LABEL_MAX = 40
const METRIC_VALUE_MAX = 20
const CHART_TITLE_MAX = 80
const CHART_LABEL_MAX = 24

function metric(report: Report, path: string, raw: unknown): CaseStudyMetric | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an object')
  }
  const source = raw as Record<string, unknown>
  const label = text(report, path + '.label', source.label, { max: METRIC_LABEL_MAX })
  const value = text(report, path + '.value', source.value, { max: METRIC_VALUE_MAX })
  if (label === undefined || value === undefined) return undefined
  return { label, value }
}

function chart(report: Report, path: string, raw: unknown): CaseChart | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an object')
  }
  const source = raw as Record<string, unknown>

  const type = oneOf(report, path + '.type', source.type, CHART_TYPES)
  const title = text(report, path + '.title', source.title, { max: CHART_TITLE_MAX })
  const values = boundedArray(report, path + '.values', source.values, CHART_VALUES_MAX, (r, p, v) =>
    num(r, p, v),
  )

  // `labels` is optional in the type but REQUIRED for the two shapes that draw
  // from it: a bars chart with no ticks and a donut with no legend both render
  // as unlabelled shapes rather than failing, which is the quiet kind of wrong.
  let labels: string[] | undefined
  if (source.labels !== undefined && source.labels !== null) {
    labels = boundedArray(report, path + '.labels', source.labels, CHART_VALUES_MAX, (r, p, v) =>
      text(r, p, v, { max: CHART_LABEL_MAX }),
    )
  }
  if (type === 'bars' || type === 'donut') {
    if (labels === undefined) {
      report.fail(path + '.labels', 'a ' + type + ' chart needs one label per value')
    } else if (values !== undefined && labels.length !== values.length) {
      report.fail(
        path + '.labels',
        'has ' + labels.length + ' labels for ' + values.length + ' values',
      )
    }
  }

  if (type === undefined || title === undefined || values === undefined) return undefined
  if (values.length === 0) return report.fail(path + '.values', 'must have at least one value')
  return labels === undefined ? { type, title, values } : { type, title, values, labels }
}

export const caseStudiesCollection = collection<CaseStudy>({
  key: 'caseStudies',
  source: {
    postType: 'case_study',
    fields: ['id', 'slug', 'title', 'acf'],
  },

  map(raw, index) {
    const report = new Report('')
    if (raw === null || typeof raw !== 'object') {
      report.fail('[' + index + ']', 'expected an object')
      return { ok: false, problems: report.problems }
    }
    const source = raw as Record<string, unknown>

    const id = slug(report, 'id', source.id, ID_PATTERN)
    // Everything below is reported against the id when there is one, so a
    // content editor reading the log sees which case failed rather than an index.
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)

    const name = text(scoped, 'name', source.name, { max: NAME_MAX })
    const label = text(scoped, 'label', source.label ?? source.name, { max: NAME_MAX })
    const brandColor = hexColor(scoped, 'brandColor', source.brandColor, HEX_COLOR_PATTERN)
    const sector = text(scoped, 'sector', source.sector, { max: NAME_MAX })
    const location = text(scoped, 'location', source.location, { max: NAME_MAX })
    const year = text(scoped, 'year', source.year, { max: 16 })
    const summary = text(scoped, 'summary', source.summary, { max: SUMMARY_MAX })

    const details = boundedArray(scoped, 'details', source.details ?? [], CASE_DETAILS_MAX, (r, p, v) =>
      text(r, p, v, { max: DETAIL_MAX }),
    )

    // The exact-two-tuple the type claims. A REST response cannot honour a tuple
    // arity, so this is where the claim is actually kept — construct it or drop
    // the entity; there is no third option that leaves the grid renderable.
    const metrics = boundedArray(scoped, 'metrics', source.metrics, CASE_METRICS_REQUIRED, (r, p, v) =>
      metric(r, p, v),
    )
    if (metrics !== undefined && metrics.length !== CASE_METRICS_REQUIRED) {
      scoped.fail('metrics', 'has ' + metrics.length + ', needs exactly ' + CASE_METRICS_REQUIRED)
    }

    const chartValue = chart(scoped, 'chart', source.chart)

    // `logo` is the one field that degrades instead of failing: null keeps the
    // drawn plate, which createBrandAtlas guarantees is never blank. A broken
    // logo costs one panel its artwork, and that is a designed state rather than
    // a defect worth stopping a deployment for.
    //
    // Only a LOCAL path is shippable (`LOCAL_MEDIA_PATH`, and the self-check
    // below enforces it). The media mirror that would turn a CMS upload URL into
    // a path under /logos/ is NOT built yet, so a remote URL — which is what
    // WordPress will actually send — degrades to null here rather than reaching
    // the self-check and failing the whole collection, i.e. the deployment,
    // the first time an editor uploads a logo. When the mirror lands, this is
    // where it plugs in: fetch through `remoteMediaUrl`, write the file, emit
    // the local path.
    let logo: string | null = null
    if (typeof source.logo === 'string') {
      const candidate = source.logo.trim()
      if (LOCAL_MEDIA_PATH.test(candidate)) logo = candidate
    }

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      name === undefined ||
      label === undefined ||
      brandColor === undefined ||
      sector === undefined ||
      location === undefined ||
      year === undefined ||
      summary === undefined ||
      details === undefined ||
      metrics === undefined ||
      chartValue === undefined
    ) {
      return { ok: false, problems }
    }

    const value: CaseStudy = {
      id,
      label,
      name,
      logo,
      brandColor,
      sector,
      location,
      year,
      summary,
      details,
      metrics: [metrics[0], metrics[1]],
      chart: chartValue,
    }

    // The mapper and the shipped-content test must agree, so the mapper checks
    // itself against the same predicates the test uses. A field that passed the
    // coercions above but fails an invariant means the two have drifted.
    const residual = caseStudyProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    return collectionProblems(items, 'caseStudies')
  },

  emit: {
    file: 'caseStudies.ts',
    exportName: 'CASE_STUDIES',
    typeAnnotation: 'CaseStudy[]',
    typeImport: { names: ['CaseStudy'], from: '../types' },
    description: 'Case studies, as published. See content/collections/caseStudies.collection.ts.',
  },
})
