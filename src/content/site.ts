// Brand and contact data, hand-written — the SINGLE swap point for the real
// values. Deliberately not a collection: the content pipeline is strictly
// array-of-records synced from WordPress or fixtures (content/collections),
// and a phone number and two legal texts do not earn a post type. Precedent:
// lookup.ts, hand-written and content-adjacent, which the generator never
// overwrites.
//
// EVERYTHING BELOW IS PLACEHOLDER DATA. The number, the address and the legal
// texts are stand-ins so the presentation can be judged; §11 wants placeholder
// content in Spanish, not English awaiting translation. Replace here and only
// here before launch.

export interface SitePhone {
  /** What the visitor reads, formatted for reading aloud. */
  display: string
  /** What the tel: link dials — digits and +, no spaces. */
  tel: string
}

export const SITE_PHONES: SitePhone[] = [{ display: '+34 600 000 000', tel: '+34600000000' }]

export const CONTACT_EMAIL = 'hola@vertigomarketing.es'

/** The brand's own mark — NOT a third-party credit (backdrop.spec.ts guards
 *  those separately; the client rule it enforces is about attribution). */
export const COPYRIGHT = '© 2026 Vertigo'

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
