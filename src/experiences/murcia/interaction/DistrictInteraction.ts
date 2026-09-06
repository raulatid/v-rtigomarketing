import * as THREE from 'three';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import type { DistrictLookup } from './resolveDistrict';
import { DistrictHighlight, INTERACTION_LAYER } from './DistrictHighlight';
import type { DistrictHighlightConfig } from './DistrictHighlight';
import { CameraFlight } from '../camera/CameraFlight';
import type { FlightDestination } from '../camera/CameraFlight';
import { scalePoseDistance } from '../camera/applyPoseToCamera';
import type { CameraRig } from '../camera/CameraRig';
import { computeFramedFocus, unobstructedCenterNdc } from '../camera/cameraFraming';
import { clientToNdc, worldToClient } from '../../../interaction/screenSpace';
import type { ScreenRect } from '../camera/cameraFraming';
import type { DragPanController } from '../navigation/DragPanController';
import type {
  BoundsRect,
  CameraPoseConfig,
  FocusFlightConfig,
} from '../config/environmentConfig';
import type { CursorManager } from '../../../interaction/cursorManager';
import type { DistrictSnapshot, DistrictState } from '../district/districtState';
import type { ServicesDisplay } from '../district/display/servicesDisplay';
import { controlAt } from '../district/display/displayConfig';
import type { DisplayControl } from '../district/display/displayConfig';

export type DistrictInteractionState =
  | { type: 'idle' }
  /** The pointer is over the cluster and the district is closed. */
  | { type: 'hovering' }
  /** Flying in. The district is already active; the camera has not landed. */
  | { type: 'entering' }
  /**
   * Landed, with the display up. Carries the tour position rather than a service
   * id: the buildings stopped meaning services in plan 003 and stopped BEING
   * per-service geometry in the 2026-09-06 export, so an id here would have to
   * be looked up from the store this class already defers to.
   */
  | { type: 'open'; serviceIndex: number };

export interface DistrictInteractionDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  controller: DragPanController;
  /** The district's shared camera decision. */
  binding: DistrictSceneBinding;
  /**
   * The district's buildings, resolved as ONE cluster.
   *
   * Not a list of per-service sites. There are three meshes and none of them
   * means a service — a tap on any of them enters, and after that they are
   * scenery (plan 003 §6).
   */
  buildings: DistrictLookup;
  /**
   * Arbitrates the cursor across every source on the shared canvas. A direct
   * `canvas.style.cursor` write would be discarded outright while the custom
   * cursor is mounted, since that sets `cursor: none` on everything.
   */
  cursor: CursorManager;
  groundPlaneHeight: number;
  /** Current camera pose, re-supplied on resize because portrait may override it. */
  getPose: () => CameraPoseConfig;
  getAspect: () => number;
  /** Recomputes and returns the navigable area for the rig's current pose. */
  resolveBounds: () => BoundsRect | null;
  /** The floor a focus flight may dolly to. Clamped against, never trusted. */
  focusFlight: FocusFlightConfig;
  /**
   * Tap tolerance per pointer type, the same numbers the drag controller uses.
   * Measured here as well, not only read off the controller: a browser can
   * cancel or recapture a pointer mid-gesture, and a release the controller has
   * already forgotten must still not count as a tap on whatever it landed on.
   */
  tapThresholdPx: { mouse: number; touch: number };
  reducedMotion: boolean;
  /**
   * The authoritative district state. This class WRITES it through named
   * transitions and is told the result through `applySnapshot`; it never keeps
   * a second copy of which service is active.
   */
  state: DistrictState;
  /** The display. Its panel is the only hit surface once the district is open. */
  display: ServicesDisplay;
  /** Where the camera settles when the district is entered: the plaza, world XZ. */
  districtCenter: { x: number; z: number };
  /** Names this district in cursor keys and warnings. */
  districtId: string;
  /**
   * Fired when `isEngaged` flips, either way. Carries no payload on purpose:
   * the consumer re-reads the aggregate it cares about
   * (`MurciaExperience.hasFocusedDistrict`) rather than being handed a copy of
   * this district's state.
   */
  onEngagedChange?: () => void;
}

/**
 * The cluster's highlight sizing.
 *
 * ONE highlight over all three buildings, so the padding that used to risk
 * neighbouring proxies overlapping is now just the cluster's own hit slop —
 * which is worth having on a phone, where the district is a small target and
 * there is no hover to aim by.
 */
