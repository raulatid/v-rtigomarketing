import * as THREE from 'three';
import type { CameraPoseConfig } from '../config/environmentConfig';
import { applyPoseToCamera, scalePoseDistance } from './applyPoseToCamera';
import type { CameraTuning } from './cameraTuning';

/**
 * Murcia's camera: a second-order spring on five scalars, posed through
 * `applyPoseToCamera`.
 *
 * Ported from `vertigo-lab`'s `camera-navigation` experiment, which replaced the
 * map-pan controller this class used to serve. The model is:
 *
 *     input -> targets -> springs -> pose
 *
 * The rig owns a navigation TARGET on the XZ plane, a yaw, a log-radius and a
 * pitch. The camera sits behind the target at that radius and elevation and
 * always looks at it. Nothing outside `update()` writes the pose during
 * navigation.
 *
 * ## Why a spring and not a lag
 *
 * The previous controller smoothed with a first-order `1 - exp(-k*dt)` lag,
 * which cannot ease IN: displacement is maximal on the first frame and decays
 * from there, so every move starts at full speed. This uses the closed-form
 * solution of a damped harmonic oscillator, evaluated once per damping group per
 * frame. It is exactly frame-rate independent (not approximately, as the lag
 * was), unconditionally stable at any dt and any ratio, and allocation-free —
 * four module-scope coefficients, reused.
 *
 * `dampingRatio` is below 1 on rotation and travel, so the camera LANDS: it
 * passes a stopped target once by about 1.4 units and returns. Zoom is driven
 * critically damped regardless, because an overshooting zoom would dip below
 * `minRadius` and put the near plane through the ground.
 *
 * ## What survived from the old rig, and why
 *
 * The read surface — `focus`, `getPose`, `getEffectivePose`, `getYaw`,
 * `getAzimuthDegrees`, `getOffset`, `getHeight`, `getForward`,
 * `get/setDistanceScale`, `setPose`, `setAspect` — is unchanged, because
 * `CameraFlight`, `cameraFraming`, `DistrictInteraction`, the services display
 * and three check harnesses all read it. `distanceScale` in particular is still
 * the flight's, and still MULTIPLIES rather than replaces, so a district flight
 * dollies to a fraction of wherever the viewer has zoomed to instead of the two
 * fighting over one number (`adr/014`).
 *
 * What changed is where `distance` and `elevationDegrees` come from: they used
 * to be rewritten on the pose every frame by `MurciaExperience.applyRigPose`,
 * and they are now spring state driven through `setTargetZoom`/`setTargetPitch`.
 * That is what lets the tilt ride the zoom's own coefficients so distance and
 * elevation settle as ONE motion — a coupling the old single-scalar lerp could
 * not express.
 *
 * ## The rig still does not clamp its own focus against the world
 *
 * It clamps the target to `tuning.bounds` and the radius to `[minRadius,
 * maxRadius]`, and that is all. Callers that propose a focus for other reasons
 * — a flight, a framing solve — clamp before committing, so clamping never
 * produces a visible snap.
 */

/**
 * What a district flight or the blog approach holds to take the camera.
 *
 * A facade over two objects — the rig answers "is something else flying this",
 * the pointer input answers "is a finger on the world". Callers get this rather
 * than the pair, because handing out the rig would let them step the springs,
 * and stepping the springs on a frame someone else owns the camera is precisely
 * what the single-owner rule (DECISIONS §9) forbids.
 */
export interface CameraOwnership {
  readonly isDragging: boolean;
  readonly isExternallyControlled: boolean;
  beginExternalControl(): void;
  endExternalControl(): void;
}

const DEG = Math.PI / 180;

// ─── The spring, as four coefficients ───
//
// Module scope and mutated in place. This runs five times a frame for the life
// of the scene; allocating a result object each call would be the only garbage
// the navigation produces.

const SPRING_CRITICAL_EPSILON = 1e-4;
const MIN_ANGULAR_FREQUENCY = 0.05;
const MIN_DAMPING_RATIO = 0.2;
const MAX_DAMPING_RATIO = 4;

let springM11 = 1;
let springM12 = 0;
let springM21 = 0;
let springM22 = 1;

