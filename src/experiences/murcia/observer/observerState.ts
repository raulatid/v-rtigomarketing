export type DwellPhase = 'idle' | 'holding' | 'complete';

/**
 * The longest step a single frame may contribute to a hold, seconds.
 *
 * A tab brought back from the background delivers one enormous delta; without
 * this, a camera left at rest would complete a hold in one frame nobody saw.
 */
export const MAX_DWELL_STEP_SECONDS = 0.1;

export interface Dwell {
  readonly phase: DwellPhase;
  /** Continuous seconds held so far. */
  readonly seconds: number;
  /**
   * Advances the hold. Leaving before the threshold starts it over. A completed
   * hold stays complete while the condition holds, and re-arms the moment it
   * breaks — so one rest completes exactly once.
   */
  step(inside: boolean, dt: number): DwellPhase;
  /** Back to idle, including from complete. */
  reset(): void;
}

export function createDwell(dwellSeconds: number): Dwell {
  let phase: DwellPhase = 'idle';
  let seconds = 0;

  return {
    get phase() {
      return phase;
    },
    get seconds() {
      return seconds;
    },
    step(inside, dt) {
      if (!inside) {
        phase = 'idle';
        seconds = 0;
        return phase;
      }
      if (phase === 'complete') return phase;
      if (Number.isFinite(dt) && dt > 0) seconds += Math.min(dt, MAX_DWELL_STEP_SECONDS);
      phase = seconds >= dwellSeconds ? 'complete' : 'holding';
      return phase;
    },
    reset() {
      phase = 'idle';
      seconds = 0;
    },
  };
}
