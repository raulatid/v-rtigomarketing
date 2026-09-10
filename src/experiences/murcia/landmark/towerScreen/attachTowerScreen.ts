import * as THREE from 'three';
import { createCarousel, type Carousel, type CarouselFrame } from './carousel';
import type { FacadeContentDocument, FacadeRotation } from './content/facadeContent';
import { DESIGN_METRES_WIDE, TOWER_DOCUMENT } from './content/towerContent';
import type { FacadeComposition } from './facadeComposition';
import { createComposition } from './facadeRenderer';
import { createMediaFacade, type MediaFacade } from './mediaFacade';
import { applyTowerPalette } from './towerPalette';

/**
 * The Vértigo tower's screen: the one entry point of this module.
 *
 * Handed a root that CONTAINS the tower — the tower's own export in the lab,
 * the whole city on the site — it colours the tower's parts, finds `LED_Main`,
 * and runs the compositions on it under the carousel. Nothing here loads a
 * model, owns a scene, a camera or a render loop: the caller ticks `update`
 * with its frame delta and disposes it with the rest of its world.
 *
 * ```
 *   TOWER_DOCUMENT  →  createComposition  →  mediaFacade  →  LED_Main
 *                          carousel ↗ (which slide, how far in)
 * ```
 *
 * A missing screen is not fatal. The tower still stands in its colours; the
 * screen warns once and stays dark, because a city must load without its
 * landmark and the export contract is what fails the build, not the viewer.
 */

export const SCREEN_NODE_NAME = 'LED_Main';

/** How long the first slide's entrance runs. Every later slide crossfades in settled. */
const ENTRANCE_SECONDS = 3.4;

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
  readonly document?: FacadeContentDocument;
  /** The width the document's layouts were drawn for. See `towerContent`. */
  readonly designMetresWide?: number;
  readonly resolution?: number;
}

export interface TowerScreen {
  /** Resolves true once the first slide's images are in; false with no screen. */
  readonly ready: Promise<boolean>;
  /** Null when there is no screen. Exposed for tuning; the site never needs it. */
  readonly facade: MediaFacade | null;
  readonly carousel: Carousel | null;
  readonly compositionIds: readonly string[];
  update(dt: number): void;
  dispose(): void;
}

function findScreen(root: THREE.Object3D, nodeName: string): THREE.Mesh | null {
  const name = THREE.PropertyBinding.sanitizeNodeName(nodeName);
  let found: THREE.Mesh | null = null;
  root.traverse((object) => {
    const mesh = object as THREE.Mesh;
    if (!found && mesh.isMesh && object.name === name && mesh.geometry.getAttribute('uv')) {
      found = mesh;
    }
  });
  return found;
}

const INERT: TowerScreen = {
  ready: Promise.resolve(false),
  facade: null,
  carousel: null,
  compositionIds: [],
  update() {},
  dispose() {},
};

export function attachTowerScreen(root: THREE.Object3D, options: TowerScreenOptions): TowerScreen {
  // First, and regardless of the screen: the tower's colours do not depend on it.
  applyTowerPalette(root);

  const screenNodeName = options.screenNodeName ?? SCREEN_NODE_NAME;
  const mesh = findScreen(root, screenNodeName);
  if (!mesh) {
    console.warn(`[vertigo] no "${screenNodeName}" mesh with UVs in the model; the tower's screen stays dark`);
    return INERT;
  }

  const document = options.document ?? TOWER_DOCUMENT;
  const compositions: FacadeComposition[] = document.compositions.map((content) =>
    createComposition({ id: content.id, label: content.label, blocks: content.blocks }),
  );
  const first = compositions[0];
  if (!first) {
    console.warn('[vertigo] the tower document has no compositions; the screen stays dark');
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

  const facade = createMediaFacade({
    mesh,
    resolution: options.resolution ?? DEFAULT_RESOLUTION,
    anisotropy: options.anisotropy,
    designMetresWide: options.designMetresWide ?? DESIGN_METRES_WIDE,
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
      // the compositions' images are ours, lent to the facade and never owned by
      // it. The palette's materials hang on the tower's meshes and go with the
      // tree.
      facade.dispose();
      for (const composition of compositions) composition.dispose?.();
    },
  };
}
