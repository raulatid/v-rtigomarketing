// Brand and contact data — now a COMPATIBILITY ADAPTER over generated content
// rather than the values themselves.
//
// These used to be hand-written here, on the argument that a phone number does
// not earn a post type. That held while only a developer could change them. The
// client edits their own contact details now, and the alternative to a
// one-record collection is a deployment for a phone number.
//
// The exports keep their old names and shapes on purpose: SiteFooter and
// ContactSection are unchanged, and this file stays the one place to look.

import { LEGAL_DOCS_LIST } from './generated/legalDocs'
import { SITE_SETTINGS } from './generated/siteSettings'
import type { LegalDoc, SitePhone } from './types'

export type { SitePhone }

/**
 * The singleton, read by index — which is only honest because the content build
 * proves there is exactly one.
 *
 * `siteSettings.collection.ts`'s `audit` fails on zero documents and on two, so
 * this cannot be `undefined` in any build that produced a deployment. The
 * assertion is also re-run against the emitted module by `site.test.ts`, the
 * same "guard on the guard" arrangement `generated.test.ts` uses.
 */
const settings = SITE_SETTINGS[0]

export const SITE_PHONES: SitePhone[] = settings.phones

/**
 * Where a form submission is emailed. Read in the browser by nothing — the
 * value that matters is read server-side by `server/recipient.ts`, which is
 * this export's first real consumer since it was written.
 */
export const CONTACT_EMAIL = settings.contactEmail

/**
 * The client's public booking page, or `undefined` when they have not given us
 * one — which is the state this shipped in, on purpose.
 *
 * `ContactSection` renders its booking button only when this is set, so the
 * client can turn the button on by pasting a link into the Studio and
 * republishing, with no code change and nothing to deploy on our side. That
 * holds when they CHANGE scheduling platform too, which is the point: the
 * content build checks the shape of a booking link — https, no credentials, a
 * path beyond the origin — and not whose domain it is, so whatever arrives here
 * is safe to put in an href without pinning the client to one provider.
 */
export const BOOKING_URL: string | undefined = settings.bookingUrl

/**
 * What that button says. Always a string: the content build substitutes the
 * shipped wording when the CMS field is blank, so no consumer needs a fallback
 * of its own and the words exist in exactly one place.
 */
export const BOOKING_LABEL: string = settings.bookingLabel

/**
 * What each panel says once a submission has genuinely been delivered.
 *
 * Editable in Sanity since 2026-09-04 (plan 012), because "te responderemos en
 * menos de 24 horas" is a promise about the client's own working week and they
 * should be able to change it without a deploy. Grouped here under names the
 * two panels use, keeping this file's habit of being the one place to look.
 */
export const FORM_MESSAGES = {
  auditTitle: settings.auditSuccessTitle,
  auditBody: settings.auditSuccessBody,
  contactTitle: settings.contactSuccessTitle,
  contactBody: settings.contactSuccessBody,
} as const

/** The brand's own mark — NOT a third-party credit (backdrop.spec.ts guards
 *  those separately; the client rule it enforces is about attribution). */
export const COPYRIGHT = settings.copyright

/**
 * The banner on the Vertigo building's sign (plan 019). Read by Murcia, which
 * resolves it to a texture source — the mirrored image, or the city's own
 * placeholder when the client has not uploaded one. See `BuildingBanner`.
 */
export const BUILDING_BANNER = settings.buildingBanner

/**
 * Which legal documents the site links to — a union in code, on purpose.
 *
 * The footer names these two, `App.tsx` routes on them and `ContactSection`
 * opens one. That is app composition, not editorial content: the same argument
 * `orbitAssignments.ts` makes for which case study occupies which orbit. A CMS
 * that could delete one would leave a footer link pointing at nothing, and a CMS
 * that could add a third would create a document nothing links to.
 *
 * The TEXT is fully editorial. Only the set is not.
 */
export type LegalDocId = 'terminos' | 'aviso'

export type { LegalDoc }

/**
 * The two documents, by id.
 *
 * `legalDocs.collection.ts`'s audit fails the build when either id is missing,
 * so the throw below can only fire against a hand-edited generated module. It
 * exists because the alternative is `LEGAL_DOCS[doc].title` on undefined, which
 * fails later and says less.
 */
function required(id: LegalDocId): LegalDoc {
  const doc = LEGAL_DOCS_LIST.find((entry) => entry.id === id)
  if (doc === undefined) throw new Error('legal document "' + id + '" is missing from the generated content')
  return doc
}

export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terminos: required('terminos'),
  aviso: required('aviso'),
}
