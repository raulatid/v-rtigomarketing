/**
 * The bounds every content collection must satisfy, as pure predicates.
 *
 * ONE DEFINITION, TWO CONSUMERS. The vitest suites assert these against whatever
 * is in `src/content/`, and the content build asserts them against what it is
 * about to write. Before this module the two were the same rules written twice —
 * once in `districts.test.ts` and once, eventually, in a validator — which is
 * the arrangement where a bound gets relaxed in one place and quietly not the
 * other.
 *
 * Pure by rule: no Node APIs, no DOM, no imports beyond types. The content build
 * bundles this for Node with esbuild, and the browser bundle must be able to
 * tree-shake it away entirely.
 */
import type {
  CaseChartType,
  CaseStudy,
  DistrictContent,
  LegalDoc,
  Service,
  SiteSettings,
  TextSpan,
} from './types'

/**
 * The district summary shows at the mobile peek stop, where the sheet is only
 * 40% of the viewport tall. A bound, not a judgement about the prose.
 */
export const DISTRICT_SUMMARY_MAX = 140

/** The panel's metric row is a fixed two-up grid. Not a preference. */
export const CASE_METRICS_REQUIRED = 2

/**
 * `CaseChart` normalises a series to its own min/max, so length is a layout
 * bound rather than a data one: past this the line has more points than the
 * chart has horizontal pixels to distinguish them.
 */
export const CHART_VALUES_MAX = 16

/** The case panel's bullet list is designed for four short lines. */
export const CASE_DETAILS_MAX = 4

export const CHART_TYPES: readonly CaseChartType[] = ['line', 'bars', 'area', 'donut']

/**
 * Ids reach `aria-controls`, DOM ids and file names, so the character set is
 * narrower than a CMS slug's. A slug containing a space breaks the
 * accordion for screen-reader users and nobody else, which is why it is a bound
 * rather than something a review would catch.
 */
export const ID_PATTERN = /^[a-z0-9][a-z0-9-]{0,63}$/

/** `createBrandAtlas` parses this with `parseInt`; anything else is silent. */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i

/**
 * Logos are always local paths: `content/lib/mirror.ts` brings CMS uploads into
 * `public/logos/` rather than hotlinking them, so an absolute URL here would
 * mean an outbound request from every visitor and a cross-origin draw that can
 * taint the atlas shared by every panel.
 *
 * The second character may not be another slash. `//evil.example/x.png` is a
 * PROTOCOL-RELATIVE url: it reads as a path and resolves as a third-party
 * origin, which is the whole class this constant exists to exclude.
 */
export const LOCAL_MEDIA_PATH = /^\/(?!\/)[\w./-]+$/

export interface Problem {
  /** Dotted path to the offending value, e.g. `satellite-02.chart.values[3]`. */
  path: string
  message: string
}

const nonEmpty = (v: unknown): boolean => typeof v === 'string' && v.trim().length > 0

function duplicates<T>(items: readonly T[], key: (item: T) => string): string[] {
  const seen = new Set<string>()
  const dupes: string[] = []
  for (const item of items) {
    const k = key(item)
    if (seen.has(k)) dupes.push(k)
    seen.add(k)
  }
  return dupes
}

/**
 * Everything wrong with one case study, as a list rather than a throw.
 *
 * A list because the generator reports the whole collection's problems in one
 * run: fixing content one build failure at a time, against a CMS with a publish
 * cycle in between, is the workflow nobody should be handed.
 */
