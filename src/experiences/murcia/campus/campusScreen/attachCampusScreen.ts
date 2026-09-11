import * as THREE from 'three';
import { createCarousel, type Carousel, type CarouselFrame } from '../../landmark/towerScreen/carousel';
import type { FacadeContentDocument, FacadeRotation } from '../../landmark/towerScreen/content/facadeContent';
import type { FacadeComposition } from '../../landmark/towerScreen/facadeComposition';
import { createComposition } from '../../landmark/towerScreen/facadeRenderer';
import { createMediaFacade, type MediaFacade } from '../../landmark/towerScreen/mediaFacade';
import { selectScreenUv, uvAttributeName } from '../../landmark/towerScreen/attachTowerScreen';
import { CAMPUS_SCREEN_DOCUMENT, DESIGN_METRES_WIDE } from './campusScreenContent';

/**
 * The campus's ring screen: the one entry point of this module.
 *
 * A copy of the tower's `attachTowerScreen`, for a different screen: one
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
 * No entrance. The tower energises with a sweep along its arc; a ticker on a
 * ring is simply on, so the progress jumps to settled on the first frame and
 * the wake in the shader never shows.
 */
const ENTRANCE_SECONDS = 0;

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

export interface CampusScreen {
  /** Resolves true once the first slide's assets are in; false with no screen. */
  readonly ready: Promise<boolean>;
  /** Null when there is no screen. Exposed for tuning; the site never needs it. */
  readonly facade: MediaFacade | null;
  readonly carousel: Carousel | null;
  readonly compositionIds: readonly string[];
  update(dt: number): void;
  dispose(): void;
}

function findScreen(root: THREE.Object3D, nodeName: string, uvChannel: number): THREE.Mesh | null {
  const name = THREE.PropertyBinding.sanitizeNodeName(nodeName);
  const attribute = uvAttributeName(uvChannel);
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!found && mesh.isMesh && object.name === name && mesh.geometry.getAttribute(attribute)) {
      found = mesh;
    }
  });
  return found;
}

const INERT: CampusScreen = {
  ready: Promise.resolve(false),
  facade: null,
  carousel: null,
  compositionIds: [],
  update() {},
  dispose() {},
};

export function attachCampusScreen(root: THREE.Object3D, options: CampusScreenOptions): CampusScreen {
  const screenNodeName = options.screenNodeName ?? SCREEN_NODE_NAME;
  const uvChannel = options.screenUvChannel ?? 0;
  const mesh = findScreen(root, screenNodeName, uvChannel);
  if (!mesh) {
    console.warn(`[service-campus] no "${screenNodeName}" mesh with ${uvAttributeName(uvChannel)}; the strip stays dark`);
    return INERT;
  }
  selectScreenUv(mesh, uvChannel);

  const document = options.document ?? CAMPUS_SCREEN_DOCUMENT;
  const compositions: FacadeComposition[] = document.compositions.map((content) =>
    createComposition({ id: content.id, label: content.label, blocks: content.blocks }),
  );
  const first = compositions[0];
  if (!first) {
    console.warn('[service-campus] the screen document has no compositions; the screen stays dark');
    return INERT;
  }

  // A document without a playlist holds its first composition for good.
  const rotation: FacadeRotation = document.rotation ?? {
    compositions: [first.id],
    seconds: Number.POSITIVE_INFINITY,
  };
  const carousel = createCarousel(rotation, {
    entranceSeconds: ENTRANCE_SECONDS,
    reducedMotion: options.reducedMotion,
  });

  const original = mesh.material;
  const facade = createMediaFacade({
    mesh,
    resolution: Math.min(options.resolution ?? DEFAULT_RESOLUTION, options.maxTextureSize ?? Infinity),
    anisotropy: options.anisotropy,
    designMetresWide: options.designMetresWide ?? DESIGN_METRES_WIDE,
    flipY: false,
  });
  if (options.reducedMotion) {
    facade.setShimmer(0);
    facade.setDust(0);
  }

  let disposed = false;
  let shownId = '';
  const show = (frame: CarouselFrame): void => {
    if (frame.compositionId !== shownId) {
      shownId = frame.compositionId;
      facade.setComposition(compositions.find((entry) => entry.id === shownId) ?? null);
    }
    facade.setProgress(frame.progress);
  };
  show(carousel.frame);

  const shown = compositions.find((entry) => entry.id === shownId);
  const ready = (shown?.load?.() ?? Promise.resolve()).then(() => !disposed);

  return {
    ready,
    facade,
    carousel,
    compositionIds: compositions.map((entry) => entry.id),

    update(dt) {
      if (disposed) return;
      show(carousel.update(dt));
      facade.update(dt);
    },

    dispose() {
      if (disposed) return;
      disposed = true;
      // The facade's canvases and textures are unreachable from the scene graph;
      // the compositions' assets are ours, lent to the facade and never owned by
      // it. The export's material goes back on the mesh for the host to free.
      facade.dispose();
      for (const composition of compositions) composition.dispose?.();
      mesh.material = original;
    },
  };
}