const CLUSTER_HIGHLIGHT: DistrictHighlightConfig = {
  highlightColor: 0x4fb0ff,
  idleIntensity: 0.12,
  hoverIntensity: 0.55,
  activeIntensity: 0.95,
  timeConstant: 0.12,
  markerRadiusScale: 1.0,
  markerColor: 0x4fb0ff,
  markerIdleOpacity: 0.3,
  markerActiveOpacity: 0.55,
  markerPulsePeriod: 3.4,
  proxyPadding: 2,
};

/** Wheel notches to scroll fraction. */
const WHEEL_SCROLL_SCALE = 0.0016;
/** Drag pixels to scroll fraction. */
const DRAG_SCROLL_SCALE = 0.0026;

/**
 * Owns the district's interaction and every transition between states.
 *
 * ONE interaction for the whole district. Not one instance per building: each
 * would own a `CameraFlight` and a set of canvas listeners, so two of them could
 * write the rig in the same frame, which is exactly the failure the
 * external-control handover exists to prevent. One raycaster, one flight, one
 * display, one highlight.
 *
 * ## The buildings are not navigation
 *
 * Since plan 003 the projected display is the district's only interaction
 * surface. The buildings are one ENTRY target — a tap on any of them opens the
 * district on its first service — and after that they are scenery.
 *
 * They stopped being per-service GEOMETRY with the 2026-09-06 export, which
 * replaced five buildings with three that carry no service meaning. That cost
 * this class nothing, which is the point: it had already given up the
 * building-to-service mapping, so the only change was N highlights becoming one.
 * `districtState` holds the active index and this class reads it back rather
 * than keeping its own.
 *
 * ## Two hit tests, never both at once
 *
 * Closed, the raycast is against the cluster's meshes and its picking proxy.
 * Open, it is `intersectObject(panel, false)` and nothing else. The two never
 * overlap, which is what makes the arbitration a mode switch rather than an
 * ordering rule.
 *
 * Kept out of `MurciaExperience` deliberately. The awkward cases here — a press
 * arriving mid-flight, a drag that ends over a control, a resize during a
 * transition, a scroll gesture that must not pan the city — are exactly the ones
 * that turn into contradictory behaviour when the state is spread across five
 * modules that each hold a piece.
 */
export class DistrictInteraction {
  private readonly deps: DistrictInteractionDeps;
  private readonly highlight: DistrictHighlight;
  private readonly group = new THREE.Group();
  private readonly flight: CameraFlight;

  /** Namespaced so this district retracting its hover cannot clear another's. */
  private readonly cursorKey: string;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pickables: THREE.Object3D[];
  private readonly hits: THREE.Intersection[] = [];
  private readonly ndc = new THREE.Vector2();
  /** Scratch for `screenPoint`. Never read between calls. */
  private readonly screenProbe = new THREE.Vector3();

  private state: DistrictInteractionState = { type: 'idle' };

  /** Latest pointer position, consumed at most once per frame. */
  private pointerClientX = 0;
  private pointerClientY = 0;
  private hoverDirty = false;
  private readonly hoverSupported: boolean;
  private enabled = true;

  /**
   * Pointer sequence that cancelled a flight. Its pointerup must not activate
   * anything: the press was a "stop", not a "choose".
   */
  private suppressedPointerId: number | null = null;

  /** Where the current pointer sequence began, to tell a tap from a drag. */
  private press: { id: number; x: number; y: number; touch: boolean } | null = null;

  /**
   * The detail-scroll gesture, while one is claimed.
   *
   * `tookControl` records whether WE called `beginExternalControl`, so releasing
   * cannot hand the rig back on behalf of a flight that took it first.
   */
  private scrollGesture: { id: number; lastY: number; tookControl: boolean } | null = null;

  private readonly framingMissWarned = new Set<string>();

