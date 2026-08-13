import type { CameraRig } from './CameraRig';
import type { BoundsRect } from '../config/environmentConfig';
import { clampToRect } from '../navigation/navigationBounds';
import { easeInOutCubic } from '../../../utils/easing';
import { clampFrameDelta } from '../../../graphics/frameDelta';

const MIN_DURATION = 0.8;
const MAX_DURATION = 1.6;
/** World units of focus travel that add one second, before clamping. */
const UNITS_PER_SECOND = 600;
/** Reduced motion still moves — instantly reframing is disorienting too. */
const REDUCED_MOTION_DURATION = 0.12;

export interface FlightDestination {
  x: number;
  z: number;
  /** Absolute rig yaw to settle on, degrees. Null keeps the current heading. */
  yawDegrees: number | null;
}

export interface CameraFlightEvents {
  /**
   * Called after the rig's yaw is written, before the focus is. The viewport
   * footprint is azimuth-dependent, so this is where the caller recomputes the
   * navigable area — and it must return the bounds for the yaw just applied,
   * because the focus written immediately after is clamped against them.
   */
  resolveBounds: () => BoundsRect | null;
  onComplete?: () => void;
  onCancel?: () => void;
}

/**
 * Scripted camera move to a district: focus and yaw only.
 *
 * Distance, elevation and FOV are deliberately untouched. Those are what set the
 * ground footprint, and the terrain skirt width is sized against a measured
 * footprint at a specific pose (PROJECT_MEMORY, "The number that can hurt
 * you") — changing them here would put the plate edge on screen for wide
 * viewports without any error to say so.
 *
 * ## Sole ownership of the rig
 *
 * While a flight plays, `DragPanController` must be in external control. It
 * writes the rig unconditionally in `update()`, so leaving it running would have
 * it easing the rig back toward its stale drag targets between this class's
 * writes. The controller is not driven from here — the caller owns the handover,
 * because it also owns the pointer listener that cancels the flight.
 *
 * ## Why elapsed/duration rather than exponential easing
 *
 * The rest of the project approaches targets with `1 - exp(-dt/tau)`, which is
 * frame-rate independent but has no defined end. A flight needs a known endpoint
 * and a known duration, so this integrates elapsed time and evaluates a closed
 * easing curve. Identical endpoints at 30, 60 and 120 fps then follow by
 * construction rather than by tolerance.
 */
export class CameraFlight {
  private readonly rig: CameraRig;
  private readonly events: CameraFlightEvents;
  private readonly reducedMotion: boolean;

  private playing = false;
  private elapsed = 0;
  private duration = MIN_DURATION;

  /** Immutable for the duration of a flight — the trajectory is never mutated. */
  private startX = 0;
  private startZ = 0;
  private startYaw = 0;
  private desiredX = 0;
  private desiredZ = 0;
  /** Signed yaw travel, already reduced to the shortest path. */
  private yawDelta = 0;

  constructor(rig: CameraRig, events: CameraFlightEvents, reducedMotion = false) {
    this.rig = rig;
    this.events = events;
    this.reducedMotion = reducedMotion;
  }

  get isPlaying(): boolean {
    return this.playing;
  }

  /**
   * Starts a flight from wherever the rig is now.
   *
   * The caller must have put `DragPanController` into external control first.
   */
  playTo(destination: FlightDestination): void {
    this.startX = this.rig.focus.x;
    this.startZ = this.rig.focus.z;
    this.startYaw = this.rig.getYaw();
    this.desiredX = destination.x;
    this.desiredZ = destination.z;

    this.yawDelta =
      destination.yawDegrees === null
        ? 0
        : shortestYawDelta(this.rig.getAzimuthDegrees(), destination.yawDegrees);

    const travel = Math.hypot(this.desiredX - this.startX, this.desiredZ - this.startZ);
    this.duration = this.reducedMotion
      ? REDUCED_MOTION_DURATION
      : clamp(MIN_DURATION + travel / UNITS_PER_SECOND, MIN_DURATION, MAX_DURATION);

    this.elapsed = 0;
    this.playing = true;
  }

  /** Stops where it is. The rig keeps whatever pose the flight reached. */
  cancel(): void {
    if (!this.playing) return;
    this.playing = false;
    this.events.onCancel?.();
  }

  update(deltaTime: number): void {
    if (!this.playing) return;

    const dt = clampFrameDelta(deltaTime);
    this.elapsed += dt;

    const t = this.duration > 0 ? Math.min(1, this.elapsed / this.duration) : 1;
    const eased = easeInOutCubic(t);

    // Yaw first, then bounds, then focus. The navigable area depends on the
    // azimuth, and the focus written below is clamped against the area for the
    // yaw that has just been applied — not the previous frame's.
    if (this.yawDelta !== 0) {
      this.rig.setYaw(this.startYaw + this.yawDelta * eased);
    }
    const bounds = this.events.resolveBounds();

    // Desired and feasible are kept apart: the destination is never rewritten by
    // a frame that happened to be clamped, so a trajectory grazing the navigable
    // edge still arrives where it was aimed.
    const desiredX = this.startX + (this.desiredX - this.startX) * eased;
    const desiredZ = this.startZ + (this.desiredZ - this.startZ) * eased;
    const feasible = bounds
      ? clampToRect(desiredX, desiredZ, bounds)
      : { x: desiredX, z: desiredZ };
    this.rig.setFocus(feasible.x, feasible.z);

    if (t >= 1) {
      this.playing = false;
      this.events.onComplete?.();
    }
  }
}

/**
 * Shortest signed rotation from `current` to `target`, in degrees.
 *
 * Result is in [-180, 180), so 350 -> 10 gives +20 rather than -340. Added to an
 * unbounded yaw it preserves accumulated turns: `CameraRig` never wraps its yaw,
 * because wrapping would make a rotation past the seam jump, and the smoothing
 * that drives it reads the value as continuous.
 *
 * An exact half turn is equally short in both directions; the half-open range
 * settles it at -180 rather than leaving it to floating-point luck.
 */
export function shortestYawDelta(current: number, target: number): number {
  return (((target - current + 180) % 360) + 360) % 360 - 180;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
