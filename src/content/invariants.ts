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
import { DEFAULT_PARTICLE_COLOR, EDITORIAL_BOUNDS, ID_PATTERN } from './editorialBounds'
import type {
  BlogPost,
  CaseChartType,
  CaseStudy,
  DistrictContent,
  LegalDoc,
  Service,
  SiteSettings,
  TextSpan,
} from './types'

// THE VALUES MOVED, THE NAMES DID NOT. These four are declared by the Sanity
// Studio too, where they decide whether the editor may press Publicar, so the
// number now has one home — `editorialBounds.ts`, a leaf module the Studio can
// import without compiling anything else of ours. What each one MEANS still
// belongs here, next to the predicate that applies it.

/**
 * The district summary shows at the mobile peek stop, where the sheet is only
 * 40% of the viewport tall. A bound, not a judgement about the prose.
 */
export const DISTRICT_SUMMARY_MAX = EDITORIAL_BOUNDS.district.summary

/** The panel's metric row is a fixed two-up grid. Not a preference. */
export const CASE_METRICS_REQUIRED = EDITORIAL_BOUNDS.caseStudy.metrics

/**
 * `CaseChart` normalises a series to its own min/max, so length is a layout
 * bound rather than a data one: past this the line has more points than the
 * chart has horizontal pixels to distinguish them.
 */
export const CHART_VALUES_MAX = EDITORIAL_BOUNDS.caseStudy.chartValues

/** The case panel's bullet list is designed for four short lines. */
export const CASE_DETAILS_MAX = EDITORIAL_BOUNDS.caseStudy.details

export const CHART_TYPES: readonly CaseChartType[] = ['line', 'bars', 'area', 'donut']

/**
 * Ids reach `aria-controls`, DOM ids and file names, so the character set is
 * narrower than a CMS slug's. Re-exported rather than declared: the Studio
 * validates against the same pattern, and it used to do so from a hand-kept
 * copy.
 */
export { ID_PATTERN }

/** `createBrandAtlas` parses this with `parseInt`; anything else is silent. */
export const HEX_COLOR_PATTERN = /^#[0-9a-f]{6}$/i
/**
 * What a case study's `brandColor` resolves to when the Studio field is left
 * empty — a brand with no colour of its own. Resolved once, in the content
 * build, so every consumer can keep reading a guaranteed hex string.
 */
export const DEFAULT_BRAND_COLOR = '#ffffff'
/** Declared in `editorialBounds.ts`, which the Studio can import. */
export { DEFAULT_PARTICLE_COLOR }

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

/**
 * Where editorial imagery is served from.
 *
 * ONE DEFINITION, TWO CONSUMERS, and they sit on opposite sides of the pipeline:
 * `content/collections/media.ts` refuses to ingest an image url with any other
 * origin, and `src/blog/sanityImage.ts` refuses to append transform parameters
 * to one. If those two ever disagreed they would be wrong about the same string
 * — either an image nothing renders, or a query appended to a local path that
 * has no idea what to do with it.
 *
 * Editorial images are NOT mirrored, unlike the brand logos LOCAL_MEDIA_PATH
 * guards. `adr/013` settled it: the library grows without bound, and the CDN's
 * own transforms are how the blog gets responsive images at all.
 */
