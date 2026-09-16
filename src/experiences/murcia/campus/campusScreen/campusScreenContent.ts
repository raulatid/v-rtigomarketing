import type { FacadeContentDocument, FreeformContent } from '../../landmark/towerScreen/content/facadeContent';

type FacadeBlock = FreeformContent['blocks'][number];

/**
 * What the campus's ring screen says, bundled: a service invitation running
 * round the building, centred on the strip.
 *
 * Plain serialisable data in the shape `parseScreenContent` accepts, so a CMS
 * document can replace it one for one; only where it comes from changes.
 *
 * ## Every metre here is a DESIGN metre
 *
 * The strip is one continuous LED screen round the outside wall: 343.906 m
 * long and 6.68 m tall, U running left to right from the right entrance
 * jamb, round the back, to the left jamb. Origin top-left. `mediaFacade`
 * normalises whatever it measures to `DESIGN_METRES_WIDE`, so an export at
 * another scale shows the same layout and LED pitch.
 *
 * ## The scroll is not painted
 *
 * The invitation is painted once, repeated at an even pitch, and the facade slides
 * the texture along u every frame with `setScroll`. `REPEATS` divides the
 * strip exactly, so the pattern wraps on itself without a seam.
 */
export const DESIGN_METRES_WIDE = 343.906;
export const DESIGN_METRES_TALL = 6.68;

/** Four repetitions leave room for the full invitation at the existing type size. */
export const REPEATS = 4;

const PITCH = DESIGN_METRES_WIDE / REPEATS;

/** Cap height, and the baseline that centres it on the strip: `at` is the baseline. */
const CAP_METRES = 3;
const BASELINE = (DESIGN_METRES_TALL + CAP_METRES) / 2;

const blocks: FacadeBlock[] = Array.from({ length: REPEATS }, (_, i) => ({
  type: 'headline',
  text: 'CLICA AQUI, VE NUESTROS SERVICIOS',
  at: [i * PITCH + 6, BASELINE],
  size: CAP_METRES,
  tracking: 0.24,
  // No reveal: the strip has no entrance, so the word is simply there.
  stage: [0, 0.01],
}));

export const CAMPUS_SCREEN_DOCUMENT: FacadeContentDocument = {
  compositions: [{ template: 'freeform', id: 'servicio', label: 'servicio', blocks }],
};