/**
 * The exact step matrix for `x'' + 2*z*w*x' + w^2*x = 0` over `dt`.
 *
 * Three branches because the closed form genuinely differs by regime, and the
 * underdamped one divides by `wd` which is zero at critical. The epsilon is not
 * a fudge: without it a ratio of exactly 1 — the value the zoom uses on every
 * frame — divides by zero.
 *
 * Being exact rather than integrated is what makes 240Hz and 60Hz agree to
 * within float noise, which `checks/navigation-feel.ts` measures ("60Hz and
 * 240Hz land in the same place").
 */
function computeSpringStep(frequency: number, ratio: number, dt: number): void {
  const w = Math.max(MIN_ANGULAR_FREQUENCY, frequency);
  const z = clamp(ratio, MIN_DAMPING_RATIO, MAX_DAMPING_RATIO);
  const e = Math.exp(-z * w * dt);
  let s: number;
  let c: number;
  if (Math.abs(z - 1) < SPRING_CRITICAL_EPSILON) {
    s = e * dt;
    c = e;
  } else if (z < 1) {
    const wd = w * Math.sqrt(1 - z * z);
    s = (e * Math.sin(wd * dt)) / wd;
    c = e * Math.cos(wd * dt);
  } else {
    const wd = w * Math.sqrt(z * z - 1);
    s = (e * Math.sinh(wd * dt)) / wd;
    c = e * Math.cosh(wd * dt);
  }
  springM11 = c + z * w * s;
  springM12 = s;
  springM21 = -w * w * s;
  springM22 = c - z * w * s;
}

let springValue = 0;
let springVelocity = 0;

/** Advances one scalar with the coefficients from the last `computeSpringStep`. */
function advanceSpring(value: number, velocity: number, target: number): void {
  const d = value - target;
  springValue = target + springM11 * d + springM12 * velocity;
  springVelocity = springM21 * d + springM22 * velocity;
}

const MIN_PITCH_DEGREES = 5;
const MAX_PITCH_DEGREES = 85;
const MIN_RADIUS_FLOOR = 1;
/** The idle clock stops counting here. A tab left open for a day must not overflow. */
const IDLE_CLOCK_CAP_SECONDS = 3600;

export class CameraRig {
  /** The navigation target on the ground. Damped; read by everything. */
  readonly focus = new THREE.Vector3();

  private readonly camera: THREE.PerspectiveCamera;
  private readonly offset = new THREE.Vector3();
  /** Unit vector on XZ pointing from the camera toward the focus. */
  private readonly forward = new THREE.Vector3(0, 0, -1);
  private readonly tuning: CameraTuning;
  private pose: CameraPoseConfig;
  /** Flight-driven distance scale, multiplying the sprung radius. */
  private distanceScale = 1;

  // ─── Targets, and the damped values chasing them ───
  private targetX = 0;
  private targetZ = 0;
  private targetYaw = 0;
  /** LOG radius. A spring in log space keeps the zoom's feel scale-free. */
  private targetZoom = 0;
  private targetPitchDegrees = 0;

  private x = 0;
  private z = 0;
  private yawDegrees = 0;
  private zoom = 0;
  private pitchDegrees = 0;

  private velYaw = 0;
  private velX = 0;
  private velZ = 0;
  private velZoom = 0;
  private velPitch = 0;

  // ─── The cursor lean, which is not navigation ───
  private hoverX = 0;
  private hoverY = 0;
  private cursorYawOffsetDegrees = 0;
  private cursorPitchOffsetDegrees = 0;
  private secondsSinceNavigation = 0;

  /**
   * True while something else owns the camera — a district flight, or the blog
   * approach. The springs are not stepped at all while it is set.
   */
  private externallyControlled = false;

  constructor(camera: THREE.PerspectiveCamera, pose: CameraPoseConfig, tuning: CameraTuning) {
    this.camera = camera;
    this.pose = pose;
    this.tuning = tuning;
    this.targetYaw = 0;
    this.targetZoom = this.clampZoom(Math.log(pose.distance));
    this.zoom = this.targetZoom;
    this.targetPitchDegrees = clamp(tuning.pitchDegrees, MIN_PITCH_DEGREES, MAX_PITCH_DEGREES);
    this.pitchDegrees = this.targetPitchDegrees;
    this.applyPose();
  }

  // ─── Reads ───

  /**
   * The *configured* pose, without the sprung radius or the flight dolly.
   *
   * Almost always the wrong one to read. Anything re-deriving a camera needs
   * `getEffectivePose()`, or it works against a camera nobody is looking
   * through.
   */
  getPose(): Readonly<CameraPoseConfig> {
    return this.pose;
  }