export function caseStudyProblems(entry: CaseStudy): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  for (const field of ['label', 'name', 'sector', 'location', 'year', 'summary'] as const) {
    if (!nonEmpty(entry[field])) at(field, 'must be a non-empty string')
  }

  if (!HEX_COLOR_PATTERN.test(entry.brandColor)) {
    at('brandColor', 'must match ' + HEX_COLOR_PATTERN)
  }
  if (entry.logo !== null && !LOCAL_MEDIA_PATH.test(entry.logo)) {
    at('logo', 'must be null or a local path under /')
  }
  if (entry.isotype !== null && !LOCAL_MEDIA_PATH.test(entry.isotype)) {
    at('isotype', 'must be null or a local path under /')
  }
  // The two are one decision, not two. The satellite's brand panel rests on the
  // isotype and unfolds into the logo, so a case with only one of them would
  // morph from real artwork into a drawn placeholder mid-animation — visibly
  // broken, and impossible to notice in the CMS where the fields sit apart.
  // Enforced here as well as in the mapper because this is what the shipped
  // module is checked against.
  if ((entry.logo === null) !== (entry.isotype === null)) {
    at('logo', 'and isotype must both be set or both be null')
  }

  if (entry.details.length > CASE_DETAILS_MAX) {
    at('details', 'at most ' + CASE_DETAILS_MAX + ' entries')
  }
  entry.details.forEach((line, i) => {
    if (!nonEmpty(line)) at('details[' + i + ']', 'must be a non-empty string')
  })

  if (entry.metrics.length !== CASE_METRICS_REQUIRED) {
    at('metrics', 'exactly ' + CASE_METRICS_REQUIRED + ' required')
  }
  entry.metrics.forEach((metric, i) => {
    if (!nonEmpty(metric?.label)) at('metrics[' + i + '].label', 'must be a non-empty string')
    if (!nonEmpty(metric?.value)) at('metrics[' + i + '].value', 'must be a non-empty string')
  })

  const chart = entry.chart
  if (!nonEmpty(chart?.title)) at('chart.title', 'must be a non-empty string')
  if (!CHART_TYPES.includes(chart?.type)) {
    at('chart.type', 'must be one of ' + CHART_TYPES.join(', '))
  }
  if (!Array.isArray(chart?.values) || chart.values.length === 0) {
    at('chart.values', 'must have at least one value')
  } else {
    if (chart.values.length > CHART_VALUES_MAX) {
      at('chart.values', 'at most ' + CHART_VALUES_MAX + ' values')
    }
    chart.values.forEach((value, i) => {
      if (!Number.isFinite(value)) at('chart.values[' + i + ']', 'must be a finite number')
    })
    // 'bars' draws x-axis ticks from these and 'donut' a legend; a short list
    // renders unlabelled segments rather than failing, which is worse than loud.
    if (chart.type === 'bars' || chart.type === 'donut') {
      if (!chart.labels || chart.labels.length !== chart.values.length) {
        at('chart.labels', 'a ' + chart.type + ' chart needs one label per value')
      }
    }
  }
  return problems
}

export function districtProblems(entry: DistrictContent): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  for (const field of ['label', 'summary', 'intro'] as const) {
    if (!nonEmpty(entry[field])) at(field, 'must be a non-empty string')
  }
  if (entry.summary.length > DISTRICT_SUMMARY_MAX) {
    at('summary', 'at most ' + DISTRICT_SUMMARY_MAX + ' chars, to survive the mobile peek stop')
  }
  // All-collapsed reads as a menu rather than as content; buildSections() opens
  // section 0, and a district with no services would open nothing.
  if (entry.services.length === 0) at('services', 'at least one required')

  entry.services.forEach((service, i) => {
    if (!ID_PATTERN.test(service.id)) at('services[' + i + '].id', 'must match ' + ID_PATTERN)
    if (!nonEmpty(service.title)) at('services[' + i + '].title', 'must be a non-empty string')
    if (!nonEmpty(service.body)) at('services[' + i + '].body', 'must be a non-empty string')
  })

  for (const dupe of duplicates(entry.services, (s) => s.id)) {
    at('services', 'duplicate service id "' + dupe + '" — two headers would share one region')
  }
  return problems
}

/**
 * The same three rules `districtProblems` applies to a nested service, applied
 * to a standalone one.
 *
 * Shared rather than duplicated: the district panel and the services collection
 * render the same fields, and a service that is valid in one place and not the
 * other would be a bug nobody could explain.
 */
