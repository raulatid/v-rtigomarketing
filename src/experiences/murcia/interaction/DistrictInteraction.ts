import * as THREE from 'three';
import type { DistrictContent, Service } from '../../../content/types';
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
import { DistrictPanel } from '../ui/districtPanel';
import type { ServicePanelView } from '../ui/districtPanel';
import { DistrictLabel } from '../ui/districtLabel';
import type { CursorManager } from '../../../interaction/cursorManager';

export type DistrictInteractionState =
  | { type: 'idle' }
  | { type: 'hovering'; serviceId: string }
  | { type: 'focusing'; serviceId: string }
  | { type: 'open'; serviceId: string };

/** One service building, resolved. Supplied in tour order. */
export interface ServiceSiteInput {
  service: Service;
  binding: ServiceBuildingBinding;
  lookup: DistrictLookup;
}

export interface DistrictInteractionDeps {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  controller: DragPanController;
  /** Shared camera decision for the district (per-building overrides apply on top). */
  binding: DistrictSceneBinding;
  /** The label feeds the panel eyebrow; `services[]` is the tour order. */
  content: DistrictContent;
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
   * Tap tolerance per pointer type, the same numbers the drag controller uses
   * (`NavigationConfig.dragThresholdPx` / `touchDragThresholdPx`). Measured here
   * as well, not only read off the controller: a browser can cancel or
   * recapture a pointer mid-gesture, and a release the controller has already
   * forgotten must still not count as a tap on whatever it landed on.
   */
  tapThresholdPx: { mouse: number; touch: number };
  reducedMotion: boolean;
  /**
   * Fired when `isEngaged` flips, either way. Carries no payload on purpose:
   * the consumer re-reads the aggregate it cares about
   * (`MurciaExperience.hasFocusedDistrict`) rather than being handed a copy of
   * this district's state. The application uses it to re-derive navigation
   * availability the moment attention changes, instead of on the next gesture.
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
  label: DistrictLabel;
}

/**
 * Per-building highlight sizing. The defaults were judged for a two-building
 * cluster; these buildings stand 15–40 m apart, so the proxy padding that made
 * a cluster's gaps clickable would make neighbouring proxies overlap and turn
 * a tap between two buildings into a coin toss.
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

/**
 * Owns the district's interaction state and every transition between states.
 *
 * ONE interaction for the whole district, holding N **sites** — one per
 * service building. Not one instance per building: each instance would own a
 * `CameraFlight` and a set of canvas listeners, so selecting building B while
 * A is open would have two flights writing the rig in the same frame, which is
 * exactly the failure the external-control handover exists to prevent. One
 * raycaster, one flight, one panel; the sites are what the state names.
 *
 * Kept out of `MurciaExperience` deliberately. The awkward cases here — a click
 * arriving mid-flight, the panel closing before the camera lands, a resize
 * during a transition, a swap while a flight is in the air — are exactly the
 * ones that turn into contradictory behaviour when the state is spread across
 * five modules that each hold a piece. `MurciaExperience` keeps composition,
 * ticking and disposal.
 */
export class DistrictInteraction {
  private readonly deps: DistrictInteractionDeps;
  private readonly sites: Site[];
  private readonly siteById = new Map<string, Site>();
  /** Every pickable object → its site, so one raycast answers "which building". */
  private readonly siteByObject = new Map<THREE.Object3D, Site>();
  private readonly group = new THREE.Group();

  private readonly flight: CameraFlight;
  private readonly panel: DistrictPanel;

  /** Namespaced so this district retracting its hover cannot clear another's. */
  private readonly cursorKey: string;

  private readonly raycaster = new THREE.Raycaster();
  private readonly pickables: THREE.Object3D[];
  private readonly hits: THREE.Intersection[] = [];
  private readonly ndc = new THREE.Vector2();
  private readonly projected = new THREE.Vector3();

  private state: DistrictInteractionState = { type: 'idle' };