  /**
   * The pose actually in effect: the configured pose carrying the sprung radius
   * and elevation, with the flight's dolly folded into the distance.
   *
   * Always a fresh object now — the radius is live state rather than config, so
   * there is no longer a case where the configured pose can be handed back by
   * identity.
   */
  getEffectivePose(): CameraPoseConfig {
    const live: CameraPoseConfig = {
      ...this.pose,
      distance: Math.exp(this.zoom),
      elevationDegrees: this.pitchDegrees,
    };
    return scalePoseDistance(live, this.distanceScale);
  }

  /** Camera offset from the focus. Read-only; mutate through the targets. */
  getOffset(): Readonly<THREE.Vector3> {
    return this.offset;
  }

  /** Height of the camera above the ground plane at the current pose. */
  getHeight(): number {
    return this.offset.y;
  }

  /** User yaw in degrees, unbounded — it accumulates through full turns. */
  getYaw(): number {
    return this.yawDegrees;
  }

  /** Pose azimuth plus user yaw: the direction the rig actually faces. */
  getAzimuthDegrees(): number {
    return this.pose.azimuthDegrees + this.yawDegrees;
  }

  /**
   * Ground-plane direction the camera is facing, normalized.
   *
   * What "forward" means for navigation: vertical drag translates the target
   * along this vector, so dragging down always advances into the screen however
   * far the rig has been turned.
   */
  getForward(): Readonly<THREE.Vector3> {
    return this.forward;
  }

  getDistanceScale(): number {
    return this.distanceScale;
  }

  get isExternallyControlled(): boolean {
    return this.externallyControlled;
  }

  /** Targets and damped values, for probes and the debug overlay. */
  snapshot() {
    return {
      x: this.x,
      z: this.z,
      yaw: this.yawDegrees,
      radius: Math.exp(this.zoom),
      pitchDegrees: this.pitchDegrees,
      targetX: this.targetX,
      targetZ: this.targetZ,
      targetYaw: this.targetYaw,
      targetRadius: Math.exp(this.targetZoom),
      cursorYawOffsetDegrees: this.cursorYawOffsetDegrees,
      cursorPitchOffsetDegrees: this.cursorPitchOffsetDegrees,
      secondsSinceNavigation: this.secondsSinceNavigation,
    };
  }

  // ─── Navigation input ───

  /**
   * One pointer, both axes, never classified.
   *
   * Arguments are normalized: `dx` by viewport WIDTH, `dy` by viewport HEIGHT.
   *
   * ## THE SIGN OF BOTH AXES IS A DECISION
   *
   * Both gains are positive, and putting a minus back on either reintroduces a
   * bug that was reported on first use of the sandbox.
   *
   * The rejected reading is PUSH THE CAMERA: the camera moves the way the finger
   * moves, so the world slides the opposite way. It is self-consistent, which is
   * why it survived review, and users called it backwards.
   *
   * What is implemented is DIRECT MANIPULATION — the world follows the finger:
   *
   *     drag DOWN  -> ground comes toward you -> camera ADVANCES
   *     drag UP    -> ground pushed away      -> camera RETREATS
   *     drag RIGHT -> world slides RIGHT      -> camera yaws LEFT
   *
   * ONE HONEST CAVEAT, on yaw only. This is an ORBIT about the navigation
   * target, not a free look, so the sweep direction depends on DEPTH and no
   * single sign can make every pixel follow the finger: beyond the target it
   * follows, at the target it is stationary (it is the centre of rotation), and
   * nearer than the target it sweeps the other way. The city sits at and beyond
   * the target, so the dominant reading is the one above — but "the point under
   * the cursor stays under the cursor" is true only at the target distance, and
   * expecting it in the foreground will read as a bug that is not one. Travel
   * has no such split: it moves the target itself.
   *
   * YAW IS APPLIED FIRST, and the heading below is derived from the value that
   * line just wrote. That is what turns a diagonal drag into a curve rather than
   * a straight line at an angle, and it is why there is deliberately no forward
   * vector captured at pointerdown and no `if (|dx| > |dy|)` branch.
   */
  drag(dxNormalized: number, dyNormalized: number): void {
    if (!Number.isFinite(dxNormalized) || !Number.isFinite(dyNormalized)) return;

    this.targetYaw += dxNormalized * this.tuning.rotationGain;

    const heading = (this.pose.azimuthDegrees + this.targetYaw) * DEG;
    const forwardX = -Math.sin(heading);
    const forwardZ = -Math.cos(heading);

    // `targetZoom`, NOT the live zoom. Within one gesture the travel scale must
    // not drift because a pinch is still settling, or the same drag would cover
    // different ground depending on how recently the viewer zoomed.
    const scale = this.tuning.scaleTravelWithDistance
      ? Math.exp(this.targetZoom) / this.tuning.travelReferenceRadius
      : 1;
    const step = dyNormalized * this.tuning.travelGain * scale;

    this.targetX += forwardX * step;
    this.targetZ += forwardZ * step;
    this.clampTargetToBounds();
    this.markNavigated();
  }

