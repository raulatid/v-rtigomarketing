/**
 * The width the tower's layouts are drawn for.
 *
 * ## Every metre on the screen is a DESIGN metre
 *
 * The layouts were drawn for the screen at its modelled size: 42.8 m wide and
 * 154.06 m tall. The city ships the same tower with its scale APPLIED at about
 * 0.307, so the real mesh measures ~13.1 m wide. `mediaFacade` normalises
 * whatever it measures to `DESIGN_METRES_WIDE`, which is what keeps every
 * position, cap height, feather and LED pitch valid at any applied scale —
 * and what makes the city's screen look exactly like the lab's, only smaller.
 *
 * The document itself is no longer here. Until 2026-09-22 this file bundled
 * two slides as positioned blocks; the words, figures and pictures come from
 * the CMS now (`src/content/tower.ts`) and `layoutTowerSlides.ts` puts them
 * on the grid those two slides were drawn on.
 */
export const DESIGN_METRES_WIDE = 42.8;
