import type { BuildingBanner, SitePhone, SiteSettings } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import {
  EMAIL_PATTERN,
  ID_PATTERN,
  LOCAL_MEDIA_PATH,
  TEL_PATTERN,
  collectionProblems,
  isBookingUrl,
  siteSettingsProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, matching, text } from '../lib/validate'
import { collection, type MediaRule } from './types'

/**
 * Site settings: how to reach the agency, and whose name is on the footer.
 *
 * ── A singleton that the build does not take on trust ──
 * Sanity presents one document and refuses to create a second. That is a
 * convenience for the editor, not a guarantee to the build: a dataset restored
 * from a backup, an import script run twice, or a second document created
 * through the API would all satisfy the Studio and break the assumption
 * `src/content/site.ts` makes when it reads `SITE_SETTINGS[0]`. So `audit`
 * asserts the count itself. Studio validation and build validation are not the
 * same claim.
 *
 * ── Why this is a collection at all ──
 * It was hand-written in `src/content/site.ts`, on the argument that a phone
 * number does not earn a post type. That was right while nobody but a developer
 * could change it. The client now edits their own contact details, and the
 * alternative to a one-record collection is a deploy for a phone number.
 */

// "Same bound as the Studio's rule" was written four times here and was true by
// maintenance rather than by construction. It is one table now — see
// src/content/editorialBounds.ts — and the Studio reads the same entries.
const {
  copyright: COPYRIGHT_MAX,
  /** A phone number as it is shown. */
  display: DISPLAY_MAX,
  /** A city, not a sentence. */
  label: LABEL_MAX,
  /** More than a handful is a directory, and this is a footer. */
  phones: PHONES_MAX,
  /** A heading in a panel, not a sentence. */
  successTitle: SUCCESS_TITLE_MAX,
  /** Two lines under that heading. */
  successBody: SUCCESS_BODY_MAX,
  /** One option in the audit form's billing dropdown. */
  revenueRange: REVENUE_RANGE_MAX,
  revenueRanges: REVENUE_RANGES_MAX,
} = EDITORIAL_BOUNDS.siteSettings

/**
 * Words on a button, not a sentence. Same bound as the Studio's rule, and the
 * same number a phone's `label` gets, for the same kind of reason.
 *
 * Measured rather than guessed, at the 360px viewport the mobile audit uses:
 * the scrim spends 16px a side and the panel 2rem (modal.css), leaving 264px of
 * content; the pill spends 2px on its border, 28px on padding and 22px on the
 * icon and its gap, leaving ~212px for text. At 0.78rem uppercase with 0.12em
 * of letterspacing a character averages ~8.8px, so ~24 of them fit. The shipped
 * wording is 15.
 *
 * At 320px the budget is ~19 characters, so a 24-character label wraps there —
 * which is why the bound is 24 and not 19. The pill is a flex row with a
 * min-height, so it GROWS to a second line rather than overflowing.
 */
const BOOKING_LABEL_MAX = 24

/**
 * What the booking button says when the CMS has not been given words for it.
 *
 * The same reasoning as SUCCESS_FALLBACKS below, and the same value the button
 * was hardcoded to before the field existed: an untouched dataset renders
 * exactly what it rendered yesterday, and filling the field in is an
 * improvement rather than a migration.
 *
 * One deliberate difference from those four: the Studio does NOT mark this
 * `required()`. It marks them, because every site needs confirmation copy.
 * A client who books no calls at all needs no booking button, and requiring
 * this would put a red badge on the only settings document over words for a
 * control that never renders.
 */
const BOOKING_LABEL_FALLBACK = 'Agenda una cita'

/**
 * What the panels say when the CMS has not been given these fields yet.
 *
 * ── Why a default here, when this file defaults nothing else ──
 *
 * The rule the content build lives by is "never ship fixtures by omission" —
 * it refuses to GUESS A SOURCE, and refuses a production build that does not
 * name one. That is about where content comes from, and it is untouched.
 *
 * This is a different question: a NEW field arriving in a schema whose dataset
 * predates it. Requiring these four would mean the deploy after this change
 * fails until somebody opens the Studio, and it would mean the site's
 * confirmation copy — which has shipped, correct, for months — could be
 * removed by clearing a text box. The words below are exactly what the two
 * components rendered before this change, so an untouched dataset behaves
 * identically and filling the fields in is an improvement rather than a
 * migration.
 *
 * The Studio still marks all four `required()`, so an editor is asked for them.
 */