  /** Hover position, -1..1 on each axis. Drives the lean only. */
  setCursor(hxNormalized: number, hyNormalized: number): void {
    this.hoverX = clamp(hxNormalized, -1, 1);
    this.hoverY = clamp(hyNormalized, -1, 1);
  }

  /** Absolute target radius, in LOG units. */
  setTargetZoom(logRadius: number, immediate = false): void {
    if (!Number.isFinite(logRadius)) return;
    this.targetZoom = this.clampZoom(logRadius);
    if (immediate) {
      this.zoom = this.targetZoom;
      this.velZoom = 0;
    }
    this.markNavigated();
  }

  setTargetPitch(degrees: number, immediate = false): void {
    if (!Number.isFinite(degrees)) return;
    this.targetPitchDegrees = clamp(degrees, MIN_PITCH_DEGREES, MAX_PITCH_DEGREES);
    if (immediate) {
      this.pitchDegrees = this.targetPitchDegrees;
      this.velPitch = 0;
    }
  }

  /**
   * The cinematic writes the pose directly. The springs are NOT stepped on a
   * frame this is called, and neither are the targets touched — so when the warp
   * hands back, the rig resumes from exactly where the viewer left it.
   */
  applyWarpPose(distance: number, elevationDegrees: number): void {
    const live: CameraPoseConfig = {
      ...this.pose,
      distance: Math.max(MIN_RADIUS_FLOOR, distance),
      elevationDegrees: clamp(elevationDegrees, MIN_PITCH_DEGREES, MAX_PITCH_DEGREES),
    };
    this.focus.set(this.x, 0, this.z);
    applyPoseToCamera(this.camera, live, this.focus, this.yawDegrees, this.offset, this.forward);
  }

  // ─── The frame ───

  /**
   * Advances every spring by `dt` and writes the pose.
   *
   * Call this ONLY on a frame where the rig owns the camera. A spring that is
   * not stepped holds its velocity, which is exactly what makes handing control
   * to a flight and back again seamless — and exactly why a caller that steps it
   * during a flight would find the two fighting.
   */
  update(dt: number): void {
    if (!Number.isFinite(dt) || dt <= 0) return;

    computeSpringStep(this.tuning.rotationDamping, this.tuning.dampingRatio, dt);
    advanceSpring(this.yawDegrees, this.velYaw, this.targetYaw);
    this.yawDegrees = springValue;
    this.velYaw = springVelocity;

    computeSpringStep(this.tuning.travelDamping, this.tuning.dampingRatio, dt);
    advanceSpring(this.x, this.velX, this.targetX);
    this.x = springValue;
    this.velX = springVelocity;
    advanceSpring(this.z, this.velZ, this.targetZ);
    this.z = springValue;
    this.velZ = springVelocity;

    // CRITICALLY DAMPED, whatever `dampingRatio` says. An overshooting zoom
    // would dip below `minRadius` on the way in — the clamp is on the TARGET,
    // and a spring that lands is a spring that passes its target.
    computeSpringStep(this.tuning.zoomDamping, 1, dt);
    advanceSpring(this.zoom, this.velZoom, this.targetZoom);
    this.zoom = springValue;
    this.velZoom = springVelocity;

    // The pitch rides the ZOOM's coefficients, deliberately, so tilt and
    // distance settle as one motion rather than two that happen to overlap. It
    // costs no extra transcendental — the step matrix is already computed.
    advanceSpring(this.pitchDegrees, this.velPitch, this.targetPitchDegrees);
    this.pitchDegrees = springValue;
    this.velPitch = springVelocity;

    if (this.secondsSinceNavigation < IDLE_CLOCK_CAP_SECONDS) {
      this.secondsSinceNavigation += dt;
    }
    const idle = this.secondsSinceNavigation >= this.tuning.cursorIdleDelay;
    const engaged = this.tuning.cursorFollow && idle;
    const leanYaw = engaged ? this.hoverX * this.tuning.cursorYawDegrees : 0;
    const leanPitch = engaged ? this.hoverY * this.tuning.cursorPitchDegrees : 0;
    // First order, not a spring. A spring would bounce when the mouse stops.
    const kCursor = 1 - Math.exp(-Math.max(0, this.tuning.cursorDamping) * dt);
    this.cursorYawOffsetDegrees += (leanYaw - this.cursorYawOffsetDegrees) * kCursor;
    this.cursorPitchOffsetDegrees += (leanPitch - this.cursorPitchOffsetDegrees) * kCursor;

    this.applyPose();
  }