export const SANITY_CDN_ORIGIN = 'https://cdn.sanity.io'

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
  if (!HEX_COLOR_PATTERN.test(entry.particleColor)) {
    at('particleColor', 'must match ' + HEX_COLOR_PATTERN)
  }
  // All-collapsed reads as a menu rather than as content; buildSections() opens
  // section 0, and a district with no services would open nothing.
  if (entry.services.length === 0) at('services', 'at least one required')

  entry.services.forEach((service, i) => {
    if (!ID_PATTERN.test(service.id)) at('services[' + i + '].id', 'must match ' + ID_PATTERN)
    if (!nonEmpty(service.title)) at('services[' + i + '].title', 'must be a non-empty string')
    if (!nonEmpty(service.body)) at('services[' + i + '].body', 'must be a non-empty string')
    if (!HEX_COLOR_PATTERN.test(service.particleColor)) {
      at('services[' + i + '].particleColor', 'must match ' + HEX_COLOR_PATTERN)
    }
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

/**
 * Whether a string is a usable booking link, whatever platform serves it.
 *
 * ── Why any host, and not an allowlist ──
 * This began as a calendly.com origin check. The client books on Calendly today
 * and is moving to another platform, and an allowlist makes that migration a
 * code change and a deploy on our side — they paste the new link, the build
 * refuses it, and the button silently disappears. Custom domains, which most
 * scheduling platforms sell, fail the same way.
 *
 * The repository already draws this line, and draws it by what the CODE does
 * with the URL rather than by how much the value is trusted:
 *
 *   • a HOST allowlist where code trusts the host — `remoteMediaUrl` in
 *     content/lib/validate.ts pins the media CDN, and `embed` in
 *     blogPosts.collection.ts pins the providers it builds an iframe for,
 *     because an iframe runs whatever the host serves;
 *   • a PROTOCOL allowlist where the URL is only ever a link a visitor may
 *     click — `safeHref` in content/lib/portableText.ts takes any host on
 *     https or mailto, and that covers every link in every blog post.
 *
 * This is the second kind: a plain anchor with `rel="noopener noreferrer"`,
 * carrying no more authority than a link in body copy. So it is checked on
 * SHAPE, and the shape stays true whatever platform the client moves to.
 *
 * PARSED, never matched as a substring — the same reason `remoteMediaUrl`
 * records under SEC-1. Parsing is also what makes the credentials check below
 * possible at all; a pattern would not see it.
 *
 * A bare origin is refused: `https://cal.com/` is a platform's own marketing
 * homepage, not anybody's booking page, and a button promising a slot that
 * lands there is worse than no button.
 */
export function isBookingUrl(value: unknown): boolean {
  if (typeof value !== 'string') return false
  let url: URL
  try {
    url = new URL(value)
  } catch {
    return false
  }
  if (url.protocol !== 'https:') return false
  // Credentials are a phishing shape, never a real booking link:
  // `https://calendly.com@attacker.net/x` parses with host attacker.net and
  // username "calendly.com", and reads as Calendly to anyone skimming the
  // Studio field. Refused on the shape, so dropping the origin allowlist does
  // not drop this — and it keeps holding for whatever platform comes next.
  if (url.username !== '' || url.password !== '') return false
  return url.pathname.length > 1
}

export function siteSettingsProblems(entry: SiteSettings): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  if (!nonEmpty(entry.copyright)) at('copyright', 'must be a non-empty string')
  if (!EMAIL_PATTERN.test(entry.contactEmail)) at('contactEmail', 'is not an email address')

  // Absent is fine — the button simply does not render. PRESENT and wrong is
  // not, and it is checked here as well as in the mapper because this is the
  // one that runs against the emitted module: a hand-edited generated file is
  // exactly how a link nobody reviewed would reach the contact dialog.
  if (entry.bookingUrl !== undefined && !isBookingUrl(entry.bookingUrl)) {
    at('bookingUrl', 'is not an https booking link')
  }

  // The button's own words. Unlike the link there IS a shipped default, so an
  // empty one here does not mean "the client has not filled it in" — it means
  // the mapper's fallback was bypassed. The consequence is worse than an ugly
  // button: the anchor's only other child is an aria-hidden icon, so an empty
  // label is a link with NO accessible name at all. Worth failing a build over.
  if (!nonEmpty(entry.bookingLabel)) at('bookingLabel', 'must be a non-empty string')

  // The confirmation copy (plan 012). Re-checked here, on the emitted module,
  // rather than trusted from the mapper — the same guard-on-the-guard
  // arrangement the rest of this file uses. A blank one is a panel that says
  // nothing to somebody who has just handed over their email address.
  if (!nonEmpty(entry.auditSuccessTitle)) at('auditSuccessTitle', 'must be a non-empty string')
  if (!nonEmpty(entry.auditSuccessBody)) at('auditSuccessBody', 'must be a non-empty string')
  if (!nonEmpty(entry.contactSuccessTitle)) at('contactSuccessTitle', 'must be a non-empty string')
  if (!nonEmpty(entry.contactSuccessBody)) at('contactSuccessBody', 'must be a non-empty string')

  // The audit form's billing dropdown. Empty is a required select with nothing
  // to pick — a form nobody can send, since the server refuses anything not in
  // this list — and a duplicate is one option shown twice. The mapper supplies
  // placeholders for an absent list, so either here means it was bypassed.
  if (!Array.isArray(entry.revenueRanges) || entry.revenueRanges.length === 0) {
    at('revenueRanges', 'at least one required')
  } else {
    entry.revenueRanges.forEach((range, i) => {
      if (!nonEmpty(range)) at('revenueRanges[' + i + ']', 'must be a non-empty string')
      else if (entry.revenueRanges.indexOf(range) !== i) at('revenueRanges[' + i + ']', 'is listed twice')
    })
  }

  // The building's banner (plan 019). The switch must be a real boolean —
  // a string 'false' is true in the one place it is read — and the image, when
  // there is one, must be a path the mirror produced: a CDN url reaching the
  // emitted module means the browser would fetch a texture cross-origin.
  if (typeof entry.buildingBanner?.enabled !== 'boolean') {
    at('buildingBanner.enabled', 'must be a boolean')
  }
  if (entry.buildingBanner?.image !== undefined && !LOCAL_MEDIA_PATH.test(entry.buildingBanner.image)) {
    at('buildingBanner.image', 'must be a local media path')
  }

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

/**
 * A blog post, checked against what the renderer and the emitted shells assume.
 *
 * Mirrors `legalDocProblems`: ingestion has already rejected an unknown
 * Portable Text style, and this re-checks the RESULT, so `PostBody`'s switch has
 * no unreachable case and the shell verifier has no absent value to tolerate.
 *
 * WHAT IS DELIBERATELY NOT CHECKED: the length of `seo.title` and
 * `seo.description`. 60 and 160 are where Google truncates, not where content
 * stops being valid, and `adr/013` makes them advisory. The Studio warns the
 * editor while they type; a build that then refused to deploy would be the worst
 * of both worlds — told it was fine, then broken. Structure is fail-closed here;
 * search-result cosmetics are not.
 */
export function blogPostProblems(entry: BlogPost): Problem[] {
  const problems: Problem[] = []
  const at = (path: string, message: string) =>
    problems.push({ path: entry.id + '.' + path, message })

  if (!ID_PATTERN.test(entry.id)) {
    problems.push({ path: String(entry.id), message: 'id must match ' + ID_PATTERN })
  }
  if (!nonEmpty(entry.title)) at('title', 'must be a non-empty string')
  if (!nonEmpty(entry.excerpt)) at('excerpt', 'must be a non-empty string')
  if (entry.body.length === 0) at('body', 'must have at least one block')

  // The id reaches `?tema=` and a filter key, so it is held to the same alphabet
  // as every other id even though Sanity guarantees the reference resolves.
  if (entry.category !== null) {
    if (!ID_PATTERN.test(entry.category.id)) {
      at('category.id', 'must match ' + ID_PATTERN)
    }
    if (!nonEmpty(entry.category.label)) at('category.label', 'must be a non-empty string')
    if (!nonEmpty(entry.category.shortLabel)) {
      at('category.shortLabel', 'must be a non-empty string')
    }
  }

  // Computed, so a bad value means the derivation broke rather than that an
  // editor typed something — which is exactly why it is worth asserting.
  if (!Number.isInteger(entry.readingTime) || entry.readingTime < 1) {
    at('readingTime', 'must be a whole number of minutes, at least 1')
  }

  if (!nonEmpty(entry.seo.title)) at('seo.title', 'must be a non-empty string')
  if (!nonEmpty(entry.seo.description)) at('seo.description', 'must be a non-empty string')
  // Never null by construction (ogImage -> cover -> site default), and asserted
  // rather than assumed because the emitted shells require exactly one og:image.
  // A local path is legitimate here: the default is same-origin and committed,
  // because a scraper will not run JavaScript or follow a transform chain.
  const image = entry.seo.image
  if (image === null || image === undefined) {
    at('seo.image', 'must be resolved at ingest, never null')
  } else if (
    !image.src.startsWith(SANITY_CDN_ORIGIN + '/') &&
    !LOCAL_MEDIA_PATH.test(image.src)
  ) {
    at('seo.image.src', 'must be on ' + SANITY_CDN_ORIGIN + ' or a local path')
  }

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
    if (block.kind === 'image' || block.kind === 'video' || block.kind === 'embed') return
    spans(at, where, block.spans)
  })
  return problems
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
