import * as THREE from 'three';
import type { BoundsRect, DragFeelConfig, NavigationConfig } from '../config/environmentConfig';
import type { CameraRig } from '../camera/CameraRig';
import { clampToRect } from './navigationBounds';

export interface DragPanEvents {
  /** Fired once per pointer sequence, on pointerdown. */
  onFirstInteraction?: () => void;
  /**
   * Fired whenever the rendered yaw changes. The viewport footprint is
   * azimuth-dependent, so the navigable bounds must be recomputed — see the
   * note on `setBounds`.
   */
  onYawChanged?: () => void;
  /**
   * Fired when the gesture crosses the drag threshold, and again when it ends —
   * including the ends that are not a pointerup, such as a handover to a
   * district flight. Mirrors `isDragging`.
   */
  onDragStateChanged?: (dragging: boolean) => void;
}

/** Frame delta is clamped so a backgrounded tab cannot produce one huge step. */
const MAX_FRAME_DELTA = 0.1;

/** Below this the yaw is treated as settled, in degrees. */
const YAW_EPSILON = 1e-3;

/**
 * How long the pointer may sit still before its recorded velocity starts to
 * bleed away, and the time constant of that bleed. Both in seconds.
 *
 * Velocity is sampled from pointermove, so a pointer held motionless produces
 * no samples and would keep whatever speed it last had — press, sweep, pause,
 * release, and the view flings on a gesture that ended at a standstill. The
 * grace period is long enough that a genuine drag (which resamples every frame)
 * never decays, and short enough that a deliberate stop reads as one.
 */
const POINTER_STILL_GRACE = 0.05;
const POINTER_STILL_DECAY = 0.05;

/**
 * Drag navigation with weight: one gesture, both axes, no modifiers.
 *
 *   drag up/down      → move forward / backward along the view direction
 *   drag left/right   → rotate the rig horizontally about the focus
 *   left or right button, or one finger — all identical
 *   everything else   → ignored
 *
 * No zoom, no vertical rotation, no keyboard, no wheel.
 *
 * ## Why the axes split this way
 *
 * With no gizmo, no button and no modifier key, a single pointer has to carry
 * both translation and rotation, so each screen axis owns one. The cost is that
 * strafing is gone: there is no sideways pan. Free 360 degree yaw pays for it —
 * any point is reached by turning toward it and advancing, which is the "drag
 * the space" feel rather than "drag a map".
 *
 * ## Fidelity
 *
 * Forward motion is solved against the ground, not from pixels: the vertical
 * pointer movement is projected onto the navigation plane and its component
 * along the camera's forward vector is applied to the focus. The lateral
 * component is discarded — that axis belongs to rotation.
 *
 * Solving against the ground is what keeps sensitivity consistent across the
 * screen: a pixel near the horizon covers far more ground than one near the
 * bottom edge, and a pixel-based mapping would ignore that. The result is then
 * scaled by `translationGain`, so the motion is proportional to the ground the
 * cursor crossed without being equal to it. At a gain of 1 the grabbed point
 * stays exactly under the pointer; below 1 it slides behind, which is the trade
 * made for weight.
 *
 * Yaw is a straight pixels-to-degrees mapping, normalized by viewport width.
 * A turntable solve (yaw from the angle the grabbed ground point sweeps about
 * the focus) was considered and rejected: its radius varies by an order of
 * magnitude between the top and bottom of the screen at this elevation, so
 * sensitivity would depend on where the drag happened to start, which reads as
 * inconsistent rather than physical.
 *
 * ## Weight
 *
 * Both axes run the same model, and the weight is in the drag rather than in a
 * coast: the input is geared down and the rendered value eases toward it, so the
 * view feels heavy while it is being moved and stops when the pointer stops.
 *
 * Release momentum exists in the code and is switched off by configuration
 * (`inertiaTimeConstant: 0`). It was tried and rejected — motion continuing
 * after the gesture ends reads as a loss of control rather than as mass. The
 * machinery is retained because it costs nothing while disabled and makes the
 * setting reversible from config alone. See DragFeelConfig.
 *
 * Everything is solved against the currently rendered camera each move, so the
 * lag introduced by smoothing never accumulates into drift, and a yaw applied
 * mid-gesture is accounted for on the next sample.
 */
export class DragPanController {
  private readonly domElement: HTMLElement;
  private readonly camera: THREE.PerspectiveCamera;
  private readonly rig: CameraRig;
  private readonly config: NavigationConfig;
  private readonly events: DragPanEvents;

  private bounds: BoundsRect;