  // ─── Handover ───

  /**
   * Marks the camera as owned by something else. The springs stop being
   * stepped; nothing else changes.
   */
  setExternallyControlled(owned: boolean): void {
    if (owned === this.externallyControlled) return;
    this.externallyControlled = owned;
    if (owned) this.markNavigated();
  }

  /**
   * Writes STATE, not targets: the damped value, the target and the velocity
   * together.
   *
   * This is how `CameraFlight` moves the rig. A flight that wrote only the
   * targets would be fighting the springs; one that wrote only the damped values
   * would snap back the moment navigation resumed. Zeroing the velocities is the
   * third thing, and the one a first-order lag never had to think about — a
   * spring handed a position but not a velocity carries the old motion straight
   * through the handover.
   */
  setNavigated(next: { x?: number; z?: number; yaw?: number }): void {
    if (next.x !== undefined && Number.isFinite(next.x)) {
      this.x = next.x;
      this.targetX = next.x;
      this.velX = 0;
    }
    if (next.z !== undefined && Number.isFinite(next.z)) {
      this.z = next.z;
      this.targetZ = next.z;
      this.velZ = 0;
    }
    if (next.yaw !== undefined && Number.isFinite(next.yaw)) {
      this.yawDegrees = next.yaw;
      this.targetYaw = next.yaw;
      this.velYaw = 0;
    }
    this.clampTargetToBounds();
    this.applyPose();
  }

  /**
   * Sets the user yaw as STATE, the way `CameraFlight` needs it.
   *
   * Unbounded on purpose: wrapping to [0, 360) would make a turn past the seam
   * jump, and both the spring and the flight read this as a continuous quantity.
   */
  setYaw(degrees: number): void {
    this.setNavigated({ yaw: degrees })
  }

  /**
   * Re-seeds every spring from wherever the camera actually is.
   *
   * For the blog approach, which flies the camera off the rig entirely — it
   * writes `camera.position` and `camera.quaternion` directly, because the rig
   * cannot express the square-on landing the seam requires. When it hands back,
   * the rig has no idea where it is, and resuming from stale state would snap.
   *
   * Solves the pose back out of the camera: project onto the ground plane along
   * the view direction for the target, then recover yaw, radius and pitch from
   * the offset. Velocities are zeroed for the same reason `setNavigated` zeroes
   * them.
   */
  adoptFromCamera(): void {
    const cam = this.camera;
    cam.updateMatrixWorld(true);

    const dir = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    // Where the view meets the ground plane the focus sits on. A camera looking
    // level or up has no intersection ahead of it; fall back to dropping the
    // camera straight down, which at least keeps the target under the viewer.
    let groundX = cam.position.x;
    let groundZ = cam.position.z;
    if (dir.y < -1e-4) {
      const t = (this.pose.lookAtHeight - cam.position.y) / dir.y;
      if (Number.isFinite(t) && t > 0) {
        groundX = cam.position.x + dir.x * t;
        groundZ = cam.position.z + dir.z * t;
      }
    }

    const dx = cam.position.x - groundX;
    const dz = cam.position.z - groundZ;
    const dy = cam.position.y;
    const horizontal = Math.hypot(dx, dz);
    const radius = Math.hypot(horizontal, dy);

    this.x = groundX;
    this.z = groundZ;
    this.targetX = groundX;
    this.targetZ = groundZ;
    this.velX = 0;
    this.velZ = 0;

    if (horizontal > 1e-4) {
      const azimuth = Math.atan2(dx, dz) / DEG;
      this.yawDegrees = azimuth - this.pose.azimuthDegrees;
      this.targetYaw = this.yawDegrees;
    }
    this.velYaw = 0;

    if (radius > MIN_RADIUS_FLOOR) {
      this.zoom = this.clampZoom(Math.log(radius));
      this.targetZoom = this.zoom;
      const pitch = Math.atan2(dy, horizontal) / DEG;
      this.pitchDegrees = clamp(pitch, MIN_PITCH_DEGREES, MAX_PITCH_DEGREES);
      this.targetPitchDegrees = this.pitchDegrees;
    }
    this.velZoom = 0;
    this.velPitch = 0;

    this.clampTargetToBounds();
    this.markNavigated();
    this.applyPose();
  }

