/**
 * Binds editorial district content to its scene composition.
 *
 * Separate from the generated content on purpose: which shape a service takes
 * in the city is not editorial copy, and mixing the two puts a marketing edit
 * one typo away from moving the composition.
 *
 * ## What it has bound, in order
 *
 * Until the 2026-09-06 re-export it carried one row per service — a building
 * node, a connection node and an accent colour — because the export shipped a
 * building per service. That export dropped them, and the rows went with them.
 *
 * Until 2026-09-11 it also carried the display district's camera decision: the
 * yaw to land on (45, then 225) and how close to fly (0.78 of rest). The
 * services campus replaced that district (plan 024) and flies its own ring of
 * stops round the lake, taking its heading from wherever the visitor was
 * looking, so neither number has a reader any more. Why the yaw had to turn
 * half round is in git history; it described a plaza no longer in the city.
 *
 * ## What it binds now: each service to a symbol
 *
 * The campus forms each service out of particles: a symbol at rest, a figure
 * when its detail opens. Which ones is scene composition, not copy — the CMS
 * carries `{ id, title, body }` and no Sanity change was wanted — so the
 * per-service rows are back, with a different payload. Every published service
 * needs a row; the unit test fails otherwise, and so would the campus's
 * content (`campus/campusContent.ts`).
 */

import type { FigureKind } from '../campus/content/servicesContent';

/** One service's shapes in the campus's particle field. */
export interface ServiceSymbolBinding {
  /** References `Service.id` within the district's content. */
  serviceId: string;
  /** A key of `campus/content/campusIcons.ts`. */
  icon: string;
  /**
   * What the symbol turns into and holds: the mechanism the service's copy
   * states, drawn (`campus/particles/figureLayouts.ts`). Changing a service's
   * copy can make its figure wrong; the Studio's `figureCaption` names it.
   */
  figure: FigureKind;
}

export interface DistrictSceneBinding {
  /** References `DistrictContent.id`. */
  contentId: string;
  /**
   * One row per published service, in any order — the tour order is the
   * content's. Placeholders until the real artwork arrives: four symbols for
   * five services, so one repeats, and never on neighbours.
   */
  services: readonly ServiceSymbolBinding[];
}

export const cityDistrictBindings: readonly DistrictSceneBinding[] = [
  {
    contentId: 'servicios',
    services: [
      { serviceId: 'seo', icon: 'magnifier', figure: 'compound' },
      { serviceId: 'web-analysis', icon: 'window', figure: 'funnel' },
      { serviceId: 'content-strategy', icon: 'magnifier', figure: 'path' },
      { serviceId: 'paid-campaigns', icon: 'pin', figure: 'segments' },
      { serviceId: 'brand-identity', icon: 'mark', figure: 'repeat' },
    ],
  },
];
