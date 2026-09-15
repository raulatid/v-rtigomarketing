import { createCarousel, type Carousel, type CarouselFrame } from '../landmark/towerScreen/carousel';
import type { FacadeContentDocument, FacadeRotation } from '../landmark/towerScreen/content/facadeContent';
import type { FacadeComposition } from '../landmark/towerScreen/facadeComposition';
import { createComposition } from '../landmark/towerScreen/facadeRenderer';
import { createMediaFacade, type MediaFacade } from '../landmark/towerScreen/mediaFacade';

export interface ScreenPlayer {
  /** Resolves true once the first slide's images are in; false with no screen. */
  readonly ready: Promise<boolean>;
  /** Null when there is no screen. Exposed for tuning; the site never needs it. */
  readonly facade: MediaFacade | null;
  readonly carousel: Carousel | null;
  readonly compositionIds: readonly string[];
  update(dt: number): void;
  dispose(): void;
}

export const INERT_SCREEN: ScreenPlayer = {
  ready: Promise.resolve(false),
  facade: null,
  carousel: null,
  compositionIds: [],
  update() {},
  dispose() {},
};

/** Owns playback and resource lifetime. Adapters own mesh and material policy. */
export function createScreenPlayer(document: FacadeContentDocument, options: {
  readonly reducedMotion: boolean;
  readonly facade: Parameters<typeof createMediaFacade>[0];
}): ScreenPlayer {
  const compositions: FacadeComposition[] = document.compositions.map((content) =>
    createComposition({ id: content.id, label: content.label, blocks: content.blocks }),
  );
  const first = compositions[0];
  if (!first) return INERT_SCREEN;

  // A document without a playlist holds its first composition for good.
  const rotation: FacadeRotation = document.rotation ?? {
    compositions: [first.id],
    seconds: Number.POSITIVE_INFINITY,
  };
  const carousel = createCarousel(rotation, {
    // Both screens start without an entrance sweep; subsequent slides crossfade.
    entranceSeconds: 0,
    reducedMotion: options.reducedMotion,
  });

  const facade = createMediaFacade(options.facade);
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
      // Compositions own their assets; the facade owns its canvases and textures.
      facade.dispose();
      for (const composition of compositions) composition.dispose?.();
    },
  };
}
