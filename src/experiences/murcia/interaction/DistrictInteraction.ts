import * as THREE from 'three';
import type { Service } from '../../../content/types';
import type {
  DistrictSceneBinding,
  ServiceBuildingBinding,
} from '../scene/cityDistrictBindings';
import type { DistrictLookup } from './resolveDistrict';
import { DistrictHighlight, INTERACTION_LAYER } from './DistrictHighlight';
import type { DistrictHighlightConfig } from './DistrictHighlight';
import { CameraFlight } from '../camera/CameraFlight';
import type { FlightDestination } from '../camera/CameraFlight';
import { scalePoseDistance } from '../camera/applyPoseToCamera';
import type { CameraRig } from '../camera/CameraRig';
import { computeFramedFocus, unobstructedCenterNdc } from '../camera/cameraFraming';
import { clientToNdc } from '../../../interaction/screenSpace';
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
  | { type: 'open'; serviceId: string };

/** One service building, resolved. Supplied in tour order. */
export interface ServiceSiteInput {
  service: Service;
  binding: ServiceBuildingBinding;
  lookup: DistrictLookup;
}

export interface DistrictInteractionDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  controller: DragPanController;
  /** The district's shared camera decision. */
  binding: DistrictSceneBinding;
  /** At least one, in tour order. */
  sites: ServiceSiteInput[];
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

interface Site {
  /** Position in the tour, 0-based. */
  index: number;
  service: Service;
  binding: ServiceBuildingBinding;
  lookup: DistrictLookup;
  highlight: DistrictHighlight;
}

/**
 * Per-building highlight sizing. These buildings stand 15–40 m apart, so the
 * proxy padding that made a tight cluster's gaps clickable would make
 * neighbouring proxies overlap and turn a tap between two buildings into a coin
 * toss. They are one entry target now, so overlap would no longer pick the wrong
 * service — but it would still put a hover glow on a building the pointer is
 * nowhere near.
 */
