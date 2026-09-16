import * as THREE from 'three';
import type { CursorManager } from '../../../interaction/cursorManager';

/**
 * Clicking the display. The one input the blog's entry point has, and — since the
 * cluster tap went with plan 022 — the only way into the blog from the city.
 *
 * The raycast, the NDC maths and the drag arbitration are `DistrictInteraction`'s
 * and `BlogBuilding`'s; the core-UV test is the lab's. What is not here is
 * everything downstream of a hit: no control rects, no hover slots, no press state,
 * no scroll gesture, no modes. The whole readable core is one target, the
 * `edificio-blog` cluster beneath it is the other, and the only thing either does is
 * start the approach — while a hover over either lights the cluster
 * (`onHoverChange`).
 *
 * ## It is the ONLY listener over this cluster
 *
 * `BlogBuilding.ts` used to hold a second one, over the buildings underneath this
 * panel, that opened the blog with no transition at all. It was deleted rather than
 * suppressed. Two listeners over one part of the scene, arbitrated by whichever mesh
 * a ray reaches first, is a coin toss between two different outcomes — and the one
 * that would usually win, by standing nearer the camera, is the one with no
 * transition. The cluster is a target again, but of THIS listener and with the same
 * outcome as the panel, so whichever mesh a ray reaches first no longer matters.
 *
 * ## Four things must all be true before a click counts
 *
 * Nothing else is enabled, no flight is running, both ends of the gesture landed on
 * a target — the READABLE CORE rather than merely the panel mesh, or the cluster —
 * and the pointer travelled
 * less than a tap's worth. Each has its own reason, recorded where it is enforced.
 */

// Namespaced 'source:instance' like every other cursor request. The source half is
// unknown to the PRIORITY table in cursorManager.ts, so this resolves to 0 — the
// weakest hint there is, which is right: a drag (30) or a district hover (20) must
// both beat a suggestion that a panel is clickable.
const CURSOR_KEY = 'murcia:blog-display';

export interface PanelPointerDeps {
  canvas: HTMLCanvasElement;
  camera: THREE.Camera;
  /** The panel mesh. */
  panel: THREE.Mesh;
  /** The cluster's meshes, flattened: the second target, raycast non-recursively. */
  buildings?: readonly THREE.Object3D[];
  /** Additional physical invitation surfaces, without the panel's core-UV mask. */
  invitations?: readonly THREE.Object3D[];
  /** When the pointer lands on or leaves a target. Never on touch. */
  onHoverChange?: (hovering: boolean) => void;
  cursor: CursorManager;
  /** The same thresholds the district and the city use, so a drag reads alike. */
  tapThresholdPx: { mouse: number; touch: number };
  /** True while something else owns attention — a district panel, a flight. */
  blocked: () => boolean;
  /** True while the approach or the return owns the camera. */
  isBusy: () => boolean;
  /** A clean tap landed on the readable core. Takes no arguments, deliberately. */
  onActivate: () => void;
}

export interface PanelPointer {
  setEnabled(next: boolean): void;
  /** Per-frame hover resolution; does not render and does not raycast unless moved. */
  update(): void;
  dispose(): void;
}

