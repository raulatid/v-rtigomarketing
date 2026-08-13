import * as THREE from 'three';
import type { DistrictContent } from '../content/districts';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import type { DistrictLookup } from './resolveDistrict';
import { DistrictHighlight, INTERACTION_LAYER } from './DistrictHighlight';
import { CameraFlight } from '../camera/CameraFlight';
import type { CameraRig } from '../camera/CameraRig';
import { computeFramedFocus, unobstructedCenterNdc } from '../camera/cameraFraming';
import { clientToNdc } from '../../../interaction/screenSpace';
import type { ScreenRect } from '../camera/cameraFraming';
import type { DragPanController } from '../navigation/DragPanController';
import type { BoundsRect, CameraPoseConfig } from '../config/environmentConfig';
import { DistrictPanel } from '../ui/districtPanel';
import { DistrictLabel } from '../ui/districtLabel';
import type { CursorManager } from '../../../interaction/cursorManager';

export type DistrictInteractionState =
  | { type: 'idle' }
  | { type: 'hovering'; districtId: string }
  | { type: 'focusing'; districtId: string }
  | { type: 'open'; districtId: string };

export interface DistrictInteractionDeps {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  camera: THREE.PerspectiveCamera;
  rig: CameraRig;
  controller: DragPanController;
  district: DistrictLookup;
  binding: DistrictSceneBinding;
  content: DistrictContent;
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
  /** Recomputes and returns the navigable area for the rig's current yaw. */
  resolveBounds: () => BoundsRect | null;
  reducedMotion: boolean;
}

/**
 * Owns district interaction state and every transition between states.
 *
 * Kept out of `MurciaExperience` deliberately. The awkward cases here — a click
 * arriving mid-flight, the panel closing before the camera lands, a resize
 * during a transition — are exactly the ones that turn into contradictory
 * behaviour when the state is spread across five modules that each hold a piece.
 * `MurciaExperience` keeps composition, ticking and disposal.
 */
export class DistrictInteraction {
  private readonly deps: DistrictInteractionDeps;
  private readonly highlight: DistrictHighlight;
  private readonly flight: CameraFlight;
  private readonly panel: DistrictPanel;
  private readonly label: DistrictLabel;

  /** Namespaced so one district retracting its hover cannot clear another's. */
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

