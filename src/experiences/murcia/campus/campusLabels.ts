/**
 * The campus's interface strings: the one locale seam for the services section.
 *
 * The copy — titles, summaries, bodies — is the CMS's (DECISIONS §31). What is
 * here is the chrome around it: button names, the hint, and what the
 * accessibility shim announces. It replaces the display district's
 * `CONTROL_LABELS`, which carried the same kind of string for the same reason,
 * and keeps its wording where the two overlap.
 *
 * Spanish is the site; English is here because the table was always keyed by
 * locale, and a second column is what keeps a third from being a refactor.
 */

export const DEFAULT_LOCALE = 'es';

export type CampusLabelKey =
  | 'leave'
  | 'hint'
  | 'previous'
  | 'next'
  | 'explore'
  | 'back'
  | 'measures';

const CAMPUS_LABELS: Readonly<Record<string, Readonly<Record<CampusLabelKey, string>>>> = {
  es: {
    leave: 'salir de los servicios',
    hint: '← Desliza hacia los lados para descubrir →',
    previous: 'Servicio anterior',
    next: 'Servicio siguiente',
    explore: 'explorar',
    back: 'volver',
    measures: 'Qué medimos',
  },
  en: {
    leave: 'leave the services',
    hint: '← Swipe sideways to discover →',
    previous: 'Previous service',
    next: 'Next service',
    explore: 'explore',
    back: 'back',
    measures: 'What we measure',
  },
};

export function campusLabel(locale: string, key: CampusLabelKey): string {
  const table = CAMPUS_LABELS[locale] ?? CAMPUS_LABELS[DEFAULT_LOCALE]!;
  return table[key];
}
