import * as THREE from 'three';
import type { BoundsRect, DragFeelConfig, NavigationConfig } from '../config/environmentConfig';
import type { CameraRig } from '../camera/CameraRig';
import { clampToRect } from './navigationBounds';
import { clientToNdc } from '../../../interaction/screenSpace';
import { clampFrameDelta } from '../../../graphics/frameDelta';

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

/** Below this the yaw is treated as settled, in degrees. */
const YAW_EPSILON = 1e-3;

/**
 * Below this the focus is treated as settled, in world units.
 *
 * The three settle epsilons are deliberately different and are NOT a set of
 * magic numbers waiting to be unified: they measure different quantities.
 * Degrees of yaw and world units of ground are not comparable, so one shared
 * constant would be wrong for one of the two.
 *
 * This one was the only one still written inline, twice, which made it look
 * incidental next to the two named above it.
 */
const FOCUS_EPSILON = 1e-3;

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

/** What the current pointer sequence is doing. See the class comment. */
type GestureMode = 'idle' | 'pan' | 'rotate' | 'twoPointer';

/** A pointer we are tracking, with the position its last delta was taken from. */
interface TrackedPointer {
  id: number;
  x: number;
  y: number;
}

/**
 * Map-style navigation: drag the ground, turn deliberately.
 *
 *   left button / one finger    pan the ground under the cursor, both axes
 *   right button / two fingers  rotate the rig horizontally about the focus
 *   middle button               ignored
 *
 * No vertical rotation, no keyboard, and NO ZOOM — not on the wheel, not on a
 * pinch. The wheel belongs to scene navigation now and this controller does not
 * listen for it at all (`adr/009`); distance changes only when a district flight
 * takes the camera to a clickable object. Two fingers still rotate by centroid.
 *
 * ## Why the gestures split this way
 *
 * This replaces a design in which one gesture carried both axes — drag up/down
 * to advance, drag left/right to turn — chosen because with no gizmo, no button
 * and no modifier a single pointer had to carry everything. It was coherent, and
 * users reported it as wrong: they expected the ground to follow the cursor, and
 * instead sideways drag spun the city. There was no strafe at all, and rotation
 * fired constantly by accident, which is what made it read as twitchy.
 *
 * So pan now owns the whole primary gesture and rotation moved to a deliberate
 * one. Rotation being deliberate is what pays for it being slower: it is entered
 * on purpose, so it can afford to cost more travel, and it can no longer be
 * triggered while you are trying to pan.
 *
 * ## Fidelity
 *
 * Pan is solved against the ground, not from pixels: both ends of the pointer's
 * movement are projected onto the navigation plane and the focus moves by the
 * negated difference, so the grabbed point stays under the cursor. Solving
 * against the ground is what keeps sensitivity consistent across the screen — a
 * pixel near the horizon covers far more ground than one near the bottom edge,
 * and a pixel-based mapping would ignore that.
 *
 * `translationGain` scales the result and ships at 1, which is the definition of
 * grab-the-point. Below 1 the grabbed point slides behind the cursor; that was
 * the previous setting and the complaint.
 *
 * Yaw is a straight pixels-to-degrees mapping, normalized by viewport width. A
 * turntable solve (yaw from the angle the grabbed ground point sweeps about the
 * focus) was considered and rejected: its radius varies by an order of magnitude
 * between the top and bottom of the screen at this elevation, so sensitivity
 * would depend on where the drag happened to start, which reads as inconsistent
 * rather than physical.
 *
 * ## Why the pan solve is immune to smoothing lag
 *
 * The rendered focus trails its target — that is what the smoothing is — so it
 * looks as though grab-the-point must be solved against a stale camera and drift
 * a little further out of register with every move. It does not, and the reason
 * is worth stating because the obvious reading says otherwise.
 *
 * The camera sits at a *rigid* offset from the focus: elevation is fixed, and
 * distance and yaw are constant during a pan because they belong to other
 * gestures now. So rendering at focus F instead of target T translates the whole
 * ray field by T - F, and the ground hit of a given screen position translates
 * by exactly the same vector. Both ends of the delta are projected against the
 * *same* camera, so that offset appears in both and cancels in the subtraction.
 * The delta is exact in target space however far behind the render is.
 *
 * The corollary is that per-move deltas telescope: dragging the cursor around
 * any closed loop returns the target focus to its exact starting value,
 * path-independently. Section 9 of checks/navigation-feel.ts asserts both.
 *
 * What the lag does cost is purely visual — the grabbed building sits behind the
 * cursor by roughly `dragSpeed x smoothingTimeConstant` while you are moving.
 * That is why the constant is short, and why the fix for it is the constant and
 * not the solve.
 *
 * An absolute-anchor solve (remember the world point grabbed at pointerdown,
 * re-place it under the cursor every move) is equally exact in the interior and
 * was rejected for the edges: it goes dead against a wall, because the anchor
 * keeps demanding a focus the clamp will not give, so pushing 200 units past an
 * edge means 200 units of nothing happening on the way back. The incremental
 * form loses only the over-travel and moves on the first pixel of the return.
 *
 * ## Weight
 *
 * The weight is in the drag rather than in a coast: the rendered value eases
 * toward the input, so the view feels like it has mass while it is being moved
 * and stops when the pointer stops.
 *
 * Release momentum exists in the code and is switched off by configuration
 * (`inertiaTimeConstant: 0`). It was tried and rejected — motion continuing
 * after the gesture ends reads as a loss of control rather than as mass. The
 * machinery is retained because it costs nothing while disabled and makes the
 * setting reversible from config alone. See DragFeelConfig.
 *
 * Everything is solved against the currently rendered camera each move, so a
 * yaw or a flight dolly applied mid-gesture is accounted for on the next sample.
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

  /**
   * Pointers currently down, in the order they arrived, at most two.
   *
   * The array rather than a single id is what makes two-finger gestures and
   * their transitions expressible; `pointers[0]` is the one a single-pointer
   * gesture follows.
   */
  private readonly pointers: TrackedPointer[] = [];
  private mode: GestureMode = 'idle';
  private pointerDownX = 0;
  private pointerDownY = 0;
  private exceededThreshold = false;

  /** Two-pointer baseline. Resampled on every 1 <-> 2 transition. */
  private lastCentroidX = 0;

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
    this.domElement.addEventListener('contextmenu', this.onContextMenu);
    // Safari on macOS reports a trackpad pinch through these non-standard
    // events INSTEAD of ctrl+wheel. Without suppressing them the whole page
    // zooms while the camera does nothing.
    this.domElement.addEventListener('gesturestart', this.onGesture);
    this.domElement.addEventListener('gesturechange', this.onGesture);
    this.domElement.addEventListener('gestureend', this.onGesture);
  }

  /**
   * True once the pointer has moved past the drag threshold in the current
   * sequence. Object-selection code reads this to decide whether a pointerup
   * should count as a click (docs/plans/002 Phase 3).
   *
   * True for a rotate and for a two-finger gesture as well as for a pan, which
   * is what stops either of those ending in a district selection.
   */
  get isDragging(): boolean {
    return this.pointers.length > 0 && this.exceededThreshold;
  }

  /** True while a pointer sequence is in progress, dragging or not. */
  get isPointerActive(): boolean {
    return this.pointers.length > 0;
  }

  /** True while the view is still settling or coasting, on any axis. */
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
   * **Gating pointer input is not enough.** `update()` writes `rig.setFocus`,
   * `rig.setYaw` and `rig.setDistanceScale` unconditionally whenever its stored
   * targets differ from what the rig currently holds. If something else moved
   * the rig, the very next frame would ease it straight back toward those stale
   * targets — two systems writing the same state, fighting, every frame. So
   * `update()` returns early while this is set, and nothing here touches the rig
   * at all.
   *
   * Any in-flight gesture is dropped, and velocities are cleared so a coast
   * cannot survive across the handover.
   */
  beginExternalControl(): void {
    if (this.externalControl) return;
    this.externalControl = true;
    this.releaseAllPointers();
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
   * DISTANCE IS DELIBERATELY NOT ADOPTED, and that is a change. It used to be, because
   * the user could zoom and this controller therefore held a distance target that a
   * flight would leave stale. It holds none now: only a flight moves distance, it owns
   * it for its whole duration, and `close()` returns it to rest. Adopting it here would
   * make this class a second writer of a value it can no longer change.
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
   * existing smoothing draws it in. Bounds change continuously as the rig yaws —
   * and as a district flight dollies — so snapping the focus here would show up as
   * a jerk on every frame of a rotation or a flight.
   */
  setBounds(bounds: BoundsRect): void {
    this.bounds = bounds;
    const target = clampToRect(this.targetX, this.targetZ, bounds);
    this.targetX = target.x;
    this.targetZ = target.z;
  }

  /** Advances smoothing and momentum on every axis. Call once per frame. */
  update(deltaTime: number): void {
    // Exactly one system may write to the rig in a frame. While another owns it,
    // this must not run at all — not even the smoothing, which would otherwise
    // drag the rig back toward stale targets. See beginExternalControl.
    if (this.externalControl) return;

    const dt = clampFrameDelta(deltaTime);
    if (dt <= 0) return;

    this.decayStalledVelocity(dt);

    // Yaw before translation: it changes the viewport footprint, and the bounds
    // that come back from that are what the translation below is clamped against.
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
    this.releaseAllPointers();
    this.domElement.removeEventListener('pointerdown', this.onPointerDown);
    this.domElement.removeEventListener('pointermove', this.onPointerMove);
    this.domElement.removeEventListener('pointerup', this.onPointerUp);
    this.domElement.removeEventListener('pointercancel', this.onPointerUp);
    this.domElement.removeEventListener('contextmenu', this.onContextMenu);
    this.domElement.removeEventListener('gesturestart', this.onGesture);
    this.domElement.removeEventListener('gesturechange', this.onGesture);
    this.domElement.removeEventListener('gestureend', this.onGesture);
    this.domElement.style.touchAction = '';
  }

  // --- Per-frame integration -------------------------------------------------
  //
  // The two integrators below share a SHAPE — optional inertia, then an
  // exponential ease toward the target, then an epsilon snap, then a write to
  // the rig — and they are deliberately not unified behind a common "smoothed
  // axis" type. They do not share a responsibility:
  //
  //   updateYaw          one scalar, with inertia, fires onYawChanged.
  //   updateTranslation  TWO axes that are not independent. The inertia test is
  //                      a 2-D speed (Math.hypot) and the clamp is a single
  //                      rectangle test that can stop X and Z together — neither
  //                      can be expressed as two separate axes without changing
  //                      the behaviour.
  //
  // The two would fit a shared abstraction and one of them would have to be bent
  // into it. PRINCIPLES §12: duplication is cheaper than the wrong abstraction.

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
    const settledX = Math.abs(this.targetX - nextX) < FOCUS_EPSILON ? this.targetX : nextX;
    const settledZ = Math.abs(this.targetZ - nextZ) < FOCUS_EPSILON ? this.targetZ : nextZ;

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
    // A mouse reports one pointerId for every button, so a second button
    // pressed mid-gesture arrives here with an id we already track. Ignoring it
    // is what locks the mode to whichever button started the gesture — without
    // this, pressing right mid-pan would switch to rotating.
    if (this.pointers.some((p) => p.id === event.pointerId)) return;
    if (this.pointers.length >= 2) return;

    const touch = event.pointerType === 'touch';

    if (!touch) {
      // Left pans, right rotates. Middle is left alone because suppressing its
      // autoscroll is unreliable across browsers.
      if (event.button === 0) this.mode = 'pan';
      else if (event.button === 2) this.mode = 'rotate';
      else return;
    }

    this.pointers.push({ id: event.pointerId, x: event.clientX, y: event.clientY });

    if (touch) {
      if (this.pointers.length === 1) {
        this.mode = 'pan';
      } else {
        this.mode = 'twoPointer';
        this.reseedTwoPointerBaselines();
        // A two-finger gesture is never a tap. Marking it as a drag straight
        // away is what stops a two-finger press ending in a district
        // selection when the first finger lifts.
        if (!this.exceededThreshold) {
          this.exceededThreshold = true;
          this.events.onDragStateChanged?.(true);
        }
      }
    }

    if (this.pointers.length === 1) {
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
    }

    this.domElement.setPointerCapture(event.pointerId);
    this.events.onFirstInteraction?.();
  };

  /**
   * Read from the event rather than from state recorded at pointerdown: a
   * pointer cannot change type mid-sequence, so the two are equivalent, and
   * taking it from the event keeps the decision beside the comparison it feeds.
   */
  private dragThresholdFor(event: PointerEvent): number {
    return event.pointerType === 'touch'
      ? this.config.touchDragThresholdPx
      : this.config.dragThresholdPx;
  }

  private readonly onPointerMove = (event: PointerEvent): void => {
    const tracked = this.pointers.find((p) => p.id === event.pointerId);
    if (!tracked) return;

    if (this.mode === 'twoPointer') {
      tracked.x = event.clientX;
      tracked.y = event.clientY;
      this.applyTwoPointer(event);
      this.stillTime = 0;
      return;
    }

    // Only the first pointer drives a single-pointer gesture. A second one
    // cannot exist here — two pointers means twoPointer mode — but a stale
    // move from a released id could, and following it would jump the view.
    if (tracked !== this.pointers[0]) return;

    tracked.x = event.clientX;
    tracked.y = event.clientY;

    if (!this.exceededThreshold) {
      const movedX = Math.abs(event.clientX - this.pointerDownX);
      const movedY = Math.abs(event.clientY - this.pointerDownY);
      // Per pointer type, never one number for both: a finger wanders 5–15px
      // between contact and release, so the mouse threshold rejects most real
      // taps as drags, and a threshold loose enough for a finger would swallow
      // deliberate small mouse drags. DECISIONS.md section 17.
      if (Math.hypot(movedX, movedY) < this.dragThresholdFor(event)) return;
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

    if (this.mode === 'pan') this.applyPan(event, rect, dt);
    else if (this.mode === 'rotate') this.applyRotation(event.clientX - this.lastClientX, rect, dt);

    this.lastClientX = event.clientX;
    this.lastClientY = event.clientY;
    this.stillTime = 0;
    if (dt > 1e-4) this.lastMoveTime = event.timeStamp;
  };

  /**
   * Horizontal movement → yaw. Sensitivity is normalized by viewport width, so
   * a turn costs the same fraction of the screen on a mouse and on touch.
   */
  private applyRotation(dxPixels: number, rect: DOMRect, dt: number): void {
    const rotation = this.config.rotation;
    if (!rotation.enabled) return;
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
   * Pointer movement → focus movement across the ground, in both axes.
   *
   * Both ends are projected against the *current* camera and the focus moves by
   * the negated difference, so the grabbed point stays under the cursor. See the
   * class comment for why the render lagging its target does not spoil that.
   */
  private applyPan(event: PointerEvent, rect: DOMRect, dt: number): void {
    if (event.clientX === this.lastClientX && event.clientY === this.lastClientY) return;

    if (!this.projectToGround(rect, this.lastClientX, this.lastClientY, this.fromPoint)) return;
    if (!this.projectToGround(rect, event.clientX, event.clientY, this.toPoint)) return;

    // The ground follows the cursor, so the focus moves the opposite way.
    const gain = this.config.translationGain;
    const proposedX = this.targetX + (this.fromPoint.x - this.toPoint.x) * gain;
    const proposedZ = this.targetZ + (this.fromPoint.z - this.toPoint.z) * gain;

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

  /**
   * Two fingers: sideways movement of their centroid turns. Changing their
   * separation does nothing — pinch-to-zoom retired with the zoom band.
   *
   * Rotation is taken from the centroid's horizontal movement, NOT from the
   * twist angle between the fingers, which is the more literal reading of the
   * gesture. At this elevation a twist maps to yaw at roughly 1:1, so the small
   * involuntary twist that accompanies every pinch would turn the city
   * constantly, and with elevation fixed there is no other axis to absorb it.
   * The centroid also gives touch and mouse the same mental model — move
   * sideways to turn. If user testing disagrees, the alternative to try is
   * twist → yaw with the centroid driving a two-finger pan.
   *
   * Vertical centroid movement does nothing, deliberately: the centroid's
   * horizontal axis is already spoken for, and putting a second solve on the
   * same signal makes both unpredictable.
   */
  private applyTwoPointer(event: PointerEvent): void {
    const rect = this.domElement.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;
    if (this.pointers.length < 2) return;

    const [a, b] = this.pointers;
    const centroidX = (a.x + b.x) / 2;
    const dt = (event.timeStamp - this.lastMoveTime) / 1000;
    this.applyRotation(centroidX - this.lastCentroidX, rect, dt);

    this.lastCentroidX = centroidX;
    if (dt > 1e-4) this.lastMoveTime = event.timeStamp;
  }

  /**
   * Resamples the two-pointer baselines from the pointers as they stand.
   *
   * Called on every 1 <-> 2 transition. Every gesture here is a delta against a
   * baseline rather than an absolute position, so a transition costs nothing
   * provided no delta is allowed to span it — which is what this guarantees.
   */
  private reseedTwoPointerBaselines(): void {
    if (this.pointers.length < 2) return;
    const [a, b] = this.pointers;
    this.lastCentroidX = (a.x + b.x) / 2;
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const index = this.pointers.findIndex((p) => p.id === event.pointerId);
    if (index === -1) return;

    this.pointers.splice(index, 1);
    this.releaseCapture(event.pointerId);

    if (this.pointers.length === 1) {
      // Two fingers became one. Resume panning from the survivor's own last
      // known position — taken from the tracked record, not from the event that
      // just left — or the next move would apply a delta the size of the gap
      // between the fingers.
      const survivor = this.pointers[0];
      this.mode = 'pan';
      this.lastClientX = survivor.x;
      this.lastClientY = survivor.y;
      this.lastMoveTime = event.timeStamp;
      this.stillTime = 0;
      this.velocityX = 0;
      this.velocityZ = 0;
      this.velocityYaw = 0;
      return;
    }

    if (this.pointers.length > 0) return;

    if (this.exceededThreshold) {
      this.settleReleaseVelocity();
    } else {
      // A tap should not coast.
      this.velocityX = 0;
      this.velocityZ = 0;
      this.velocityYaw = 0;
    }

    const wasDragging = this.exceededThreshold;
    this.mode = 'idle';
    this.exceededThreshold = false;
    if (wasDragging) this.events.onDragStateChanged?.(false);
  };

  /** Right-drag rotates, so the context menu must never open on release. */
  private readonly onContextMenu = (event: MouseEvent): void => {
    event.preventDefault();
  };

  /**
   * Safari trackpad pinch. Suppressed so it cannot zoom the PAGE.
   *
   * Retained even though a pinch no longer moves the camera: this stops the browser
   * scaling the document, which is a different failure and still real.
   */
  private readonly onGesture = (event: Event): void => {
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

  /**
   * Drops every tracked pointer and releases its capture.
   *
   * Per id, and every path out of a gesture has to come through here or through
   * `onPointerUp`. A capture left behind on a released pointer silently
   * swallows all subsequent input on the canvas, with nothing to see.
   */
  private releaseAllPointers(): void {
    if (this.pointers.length === 0) return;
    const wasDragging = this.isDragging;
    for (const pointer of this.pointers) this.releaseCapture(pointer.id);
    this.pointers.length = 0;
    this.mode = 'idle';
    this.exceededThreshold = false;
    if (wasDragging) this.events.onDragStateChanged?.(false);
  }

  private releaseCapture(pointerId: number): void {
    if (this.domElement.hasPointerCapture(pointerId)) {
      this.domElement.releasePointerCapture(pointerId);
    }
  }

  /** Projects a client-space point onto the horizontal navigation plane. */
  private projectToGround(
    rect: DOMRect,
    clientX: number,
    clientY: number,
    target: THREE.Vector3,
  ): boolean {
    clientToNdc(rect, clientX, clientY, this.ndc);
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
