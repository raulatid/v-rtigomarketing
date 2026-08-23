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

import { SITE_SETTINGS } from './generated/siteSettings'
import type { SitePhone } from './types'

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

export const CONTACT_EMAIL = settings.contactEmail

/** The brand's own mark — NOT a third-party credit (backdrop.spec.ts guards
 *  those separately; the client rule it enforces is about attribution). */
export const COPYRIGHT = settings.copyright

export type LegalDocId = 'terminos' | 'aviso'

export interface LegalDoc {
  title: string
  /** One entry per paragraph. */
  body: string[]
}

// PLACEHOLDER legal boilerplate, plausible in shape but generic on purpose.
// This is not legal text and nobody has reviewed it: the production audits
// (security-wordpress-api §API-3, production-readiness §LEAD-1) already record
// that the real privacy notice, lawful basis and retention policy must ship
// with the real form backend. These panels are where that text will live.
export const LEGAL_DOCS: Record<LegalDocId, LegalDoc> = {
  terminos: {
    title: 'Términos y privacidad',
    body: [
      'Texto provisional. Este sitio es una experiencia de demostración de Vertigo y el presente documento ocupa el lugar de los términos de uso y la política de privacidad definitivos.',
      'Los datos introducidos en los formularios no se envían a ningún servidor en esta versión: la política definitiva describirá qué datos se recogen, con qué base legal, durante cuánto tiempo se conservan y cómo ejercer los derechos de acceso, rectificación y supresión.',
      'La versión final de este documento debe redactarse y revisarse legalmente antes del lanzamiento del sitio.',
    ],
  },
  aviso: {
    title: 'Aviso legal',
    body: [
      'Texto provisional. En cumplimiento de la normativa aplicable, esta página recogerá la identificación del titular del sitio: denominación social, NIF, domicilio y datos de contacto.',
      'El contenido de este sitio — textos, gráficos y la experiencia interactiva — pertenece a Vertigo y no puede reproducirse sin autorización.',
      'La versión final de este documento debe redactarse y revisarse legalmente antes del lanzamiento del sitio.',
    ],
  },
}