const SUCCESS_FALLBACKS = {
  auditSuccessTitle: 'Solicitud recibida',
  auditSuccessBody:
    'Gracias por contactarnos. Revisaremos tu web de forma manual y te responderemos en menos de 24 horas.',
  contactSuccessTitle: 'Recibido',
  contactSuccessBody: 'Gracias por contactarnos, te responderemos en menos de 24 horas.',
} as const

/**
 * Reads one of the four, falling back when the CMS has never been given it.
 *
 * Absent means absent: `null`, `undefined` or the empty string an editor leaves
 * behind after clearing a box. A value that IS present is validated exactly as
 * any other text field — a too-long or entity-carrying one still fails the
 * build rather than being quietly replaced.
 */
function successCopy(
  report: Report,
  path: keyof typeof SUCCESS_FALLBACKS,
  raw: unknown,
  max: number,
): string | undefined {
  if (raw === null || raw === undefined || raw === '') return SUCCESS_FALLBACKS[path]
  return text(report, path, raw, { max })
}

/**
 * The booking link — optional, and OMITTED rather than empty when unset.
 *
 * Same shape as a phone's `label` above, and for the same reason: an editor who
 * clears the box in the Studio leaves `''` behind, not `undefined`, so blank
 * counts as absent. Unlike the confirmation copy there is NO fallback — nobody
 * can guess somebody else's calendar, and the contact dialog reads absence as
 * "render no button".
 *
 * A value that IS present is held to the SHAPE of a booking link rather than to
 * one platform's domain, so the client can change scheduling providers without
 * a deploy. The reasoning lives on `isBookingUrl`.
 */
function booking(report: Report, path: string, raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') return undefined
  if (typeof raw !== 'string') {
    report.fail(path, 'expected a string')
    return undefined
  }
  const trimmed = raw.trim()
  if (!isBookingUrl(trimmed)) {
    report.fail(path, JSON.stringify(trimmed) + ' is not an https booking link')
    return undefined
  }
  return trimmed
}

/**
 * The booking button's words, falling back when the CMS has never been given
 * them. `successCopy` above with a different default — kept separate because
 * that one is keyed to the four confirmation fields and this is not one of
 * them, and widening it would mean widening its key type for one caller.
 */
function bookingCopy(report: Report, path: string, raw: unknown): string | undefined {
  if (raw === null || raw === undefined || raw === '') return BOOKING_LABEL_FALLBACK
  return text(report, path, raw, { max: BOOKING_LABEL_MAX })
}

/**
 * The audit form's billing ranges before the client has given us any.
 *
 * PLACEHOLDERS. The client did not know their brackets when the dropdown was
 * built (2026-09-14) and will write them in the Studio; these four are seeded
 * into the dataset as well, so the editor sees them as something to replace.
 * The fallback is the SUCCESS_FALLBACKS reasoning again — a dataset that
 * predates the field must still build — with a sharper edge: the select is
 * required and the server refuses anything outside this list, so an empty one
 * would be a form nobody can send.
 */
const REVENUE_RANGES_FALLBACK = [
  'Menos de 100.000 €',
  '100.000 - 500.000 €',
  '500.000 - 1.000.000 €',
  'Más de 1.000.000 €',
] as const

/**
 * Each range is at once the option's label and the value the form submits,
 * so a present list is held to what a `<select>` needs: bounded, no blank
 * entries, and no two alike (one option shown twice, and a duplicate React key).
 */
function revenueRanges(report: Report, path: string, raw: unknown): string[] | undefined {
  if (raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) {
    return [...REVENUE_RANGES_FALLBACK]
  }
  const ranges = boundedArray(report, path, raw, REVENUE_RANGES_MAX, (r, p, v) =>
    text(r, p, v, { max: REVENUE_RANGE_MAX }),
  )
  if (ranges === undefined) return undefined
  for (const [i, range] of ranges.entries()) {
    if (ranges.indexOf(range) !== i) {
      return report.fail(path + '[' + i + ']', JSON.stringify(range) + ' is listed twice')
    }
  }
  return ranges
}

/**
 * What the banner image must be, beyond being fetchable (plan 019).
 *
 * The image is stretched onto each face of the sign on the Vertigo tower, and
 * the faces are ~1.84:1 (`murcia/landmark/vertigoBuildingConfig.ts`), so the
 * aspect band is what keeps it from reading squashed. PNG and WebP, like the
 * brand marks: WebP carries a photograph well and a JPEG buys nothing here.
 *
 * Duplicated in the Studio (`sanity-studio/schemas/lib/bannerImage.ts`) so
 * the editor is told at the field; the two packages may not import each other.
 */