  // ─── Configuration ───

  /**
   * Sets the flight dolly. Multiplies the sprung radius rather than replacing
   * it, so a district flight composes with the viewer's zoom instead of
   * overwriting it.
   *
   * Not clamped here: the floor lives in `FocusFlightConfig`, which the rig has
   * no reason to know about, and clamping in two places is how the two
   * disagree. `CameraFlight` clamps every proposal before it arrives.
   */
  setDistanceScale(scale: number): void {
    if (scale === this.distanceScale) return;
    this.distanceScale = scale;
    this.applyPose();
  }

  /**
   * Replaces the configured pose — fov, near, far, azimuth, lookAtHeight.
   *
   * Distance and elevation on the incoming pose are IGNORED for the live camera:
   * they are spring state now. A resize re-resolves the pose and must not
   * teleport a viewer who has zoomed.
   */
  setPose(pose: CameraPoseConfig): void {
    this.pose = pose;
    this.applyPose();
  }

  /** Replaces the target rectangle and re-clamps into it. */
  setBounds(bounds: CameraTuning['bounds']): void {
    this.tuning.bounds = bounds;
    this.clampTargetToBounds();
  }

  setAspect(aspect: number): void {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Places the target immediately, springs and all. Construction and resets. */
  setFocus(x: number, z: number): void {
    this.x = x;
    this.z = z;
    this.targetX = x;
    this.targetZ = z;
    this.velX = 0;
    this.velZ = 0;
    this.clampTargetToBounds();
    this.applyPose();
  }

  /** Re-applies both clamps after the bounds or the radius limits moved. */
  reclamp(): void {
    this.clampTargetToBounds();
    this.targetZoom = this.clampZoom(this.targetZoom);
  }

  // ─── Internals ───

  private markNavigated(): void {
    this.secondsSinceNavigation = 0;
  }

  private clampTargetToBounds(): void {
    const { bounds } = this.tuning;
    this.targetX = clampAxis(this.targetX, bounds.minX, bounds.maxX);
    this.targetZ = clampAxis(this.targetZ, bounds.minZ, bounds.maxZ);
  }

  private clampZoom(logRadius: number): number {
    const min = Math.max(this.tuning.minRadius, MIN_RADIUS_FLOOR);
    const max = Math.max(this.tuning.maxRadius, min);
    return clamp(logRadius, Math.log(min), Math.log(max));
  }

  /**
   * Writes the camera from the damped state.
   *
   * The lean is added HERE and nowhere else — it never enters `targetYaw` or
   * `targetPitchDegrees`, which is what keeps the bounds clamp, `setNavigated`
   * and `snapshot` free of an ornament.
   */
  private applyPose(): void {
    this.focus.set(this.x, 0, this.z);
    const live: CameraPoseConfig = {
      ...this.pose,
      distance: Math.exp(this.zoom) * this.distanceScale,
      elevationDegrees: clamp(
        this.pitchDegrees + this.cursorPitchOffsetDegrees,
        MIN_PITCH_DEGREES,
        MAX_PITCH_DEGREES,
      ),
    };
    applyPoseToCamera(
      this.camera,
      live,
      this.focus,
      this.yawDegrees + this.cursorYawOffsetDegrees,
      this.offset,
      this.forward,
    );
  }
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/** Collapses to the midpoint when a rectangle is inverted, rather than to an edge. */
function clampAxis(value: number, min: number, max: number): number {
  if (min > max) return (min + max) / 2;
  return Math.min(max, Math.max(min, value));
}
