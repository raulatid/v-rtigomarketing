import type { SitePhone, SiteSettings } from '../../src/content/types'
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

const COPYRIGHT_MAX = 120
const DISPLAY_MAX = 40

/** More than a handful is a directory, and this is a footer. */
const PHONES_MAX = 4

function phone(report: Report, path: string, raw: unknown): SitePhone | undefined {
  if (raw === null || typeof raw !== 'object') {
    return report.fail(path, 'expected an object')
  }
  const source = raw as Record<string, unknown>
  const display = text(report, path + '.display', source.display, { max: DISPLAY_MAX })
  // The display string is free — spaces, parentheses, whatever reads well. This
  // is the one that gets dialled, and a space in it produces a link that
  // silently does nothing on some handsets rather than failing visibly.
  const tel = matching(report, path + '.tel', source.tel, TEL_PATTERN, 'a dialable number')
  if (display === undefined || tel === undefined) return undefined
  return { display, tel }
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
      phones[]{ display, tel },
      contactEmail,
      copyright
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

    const problems = [...report.problems, ...scoped.problems]
    if (
      problems.length > 0 ||
      id === undefined ||
      phones === undefined ||
      contactEmail === undefined ||
      copyright === undefined
    ) {
      return { ok: false, problems }
    }

    const value: SiteSettings = { id, phones, contactEmail, copyright }

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
