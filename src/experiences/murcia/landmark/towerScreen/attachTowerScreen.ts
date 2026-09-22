import * as THREE from 'three';
import type { FacadeContentDocument } from './content/facadeContent';
import { createScreenPlayer, INERT_SCREEN, type ScreenPlayer } from '../../screens/screenPlayer';
import { findScreen, selectScreenUv, uvAttributeName } from '../../screens/screenMesh';
import { DESIGN_METRES_WIDE } from './content/towerContent';
import { applyTowerPalette } from './towerPalette';

/**
 * The Vértigo tower's screen: the one entry point of this module.
 *
 * Handed a root that CONTAINS the tower — the tower's own export in the lab,
 * the whole city on the site — and the document to show, it colours the
 * tower's parts, finds `LED_Main`, and runs the compositions on it under the
 * carousel. Nothing here loads a model, owns a scene, a camera or a render
 * loop: the caller ticks `update` with its frame delta and disposes it with
 * the rest of its world.
 *
 * ```
 *   TOWER_SCREEN_CONTENT  →  layoutTowerSlides  →  createComposition  →  mediaFacade  →  LED_Main
 *      (src/content, CMS)     (the template)          carousel ↗ (which slide, how far in)
 * ```
 *
 * The document arrives as an option rather than being imported here, so this
 * module stays free of generated content: the site hands it the CMS's slides
 * through the template, the lab and the tests hand it whatever they like.
 *
 * A missing screen is not fatal. The tower still stands in its colours; the
 * screen warns once and stays dark, because a city must load without its
 * landmark and the export contract is what fails the build, not the viewer.
 */

export const SCREEN_NODE_NAME = 'LED_Main';

/**
 * Long-axis texture size. At 2048 the portrait screen is a 569×2048 canvas —
 * about 48 px per design metre, crisp for the type sizes in `towerContent`.
 */
const DEFAULT_RESOLUTION = 2048;

export interface TowerScreenOptions {
  /** The renderer's max anisotropy, or less. The screen is seen at an angle. */
  readonly anisotropy: number;
  /** No entrance, no shimmer, no dust. Slides still change, by crossfade. */
  readonly reducedMotion: boolean;
  /**
   * The screen mesh's name. Defaults to `SCREEN_NODE_NAME`; a host that keeps
   * its export contract in its own config passes it from there, so the name has
   * one source of truth.
   */
  readonly screenNodeName?: string;
  /** Which UV set is the screen (`VertigoBuildingConfig.screenUvChannel`). Default 0. */
  readonly screenUvChannel?: 0 | 1;
  /** What the screen shows. On the site, `layoutTowerSlides(TOWER_SCREEN_CONTENT)`. */
  readonly document: FacadeContentDocument;
  /** The width the document's layouts were drawn for. See `towerContent`. */
  readonly designMetresWide?: number;
  readonly resolution?: number;
}

export type TowerScreen = ScreenPlayer;

export function attachTowerScreen(root: THREE.Object3D, options: TowerScreenOptions): TowerScreen {
  // First, and regardless of the screen: the tower's colours do not depend on it.
  applyTowerPalette(root);

  const screenNodeName = options.screenNodeName ?? SCREEN_NODE_NAME;
  const uvChannel = options.screenUvChannel ?? 0;
  const mesh = findScreen(root, screenNodeName, uvChannel);
  if (!mesh) {
    console.warn(`[vertigo] no "${screenNodeName}" mesh with ${uvAttributeName(uvChannel)}; the screen stays dark`);
    return INERT_SCREEN;
  }
  selectScreenUv(mesh, uvChannel);

  const document = options.document;
  if (document.compositions.length === 0) {
    console.warn('[vertigo] the tower document has no compositions; the screen stays dark');
    return INERT_SCREEN;
  }

  const player = createScreenPlayer(document, {
    reducedMotion: options.reducedMotion,
    facade: {
      mesh,
      resolution: options.resolution ?? DEFAULT_RESOLUTION,
      anisotropy: options.anisotropy,
      designMetresWide: options.designMetresWide ?? DESIGN_METRES_WIDE,
    },
  });
  return player;
}
