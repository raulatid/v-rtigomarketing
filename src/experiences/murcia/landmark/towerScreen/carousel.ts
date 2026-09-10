import type { FacadeRotation } from './content/facadeContent';

/**
 * Which slide the tower shows, and how far its entrance has run.
 *
 * The screen's only clock, kept out of `mediaFacade` on purpose: the facade is
 * told what to show and where the transition is, and never decides either. A
 * pure state machine over `dt`, so it can be tested without a renderer and
 * would not change if a scroll position or a route drove it instead.
 *
 * The first slide gets its entrance — progress 0 → 1 over `entranceSeconds` —
 * and every later one arrives by the facade's crossfade, already settled. The
 * rotation counts only while a slide is settled, so a turn is `seconds` of
 * being readable, not of arriving.
 */

export interface CarouselFrame {
  readonly compositionId: string;
  /** The facade's 0..1 transition clock. */
  readonly progress: number;
}

export interface CarouselOptions {
  readonly entranceSeconds: number;
  /** Starts settled: the entrance is motion applied to the viewer. */
  readonly reducedMotion: boolean;
}

export interface Carousel {
  /** The current frame, without advancing. */
  readonly frame: CarouselFrame;
  update(dt: number): CarouselFrame;
  /** Jumps to `id`; the rotation continues from there when `id` is in it. */
  show(id: string): void;
  setRotating(on: boolean): void;
  setSeconds(seconds: number): void;
  /** Runs the entrance again from the start. */
  replay(): void;
}

export function createCarousel(rotation: FacadeRotation, options: CarouselOptions): Carousel {
  const slides = rotation.compositions;
  const entrance = Math.max(options.entranceSeconds, 1e-3);
  const start = (): number => (options.reducedMotion ? 1 : 0);

  let index = 0;
  let compositionId: string = slides[0];
  let progress = start();
  let elapsed = 0;
  let rotating = true;
  let seconds = rotation.seconds;

  const frame = (): CarouselFrame => ({ compositionId, progress });

  return {
    get frame() {
      return frame();
    },

    update(dt) {
      if (progress < 1) {
        progress = Math.min(1, progress + Math.max(0, dt) / entrance);
      } else if (rotating && slides.length > 1) {
        elapsed += Math.max(0, dt);
        if (elapsed >= seconds) {
          elapsed = 0;
          index = (index + 1) % slides.length;
          compositionId = slides[index]!;
        }
      }
      return frame();
    },

    show(id) {
      compositionId = id;
      const at = slides.indexOf(id);
      if (at >= 0) index = at;
      elapsed = 0;
    },

    setRotating(on) {
      rotating = on;
      elapsed = 0;
    },

    setSeconds(value) {
      seconds = Math.max(0.1, value);
    },

    replay() {
      progress = start();
      elapsed = 0;
    },
  };
}
