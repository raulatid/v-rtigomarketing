import type { DistrictContent, DistrictService } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import {
  DEFAULT_CAMPUS_SYMBOL,
  isCampusFigure,
  isCampusSymbol,
  type CampusFigure,
  type CampusSymbol,
} from '../../src/content/campusShapes'
import {
  DEFAULT_PARTICLE_COLOR,
  DISTRICT_SUMMARY_MAX,
  HEX_COLOR_PATTERN,
  ID_PATTERN,
  collectionProblems,
  districtProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, hexColor, slug, text } from '../lib/validate'
import { collection } from './types'
import { SERVICE_BODY_MAX, SERVICE_TITLE_MAX } from './serviceBounds'

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

// Shared with the Studio — see src/content/editorialBounds.ts. The summary
// bound lives with the other district invariants as DISTRICT_SUMMARY_MAX, which
// reads from the same table.
const { label: LABEL_MAX, intro: INTRO_MAX, services: SERVICES_MAX } = EDITORIAL_BOUNDS.district
const {
  figureCaption: FIGURE_CAPTION_MAX,
  measure: MEASURE_MAX,
  measures: MEASURES_MAX,
} = EDITORIAL_BOUNDS.service

const isBlank = (value: unknown) =>
  value === undefined || value === null || (typeof value === 'string' && value.trim() === '')

/**
 * The figure's legend. Optional — the documents published before the field
 * existed have none — so blank is null, and the plate leaves the line out. A
 * value that IS present is bounded like any other copy.
 */
function figureCaption(report: Report, path: string, value: unknown): string | null | undefined {
  if (isBlank(value)) return null
  return text(report, path, value, { max: FIGURE_CAPTION_MAX })
}

/**
 * «Qué medimos». Absent is an empty list; an entry left blank in the Studio is
 * a row the editor added and did not fill, which fails rather than drawing an
 * empty line on the plate.
 */
function measures(report: Report, path: string, value: unknown): string[] | undefined {
  if (value === undefined || value === null) return []
  return boundedArray(report, path, value, MEASURES_MAX, (r, p, v) => text(r, p, v, { max: MEASURE_MAX }))
}

/**
 * The symbol the particles form at rest. Absent is "no preference" and takes
 * the default, because a stop has to show SOMETHING and a symbol asserts
 * nothing about the copy.
 *
 * A value that IS present must be a name the campus can draw. Only the API can
 * deliver one that is not — the Studio offers a closed list — so this fails the
 * build rather than falling back, which would hide a mismatch between the two.
 */
function symbol(report: Report, path: string, value: unknown): CampusSymbol | undefined {
  if (isBlank(value)) return DEFAULT_CAMPUS_SYMBOL
  if (!isCampusSymbol(value)) return report.fail(path, 'not a campus symbol: ' + String(value))
  return value
}

/**
 * What that symbol turns into. Absent is NULL and deliberately has no default:
 * each figure draws the one mechanism its service's copy argues, so a figure
 * nobody chose would assert a mechanism nobody wrote. Null means the symbol
 * stays a symbol — a hole, which someone can see and fill by editing.
 *
 * This used to come from a table in the scene keyed by the service's slug, and
 * a service the table did not list rejected the whole campus document. That is
 * why absent is a supported value here rather than a failure.
 */
function figure(report: Report, path: string, value: unknown): CampusFigure | null | undefined {
  if (isBlank(value)) return null
  if (!isCampusFigure(value)) return report.fail(path, 'not a campus figure: ' + String(value))
  return value
}

/**
 * An optional Studio colour: absent or blank is an editorial choice ("use the
 * default"), resolved here so the shipped type is always a hex string. A value
 * that IS present must still parse; a typo fails the build. The case study's
 * `brandColor` is resolved the same way.
 */
function particleColor(report: Report, path: string, value: unknown, fallback: string | undefined) {
  const empty = value === undefined || value === null || (typeof value === 'string' && value.trim() === '')
  if (empty) return fallback
  return hexColor(report, path, value, HEX_COLOR_PATTERN)
}

function service(
  report: Report,
  path: string,
  raw: unknown,
  districtColor: string | undefined,
): DistrictService | undefined {
  // A reference GROQ could not dereference comes back as null, and it comes back
  // as null for exactly two reasons: the service document was deleted, or it was
  // never published. "expected an object" sends an editor looking at the district
  // for a problem that is one document away, so say which question to ask.
  if (raw === null) {
    return report.fail(
      path,
      'unresolved service reference — the referenced service document is missing, ' +
        'unpublished, or still a draft',
    )
  }
  if (typeof raw !== 'object') {
    return report.fail(path, 'expected a dereferenced service object, got ' + typeof raw)
  }
  const source = raw as Record<string, unknown>
  // The id becomes an `aria-controls` value, so the character set is narrower
  // than a CMS slug's. A space here breaks the accordion for screen-reader
  // users and for nobody else, which is why it is asserted rather than reviewed.
  const id = slug(report, path + '.id', source.id, ID_PATTERN)
  const title = text(report, path + '.title', source.title, { max: SERVICE_TITLE_MAX })
  const body = text(report, path + '.body', source.body, { max: SERVICE_BODY_MAX, preserveLineBreaks: true })
  // Empty takes the district's: a service nobody coloured reads as the entry.
  const color = particleColor(report, path + '.particleColor', source.particleColor, districtColor)
  const caption = figureCaption(report, path + '.figureCaption', source.figureCaption)
  const measured = measures(report, path + '.measures', source.measures)
  const shape = symbol(report, path + '.symbol', source.symbol)
  const turnsInto = figure(report, path + '.figure', source.figure)
  if (
    id === undefined ||
    title === undefined ||
    body === undefined ||
    color === undefined ||
    caption === undefined ||
    measured === undefined ||
    shape === undefined ||
    turnsInto === undefined
  ) {
    return undefined
  }
  return {
    id,
    title,
    body,
    particleColor: color,
    figureCaption: caption,
    measures: measured,
    symbol: shape,
    figure: turnsInto,
  }
}

export const districtsCollection = collection<DistrictContent>({
  key: 'districts',
  source: {
    type: 'district',
    orderBy: 'slug.current asc',
    // Services are REFERENCES, dereferenced here. The projected shape is the
    // same one the accordion always rendered, which is why promoting them to
    // their own documents changed nothing in districtPanel.ts — normalization
    // belongs in GROQ, not in the mapper.
    //
    // A reference that will not resolve arrives as null. That is a build
    // failure, named by district and index, not a service quietly missing from
    // the panel.
    projection: `{
      "id": slug.current,
      label,
      summary,
      intro,
      particleColor,
      services[]->{ "id": slug.current, title, body, particleColor, figureCaption, measures, symbol, figure }
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
    const color = particleColor(scoped, 'particleColor', source.particleColor, DEFAULT_PARTICLE_COLOR)
    const services = boundedArray(scoped, 'services', source.services, SERVICES_MAX, (r, p, v) =>
      service(r, p, v, color),
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
      color === undefined ||
      services === undefined
    ) {
      return { ok: false, problems }
    }

    const value: DistrictContent = { id, label, summary, intro, particleColor: color, services }

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