const SITE_HIGHLIGHT: DistrictHighlightConfig = {
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
 * ONE interaction for the whole district, holding N **sites** — one per service
 * building. Not one instance per building: each would own a `CameraFlight` and a
 * set of canvas listeners, so two of them could write the rig in the same frame,
 * which is exactly the failure the external-control handover exists to prevent.
 * One raycaster, one flight, one display; the sites are what the state names.
 *
 * ## The buildings are not navigation
 *
 * Since plan 003 the projected display is the district's only interaction
 * surface. The buildings are one ENTRY target — a tap on any of them opens the
 * district on its first service — and after that they are scenery that reacts to
 * the active index. There is no per-building flight and no building-to-service
 * click mapping; `districtState` holds the active index and this class reads it
 * back rather than keeping its own.
 *
 * ## Two hit tests, never both at once
 *
 * Closed, the raycast is against the sites' meshes and their picking proxies.
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
  private readonly sites: Site[];
  private readonly siteById = new Map<string, Site>();
  /** Every pickable object → its site, so one raycast answers "is this the district". */
  private readonly siteByObject = new Map<THREE.Object3D, Site>();
  private readonly group = new THREE.Group();
  private readonly flight: CameraFlight;

  /** Namespaced so this district retracting its hover cannot clear another's. */
  private readonly cursorKey: string;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pickables: THREE.Object3D[];
  private readonly hits: THREE.Intersection[] = [];
  private readonly ndc = new THREE.Vector2();

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
    if (deps.sites.length === 0) {
      throw new Error(`[district] "${deps.districtId}" has no sites.`);
    }
    this.deps = deps;
    this.cursorKey = `district:${deps.districtId}`;
    this.group.name = `District:${deps.districtId}`;

    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

    this.sites = deps.sites.map((input, index) => {
      const highlight = new DistrictHighlight(
        input.lookup,
        deps.groundPlaneHeight,
        SITE_HIGHLIGHT,
        deps.reducedMotion,
      );
      const site: Site = {
        index,
        service: input.service,
        binding: input.binding,
        lookup: input.lookup,
        highlight,
      };
      this.siteById.set(input.service.id, site);
      for (const mesh of input.lookup.meshes) this.siteByObject.set(mesh, site);
      this.siteByObject.set(highlight.proxy, site);
      this.group.add(highlight.group);
      return site;
    });

    this.flight = new CameraFlight(
      deps.rig,
      {
        resolveBounds: deps.resolveBounds,
        onComplete: () => this.onFlightSettled(),
        onCancel: () => this.onFlightSettled(),
      },
      deps.reducedMotion,
    );

    // Only the sites' own meshes and proxies are ever raycast — never the
    // Scene. The proxies live on their own layer, so the raycaster has to opt in.
    this.pickables = Array.from(this.siteByObject.keys());
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
      this.releaseScrollGesture();
    }
  }

  getState(): DistrictInteractionState {
    return this.state;
  }

  /** Service ids in tour order. Exposed for tests and diagnostics. */
  get serviceIds(): string[] {
    return this.sites.map((site) => site.service.id);
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

  // --- Frame ----------------------------------------------------------------

  update(deltaTime: number): void {
    if (this.hoverDirty) {
      this.hoverDirty = false;
      this.resolveHover();
    }

    this.flight.update(deltaTime);
    for (const site of this.sites) site.highlight.update(deltaTime);
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
      const site = this.sites[snapshot.activeServiceIndex];
      const serviceId = site?.service.id ?? this.sites[0].service.id;
      if (!wasActive) {
        this.setInteractionState({ type: 'entering' });
        this.beginEntry();
      } else if (this.state.type === 'open') {
        this.setInteractionState({ type: 'open', serviceId });
      }
    } else if (wasActive) {
      this.setInteractionState({ type: 'idle' });
      this.beginExit();
    }

    this.applyHighlights(snapshot);
  }

  private applyHighlights(snapshot: DistrictSnapshot): void {
    for (const site of this.sites) {
      if (!snapshot.districtActive) {
        site.highlight.setState('idle');
        continue;
      }
      // Visual hierarchy, not a disabled state: the unselected buildings stay
      // at their idle treatment rather than being dimmed out (plan 003 §6).
      site.highlight.setState(site.index === snapshot.activeServiceIndex ? 'active' : 'idle');
    }
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
      const snapshot = this.deps.state.get();
      const site = this.sites[snapshot.activeServiceIndex] ?? this.sites[0];
      this.setInteractionState({ type: 'open', serviceId: site.service.id });
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
    // single building would promise a per-building selection that no longer
    // exists.
    for (const site of this.sites) site.highlight.setState(hovering ? 'hover' : 'idle');
  }

  private pickAt(clientX: number, clientY: number): Site | null {
    const rect = this.canvasRect();
    if (rect.width === 0 || rect.height === 0) return null;

    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.pickables, false, this.hits);
    const first = this.hits[0];
    return first ? (this.siteByObject.get(first.object) ?? null) : null;
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

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.enabled) return;

    const wasScrolling = this.scrollGesture?.id === event.pointerId;
    if (wasScrolling) this.releaseScrollGesture();

    const suppressed = this.suppressedPointerId === event.pointerId;
    this.suppressedPointerId = null;

    const press = this.press?.id === event.pointerId ? this.press : null;
    if (press) this.press = null;

    this.deps.display.setPressed(null);

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
    if (this.suppressedPointerId === event.pointerId) this.suppressedPointerId = null;
    if (this.press?.id === event.pointerId) this.press = null;
    if (this.scrollGesture?.id === event.pointerId) this.releaseScrollGesture();
    this.deps.display.setPressed(null);
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
    this.deps.cursor.request(this.cursorKey, '');
    this.releaseScrollGesture();

    if (this.flight.isPlaying) this.flight.cancel();
    for (const site of this.sites) site.highlight.dispose();
    this.group.removeFromParent();
    this.group.clear();
  }
}
