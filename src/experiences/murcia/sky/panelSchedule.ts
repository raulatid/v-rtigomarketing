/**
 * Which satellites show a brand panel, and whose brand, two at a time (plan 027).
 *
 * Pure: it is handed the time and a question — will this satellite stay in
 * view, and lit, from now until a panel would be gone? — and answers with the
 * panels to draw and how opaque. It never projects anything itself; the host
 * owns the camera and asks it of the passes (`skyPasses.ts`), whose future is
 * known, so a panel is only ever put on a satellite that will carry it to the
 * end instead of one about to leave the frame mid-sentence.
 *
 * Every few seconds a pair comes up, holds and fades, and leaves the sky to
 * the next pair. With one candidate, one panel; with none, the schedule waits
 * and asks again on the next frame.
 *
 * A brand is not tied to a satellite: the brands take strict turns, and each
 * turn goes on whichever satellite can carry it. So no brand comes round again
 * before every other has been shown, and the sky can hold more satellites
 * than there are brands — which it needs: a stop's frame is narrow, and with
 * one satellite per brand most turns found nothing in it (seen on 2026-10-22).
 */

export interface ShownPanel {
  readonly satellite: number;
  /** Index into the brands. */
  readonly brand: number;
  /** 0..1. */
  readonly opacity: number;
}

export interface PanelSchedule {
  /**
   * The panels at `t`. `canShow(satellite, from, to)` answers whether it is in
   * view and lit for the whole window.
   */
  update(t: number, canShow: (satellite: number, from: number, to: number) => boolean): readonly ShownPanel[];
  /** Drops the panels on screen; the next `update` starts after `FIRST_DELAY`. */
  reset(): void;
}

/** Two at once: one is a label, three crowd the stop's frame and its plate. */
export const PANELS_AT_ONCE = 2;
/**
 * Seconds. A panel fades in, holds long enough to recognise a logo — it has no
 * text to read — and fades out; then the sky is left bare for a moment, so the
 * pairs read as turns and not as one panel jumping between satellites.
 */
export const PANEL_TIMING = { fadeIn: 0.5, hold: 2.5, fadeOut: 0.5, gap: 1.4 } as const;
export const PANEL_SECONDS = PANEL_TIMING.fadeIn + PANEL_TIMING.hold + PANEL_TIMING.fadeOut;
/** Seconds after a reset before the first pair: the plate lands first. */
export const FIRST_DELAY = 0.8;
/**
 * Seconds a lone candidate may be held back for a second one to join it. The
 * passes' future is known, so this is a look ahead, not a gamble: without it
 * the first satellite to qualify always went up alone, a moment before its
 * pair could have (simulated on 2026-10-22).
 */
export const PAIR_PATIENCE = 1.5;
/** Seconds between two looks when nothing could be shown: the look costs projections. */
export const RETRY_SECONDS = 0.25;

export function panelOpacity(age: number): number {
  if (age <= 0 || age >= PANEL_SECONDS) return 0;
  if (age < PANEL_TIMING.fadeIn) return age / PANEL_TIMING.fadeIn;
  const fadeOutAt = PANEL_SECONDS - PANEL_TIMING.fadeOut;
  if (age > fadeOutAt) return (PANEL_SECONDS - age) / PANEL_TIMING.fadeOut;
  return 1;
}

export function createPanelSchedule(satellites: number, brands: number): PanelSchedule {
  /** When each satellite last carried a panel: the least recent go first, so the panels move round the sky. */
  const lastCarried = new Map<number, number>();
  let shown: Array<{ satellite: number; brand: number }> = [];
  let nextBrand = 0;
  let startedAt = 0;
  let nextAt: number | null = null;

  return {
    update(t, canShow) {
      if (shown.length > 0 && t - startedAt >= PANEL_SECONDS) {
        shown = [];
        nextAt = t + PANEL_TIMING.gap;
      }
      nextAt ??= t + FIRST_DELAY;

      if (brands > 0 && shown.length === 0 && t >= nextAt) {
        // Never the same brand twice at once.
        const wanted = Math.min(PANELS_AT_ONCE, brands);
        const carriersAt = (from: number): number[] =>
          Array.from({ length: satellites }, (_, satellite) => satellite)
            .filter((satellite) => canShow(satellite, from, from + PANEL_SECONDS))
            .sort((a, b) => (lastCarried.get(a) ?? -Infinity) - (lastCarried.get(b) ?? -Infinity) || a - b)
            .slice(0, wanted);
        const now = carriersAt(t);
        let waitFor = 0;
        if (now.length > 0 && now.length < wanted) {
          for (let ahead = RETRY_SECONDS; ahead <= PAIR_PATIENCE + 1e-6; ahead += RETRY_SECONDS) {
            if (carriersAt(t + ahead).length >= wanted) {
              waitFor = ahead;
              break;
            }
          }
        }
        if (now.length === 0 || waitFor > 0) {
          nextAt = t + (waitFor || RETRY_SECONDS);
        } else {
          shown = now.map((satellite) => {
            const brand = nextBrand;
            nextBrand = (nextBrand + 1) % brands;
            lastCarried.set(satellite, t);
            return { satellite, brand };
          });
          startedAt = t;
        }
      }

      const opacity = panelOpacity(t - startedAt);
      return shown.map((panel) => ({ ...panel, opacity }));
    },

    reset() {
      shown = [];
      nextAt = null;
    },
  };
}