  private readonly plane: THREE.Plane;
  private readonly raycaster = new THREE.Raycaster();
  private readonly ndc = new THREE.Vector2();
  private readonly fromPoint = new THREE.Vector3();
  private readonly toPoint = new THREE.Vector3();

  /** Where the focus is heading. The rig eases toward this. */
  private targetX = 0;
  private targetZ = 0;
  /** Where the yaw is heading, degrees, unbounded. */
  private targetYaw = 0;

  /** World units per second, for release momentum. */
  private velocityX = 0;
  private velocityZ = 0;
  /** Degrees per second, for release momentum. */
  private velocityYaw = 0;

  /** Rendered yaw, eased toward targetYaw. Mirrors what the rig holds. */
  private currentYaw = 0;

  private lastMoveTime = 0;
  private lastClientX = 0;
  private lastClientY = 0;
  /** Seconds the pointer has been down without producing a move. */
  private stillTime = 0;

  private activePointerId: number | null = null;
  private pointerDownX = 0;
  private pointerDownY = 0;
  private exceededThreshold = false;

  /** True while another system owns the rig. See beginExternalControl. */
  private externalControl = false;

  constructor(
    domElement: HTMLElement,
    camera: THREE.PerspectiveCamera,
    rig: CameraRig,
    config: NavigationConfig,
    bounds: BoundsRect,
    events: DragPanEvents = {},
  ) {
    this.domElement = domElement;
    this.camera = camera;
    this.rig = rig;
    this.config = config;
    this.bounds = bounds;
    this.events = events;
    this.plane = new THREE.Plane(new THREE.Vector3(0, 1, 0), -config.groundPlaneHeight);

    this.targetX = rig.focus.x;
    this.targetZ = rig.focus.z;
    this.targetYaw = rig.getYaw();
    this.currentYaw = this.targetYaw;

    // OrbitControls used to set this for us. Without it, a single-finger drag
    // scrolls the page or triggers pull-to-refresh on mobile.
    this.domElement.style.touchAction = 'none';

    this.domElement.addEventListener('pointerdown', this.onPointerDown);
    this.domElement.addEventListener('pointermove', this.onPointerMove);
    this.domElement.addEventListener('pointerup', this.onPointerUp);
    this.domElement.addEventListener('pointercancel', this.onPointerUp);
    this.domElement.addEventListener('wheel', this.onWheel, { passive: false });
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
  }

  /**
   * True once the pointer has moved past the drag threshold in the current
   * sequence. Object-selection code reads this to decide whether a pointerup
   * should count as a click (docs/plans/002 Phase 3).
   */
  get isDragging(): boolean {
    return this.activePointerId !== null && this.exceededThreshold;
  }

  /** True while a pointer sequence is in progress, dragging or not. */
  get isPointerActive(): boolean {
    return this.activePointerId !== null;
  }

  /** True while the view is still settling or coasting, on either axis. */
  get isSettling(): boolean {
    const dx = this.targetX - this.rig.focus.x;
    const dz = this.targetZ - this.rig.focus.z;
    return (
      Math.hypot(dx, dz) > 1e-3 ||
      Math.hypot(this.velocityX, this.velocityZ) > 0 ||
      Math.abs(this.targetYaw - this.currentYaw) > YAW_EPSILON ||
      this.velocityYaw !== 0
    );
  }

  /** True while another system owns the rig — see beginExternalControl. */
  get isExternallyControlled(): boolean {
    return this.externalControl;
  }

  /**
   * Hands the rig to another system, such as a scripted camera flight.
   *
   * **Gating pointer input is not enough.** `update()` writes `rig.setFocus` and
   * `rig.setYaw` unconditionally whenever its stored targets differ from what the
   * rig currently holds. If something else moved the rig, the very next frame
   * would ease it straight back toward those stale targets — two systems writing
   * the same state, fighting, every frame. So `update()` returns early while this
   * is set, and nothing here touches the rig at all.
   *
   * Any in-flight gesture is dropped, and velocities are cleared so a coast
   * cannot survive across the handover.
   */
  beginExternalControl(): void {
    if (this.externalControl) return;
    this.externalControl = true;
    this.releasePointer();
    this.velocityX = 0;
    this.velocityZ = 0;
    this.velocityYaw = 0;
  }