export function createPanelPointer(deps: PanelPointerDeps): PanelPointer {
  const { canvas, camera, panel, cursor } = deps;
  const buildings = [...(deps.buildings ?? [])];
  const invitations = [...(deps.invitations ?? [])];

  // Allocated once and mutated in place. A raycaster per event is a per-pointermove
  // allocation on a listener that fires at the pointer's full rate.
  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();

  let enabled = false;
  let hovering = false;
  let hoverDirty = false;
  let pointerX = 0;
  let pointerY = 0;

  /**
   * Where the current pointer sequence began, and whether something else owned
   * attention when it did.
   *
   * `blocked` is read at the PRESS and kept, not re-read at the release. The
   * district's close and this panel share a canvas and a `pointerup`; the district
   * lets go synchronously, so by the time this listener runs `hasFocusedDistrict` is
   * already false — and a tap that closed the display would fall straight through
   * to whatever is behind it. `BlogBuilding` learned this for real; it is inherited
   * here rather than rediscovered.
   */
  let press: { id: number; x: number; y: number; touch: boolean; blocked: boolean } | null = null;

  // Touch has no hover, and a "hover" left behind by the last tap is a cursor hint
  // pinned to wherever a finger happened to lift.
  const hoverSupported =
    typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;

  /**
   * The core inset, read off the material rather than restated here.
   *
   * One inset and not two: the shader does the same remap to find its core, and a
   * second copy of the number is how a control ends up drawn in one place and
   * clickable in another — the failure `displayConfig.ts` exists to prevent for the
   * services display.
   */
  const coreInset = (): number => {
    const material = panel.material as THREE.ShaderMaterial;
    const value = material.uniforms?.['uCoreInset']?.value as number | undefined;
    return typeof value === 'number' && value > 0 ? value : 1;
  };

  /**
   * Whether a client point is over the panel's READABLE CORE, not merely its mesh —
   * or over the cluster beneath it.
   *
   * The distinction is the margin: the plane runs `1 / coreInset` wider than the
   * page it carries, and that ring is transparent. Treating it as part of the target
   * would put the cursor's pointer state — and a click — on empty air beside the
   * display. A building seen THROUGH the ring is not empty air, so it still counts.
   */
  function overTarget(clientX: number, clientY: number): boolean {
    const rect = canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;

    // The canvas's own rect, not `innerWidth` — that is what makes this correct
    // regardless of where the canvas sits or how the page is laid out.
    ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    raycaster.setFromCamera(ndc, camera);

    // NON-RECURSIVE, and it is load-bearing. The plate is a CHILD of this mesh, and
    // `true` here would return its rim-wall intersections, whose `uv` runs
    // (position along the contour, depth) and means nothing in this space. The hit
    // test would then succeed at wrong positions rather than fail loudly.
    const hit = raycaster.intersectObject(panel, false)[0];
    // `uv` is optional on an intersection — present only when the geometry carries a
    // uv attribute — so this chain is required rather than defensive.
    if (hit?.uv) {
      const inset = coreInset();
      const x = (hit.uv.x - 0.5) / inset + 0.5;
      const y = (hit.uv.y - 0.5) / inset + 0.5;
      if (x >= 0 && x <= 1 && y >= 0 && y <= 1) return true;
    }

    const visibleInvitations = invitations.filter((object) => {
      for (let node: THREE.Object3D | null = object; node; node = node.parent) {
        if (!node.visible) return false;
      }
      return true;
    });
    if (raycaster.intersectObjects(visibleInvitations, false).length > 0) return true;
    return buildings.length > 0 && raycaster.intersectObjects(buildings, false).length > 0;
  }

  function setHover(next: boolean): void {
    if (next === hovering) return;
    hovering = next;
    cursor.request(CURSOR_KEY, next ? 'pointer' : '');
    deps.onHoverChange?.(next);
  }

  const onPointerMove = (event: PointerEvent): void => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    // Deferred to `update`, never resolved here: a raycast per pointermove is a
    // raycast at the pointer's full rate, and the answer is only ever consumed once
    // a frame.
    hoverDirty = true;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled || event.button !== 0) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType !== 'mouse',
      blocked: deps.blocked() || deps.isBusy(),
    };
  };

  const onPointerUp = (event: PointerEvent): void => {
    const started = press?.id === event.pointerId ? press : null;
    press = null;
    if (!enabled || started === null) return;
    if (event.button !== 0) return;
    if (started.blocked || deps.blocked() || deps.isBusy()) return;

    // Measured across the gesture, and both ends must be on the core. Murcia is a
    // free pan, so a drag that begins and ends over the display is the COMMON case,
    // not an edge case — and starting a three-second flight because someone finished
    // panning over the panel would be the worst bug this file could have. Requiring
    // only the release would also let a drag that starts on the sky and ends on the
    // display fire it.
    const threshold = started.touch ? deps.tapThresholdPx.touch : deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > threshold) return;

    // From the EVENT's own coordinates, never a stored hover (DECISIONS §17).
    if (!overTarget(started.x, started.y)) return;
    if (!overTarget(event.clientX, event.clientY)) return;

    deps.onActivate();
  };

  const onPointerCancel = (): void => {
    press = null;
  };

  const onPointerLeave = (): void => {
    press = null;
    hoverDirty = false;
    setHover(false);
  };

  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerCancel);
  canvas.addEventListener('pointerleave', onPointerLeave);

  return {
    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      if (!next) {
        press = null;
        hoverDirty = false;
        setHover(false);
      }
    },

    update(): void {
      if (!enabled || !hoverSupported || deps.blocked() || deps.isBusy()) {
        if (hovering) setHover(false);
        return;
      }
      if (!hoverDirty) return;
      hoverDirty = false;
      setHover(overTarget(pointerX, pointerY));
    },

    dispose(): void {
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerCancel);
      canvas.removeEventListener('pointerleave', onPointerLeave);
      // The cursor manager outlives this module, and this file wrote into it. Never
      // leave a pointer hint over a scene with nothing under it to click.
      cursor.request(CURSOR_KEY, '');
    },
  };
}
