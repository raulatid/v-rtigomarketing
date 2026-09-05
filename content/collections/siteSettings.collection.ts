import type { SitePhone, SiteSettings } from '../../src/content/types'
import { EDITORIAL_BOUNDS } from '../../src/content/editorialBounds'
import {
  EMAIL_PATTERN,
  ID_PATTERN,
  TEL_PATTERN,
  collectionProblems,
  siteSettingsProblems,
} from '../../src/content/invariants'
import { Report, boundedArray, matching, text } from '../lib/validate'
import { collection } from './types'

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
} = EDITORIAL_BOUNDS.siteSettings

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
    // A deterministic document id, projected to the name the application uses.
    projection: `{
      "id": "site",
      phones[]{ label, display, tel },
      contactEmail,
      copyright,
      auditSuccessTitle,
      auditSuccessBody,
      contactSuccessTitle,
      contactSuccessBody
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

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      phones === undefined ||
      contactEmail === undefined ||
      copyright === undefined ||
      auditSuccessTitle === undefined ||
      auditSuccessBody === undefined ||
      contactSuccessTitle === undefined ||
      contactSuccessBody === undefined
    ) {
      return { ok: false, problems }
    }

    const value: SiteSettings = {
      id,
      phones,
      contactEmail,
      copyright,
      auditSuccessTitle,
      auditSuccessBody,
      contactSuccessTitle,
      contactSuccessBody,
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