  /**
   * Takes the rig back.
   *
   * `adoptRigState` reads the focus and yaw the other system actually left behind
   * and makes them this controller's current *and* target state. Without it the
   * first `update()` after resuming would ease the rig from wherever the flight
   * ended back to wherever the user last dragged to — a snap, and a long one.
   *
   * It is on by default because resuming without it is almost always a bug; the
   * option exists only for a caller that has already set the targets itself.
   */
  endExternalControl(options: { adoptRigState?: boolean } = {}): void {
    if (!this.externalControl) return;
    this.externalControl = false;

    if (options.adoptRigState ?? true) {
      this.targetX = this.rig.focus.x;
      this.targetZ = this.rig.focus.z;
      this.targetYaw = this.rig.getYaw();
      this.currentYaw = this.targetYaw;
    }

    this.velocityX = 0;
    this.velocityZ = 0;
    this.velocityYaw = 0;
    this.stillTime = 0;
  }

  /**
   * Replaces the navigable area.
   *
   * Only the *target* is re-clamped; the rendered focus is left alone and the
   * existing smoothing draws it in. Bounds now change continuously as the rig
   * yaws — the footprint is azimuth-dependent — so snapping the focus here
   * would show up as a jerk on every frame of a rotation.
   */
  setBounds(bounds: BoundsRect): void {
    this.bounds = bounds;
    const target = clampToRect(this.targetX, this.targetZ, bounds);
    this.targetX = target.x;
    this.targetZ = target.z;
  }

  /** Advances smoothing and momentum on both axes. Call once per frame. */
  update(deltaTime: number): void {
    // Exactly one system may write to the rig in a frame. While another owns it,
    // this must not run at all — not even the smoothing, which would otherwise
    // drag the rig back toward stale targets. See beginExternalControl.
    if (this.externalControl) return;

    const dt = Math.min(Math.max(deltaTime, 0), MAX_FRAME_DELTA);
    if (dt <= 0) return;

    this.decayStalledVelocity(dt);

    // Yaw first: it changes the viewport footprint, and the bounds that come
    // back from that are what the translation below is clamped against.
    this.updateYaw(dt);
    this.updateTranslation(dt);
  }

  /**
   * Bleeds off momentum while the pointer is down but not moving, so a gesture
   * that ends at a standstill releases at a standstill. See POINTER_STILL_GRACE.
   */
  private decayStalledVelocity(dt: number): void {
    if (!this.isPointerActive) return;

    this.stillTime += dt;
    if (this.stillTime < POINTER_STILL_GRACE) return;

    const decay = Math.exp(-dt / POINTER_STILL_DECAY);
    this.velocityX *= decay;
    this.velocityZ *= decay;
    this.velocityYaw *= decay;
  }

