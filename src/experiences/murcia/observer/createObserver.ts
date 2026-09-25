import type * as THREE from 'three';
import type { ObserverConfig } from './observerConfig';
import { createObserverSample, sampleCamera, type ObserverSample } from './observerProjection';
import { createDwell, type DwellPhase } from './observerState';

export interface ObserverOptions {
  config: ObserverConfig;
  /**
   * Fired once per rest, on the frame the camera has been still for
   * `dwellSeconds`. The sample is reused — copy what is kept.
   */
  onRest: (sample: Readonly<ObserverSample>) => void;
}

export interface Observer {
  /**
   * One frame. Call AFTER whichever owner wrote the camera, so the sample is
   * this frame's pose. `navigating` false — a flight, the warp, a focused
   * district — resets the hold: a rest on someone else's camera is not the
   * viewer's.
   */
  update(dt: number, camera: THREE.PerspectiveCamera, navigating: boolean): void;
  readonly phase: DwellPhase;
  readonly heldSeconds: number;
  /** The latest sample. Valid after the first navigating frame. */
  readonly sample: Readonly<ObserverSample>;
  /** Whether the latest sample was still. */
  readonly still: boolean;
  reset(): void;
}

/**
 * A rest detector: two samples in ping-pong so speed is measured without
 * allocating, a dwell, and the edge where a rest completes.
 *
 * It knows nothing about where the camera ought to be. Whether a rest means
 * anything is decided on the server; this only says when one happened.
 *
 * Owns no GPU or DOM resource, so there is no dispose.
 */
export function createObserver(options: ObserverOptions): Observer {
  const { config } = options;
  const dwell = createDwell(config.dwellSeconds);

  let current = createObserverSample();
  let previous = createObserverSample();
  let hasPrevious = false;
  let still = false;

  function reset(): void {
    hasPrevious = false;
    still = false;
    dwell.reset();
  }

  return {
    update(dt, camera, navigating) {
      if (!navigating) {
        reset();
        return;
      }

      const swap = previous;
      previous = current;
      current = swap;
      sampleCamera(camera, hasPrevious ? previous : null, dt, current);
      hasPrevious = true;

      still =
        current.linearSpeed <= config.stillLinearSpeed &&
        current.angularSpeedDegrees <= config.stillAngularSpeedDegrees;
      const before = dwell.phase;
      if (dwell.step(still, dt) === 'complete' && before !== 'complete') options.onRest(current);
    },
    get phase() {
      return dwell.phase;
    },
    get heldSeconds() {
      return dwell.seconds;
    },
    get sample() {
      return current;
    },
    get still() {
      return still;
    },
    reset,
  };
}
