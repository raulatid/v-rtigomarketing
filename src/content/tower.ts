// The Vértigo tower's screen content — an adapter over the generated module,
// like `site.ts` is for the settings.
//
// The screen used to draw a document bundled in the experience
// (`towerScreen/content/towerContent.ts`, retired 2026-09-22). The client
// edits the slides now, and the alternative to a one-record collection is a
// deployment for a headline.

import { TOWER_SCREEN } from './generated/towerScreen.js'
import type { TowerScreenContent, TowerSlide, TowerSlideImage } from './types.js'

export type { TowerScreenContent, TowerSlide, TowerSlideImage }

/**
 * The singleton, read by index — which is only honest because the content
 * build proves there is exactly one.
 *
 * `towerScreen.collection.ts`'s `audit` fails on zero documents and on two, so
 * this cannot be `undefined` in any build that produced a deployment. The
 * assertion is re-run against the emitted module by `tower.test.ts`, the same
 * "guard on the guard" arrangement `site.test.ts` uses.
 */
export const TOWER_SCREEN_CONTENT: TowerScreenContent = TOWER_SCREEN[0]