  dispose(): void {
    this.releasePointer();
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp);
    this.domElement.removeEventListener('wheel', this.onWheel);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.domElement.style.touchAction = '';
  }

  // --- Per-frame integration -------------------------------------------------

  private updateYaw(dt: number): void {
    const rotation = this.config.rotation;
    if (!rotation.enabled) return;
    const feel = rotation.feel;

    if (!this.isPointerActive && feel.inertiaTimeConstant > 0) {
      if (Math.abs(this.velocityYaw) > feel.minInertiaSpeed) {
        this.targetYaw += this.velocityYaw * dt;
        this.velocityYaw *= Math.exp(-dt / feel.inertiaTimeConstant);
      } else {
        this.velocityYaw = 0;
      }
    }

    const alpha = smoothingAlpha(feel, this.isPointerActive, dt);
    const next = this.currentYaw + (this.targetYaw - this.currentYaw) * alpha;
    const settled = Math.abs(this.targetYaw - next) < YAW_EPSILON ? this.targetYaw : next;

    if (settled === this.currentYaw) return;
    this.currentYaw = settled;
    this.rig.setYaw(settled);
    // Recomputes the footprint and calls back into setBounds. Ordering matters:
    // the translation step that follows must see the bounds for the new yaw.
    this.events.onYawChanged?.();
  }

  private updateTranslation(dt: number): void {
    const feel = this.config.feel;

    // Momentum only applies once the pointer is gone.
    if (!this.isPointerActive && feel.inertiaTimeConstant > 0) {
      const speed = Math.hypot(this.velocityX, this.velocityZ);
      if (speed > feel.minInertiaSpeed) {
        const proposedX = this.targetX + this.velocityX * dt;
        const proposedZ = this.targetZ + this.velocityZ * dt;
        const clamped = clampToRect(proposedX, proposedZ, this.bounds);
        // Kill momentum on an axis that hit the wall, so it does not grind.
        if (clamped.x !== proposedX) this.velocityX = 0;
        if (clamped.z !== proposedZ) this.velocityZ = 0;
        this.targetX = clamped.x;
        this.targetZ = clamped.z;

        const decay = Math.exp(-dt / feel.inertiaTimeConstant);
        this.velocityX *= decay;
        this.velocityZ *= decay;
      } else {
        this.velocityX = 0;
        this.velocityZ = 0;
      }
    }

    const alpha = smoothingAlpha(feel, this.isPointerActive, dt);
    const nextX = this.rig.focus.x + (this.targetX - this.rig.focus.x) * alpha;
    const nextZ = this.rig.focus.z + (this.targetZ - this.rig.focus.z) * alpha;

    // Snap the last fraction of a unit so the rig settles exactly.
    const settledX = Math.abs(this.targetX - nextX) < 1e-3 ? this.targetX : nextX;
    const settledZ = Math.abs(this.targetZ - nextZ) < 1e-3 ? this.targetZ : nextZ;

    if (settledX !== this.rig.focus.x || settledZ !== this.rig.focus.z) {
      this.rig.setFocus(settledX, settledZ);
    }
  }

  // --- Pointer handling ------------------------------------------------------

  private readonly onPointerDown = (event: PointerEvent): void => {
    if (!this.config.enabled) return;
    // A flight cancels itself from a capture-phase listener on this same
    // element, which runs before this one. So by the time a cancelling press
    // arrives here external control has already ended and the drag starts
    // normally — the press that stopped the flight is also the press that
    // begins the gesture, with no synthetic re-dispatch.
    if (this.externalControl) return;
    // Left and right behave identically — the control is just click-and-drag,
    // so which button it is does not matter. Middle is left alone because
    // suppressing its autoscroll is unreliable across browsers.
    if (event.button !== 0 && event.button !== 2) return;
    if (this.activePointerId !== null) return;

    this.activePointerId = event.pointerId;
    this.pointerDownX = event.clientX;
    this.pointerDownY = event.clientY;
    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.exceededThreshold = false;
    this.lastMoveTime = event.timeStamp;
    this.stillTime = 0;

    // Grabbing stops any coast, as it would on a physical surface.
    this.velocityX = 0;
    this.velocityZ = 0;
    this.velocityYaw = 0;

    this.domElement.setPointerCapture(event.pointerId);
    this.events.onFirstInteraction?.();
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;

    if (!this.exceededThreshold) {
      const movedX = Math.abs(event.clientX - this.pointerDownX);
      const movedY = Math.abs(event.clientY - this.pointerDownY);
      if (Math.hypot(movedX, movedY) < this.config.dragThresholdPx) return;
      this.exceededThreshold = true;
      // Re-anchor at the moment the drag actually starts, so the first frame
      // does not jump by the threshold distance.
      this.lastClientX = event.clientX;
      this.lastClientY = event.clientY;
      this.lastMoveTime = event.timeStamp;
      this.stillTime = 0;
      this.events.onDragStateChanged?.(true);
      return;
    }

    const rect = this.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dt = (event.timeStamp - this.lastMoveTime) / 1000;

    this.applyRotation(event, rect, dt);
    this.applyTranslation(event, rect, dt);

    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.stillTime = 0;
    if (dt > 1e-4) this.lastMoveTime = event.timeStamp;
  };

  /** Horizontal drag → yaw. Sensitivity is normalized by viewport width. */
  private applyRotation(event: PointerEvent, rect: DOMRect, dt: number): void {
    const rotation = this.config.rotation;
    if (!rotation.enabled) return;

    const dxPixels = event.clientX - this.lastClientX;
    if (dxPixels === 0) return;

    // Positive, and it is worth saying why, because the intuitive answer is
    // wrong. This is an orbit, not a slide: raising the azimuth swings the
    // camera's forward vector toward -X, so a point that was straight ahead
    // ends up further to the right of frame. Dragging right therefore carries
    // the ground right by *increasing* yaw. Reasoning about the camera's
    // sideways translation instead gives the opposite, incorrect, answer.
    const deltaYaw = dxPixels * (rotation.degreesPerViewportWidth / rect.width);
    this.targetYaw += deltaYaw;

    if (dt > 1e-4) {
      this.velocityYaw = THREE.MathUtils.lerp(
        this.velocityYaw,
        deltaYaw / dt,
        rotation.feel.velocityBlend,
      );
    }
  }

  /**
   * Vertical drag → forward/backward along the view direction.
   *
   * Both sample points are projected against the *current* camera with the
   * horizontal coordinate held fixed, so the measurement isolates the vertical
   * axis: a purely horizontal drag contributes no translation even though
   * perspective would otherwise give it a forward component.
   */
  private applyTranslation(event: PointerEvent, rect: DOMRect, dt: number): void {
    const dyPixels = event.clientY - this.lastClientY;
    if (dyPixels === 0) return;

    if (!this.projectToGround(rect, event.clientX, this.lastClientY, this.fromPoint)) return;
    if (!this.projectToGround(rect, event.clientX, event.clientY, this.toPoint)) return;

    // The ground follows the cursor, so the focus moves the opposite way.
    // Scaled by translationGain: below 1 the grabbed point slides behind the
    // pointer, which is the only sensitivity knob this axis has.
    const forward = this.rig.getForward();
    const amount =
      ((this.fromPoint.x - this.toPoint.x) * forward.x +
        (this.fromPoint.z - this.toPoint.z) * forward.z) *
      this.config.translationGain;

    const proposedX = this.targetX + forward.x * amount;
    const proposedZ = this.targetZ + forward.z * amount;

    // Clamp the proposal before committing it, never the result afterwards.
    const clamped = clampToRect(proposedX, proposedZ, this.bounds);

    if (dt > 1e-4) {
      const instantX = (clamped.x - this.targetX) / dt;
      const instantZ = (clamped.z - this.targetZ) / dt;
      // Smoothed so a single jittery sample cannot define the release speed.
      const blend = this.config.feel.velocityBlend;
      this.velocityX = THREE.MathUtils.lerp(this.velocityX, instantX, blend);
      this.velocityZ = THREE.MathUtils.lerp(this.velocityZ, instantZ, blend);
    }

    this.targetX = clamped.x;
    this.targetZ = clamped.z;
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== this.activePointerId) return;

    if (this.exceededThreshold) {
      this.settleReleaseVelocity();
    } else {
      // A tap should not coast.
      this.velocityX = 0;
      this.velocityZ = 0;
      this.velocityYaw = 0;
    }

    this.releasePointer();
  };

  /** Wheel is actively suppressed: nothing downstream consumes it. */
  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault();
  };

  /** Right-drag navigates, so the context menu must never open on release. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * Prepares the recorded velocity for the coast, per axis: capped to the speed
   * limit where inertia is enabled, dropped entirely where it is not.
   *
   * Dropping it matters even though the integration step already ignores it —
   * a stale non-zero velocity would leave `isSettling` true for the rest of the
   * session, since nothing else clears it once the inertia branch stops running.
   */
  private settleReleaseVelocity(): void {
    const feel = this.config.feel;
    if (feel.inertiaTimeConstant <= 0) {
      this.velocityX = 0;
      this.velocityZ = 0;
    } else {
      const speed = Math.hypot(this.velocityX, this.velocityZ);
      if (speed > feel.maxInertiaSpeed && speed > 0) {
        const scale = feel.maxInertiaSpeed / speed;
        this.velocityX *= scale;
        this.velocityZ *= scale;
      }
    }

    const rotationFeel = this.config.rotation.feel;
    if (rotationFeel.inertiaTimeConstant <= 0) {
      this.velocityYaw = 0;
    } else if (Math.abs(this.velocityYaw) > rotationFeel.maxInertiaSpeed) {
      this.velocityYaw = Math.sign(this.velocityYaw) * rotationFeel.maxInertiaSpeed;
    }
  }

  private releasePointer(): void {
    if (this.activePointerId === null) return;
    if (this.domElement.hasPointerCapture(this.activePointerId)) {
      this.domElement.releasePointerCapture(this.activePointerId);
    }
    const wasDragging = this.isDragging;
    this.activePointerId = null;
    this.exceededThreshold = false;
    if (wasDragging) this.events.onDragStateChanged?.(false);
  }

  /** Projects a client-space point onto the horizontal navigation plane. */
  private projectToGround(
    rect: DOMRect,
    clientX: number,
    clientY: number,
    target: THREE.Vector3,
  ): boolean {
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -((clientY - rect.top) / rect.height) * 2 + 1,
    );
    this.raycaster.setFromCamera(this.ndc, this.camera);
    return this.raycaster.ray.intersectPlane(this.plane, target) !== null;
  }
}

/**
 * Frame-rate independent exponential approach, using the drag time constant
 * while the pointer is down and the heavier release one once it is gone.
 */
function smoothingAlpha(feel: DragFeelConfig, pointerActive: boolean, dt: number): number {
  const tau = pointerActive ? feel.smoothingTimeConstant : feel.releaseTimeConstant;
  return tau > 0 ? 1 - Math.exp(-dt / tau) : 1;
}