  constructor(deps: DistrictInteractionDeps) {
    this.deps = deps;
    this.cursorKey = `district:${deps.content.id}`;

    this.highlight = new DistrictHighlight(
      deps.district,
      deps.groundPlaneHeight,
      undefined,
      deps.reducedMotion,
    );

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
    });

    this.label = new DistrictLabel(deps.container, deps.content.label, {
      onActivate: () => this.select(),
    });

    // Only the district's own meshes and its proxy are ever raycast — never the
    // Scene. The proxy lives on its own layer, so the raycaster has to opt in.
    this.pickables = [...deps.district.meshes, this.highlight.proxy];
    this.raycaster.layers.enable(0);
    this.raycaster.layers.enable(INTERACTION_LAYER);

    this.hoverSupported =
      typeof window.matchMedia !== 'function' || !window.matchMedia('(hover: none)').matches;

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
    return this.highlight.group;
  }

  /**
   * Input gate, for while another experience is showing.
   *
   * These listeners are on the SHARED canvas and the raycast is against this
   * district's own meshes, so an Earth click landing where the hidden city
   * happens to be would select a district and fly Murcia's camera. Frozen state
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
    this.highlight.update(deltaTime);
    this.updateLabelPosition();
  }

  // --- Transitions ----------------------------------------------------------

  private select(): void {
    const id = this.deps.content.id;
    // Re-selecting the district that is already open is a no-op rather than a
    // second flight to the same place.
    if (this.state.type === 'open' && this.state.districtId === id) return;
    if (this.state.type === 'focusing' && this.state.districtId === id) return;

    this.state = { type: 'focusing', districtId: id };
    // Immediate acknowledgement: the highlight and the panel both start now,
    // while the camera is still moving.
    this.highlight.setState('active');
    this.label.setVisible(false);
    this.panel.show(this.deps.content, this.deps.reducedMotion);
    // `resolveHover` stands down for focusing and open, so a hover held from the
    // press that got here would never be retracted and the pointing hand would
    // stay up for as long as the panel is. Released here; `close()` returns to
    // idle and the next pointer move re-establishes it if it still applies.
    this.deps.cursor.request(this.cursorKey, '');

    // The panel's rectangle is only meaningful once it is laid out, and the
    // framing is computed from that measured rectangle rather than from the
    // breakpoint — so a CSS width change cannot silently break the composition.
    const destination = this.computeDestination();

    this.deps.controller.beginExternalControl();
    this.flight.playTo(destination);
  }

  private close(): void {
    if (this.state.type === 'idle') return;
    this.state = { type: 'idle' };
    this.panel.hide();
    this.highlight.setState('idle');
    this.label.setVisible(!this.hoverSupported);
    // Deliberately no flight back: returning the camera discards wherever the
    // user chose to be, and reads as the interface undoing their navigation.
    if (this.flight.isPlaying) this.flight.cancel();
  }

  /**
   * Where to fly, framed into the part of the canvas the panel does not cover.
   *
   * Computed against a detached rig inside `computeFramedFocus`, so the live rig
   * is never moved to take the measurement — doing that would jump the camera
   * for a frame and fire the yaw-changed side effects on the way through.
   */
  private computeDestination(): { x: number; z: number; yawDegrees: number | null } {
    const { district, binding } = this.deps;
    const target = { x: district.center.x, z: district.center.z };
    const yawDegrees = binding.approachYawDegrees;

    const canvasRect = this.canvasRect();
    const ndc = unobstructedCenterNdc(canvasRect, this.panel.getObstructionRect());

    const framed = computeFramedFocus({
      pose: this.deps.getPose(),
      aspect: this.deps.getAspect(),
      yawDegrees: yawDegrees ?? this.deps.rig.getAzimuthDegrees(),
      groundPlaneHeight: this.deps.groundPlaneHeight,
      target,
      ndc,
    });

    // A near-horizon NDC can miss the ground plane. Falling back to the unframed
    // centre is worse framing but never a wrong position.
    return { ...(framed ?? target), yawDegrees };
  }

  private onFlightSettled(): void {
    this.deps.controller.endExternalControl({ adoptRigState: true });
    if (this.state.type === 'focusing') {
      this.state = { type: 'open', districtId: this.state.districtId };
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
    const id = this.deps.content.id;

    if (hovering && this.state.type !== 'hovering') {
      this.state = { type: 'hovering', districtId: id };
      this.highlight.setState('hover');
      this.label.setHovered(true);
      this.deps.cursor.request(this.cursorKey, 'pointer');
    } else if (!hovering && this.state.type === 'hovering') {
      this.state = { type: 'idle' };
      this.highlight.setState('idle');
      this.label.setHovered(false);
      this.deps.cursor.request(this.cursorKey, '');
    }
  }

  private pickAt(clientX: number, clientY: number): boolean {
    const rect = this.canvasRect();
    if (rect.width === 0 || rect.height === 0) return false;

    clientToNdc(rect, clientX, clientY, this.ndc);
    this.raycaster.setFromCamera(this.ndc, this.deps.camera);
    this.hits.length = 0;
    this.raycaster.intersectObjects(this.pickables, false, this.hits);
    return this.hits.length > 0;
  }

  private canvasRect(): ScreenRect {
    const rect = this.deps.canvas.getBoundingClientRect();
    return { left: rect.left, top: rect.top, width: rect.width, height: rect.height };
  }

  private updateLabelPosition(): void {
    const rect = this.canvasRect();
    const bounds = this.deps.district.bounds;
    this.projected.set(
      this.deps.district.center.x,
      bounds.isEmpty() ? this.deps.groundPlaneHeight : bounds.max.y + 4,
      this.deps.district.center.z,
    );
    this.projected.project(this.deps.camera);

    const onScreen =
      this.projected.z < 1 &&
      this.projected.x >= -1 &&
      this.projected.x <= 1 &&
      this.projected.y >= -1 &&
      this.projected.y <= 1;

    this.label.setPosition(
      rect.left + ((this.projected.x + 1) / 2) * rect.width,
      rect.top + ((1 - this.projected.y) / 2) * rect.height,
      onScreen,
    );
  }

  // --- Input ----------------------------------------------------------------

  private readonly onPointerDownCapture = (event: PointerEvent): void => {
    if (!this.enabled) return;
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

    if (event.button !== 0) return;
    if (this.deps.controller.isDragging) return;

    if (this.pickAt(event.clientX, event.clientY)) {
      this.select();
    } else if (this.state.type === 'open' || this.state.type === 'focusing') {
      this.close();
    }
  };

  private readonly onPointerCancel = (event: PointerEvent): void => {
    if (this.suppressedPointerId === event.pointerId) this.suppressedPointerId = null;
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
    this.label.dispose();
    this.highlight.dispose();
  }
}