  constructor(deps: DistrictInteractionDeps) {
    if (deps.buildings.meshes.length === 0) {
      throw new Error(`[district] "${deps.districtId}" has no buildings.`);
    }
    this.deps = deps;
    this.cursorKey = `district:${deps.districtId}`;
    this.group.name = `District:${deps.districtId}`;

    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

    this.highlight = new DistrictHighlight(
      deps.buildings,
      deps.groundPlaneHeight,
      CLUSTER_HIGHLIGHT,
      deps.reducedMotion,
    );
    this.group.add(this.highlight.group);

    this.flight = new CameraFlight(
      deps.rig,
      {
        resolveBounds: deps.resolveBounds,
        onComplete: () => this.onFlightSettled(),
        onCancel: () => this.onFlightSettled(),
      },
      deps.reducedMotion,
    );

    // Only the cluster's own meshes and its proxy are ever raycast — never the
    // Scene. The proxy lives on its own layer, so the raycaster has to opt in.
    this.pickables = [...deps.buildings.meshes, this.highlight.proxy];
    this.raycaster.layers.enable(0);
    this.raycaster.layers.enable(INTERACTION_LAYER);

    // Capture phase so a press that cancels a flight is seen before anything
    // else acts on it. It does NOT run before `DragPanController`, which listens
    // on the same canvas and registered first — at the target node, listeners
    // fire in registration order whatever their capture flag. That is why the
    // detail-scroll gesture takes external control rather than trying to stop
    // propagation, which on a shared target cannot work.
    deps.canvas.addEventListener('pointerdown', this.onPointerDownCapture, { capture: true });
    deps.canvas.addEventListener('pointermove', this.onPointerMove);
    deps.canvas.addEventListener('pointerup', this.onPointerUp);
    deps.canvas.addEventListener('pointercancel', this.onPointerCancel);
    // Non-passive: it calls preventDefault while the detail copy owns the wheel.
    // Safe beside `createNavigationInput`'s window-level handler, which is the
    // app's only other one and already stands down while a district is engaged.
    deps.canvas.addEventListener('wheel', this.onWheel, { passive: false });
    window.addEventListener('keydown', this.onKeyDown);
    // See onWindowPointerRelease. Passive, because it only reads.
    window.addEventListener('pointerup', this.onWindowPointerRelease, {
      capture: true,
      passive: true,
    });
    window.addEventListener('pointercancel', this.onWindowPointerRelease, {
      capture: true,
      passive: true,
    });
  }

  get object3D(): THREE.Object3D {
    return this.group;
  }