  /** Latest pointer position, consumed at most once per frame. */
  private pointerClientX = 0;
  private pointerClientY = 0;
  private hoverDirty = false;
  private readonly hoverSupported: boolean;
  /**
   * Whether this district accepts input. Defaults to true so the interaction is
   * complete on its own; `MurciaExperience` seeds it from its active flag at
   * construction, because districts are built during the Earth intro — while
   * the city is still hidden.
   */
  private enabled = true;

  /**
   * Pointer sequence that cancelled a flight. Its pointerup must not select or
   * dismiss anything: the press was a "stop", not a "choose".
   */
  private suppressedPointerId: number | null = null;

  /** Where the current pointer sequence began, to tell a tap from a drag. */
  private press: { id: number; x: number; y: number; touch: boolean } | null = null;

  /** One warning per building, not one per selection. See computeDestination. */
  private readonly framingMissWarned = new Set<string>();

  constructor(deps: DistrictInteractionDeps) {
    if (deps.sites.length === 0) {
      throw new Error(`[district] "${deps.content.id}" has no sites.`);
    }
    this.deps = deps;
    this.cursorKey = `district:${deps.content.id}`;
    this.group.name = `District:${deps.content.id}`;

    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

    this.sites = deps.sites.map((input, index) => {
      const highlight = new DistrictHighlight(
        input.lookup,
        deps.groundPlaneHeight,
        SITE_HIGHLIGHT,
        deps.reducedMotion,
      );
      // Created in tour order, so tab order IS tour order.
      const label = new DistrictLabel(deps.container, input.service.title, {
        onActivate: () => this.select(input.service.id),
      });
      const site: Site = {
        index,
        service: input.service,
        binding: input.binding,
        lookup: input.lookup,
        highlight,
        label,
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

    this.panel = new DistrictPanel(deps.container, deps.content.id, {
      onClose: () => this.close(),
      onStep: (direction) => this.step(direction),
    });

    // Only the sites' own meshes and proxies are ever raycast — never the
    // Scene. The proxies live on their own layer, so the raycaster has to opt in.
    this.pickables = Array.from(this.siteByObject.keys());
    this.raycaster.layers.enable(0);
    this.raycaster.layers.enable(INTERACTION_LAYER);

    // Capture phase, so this runs before DragPanController's own pointerdown
    // listener. A press that cancels a flight then falls through and starts the
    // drag in the same event — no synthetic re-dispatch, no dead first gesture.
    deps.canvas.addEventListener('pointerdown', this.onPointerDownCapture, { capture: true });
    deps.canvas.addEventListener('pointermove', this.onPointerMove);
    deps.canvas.addEventListener('pointerup', this.onPointerUp);
    deps.canvas.addEventListener('pointercancel', this.onPointerCancel);
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
   * happens to be would select a building and fly Murcia's camera. Frozen state
   * that a stray click can still move is not frozen.
   *
   * The listeners are left attached rather than removed: `dispose()` owns
   * teardown, and attach/detach cycles on every warp would be one more pairing
   * to get wrong. Panels and flights already in progress are untouched — this
   * only stops NEW input, exactly as `update()` only stops new frames.
   */
  setEnabled(next: boolean): void {
    this.enabled = next;
    if (!next) {
      // Resolved in update(), which is about to stop — a hover held now could
      // never be retracted.
      this.hoverDirty = false;
      this.suppressedPointerId = null;
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
   * The only writer of `this.state`. Assignment goes through here so an
   * engagement flip is a semantic event the outside can subscribe to
   * (`onEngagedChange`), not something it has to poll for — the navigation
   * rail's visibility derives from it.
   */
  private setState(next: DistrictInteractionState): void {
    const wasEngaged = this.isEngaged;
    this.state = next;
    if (this.isEngaged !== wasEngaged) this.deps.onEngagedChange?.();
  }

  /**
   * True while this district holds the viewer's attention: flying to one of
   * its buildings, or open on one.
   *
   * The application reads this (aggregated by `MurciaExperience.hasFocusedDistrict`)
   * to stand global scene navigation down — you close the district before you leave
   * the city (`adr/009`). It is a boolean rather than the state itself because the
   * four-state union is this class's mechanics and nothing outside needs to name a
   * transition.
   *
   * `hovering` is deliberately NOT engaged. It is re-resolved every frame from the
   * pointer position, so including it would make the navigation rail flicker on and
   * off as the pointer crossed a building — and hovering is not attention, it is
   * proximity.
   */
  get isEngaged(): boolean {
    return this.state.type === 'focusing' || this.state.type === 'open';
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
    this.updateLabelPositions();
  }

  // --- Transitions ----------------------------------------------------------

  /** The engaged site, if any. */
  private engagedSite(): Site | null {
    if (this.state.type !== 'focusing' && this.state.type !== 'open') return null;
    return this.siteById.get(this.state.serviceId) ?? null;
  }

  private select(serviceId: string): void {
    const site = this.siteById.get(serviceId);
    if (!site) return;
    // Re-selecting the building that is already open is a no-op rather than a
    // second flight to the same place.
    const current = this.engagedSite();
    if (current === site) return;

    if (current) {
      // SWAP: the viewer moved from one building to another with the panel up.
      // The old site stands down; the panel keeps its stop and focus; the
      // flight is simply re-aimed (the controller is already under external
      // control, and beginExternalControl is idempotent). Distance is NOT
      // touched — the rig is already at the district's approach scale, so the
      // new destination's delta is zero and the camera glides sideways.
      current.highlight.setState('idle');
      current.label.setVisible(!this.hoverSupported);
      this.panel.swap(this.viewFor(site), this.deps.reducedMotion);
    } else {
      this.panel.show(this.viewFor(site), this.deps.reducedMotion);
    }

    this.setState({ type: 'focusing', serviceId });
    // Immediate acknowledgement: the highlight and the panel both start now,
    // while the camera is still moving.
    site.highlight.setState('active');
    site.label.setVisible(false);
    // `resolveHover` stands down for focusing and open, so a hover held from the
    // press that got here would never be retracted and the pointing hand would
    // stay up for as long as the panel is. Released here; `close()` returns to
    // idle and the next pointer move re-establishes it if it still applies.
    this.deps.cursor.request(this.cursorKey, '');

    // The panel's rectangle is only meaningful once it is laid out, and the
    // framing is computed from that measured rectangle rather than from the
    // breakpoint — so a CSS width change cannot silently break the composition.
    const destination = this.computeDestination(site);

    this.deps.controller.beginExternalControl();
    this.flight.playTo(destination);
  }

  /** Prev/next from the panel. Wraps at both ends. */
  private step(direction: -1 | 1): void {
    const current = this.engagedSite();
    if (!current) return;
    const count = this.sites.length;
    const next = this.sites[(current.index + direction + count) % count];
    if (next) this.select(next.service.id);
  }

  private close(): void {
    if (this.state.type === 'idle') return;
    const current = this.engagedSite();
    this.setState({ type: 'idle' });
    this.panel.hide();
    if (current) {
      current.highlight.setState('idle');
      current.label.setVisible(!this.hoverSupported);
    }
    if (this.flight.isPlaying) this.flight.cancel();

    // Still deliberately no flight back for FOCUS or YAW: returning the view
    // discards wherever the viewer chose to be, and reads as the interface undoing
    // their navigation.
    //
    // Distance is not like that, and the asymmetry is the point. It was never user
    // state to preserve — the viewer did not choose it, selecting a building did —
    // and with the zoom band gone (`adr/009`) there is no way to undo it by hand.
    // Leaving them dollied in with no way out is the one outcome worse than moving
    // the camera on a close.
    //
    // A flight rather than a snap, and it takes external control for the same reason
    // `select()` does: two systems writing the rig in one frame is the failure this
    // whole handover exists to prevent.
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

  private viewFor(site: Site): ServicePanelView {
    const count = this.sites.length;
    const prev = this.sites[(site.index - 1 + count) % count]!;
    const next = this.sites[(site.index + 1) % count]!;
    return {
      eyebrow: `${this.deps.content.label} · ${site.index + 1} / ${count}`,
      title: site.service.title,
      body: site.service.body,
      prevTitle: prev.service.title,
      nextTitle: next.service.title,
    };
  }

  /**
   * Where to fly, framed into the part of the canvas the panel does not cover.
   *
   * Computed against a detached rig inside `computeFramedFocus`, so the live rig
   * is never moved to take the measurement — doing that would jump the camera
   * for a frame and fire the yaw-changed side effects on the way through.
   */
  private computeDestination(site: Site): FlightDestination {
    const { binding } = this.deps;
    const target = { x: site.lookup.center.x, z: site.lookup.center.z };
    const yawDegrees = site.binding.approachYawDegrees ?? binding.approachYawDegrees;
    const requestedScale = site.binding.focusDistanceScale ?? binding.focusDistanceScale;

    // Clamped rather than trusted, and never above 1. Outward is the direction whose
    // ground footprint outgrows the terrain skirt, and only the range from the floor
    // up to rest is proven safe (`checks/footprint.ts`).
    const distanceScale =
      requestedScale === null
        ? null
        : Math.min(1, Math.max(this.deps.focusFlight.minDistanceScale, requestedScale));

    const canvasRect = this.canvasRect();
    const ndc = unobstructedCenterNdc(canvasRect, this.panel.getObstructionRect());

    // Framed against the pose the flight will ARRIVE at, not the one it leaves from.
    // The framing solve places the building at a chosen NDC by moving the focus, and
    // how far the focus has to move depends on the distance — so solving it against
    // the current distance and then dollying somewhere else lands the building off
    // the panel-free region by the ratio between them.
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
    // centre is worse framing but never a wrong position.
    //
    // Said out loud, because flying closer makes the miss MORE likely: a lower camera
    // puts the panel-free NDC nearer the horizon, and a silent fallback would degrade
    // the composition with nothing to say it had. Warned once per building rather
    // than per selection, so it reports without becoming noise.
    if (!framed && !this.framingMissWarned.has(site.service.id)) {
      this.framingMissWarned.add(site.service.id);
      console.warn(
        `[district] ${this.deps.content.id}/${site.service.id}: the framing ray missed ` +
          'the ground plane, so the building is centred rather than framed clear of ' +
          'the panel. Usually means the approach distance is too close for this viewport.',
      );
    }

    return { ...(framed ?? target), yawDegrees, distanceScale };
  }

  private onFlightSettled(): void {
    this.deps.controller.endExternalControl({ adoptRigState: true });
    if (this.state.type === 'focusing') {
      this.setState({ type: 'open', serviceId: this.state.serviceId });
    }
  }

  // --- Picking --------------------------------------------------------------

  private resolveHover(): void {
    if (!this.hoverSupported) return;
    // Hover during a drag would fight the gesture, and during a flight the
    // camera is moving under a stationary pointer.
    if (this.deps.controller.isDragging || this.flight.isPlaying) return;
    if (this.state.type === 'focusing' || this.state.type === 'open') return;

    const hovering = this.pickAt(this.pointerClientX, this.pointerClientY);
    const previous =
      this.state.type === 'hovering' ? (this.siteById.get(this.state.serviceId) ?? null) : null;
    if (hovering === previous) return;

    // Leave the old one and enter the new one in the same frame, so crossing
    // straight from A to B never shows two lit buildings or none.
    if (previous) {
      previous.highlight.setState('idle');
      previous.label.setHovered(false);
    }
    if (hovering) {
      this.setState({ type: 'hovering', serviceId: hovering.service.id });
      hovering.highlight.setState('hover');
      hovering.label.setHovered(true);
      this.deps.cursor.request(this.cursorKey, 'pointer');
    } else {
      this.setState({ type: 'idle' });
      this.deps.cursor.request(this.cursorKey, '');
    }
  }

  private pickAt(clientX: number, clientY: number): Site | null {
    const rect = this.canvasRect();
    if (rect.width === 0 || rect.height === 0) return null;

    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.pickables, false, this.hits);
    // Hits arrive sorted by distance; the nearest decides.
    const first = this.hits[0];
    return first ? (this.siteByObject.get(first.object) ?? null) : null;
  }

  private canvasRect(): ScreenRect {
    const rect = this.deps.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  private updateLabelPositions(): void {
    const rect = this.canvasRect();
    for (const site of this.sites) {
      const bounds = site.lookup.bounds;
      this.projected.set(
        site.lookup.center.x,
        bounds.isEmpty() ? this.deps.groundPlaneHeight : bounds.max.y + 4,
        site.lookup.center.z,
      );
      this.projected.project(this.deps.camera);

      const onScreen =
        this.projected.z < 1 &&
        this.projected.x >= -1 &&
        this.projected.x <= 1 &&
        this.projected.y >= -1 &&
        this.projected.y <= 1;

      site.label.setPosition(
        rect.left + ((this.projected.x + 1) / 2) * rect.width,
        rect.top + ((1 - this.projected.y) / 2) * rect.height,
        onScreen,
      );
    }
  }

  // --- Input ----------------------------------------------------------------

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
    if (!this.flight.isPlaying) return;
    // Any press interrupts. Locking the user out of a one-second animation is
    // the more annoying failure.
    this.flight.cancel();
    this.suppressedPointerId = event.pointerId;
  };

  private readonly onPointerMove = (event: PointerEvent): void => {
    if (!this.enabled) return;
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    // Coalesced to one raycast per frame in update(); a pointermove burst must
    // not turn into a burst of raycasts.
    this.hoverDirty = true;
  };

  private readonly onPointerUp = (event: PointerEvent): void => {
    if (!this.enabled) return;
    const suppressed = this.suppressedPointerId === event.pointerId;
    this.suppressedPointerId = null;
    // The press that stopped a flight also produces a pointerup, and the click
    // guard below only tests the drag threshold — so a sub-threshold tap would
    // otherwise fall straight through into selecting and flying again.
    if (suppressed) return;

    const press = this.press?.id === event.pointerId ? this.press : null;
    if (press) this.press = null;

    if (event.button !== 0) return;
    // A drag that began over a building left its hover lit — resolveHover
    // stands down for the whole drag, and nothing moves the pointer afterwards.
    // Re-resolve on the next frame so the label and glow follow the pointer,
    // not the press.
    this.pointerClientX = event.clientX;
    this.pointerClientY = event.clientY;
    this.hoverDirty = true;
    if (this.deps.controller.isDragging) return;
    // Measured against the press, independently of the controller: the release
    // of a drag is not a tap on whatever building it happens to end over. And a
    // release with no press on record — the browser cancelled the pointer
    // mid-gesture, or the press landed on a label — is not a tap either.
    if (!press) return;
    const threshold = press.touch ? this.deps.tapThresholdPx.touch : this.deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - press.x, event.clientY - press.y) > threshold) return;

    const site = this.pickAt(event.clientX, event.clientY);
    if (site) {
      this.select(site.service.id);
    } else if (this.state.type === 'open' || this.state.type === 'focusing') {
      this.close();
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.suppressedPointerId === event.pointerId) this.suppressedPointerId = null;
    if (this.press?.id === event.pointerId) this.press = null;
  };

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    // This one is on `window`, so it fires even while Earth owns the screen.
    if (!this.enabled) return;
    if (event.key !== 'Escape') return;
    if (this.state.type === 'open' || this.state.type === 'focusing') this.close();
  };

  dispose(): void {
    const canvas = this.deps.canvas;
    canvas.removeEventListener('pointerdown', this.onPointerDownCapture, { capture: true });
    canvas.removeEventListener('pointermove', this.onPointerMove);
    canvas.removeEventListener('pointerup', this.onPointerUp);
    canvas.removeEventListener('pointercancel', this.onPointerCancel);
    window.removeEventListener('keydown', this.onKeyDown);
    this.deps.cursor.request(this.cursorKey, '');

    if (this.flight.isPlaying) this.flight.cancel();
    this.panel.dispose();
    for (const site of this.sites) {
      site.label.dispose();
      site.highlight.dispose();
    }
    this.group.removeFromParent();
    this.group.clear();
  }
}