const BANNER_RULES: Record<string, MediaRule> = {
  bannerImage: {
    extensions: ['png', 'webp'],
    minWidth: 1024,
    minHeight: 512,
    minAspect: 1.6,
    maxAspect: 2.1,
  },
}

/**
 * The building's banner: a switch and, when the client has uploaded one, a
 * mirrored image.
 *
 * The switch DEFAULTS ON when unset — a dataset that predates the field shows
 * the city's own placeholder, which is the same "an untouched dataset renders
 * what it rendered yesterday" reasoning the confirmation copy follows. Only an
 * editor's explicit `false` turns the sign blank.
 *
 * The image, by the time it reaches here, is a path the mirror wrote (or a
 * fixture's local path). Anything else is refused: a CDN url in the emitted
 * module is a texture the browser would fetch from a third party.
 */
function banner(report: Report, enabledRaw: unknown, imageRaw: unknown): BuildingBanner | undefined {
  let enabled = true
  if (enabledRaw !== null && enabledRaw !== undefined) {
    if (typeof enabledRaw !== 'boolean') {
      report.fail('buildingBanner.enabled', 'expected a boolean')
      return undefined
    }
    enabled = enabledRaw
  }
  if (imageRaw === null || imageRaw === undefined || imageRaw === '') return { enabled }
  if (typeof imageRaw !== 'string' || !LOCAL_MEDIA_PATH.test(imageRaw.trim())) {
    report.fail('buildingBanner.image', 'must be a local media path — was the mirror skipped?')
    return undefined
  }
  return { enabled, image: imageRaw.trim() }
}

function phone(report: Report, path: string, raw: unknown): SitePhone | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an object')
  }
  const source = raw as Record<string, unknown>

  // Optional, and OMITTED rather than empty when unset — the same shape as an
  // image caption (`media.ts`). `text()` fails on a non-string and has no
  // optional mode, so the call is GUARDED rather than the helper widened. An
  // editor who clears the field in the Studio leaves '' behind, not undefined,
  // which is why blank counts as absent here.
  let label: string | undefined
  if (source.label !== null && source.label !== undefined && source.label !== '') {
    label = text(report, path + '.label', source.label, { max: LABEL_MAX })
    if (label === undefined) return undefined
  }

  const display = text(report, path + '.display', source.display, { max: DISPLAY_MAX })
  // The display string is free — spaces, parentheses, whatever reads well. This
  // is the one that gets dialled, and a space in it produces a link that
  // silently does nothing on some handsets rather than failing visibly.
  const tel = matching(report, path + '.tel', source.tel, TEL_PATTERN, 'a dialable number')
  if (display === undefined || tel === undefined) return undefined
  return label === undefined ? { display, tel } : { label, display, tel }
}

