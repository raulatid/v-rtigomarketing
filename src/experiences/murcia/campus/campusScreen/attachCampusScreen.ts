import * as THREE from 'three';
import type { FacadeContentDocument } from '../../landmark/towerScreen/content/facadeContent';
import { createScreenPlayer, INERT_SCREEN, type ScreenPlayer } from '../../screens/screenPlayer';
import { findScreen, selectScreenUv, uvAttributeName } from '../../screens/screenMesh';
import { CAMPUS_SCREEN_DOCUMENT, DESIGN_METRES_WIDE } from './campusScreenContent';

/**
 * The campus's ring screen: the one entry point of this module.
 *
 * An adapter for the shared screen player, on one
 * continuous LED strip round the outside wall, `CAMPUS_SCREEN_Continuous`.
 * Handed a root that CONTAINS the campus, it finds the strip and runs the
 * compositions on it under the carousel. Nothing here loads a model, owns a
 * scene, a camera or a render loop: the caller ticks `update` with its frame
 * delta and disposes it with the rest of its world.
 *
 * On the site it runs on the tower's engine (`landmark/towerScreen/`), which
 * gained `flipY` and `setScroll` for it; only this file and the document are
 * the campus's own.
 *
 * What differs from the tower's, and why:
 *   - no palette here: the city colours the campus by name at load
 *     (`campusPalette.ts`), the lab's export carried its own materials;
 *   - `flipY` stays off: the UV template says V runs bottom to top, but the
 *     export MEASURES the other way round, like the tower; with the flip on
 *     the word stood on its head. The option is kept for the next export;
 *   - the loader's material is put back on dispose, because the lab's harness
 *     sweeps the scene and an orphan would leak;
 *   - a texture-size clamp, because 8192 is a wide canvas.
 *
 * A missing screen is not fatal: it warns once and stays dark.
 */

export const SCREEN_NODE_NAME = 'CAMPUS_SCREEN_Continuous';

/**
 * Long-axis texture size, clamped to the renderer's limit. At 16384 the strip
 * is a 16384×318 canvas, about 48 px per design metre, so a 3 m word is
 * 143 px tall and stays legible through the LED grid; a renderer capped at
 * 8192 gets half that.
 */
const DEFAULT_RESOLUTION = 16384;

export interface CampusScreenOptions {
  /** The renderer's max anisotropy, or less. The strip is seen at grazing angles. */
  readonly anisotropy: number;
  /** No entrance, no shimmer, no dust. Slides still change, by crossfade. */
  readonly reducedMotion: boolean;
  /** The screen mesh's node name. Defaults to `SCREEN_NODE_NAME`. */
  readonly screenNodeName?: string;
  /** Which UV set is the screen (`CAMPUS_SCREEN_UV_CHANNEL` on the site). Default 0. */
  readonly screenUvChannel?: 0 | 1;
  readonly document?: FacadeContentDocument;
  /** The width the document's layouts were drawn for. See `campusScreenContent`. */
  readonly designMetresWide?: number;
  readonly resolution?: number;
  /** The renderer's limit; the resolution is clamped to it. */
  readonly maxTextureSize?: number;
}

export type CampusScreen = ScreenPlayer;

export function attachCampusScreen(root: THREE.Object3D, options: CampusScreenOptions): CampusScreen {
  const screenNodeName = options.screenNodeName ?? SCREEN_NODE_NAME;
  const uvChannel = options.screenUvChannel ?? 0;
  const mesh = findScreen(root, screenNodeName, uvChannel);
  if (!mesh) {
    console.warn(`[service-campus] no "${screenNodeName}" mesh with ${uvAttributeName(uvChannel)}; the strip stays dark`);
    return INERT_SCREEN;
  }
  selectScreenUv(mesh, uvChannel);

  const document = options.document ?? CAMPUS_SCREEN_DOCUMENT;
  if (document.compositions.length === 0) {
    console.warn('[service-campus] the screen document has no compositions; the screen stays dark');
    return INERT_SCREEN;
  }

  const original = mesh.material;
  const player = createScreenPlayer(document, {
    reducedMotion: options.reducedMotion,
    facade: {
      mesh,
      resolution: Math.min(options.resolution ?? DEFAULT_RESOLUTION, options.maxTextureSize ?? Infinity),
      anisotropy: options.anisotropy,
      designMetresWide: options.designMetresWide ?? DESIGN_METRES_WIDE,
      flipY: false,
    },
  });
  let disposed = false;
  return {
    ...player,
    dispose() {
      if (disposed) return;
      disposed = true;
      player.dispose();
      // Restore the loader's material so the host can release it with the tree.
      mesh.material = original;
    },
  };
}
