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
import { collection, type MediaRule } from './types'

/**
 * What an uploaded brand mark has to be, enforced by `content/lib/mirror.ts`
 * before it is fetched.
 *
 * ── Where the numbers come from ──
 * `createBrandAtlas.ts` fits an isotype into a 432×432 box (a 512² cell padded by
 * 40) and a logo into an 896×400 one (1024×512 padded by 64/56). The minimums are
 * those boxes: below them the artwork is upscaled and softens at the case-panel
 * close-up, which `drawLogoContained` already warns about in the console. The
 * ideals an editor is steered towards — 512×512 and 1600×800 — live in
 * `docs/earth/logo-spec.md` and are not enforced here; only the floor is.
 *
 * The aspect bands are wide on purpose. The renderer contain-fits, so a shape it
 * did not expect is never broken, only small — these bounds mark where "small"
 * becomes "illegible": a nearly-square isotype is fine, a portrait one is not; a
 * lockup between 1.5:1 and 5:1 reads inside the 2:1 expanded panel, one outside
 * that does not.
 *
 * ── PNG and WebP only ──
 * Both carry an alpha channel. A JPEG does not, so it would ship a rectangle of
 * background over the dark-glass panel — see `docs/content/sanity-media-contract.md`.
 * SVG is refused separately and for an unrelated reason, in `remoteMediaUrl`.
 *
 * ── Duplicated in the Studio, deliberately ──
 * `sanity-studio/schemas/lib/brandMark.ts` carries the same numbers so an editor
 * is stopped at the field rather than by a failed deploy. The Studio is its own
 * npm package and neither side may import the other, exactly as with the
 * isotype/logo pairing rule below. Change `docs/earth/logo-spec.md` first, then
 * both copies.
 */
const BRAND_MARK_RULES: Record<string, MediaRule> = {
  isotype: {
    extensions: ['png', 'webp'],
    minWidth: 432,
    minHeight: 432,
    minAspect: 0.75,
    maxAspect: 4 / 3,
  },
  logo: {
    extensions: ['png', 'webp'],
    minWidth: 900,
    minHeight: 400,
    minAspect: 1.5,
    maxAspect: 5,
  },
}

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
    type: 'caseStudy',
    // Stable and domain-meaningful: `id` IS `slug.current` after projection, so
    // ordering by slug orders the emitted array by the id the application looks
    // records up by. `_createdAt` would reshuffle the file whenever an editor
    // added one, and the array position is what `orbitAssignments.ts` and the
    // brand atlas agree on.
    orderBy: 'slug.current asc',
    // Both brand marks are drawn into shared canvas atlases, so they are
    // mirrored into public/logos/ rather than hotlinked: a cross-origin draw
    // taints the canvas every panel shares, and img-src 'self' stays intact.
    //
    // The projection must hand the mirror a URL STRING — `logo.asset->url` —
    // never the bare `logo` field, which is Sanity's image object. A bare
    // `logo` typechecks, passes every fixture (they are all null), and fails
    // the first real build with "expected a string, got object". Asserted in
    // collections.test.ts because the mapper tests cannot see GROQ. Same for
    // `isotype`.
    mirror: ['logo', 'isotype'],
    mediaRules: BRAND_MARK_RULES,
    // The normalization layer. Everything the mapper reads is flat and named
    // exactly as `map` expects, so nothing downstream learns a Sanity shape —
    // no `_ref`, no `_type`, no `slug.current`, no asset object.
    projection: `{
      "id": slug.current,
      label,
      name,
      "isotype": isotype.asset->url,
      "logo": logo.asset->url,
      brandColor,
      sector,
      location,
      year,
      summary,
      details,
      metrics[]{ label, value },
      chart{
        type,
        title,
        "values": points[].value,
        "labels": select(type in ["bars", "donut"] => points[].label)
      }
    }`,
    // The chart is ONE list of points in the Studio — an editor keeping two
    // parallel lists aligned by hand was the mistake worth designing out — and
    // is split back into `values` + `labels` here. `select()` yields null for
    // line and area charts, which the mapper already treats as "no labels", so
    // the emitted module is byte-identical to what the fixtures produce.
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

    // `isotype` and `logo` are the two fields that degrade instead of failing:
    // null keeps the drawn plate, which createBrandAtlas guarantees is never
    // blank. Absent brand artwork costs one panel its trademark, and that is a
    // designed state rather than a defect worth stopping a deployment for.
    //
    // What does NOT degrade is having one without the other — see the pairing
    // check below.
    //
    // Only a LOCAL path is shippable (`LOCAL_MEDIA_PATH`, and the self-check
    // below enforces it). By the time a record reaches here the mirror has
    // already run — `content/lib/mirror.ts` fetched the CMS uploads into
    // public/logos/ and rewrote these fields to paths — so absent artwork is the
    // only remaining reason to degrade. Artwork that was DECLARED and could not
    // be fetched never gets this far: the mirror fails the build instead, since
    // a broken media reference is not an editorial state.
    //
    // Fixtures and the seed carry local paths already and are never mirrored,
    // which is why this still has to accept a plain path.
    const localMedia = (value: unknown): string | null => {
      if (typeof value !== 'string') return null
      const candidate = value.trim()
      return LOCAL_MEDIA_PATH.test(candidate) ? candidate : null
    }
    const logo = localMedia(source.logo)
    const isotype = localMedia(source.isotype)

    // THE PAIR IS ONE DECISION. The satellite's brand panel rests showing the
    // isotype and unfolds into the logo when its case study is selected, so a
    // case carrying only one of them would morph from a real trademark into a
    // drawn placeholder halfway through the animation.
    //
    // This FAILS rather than degrading, unlike each field on its own. The two
    // sit in different slots of the Studio and an editor filling one and not the
    // other sees nothing wrong; the site would look plausible and be wrong on
    // exactly one satellite. That is the failure mode the build-time content
    // pipeline exists to catch. Degrading both to null instead would be quieter,
    // but it would also silently discard artwork someone deliberately uploaded.
    if ((logo === null) !== (isotype === null)) {
      scoped.fail(
        logo === null ? 'logo' : 'isotype',
        'is missing while the other is set — a case study needs both the isotype ' +
          'and the full logo, or neither',
      )
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
      isotype,
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