export const siteSettingsCollection = collection<SiteSettings>({
  key: 'siteSettings',
  source: {
    type: 'siteSettings',
    // One document, but ordered anyway: the ordering is what makes the emitted
    // array byte-stable, and "there is only one" is a claim audit() proves
    // rather than one the query may assume.
    orderBy: '_id asc',
    // The banner is drawn as a WebGL texture, so it is mirrored in-house like
    // the brand marks rather than hotlinked like editorial imagery. The
    // projection hands the mirror a URL STRING — `bannerImage.asset->url` —
    // never the bare image object (see caseStudies.collection.ts for the trap).
    mirror: ['bannerImage'],
    mediaRules: BANNER_RULES,
    // A deterministic document id, projected to the name the application uses.
    projection: `{
      "id": "site",
      phones[]{ label, display, tel },
      contactEmail,
      bookingUrl,
      bookingLabel,
      copyright,
      auditSuccessTitle,
      auditSuccessBody,
      contactSuccessTitle,
      contactSuccessBody,
      revenueRanges,
      bannerEnabled,
      "bannerImage": bannerImage.asset->url
    }`,
  },

  map(raw, index) {
    const report = new Report('')
    if (raw === null || typeof raw !== 'object') {
      report.fail('[' + index + ']', 'expected an object')
      return { ok: false, problems: report.problems }
    }
    const source = raw as Record<string, unknown>

    const id = text(report, 'id', source.id, { max: 64 })
    const at = id ?? '[' + index + ']'
    const scoped = new Report(at)

    if (id !== undefined && !ID_PATTERN.test(id)) {
      scoped.fail('id', '"' + id + '" does not match ' + ID_PATTERN)
    }

    const phones = boundedArray(scoped, 'phones', source.phones, PHONES_MAX, (r, p, v) => phone(r, p, v))
    const contactEmail = matching(
      scoped,
      'contactEmail',
      source.contactEmail,
      EMAIL_PATTERN,
      'an email address',
    )
    // The link is deliberately absent from the `=== undefined` guard below:
    // undefined is the SUCCESS value for a field the client has not filled in
    // yet. A value that is present and wrong reports a problem instead, and
    // `problems.length` is what fails the record.
    const bookingUrl = booking(scoped, 'bookingUrl', source.bookingUrl)
    // The label IS in that guard, like the confirmation copy: the fallback
    // means undefined can only mean a present value that failed validation.
    const bookingLabel = bookingCopy(scoped, 'bookingLabel', source.bookingLabel)
    const copyright = text(scoped, 'copyright', source.copyright, { max: COPYRIGHT_MAX })

    // The confirmation copy. `text()` strips HTML and fails on the residue, so
    // an editor who pastes formatted text out of a document is told rather than
    // silently having it flattened into something that reads wrong.
    const auditSuccessTitle = successCopy(
      scoped,
      'auditSuccessTitle',
      source.auditSuccessTitle,
      SUCCESS_TITLE_MAX,
    )
    const auditSuccessBody = successCopy(
      scoped,
      'auditSuccessBody',
      source.auditSuccessBody,
      SUCCESS_BODY_MAX,
    )
    const contactSuccessTitle = successCopy(
      scoped,
      'contactSuccessTitle',
      source.contactSuccessTitle,
      SUCCESS_TITLE_MAX,
    )
    const contactSuccessBody = successCopy(
      scoped,
      'contactSuccessBody',
      source.contactSuccessBody,
      SUCCESS_BODY_MAX,
    )
    const buildingBanner = banner(scoped, source.bannerEnabled, source.bannerImage)
    const ranges = revenueRanges(scoped, 'revenueRanges', source.revenueRanges)

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      phones === undefined ||
      contactEmail === undefined ||
      copyright === undefined ||
      bookingLabel === undefined ||
      auditSuccessTitle === undefined ||
      auditSuccessBody === undefined ||
      contactSuccessTitle === undefined ||
      contactSuccessBody === undefined ||
      ranges === undefined ||
      buildingBanner === undefined
    ) {
      return { ok: false, problems }
    }

    const value: SiteSettings = {
      id,
      phones,
      contactEmail,
      // Spread rather than assigned, so an unset link leaves the key OUT of the
      // emitted record instead of writing `"bookingUrl": undefined` — the
      // emitter is byte-stable and a key that is sometimes there is a diff.
      ...(bookingUrl === undefined ? {} : { bookingUrl }),
      // Assigned plainly, unlike the link above: the fallback means this is
      // never absent, so the key is always there and the emitter stays stable.
      bookingLabel,
      copyright,
      auditSuccessTitle,
      auditSuccessBody,
      contactSuccessTitle,
      contactSuccessBody,
      revenueRanges: ranges,
      // Always present (the switch has a default); the image key inside it is
      // spread the way `bookingUrl` is, for the same byte-stability reason.
      buildingBanner,
    }

    const residual = siteSettingsProblems(value)
    if (residual.length > 0) return { ok: false, problems: residual }

    return { ok: true, value }
  },

  audit(items) {
    const problems = collectionProblems(items, 'siteSettings')
    // The singleton invariant, kept here rather than assumed downstream.
    // `site.ts` reads [0] and every renderer reads through it, so two documents
    // would mean half the site quietly using one and nothing using the other.
    if (items.length > 1) {
      problems.push({
        path: 'siteSettings',
        message:
          'found ' +
          items.length +
          ' documents, expected exactly one — src/content/site.ts reads the first ' +
          'and the rest would be invisible',
      })
    }
    return problems
  },

  emit: {
    file: 'siteSettings.ts',
    exportName: 'SITE_SETTINGS',
    typeAnnotation: 'SiteSettings[]',
    typeImport: { names: ['SiteSettings'], from: '../types' },
    description:
      'Global editable settings, as published. Exactly one record — see content/collections/siteSettings.collection.ts.',
  },
})