  /**
   * Input gate, for while another experience is showing.
   *
   * These listeners are on the SHARED canvas and the raycast is against this
   * district's own meshes, so an Earth click landing where the hidden city
   * happens to be would open the district and fly Murcia's camera. Frozen state
   * that a stray click can still move is not frozen.
   */
  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      this.hoverDirty = false;
      this.suppressedPointerId = null;
      // The press goes with them. A pointer that is down when this district is
      // switched off has already been abandoned; leaving it on the books would
      // outlive the whole visit to the other world.
      this.press = null;
      this.releaseScrollGesture();
    }
  }

  getState(): DistrictInteractionState {
    return this.state;
  }

  /**
   * True while this district holds the viewer's attention.
   *
   * The application reads this (aggregated by
   * `MurciaExperience.hasFocusedDistrict`) to stand global scene navigation
   * down — you close the district before you leave the city (`adr/009`).
   *
   * `hovering` is deliberately NOT engaged. It is re-resolved every frame from
   * the pointer position, so including it would make the navigation rail flicker
   * as the pointer crossed a building — hovering is not attention, it is
   * proximity.
   */
  get isEngaged(): boolean {
    return this.state.type === 'entering' || this.state.type === 'open';
  }

  /** True while the flight owns the rig — the caller must not tick the controller. */
  get isFlying(): boolean {
    return this.flight.isPlaying;
  }

  /**
   * Where the first building is on screen, in client coordinates.
   *
   * A test seam, exposed on the debug flag by the caller exactly as the blog
   * building's is. An e2e round trip has to TAP a building, and where one sits
   * depends on the camera pose and on the GLB — a hardcoded point would turn a
   * test of this district's behaviour into a test of the city's layout that
   * breaks on the next re-export.
   *
   * Null when the building is behind the camera or off screen, which the caller
   * must treat as a failed precondition rather than as a coordinate.
   */
  screenPoint(): { x: number; y: number } | null {
    const point = worldToClient(
      this.canvasRect(),
      this.deps.camera,
      this.deps.buildings.center,
      this.screenProbe,
    );
    return point === null ? null : { x: point.x, y: point.y };
  }

  // --- Frame ----------------------------------------------------------------

  update(deltaTime: number): void {
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.resolveHover();
    }

    this.flight.update(deltaTime);
    this.highlight.update(deltaTime);
  }

  // --- State ----------------------------------------------------------------

  /**
   * Applies an authoritative snapshot: the camera on an activity edge, and the
   * building highlights on every change.
   *
   * Called by whoever owns the subscription rather than subscribing here, so
   * that the display, the flow and this class are updated in one known order
   * from one place instead of racing three independent listeners.
   */
  applySnapshot(snapshot: DistrictSnapshot): void {
    const wasActive = this.isEngaged;

    if (snapshot.districtActive) {
      if (!wasActive) {
        this.setInteractionState({ type: 'entering' });
        this.beginEntry();
      } else if (this.state.type === 'open') {
        this.setInteractionState({ type: 'open', serviceIndex: snapshot.activeServiceIndex });
      }
    } else if (wasActive) {
      this.setInteractionState({ type: 'idle' });
      this.beginExit();
    }

    this.applyHighlights(snapshot);
  }

  private applyHighlights(snapshot: DistrictSnapshot): void {
    // The cluster lights as one, and it no longer changes with the active index:
    // there is nothing per-service left to light. Open is 'active', closed is
    // 'idle', and hover is resolved separately while closed.
    this.highlight.setState(snapshot.districtActive ? 'active' : 'idle');
  }

  /**
   * The only writer of `this.state`. Assignment goes through here so an
   * engagement flip is a semantic event the outside can subscribe to
   * (`onEngagedChange`), not something it has to poll for.
   */
  private setInteractionState(next: DistrictInteractionState): void {
    const wasEngaged = this.isEngaged;
    this.state = next;
    if (this.isEngaged !== wasEngaged) this.deps.onEngagedChange?.();
  }

  // --- Camera ---------------------------------------------------------------

  private beginEntry(): void {
    // `resolveHover` stands down once engaged, so a hover held from the press
    // that got here would never be retracted and the pointing hand would stay up
    // for as long as the district is open.
    this.deps.cursor.request(this.cursorKey, '');
    this.deps.controller.beginExternalControl();
    this.flight.playTo(this.computeDestination());
  }

  private beginExit(): void {
    if (this.flight.isPlaying) this.flight.cancel();

    // Deliberately no flight back for FOCUS or YAW: returning the view discards
    // wherever the viewer chose to be, and reads as the interface undoing their
    // navigation.
    //
    // Distance is not like that, and the asymmetry is the point. It was never
    // user state to preserve — the viewer did not choose it, entering the
    // district did — and with the zoom band gone (`adr/009`) there is no way to
    // undo it by hand. Leaving them dollied in with no way out is the one
    // outcome worse than moving the camera on a close.
    if (this.deps.rig.getDistanceScale() !== 1) {
      this.deps.controller.beginExternalControl();
      this.flight.playTo({
        x: this.deps.rig.focus.x,
        z: this.deps.rig.focus.z,
        yawDegrees: null,
        distanceScale: 1,
      });
    }
  }

  /**
   * Where to fly when the district opens: the plaza, centred.
   *
   * ONE destination for the whole district, not one per building. The display
   * hangs above the plaza and is what the visitor reads, so the camera settles
   * once and stays there while they page through the services — a flight per
   * service would move the world under a UI that had not moved.
   *
   * There is no DOM panel to frame around any more, so the target NDC is simply
   * the centre. `unobstructedCenterNdc` is still the thing that says so, rather
   * than a hardcoded `(0, 0)`, because it is where that decision lives.
   */
  private computeDestination(): FlightDestination {
    const { binding } = this.deps;
    const target = { x: this.deps.districtCenter.x, z: this.deps.districtCenter.z };
    const yawDegrees = binding.approachYawDegrees;

    // Clamped rather than trusted, and never above 1. Outward is the direction
    // whose ground footprint outgrows the terrain skirt, and only the range from
    // the floor up to rest is proven safe (`checks/footprint.ts`).
    const distanceScale =
      binding.focusDistanceScale === null
        ? null
        : Math.min(
            1,
            Math.max(this.deps.focusFlight.minDistanceScale, binding.focusDistanceScale),
          );

    const ndc = unobstructedCenterNdc(this.canvasRect(), null);

    // Framed against the pose the flight will ARRIVE at, not the one it leaves
    // from. The framing solve places the target at a chosen NDC by moving the
    // focus, and how far the focus has to move depends on the distance — so
    // solving against the current distance and then dollying somewhere else
    // lands the district off by the ratio between them.
    const arrivalPose =
      distanceScale === null
        ? this.deps.getPose()
        : scalePoseDistance(this.deps.rig.getPose(), distanceScale);

    const framed = computeFramedFocus({
      pose: arrivalPose,
      aspect: this.deps.getAspect(),
      yawDegrees: yawDegrees ?? this.deps.rig.getAzimuthDegrees(),
      groundPlaneHeight: this.deps.groundPlaneHeight,
      target,
      ndc,
    });

    // A near-horizon NDC can miss the ground plane. Falling back to the unframed
    // centre is worse framing but never a wrong position. Warned once, so it
    // reports without becoming noise.
    if (!framed && !this.framingMissWarned.has(this.deps.districtId)) {
      this.framingMissWarned.add(this.deps.districtId);
      console.warn(
        `[district] ${this.deps.districtId}: the framing ray missed the ground plane, ` +
          'so the district is centred by fallback. Usually means the approach ' +
          'distance is too close for this viewport.',
      );
    }

    return { ...(framed ?? target), yawDegrees, distanceScale };
  }

  private onFlightSettled(): void {
    this.deps.controller.endExternalControl({ adoptRigState: true });
    if (this.state.type === 'entering') {
      this.setInteractionState({
        type: 'open',
        serviceIndex: this.deps.state.get().activeServiceIndex,
      });
    }
  }

  // --- Picking --------------------------------------------------------------

  private resolveHover(): void {
    if (!this.hoverSupported) return;
    // Hover during a drag would fight the gesture, and during a flight the
    // camera is moving under a stationary pointer.
    if (this.deps.controller.isDragging || this.flight.isPlaying) return;

    if (this.deps.state.get().districtActive) {
      // Open: the display owns hover entirely, and nothing else is pickable.
      const control = this.controlUnderPointer(this.pointerClientX, this.pointerClientY);
      this.deps.display.setHover(control);
      this.deps.cursor.request(this.cursorKey, control && control !== 'detail-viewport' ? 'pointer' : '');
      return;
    }

    if (this.state.type === 'entering') return;

    const hovering = this.pickAt(this.pointerClientX, this.pointerClientY);
    const wasHovering = this.state.type === 'hovering';
    if (!!hovering === wasHovering) return;

    if (hovering) {
      this.setInteractionState({ type: 'hovering' });
      this.deps.cursor.request(this.cursorKey, 'pointer');
    } else {
      this.setInteractionState({ type: 'idle' });
      this.deps.cursor.request(this.cursorKey, '');
    }
    // The whole cluster lights as one: it is one entry target, and lighting a
    // single building would promise a selection that does not exist.
    this.highlight.setState(hovering ? 'hover' : 'idle');
  }

  /** Whether the cluster is under this point. It is one target, so this is a yes/no. */
  private pickAt(clientX: number, clientY: number): boolean {
    const rect = this.canvasRect();
    if (rect.width === 0 || rect.height === 0) return false;

    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.pickables, false, this.hits);
    return this.hits.length > 0;
  }

  /**
   * Which display control is under the pointer, if any.
   *
   * `intersectObject(panel, false)` — NON-recursive, and that is load-bearing.
   * The shell plate is a child of the panel, and `ExtrudeGeometry` gives its rim
   * walls a `uv` of (position along the contour, depth), which is meaningless
   * here. A recursive test would return those and the controls would fire at
   * wrong positions rather than fail loudly.
   */
  private controlUnderPointer(clientX: number, clientY: number): DisplayControl | null {
    const rect = this.canvasRect();
    if (rect.width === 0 || rect.height === 0) return null;

    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObject(this.deps.display.panel, false, this.hits);

    const hit = this.hits[0];
    if (!hit?.uv) return null;

    // The panel's UVs span the whole plane; the controls are authored against
    // the readable CORE inside it. One conversion, from the same uniform the
    // shader draws with, so the two cannot disagree.
    const inset = this.deps.display.panelMaterial.uniforms['uCoreInset'].value as number;
    const x = (hit.uv.x - 0.5) / inset + 0.5;
    const y = (hit.uv.y - 0.5) / inset + 0.5;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;

    // Rects are authored top-down, the way the copy reads; UVs run bottom-up.
    return controlAt(x, 1 - y, this.deps.state.get().detailOpen);
  }

  private canvasRect(): ScreenRect {
    const rect = this.deps.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  // --- Input ----------------------------------------------------------------

  private activate(control: DisplayControl): void {
    const state = this.deps.state;
    switch (control) {
      case 'previous':
        state.previousService();
        break;
      case 'next':
        state.nextService();
        break;
      case 'detail':
        state.openDetail();
        break;
      case 'close':
        state.closeDetail();
        break;
      case 'back':
        state.exitDistrict();
        break;
      case 'detail-viewport':
        // A reading area, not a button. Taps on it do nothing.
        break;
    }
  }

  private releaseScrollGesture(): void {
    const gesture = this.scrollGesture;
    this.scrollGesture = null;
    if (!gesture?.tookControl) return;
    // Only if a flight has not taken the rig in the meantime — handing it back
    // on the flight's behalf would drop it mid-air.
    if (this.flight.isPlaying) return;
    this.deps.controller.endExternalControl({ adoptRigState: true });
  }

  private readonly onPointerDownCapture = (event: PointerEvent): void => {
    if (!this.enabled) return;
    if (this.press === null) {
      this.press = {
        id: event.pointerId,
        x: event.clientX,
        y: event.clientY,
        touch: event.pointerType === 'touch',
      };
    }

    if (this.flight.isPlaying) {
      // Any press interrupts. Locking the user out of a one-second animation is
      // the more annoying failure.
      this.flight.cancel();
      this.suppressedPointerId = event.pointerId;
      return;
    }

    const snapshot = this.deps.state.get();
    if (!snapshot.districtActive) return;

    const control = this.controlUnderPointer(event.clientX, event.clientY);
    this.deps.display.setPressed(control);

    if (snapshot.detailOpen && control === 'detail-viewport' && this.scrollGesture === null) {
      // Claim the gesture before it moves. `DragPanController` listens on this
      // same canvas and registered first, so its pointerdown has already run —
      // `beginExternalControl` releases the pointers it captured and stops it
      // writing the rig, which is the only mechanism that works on a shared
      // target. Reading and panning cannot both happen, and reading wins
      // (plan 003 §13).
      const tookControl = !this.deps.controller.isExternallyControlled;
      if (tookControl) this.deps.controller.beginExternalControl();
      this.scrollGesture = { id: event.pointerId, lastY: event.clientY, tookControl };
    }
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;

    const gesture = this.scrollGesture;
    if (gesture && gesture.id === event.pointerId) {
      // Natural direction: dragging UP moves the copy up and reveals what comes
      // next, which is what every touch surface does. The lab drove this the
      // other way and never had a browser to try it in.
      this.deps.display.scrollDetail((gesture.lastY - event.clientY) * DRAG_SCROLL_SCALE);
      gesture.lastY = event.clientY;
      return;
    }

    // Coalesced to one raycast per frame in update(); a pointermove burst must
    // not turn into a burst of raycasts.
    this.hoverDirty = true;
  };

  /**
   * Forgets a pointer sequence, whatever ended it.
   *
   * Every listener that can learn a sequence is over comes through here, and
   * none of them may skip it. `press` is the reason: a press is only recorded
   * while none is on the books (see `onPointerDownCapture`), so one that is
   * never cleared is not a stale record — it is a permanent refusal, and every
   * later tap dies at the `!press` guard in `onPointerUp` with nothing to see.
   */
  private endPointerSequence(pointerId: number): void {
    if (this.suppressedPointerId === pointerId) this.suppressedPointerId = null;
    if (this.press?.id === pointerId) this.press = null;
    if (this.scrollGesture?.id === pointerId) this.releaseScrollGesture();
    this.deps.display.setPressed(null);
  }

  private readonly onPointerUp = (event: PointerEvent): void => {
    const wasScrolling = this.scrollGesture?.id === event.pointerId;
    if (wasScrolling) this.releaseScrollGesture();

    const suppressed = this.suppressedPointerId === event.pointerId;
    this.suppressedPointerId = null;

    const press = this.press?.id === event.pointerId ? this.press : null;
    if (press) this.press = null;

    this.deps.display.setPressed(null);

    // The gate comes AFTER the bookkeeping above, and the order is the fix for
    // a defect this class shipped with. A release ends its sequence whether or
    // not this district is listening to it; returning first left `press` holding
    // a pointer that had already lifted, and a press is never replaced while one
    // is on the books. On mobile the scene swap out of Murcia is a PINCH, so
    // `setEnabled(false)` routinely lands with the fingers still on the glass —
    // which is why the district went permanently deaf to taps there and never on
    // a desktop, where the same swap comes from the wheel with no pointer down.
    if (!this.enabled) return;

    // The press that stopped a flight also produces a pointerup, and the tap
    // guard below only tests the drag threshold — so a sub-threshold tap would
    // otherwise fall straight through into acting again.
    if (suppressed || wasScrolling) return;
    if (event.button !== 0) return;

    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    this.hoverDirty = true;

    if (this.deps.controller.isDragging) return;
    // Measured against the press, independently of the controller: the release
    // of a drag is not a tap on whatever it happens to end over. And a release
    // with no press on record — the browser cancelled the pointer mid-gesture —
    // is not a tap either.
    if (!press) return;
    const threshold = press.touch ? this.deps.tapThresholdPx.touch : this.deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > threshold) return;

    if (this.deps.state.get().districtActive) {
      const control = this.controlUnderPointer(event.clientX, event.clientY);
      if (control) this.activate(control);
      return;
    }

    // Closed: any building opens the district. They carry no service meaning.
    if (this.pickAt(event.clientX, event.clientY)) this.deps.state.enterDistrict();
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    this.endPointerSequence(event.pointerId);
  };

  /**
   * A release this canvas was never going to be told about.
   *
   * A touch pointer holds implicit capture on the element it landed on, so its
   * release normally comes back here whatever it ends up over. That capture is
   * not guaranteed to last the gesture: `beginExternalControl` releases it, and
   * the reading claim in `onPointerDownCapture` calls that at pointerdown. From
   * there the release is hit-tested like any other event and belongs to whatever
   * sits above the canvas — the header's controls, an overlay, an a11y button —
   * so the listeners below never fire and the sequence is never closed.
   *
   * Capture phase on `window`, which is where and how `createNavigationInput`
   * already keeps its own contact bookkeeping. BOOKKEEPING ONLY: a release that
   * did not happen on the canvas must not activate anything, so this deliberately
   * does not share a path with `onPointerUp`, and a release that DID reach the
   * canvas is left alone for that handler to answer.
   */
  private readonly onWindowPointerRelease = (event: PointerEvent): void => {
    const target = event.target;
    if (target instanceof Node && this.deps.canvas.contains(target)) return;
    this.endPointerSequence(event.pointerId);
  };

  private readonly onWheel = (event: WheelEvent): void => {
    if (!this.enabled) return;
    const snapshot = this.deps.state.get();
    if (!snapshot.districtActive || !snapshot.detailOpen) return;
    if (this.controlUnderPointer(event.clientX, event.clientY) !== 'detail-viewport') return;

    // Claimed only over the reading area, and only while reading. Everywhere
    // else the wheel still belongs to `createNavigationInput`, which is the
    // app's single wheel owner — and which is already inert while a district is
    // engaged, so this cannot fight it.
    event.preventDefault();
    this.deps.display.scrollDetail(event.deltaY * WHEEL_SCROLL_SCALE);
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // This one is on `window`, so it fires even while Earth owns the screen.
    if (!this.enabled) return;
    if (event.key !== 'Escape') return;
    const snapshot = this.deps.state.get();
    if (!snapshot.districtActive) return;
    // One level at a time, the same order VOLVER walks.
    if (snapshot.detailOpen) this.deps.state.closeDetail();
    else this.deps.state.exitDistrict();
  };

  dispose(): void {
    const canvas = this.deps.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDownCapture, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    canvas.removeEventListener('wheel', this.onWheel);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('pointerup', this.onWindowPointerRelease, { capture: true });
    window.removeEventListener('pointercancel', this.onWindowPointerRelease, { capture: true });
    this.deps.cursor.request(this.cursorKey, '');
    this.releaseScrollGesture();

    if (this.flight.isPlaying) this.flight.cancel();
    this.highlight.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
