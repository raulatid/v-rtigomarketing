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
  /**
   * Absolute distance scale to settle on. Null keeps the current distance.
   *
   * Same null-means-keep convention as `yawDegrees`, deliberately: both are
   * composition decisions a district may or may not want to make.
   *
   * MUST be clamped to `FocusFlightConfig.minDistanceScale` by the caller, and
   * must never exceed 1. Outward is the direction that grows the ground footprint
   * past the terrain skirt, and `checks/footprint.ts` only proves the range from
   * the floor up to rest.
   */
  distanceScale: number | null;
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
 * Scripted camera move to a district: focus, yaw and distance.
 *
 * Elevation and FOV are still deliberately untouched, and distance no longer is.
 * That is a change, and the reasoning it replaces was correct at the time: all
 * three set the ground footprint, and the terrain skirt is sized against a measured
 * footprint at a specific pose (PROJECT_MEMORY, "The number that can hurt you").
 *
 * What changed is that this is now the ONLY thing that moves the camera closer to
 * anything. The wheel-and-pinch zoom band is gone (`adr/009`), so "click a place to
 * get a closer look" has to be carried here or it does not exist.
 *
 * It is affordable because it only ever moves INWARD. Pulling back is what grows
 * the footprint and eats the skirt margin; flying in shrinks it. The floor is not
 * merely taste either — below roughly distance 60 the fixed `lookAtHeight` tilts the
 * camera up, the effective pitch collapses through the ~28 degree floor where the
 * bounds maths degenerates, and the footprint starts widening again. The caller
 * clamps to `FocusFlightConfig.minDistanceScale`, which sits far above that, and
 * `checks/footprint.ts` sweeps the whole range against the real skirt.
 *
 * Elevation and FOV stay untouched because nothing needs them to move, and each
 * would reopen the footprint question on its own terms.
 *
 * ## Sole ownership of the rig
 *
 * While a flight plays, the rig must be in external control. Its springs chase
 * their targets whenever `CameraRig.update` runs, so leaving them running would
 * ease the rig back toward stale targets between this class's writes; under
 * external control `MurciaExperience` does not step them at all. The handover is
 * not driven from here — the caller owns it, because it also owns the pointer
 * listener that cancels the flight.
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
  private startDistanceScale = 1;
  private desiredX = 0;
  private desiredZ = 0;
  /** Signed yaw travel, already reduced to the shortest path. */
  private yawDelta = 0;
  /** Signed distance-scale travel. 0 when the destination keeps the distance. */
  private distanceScaleDelta = 0;

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
   * The caller must have put the rig into external control first.
   */
  playTo(destination: FlightDestination): void {
    this.startX = this.rig.focus.x;
    this.startZ = this.rig.focus.z;
    this.startYaw = this.rig.getYaw();
    this.startDistanceScale = this.rig.getDistanceScale();
    this.desiredX = destination.x;
    this.desiredZ = destination.z;

    this.distanceScaleDelta =
      destination.distanceScale === null
        ? 0
        : destination.distanceScale - this.startDistanceScale;

    this.yawDelta =
      destination.yawDegrees === null
        ? 0
        : shortestYawDelta(this.rig.getAzimuthDegrees(), destination.yawDegrees);

    // Distance counts as travel. Without it a pure dolly — which is exactly what
    // `close()` asks for — would take the flat MIN_DURATION regardless of how far it
    // had to come back, so a deep zoom would snap out in the same time a shallow one
    // eased out.
    const groundTravel = Math.hypot(this.desiredX - this.startX, this.desiredZ - this.startZ);
    const distanceTravel = Math.abs(this.distanceScaleDelta) * this.rig.getPose().distance;
    const travel = groundTravel + distanceTravel;
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

    // Yaw and DISTANCE first, then bounds, then focus. The navigable area depends
    // on the azimuth and on the distance alike — both set the ground footprint — and
    // the focus written below is clamped against the area for the pose that has just
    // been applied, never the previous frame's. Writing distance after `resolveBounds`
    // would clamp every frame of a dolly against the footprint of the frame before it.
    if (this.yawDelta !== 0) {
      this.rig.setYaw(this.startYaw + this.yawDelta * eased);
    }
    if (this.distanceScaleDelta !== 0) {
      this.rig.setDistanceScale(this.startDistanceScale + this.distanceScaleDelta * eased);
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