export function serviceProblems(entry: Service): Problem[] {
  const problems: Problem[] = []
  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  for (const field of ['title', 'body'] as const) {
    if (!nonEmpty(entry[field])) {
      problems.push({ path: entry.id + '.' + field, message: 'must be a non-empty string' })
    }
  }
  return problems
}

/**
 * What a `tel:` href may contain: digits, with an optional leading `+`.
 *
 * The DISPLAY string is free — spaces, parentheses, whatever reads well. This is
 * the one that gets dialled, and a space in it produces a link that silently
 * does nothing on some handsets rather than failing visibly.
 */
export const TEL_PATTERN = /^\+?[0-9]{6,20}$/

/**
 * Deliberately loose. A strict RFC 5322 pattern rejects addresses that work, and
 * the only thing this needs to catch is a typo that would produce a `mailto:`
 * link nobody can use — a missing `@`, a missing domain, an accidental space.
 */
export const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

export function siteSettingsProblems(entry: SiteSettings): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  if (!nonEmpty(entry.copyright)) at('copyright', 'must be a non-empty string')
  if (!EMAIL_PATTERN.test(entry.contactEmail)) at('contactEmail', 'is not an email address')

  // The footer renders this list and the contact section links it. An empty one
  // leaves the site with no way to reach anybody, which is a content mistake
  // worth stopping a deployment for.
  if (entry.phones.length === 0) at('phones', 'at least one required')
  entry.phones.forEach((phone, i) => {
    if (!nonEmpty(phone?.display)) at('phones[' + i + '].display', 'must be a non-empty string')
    if (!TEL_PATTERN.test(phone?.tel)) at('phones[' + i + '].tel', 'is not a dialable number')
  })
  return problems
}

/**
 * A legal document, checked against the vocabulary the renderer implements.
 *
 * The serializer in `LegalPanel` handles exactly three block kinds and two
 * marks. This is the assertion that nothing else ever reaches it — ingestion
 * already rejects an unknown Portable Text style, and this re-checks the result,
 * so the renderer's `switch` has no unreachable default that quietly renders
 * nothing.
 */
export function legalDocProblems(entry: LegalDoc): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  if (!nonEmpty(entry.title)) at('title', 'must be a non-empty string')
  if (entry.body.length === 0) at('body', 'must have at least one block')

  entry.body.forEach((block, i) => {
    const where = 'body[' + i + ']'
    if (block.kind === 'list') {
      if (block.items.length === 0) at(where, 'a list needs at least one item')
      block.items.forEach((item, j) => spans(at, where + '.items[' + j + ']', item))
      return
    }
    if (block.kind === 'heading' && block.level !== 2 && block.level !== 3) {
      at(where, 'heading level must be 2 or 3')
    }
    spans(at, where, block.spans)
  })
  return problems
}

function spans(
  at: (path: string, message: string) => void,
  where: string,
  items: readonly TextSpan[],
): void {
  if (items.length === 0) {
    at(where, 'must have at least one span')
    return
  }
  items.forEach((span, i) => {
    if (!nonEmpty(span?.text)) at(where + '.spans[' + i + ']', 'must have text')
    // Asserted again on the shipped value, not only at ingest: this is the
    // property that lets the renderer put the value straight into an href.
    if (span?.href !== undefined && !/^(https:|mailto:)/.test(span.href)) {
      at(where + '.spans[' + i + '].href', 'must be an https: or mailto: link')
    }
    for (const mark of span?.marks ?? []) {
      if (mark !== 'strong' && mark !== 'em') {
        at(where + '.spans[' + i + '].marks', 'unsupported mark "' + String(mark) + '"')
      }
    }
  })
}

/** Collection-level bounds: the ones a single entry cannot see. */
export function collectionProblems(items: readonly { id: string }[], label: string): Problem[] {
  const problems: Problem[] = []
  if (items.length === 0) {
    problems.push({ path: label, message: 'collection is empty' })
  }
  for (const dupe of duplicates(items, (item) => item.id)) {
    problems.push({ path: label + '.' + dupe, message: 'duplicate id' })
  }
  return problems
}
