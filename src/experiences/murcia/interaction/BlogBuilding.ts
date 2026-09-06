import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { CursorManager } from '../../../interaction/cursorManager';
import { worldToClient } from '../../../interaction/screenSpace';

/**
 * The blog's entry point in the city: a tap on the `blog_edificios` cluster.
 *
 * ## What this is not
 *
 * It is not a district, and it must not become one. There is no camera flight,
 * no panel, no state machine and no service meaning — a tap emits ONE signal
 * outward and this module is finished. `DistrictInteraction` is 766 lines
 * because entering a district is genuinely that complicated; entering the blog
 * is not, and folding this in there would teach the services district that a
 * blog exists.
 *
 * ## Why a second pointer listener is safe here
 *
 * `DistrictInteraction`'s docblock warns against one instance per building, and
 * it is right: each would own a `CameraFlight` and could write the camera rig in
 * the same frame as its neighbour. This owns no rig, no flight and no camera —
 * the two cannot contend for anything. Their pickable sets are disjoint (service
 * buildings against `blog_edificios`), so no tap can be read by both, and this
 * one stands down entirely while a district is open.
 *
 * ## The node names
 *
 * `blog_edificios` and `blog_edificios.001`, and the second is the whole reason
 * `findByAnyNameSpelling` is used rather than `getObjectByName`, and the reason
 * is recorded even though the name that needed it has gone: GLTFLoader strips
 * `[ ] . : /` from node names, so a mesh authored as `blog_edificios.001`
 * reaches the runtime as `blog_edificios001`, and the 2026-08-11 audit recorded
 * exactly that biting for real on this cluster. `checks/city-asset.ts` asserts
 * every name below resolves in the shipped GLB, so a re-export that renames one
 * fails the build rather than quietly removing the way into the blog.
 */

/**
 * Blender names for the cluster. Scene composition is code-owned — the same
 * reason `cityDistrictBindings.ts` exists and holds object names rather than
 * `districts.ts` doing it.
 *
 * ONE name since the 2026-09-06 re-export, which merged the cluster: the file
 * carries `blog_edificios` and no `.001` beside it. The list stays a list
 * because what it names is "the meshes the blog's entry point is made of", and
 * that has been more than one before and may be again — every consumer already
 * iterates it, so a second name costs nothing to add back.
 */
export const BLOG_BUILDING_NODE_NAMES = ['blog_edificios'] as const;

export interface BlogBuildingDeps {
  root: THREE.Object3D;
  camera: THREE.Camera;
  canvas: HTMLCanvasElement;
  cursor: CursorManager;
  /** Same thresholds the district uses, so a drag reads the same everywhere. */
  tapThresholdPx: { mouse: number; touch: number };
  /** True while something else owns attention — a district panel, a flight. */
  blocked: () => boolean;
  /** A clean tap landed on the cluster. Takes no arguments, deliberately. */
  onActivate: () => void;
}

export interface BlogBuilding {
  setEnabled(next: boolean): void;
  /** Per-frame hover resolution; does not render. */
  update(): void;
  dispose(): void;
  /**
   * Where the cluster is on screen right now, in client coordinates.
   *
   * FOR TESTS. The e2e round trip has to tap this building, and its position is
   * a fact about the camera pose and the GLB — not something a spec can hardcode
   * without becoming a test of the city's layout. Installed on `window` only
   * under `debugTools`, so it is compiled out of production along with the rest.
   *
   * `null` when the cluster is behind the camera or off screen, which is a
   * meaningful answer rather than a failure: the caller should not tap.
   */
  screenPoint(): { x: number; y: number } | null;
  /**
   * The cluster's centre in world space, copied into `out`.
   *
   * Static scenery, computed once at construction. Exposed for the arrival
   * beacon, which pins a label above this building and does its own projection
   * against a cached canvas rect rather than paying a layout read per frame —
   * so it wants the world point, not `screenPoint()`'s client one.
   */
  anchor(out: THREE.Vector3): THREE.Vector3;
}

// Namespaced 'source:instance' like every other cursor request. The source half
// is unknown to the PRIORITY table in cursorManager.ts, so this resolves to 0 —
// the weakest hint there is, which is right: a drag (30) or a district hover
// (20) must both beat a suggestion that a building is clickable.
const CURSOR_KEY = 'murcia:blog-building';

export function createBlogBuilding(deps: BlogBuildingDeps): BlogBuilding | null {
  const meshes: THREE.Object3D[] = [];
  for (const name of BLOG_BUILDING_NODE_NAMES) {
    const match = findByAnyNameSpelling(deps.root, name);
    if (match === null) {
      // Reported rather than thrown: a city that shipped without the cluster
      // should still run, and the missing way into the blog should be loud.
      console.error(
        `[blog-cta] node "${name}" is not in the city, so the blog has no entry point. ` +
          'checks/city-asset.ts asserts this contract — run `npm run check:asset:contract`.',
      );
      continue;
    }
    match.object.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj);
    });
  }
  if (meshes.length === 0) return null;

  const raycaster = new THREE.Raycaster();
  const ndc = new THREE.Vector2();
  const hits: THREE.Intersection[] = [];

  let enabled = false;
  let hovering = false;
  let hoverDirty = false;
  let pointerX = 0;
  let pointerY = 0;
  let press: { id: number; x: number; y: number; touch: boolean } | null = null;

  // Touch has no hover, and a "hover" left behind by the last tap is a cursor
  // hint pinned to wherever a finger happened to lift.
  const hoverSupported =
    typeof window.matchMedia === 'function' && window.matchMedia('(hover: hover)').matches;

  function pickAt(clientX: number, clientY: number): boolean {
    const rect = deps.canvas.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return false;
    ndc.x = ((clientX - rect.left) / rect.width) * 2 - 1;
    ndc.y = -((clientY - rect.top) / rect.height) * 2 + 1;
    raycaster.setFromCamera(ndc, deps.camera as THREE.PerspectiveCamera);
    hits.length = 0;
    raycaster.intersectObjects(meshes, false, hits);
    return hits.length > 0;
  }

  function setHover(next: boolean): void {
    if (next === hovering) return;
    hovering = next;
    // Released by requesting the EMPTY cursor, never by cursor.clear() — that
    // takes no key and wipes every source's request, including the drag's.
    deps.cursor.request(CURSOR_KEY, next ? 'pointer' : '');
  }

  const onPointerMove = (event: PointerEvent): void => {
    if (!enabled || !hoverSupported) return;
    pointerX = event.clientX;
    pointerY = event.clientY;
    hoverDirty = true;
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (!enabled) return;
    press = {
      id: event.pointerId,
      x: event.clientX,
      y: event.clientY,
      touch: event.pointerType === 'touch',
    };
  };

  const onPointerUp = (event: PointerEvent): void => {
    const started = press?.id === event.pointerId ? press : null;
    press = null;
    if (!enabled || started === null) return;
    if (event.button !== 0) return;
    if (deps.blocked()) return;

    // Measured against this module's OWN press, exactly as the district measures
    // against its own: the release of a drag across the city is not a tap on
    // whatever it happens to end over, and a pointer the browser cancelled
    // mid-gesture has no press on record and is not a tap either.
    const threshold = started.touch ? deps.tapThresholdPx.touch : deps.tapThresholdPx.mouse;
    if (Math.hypot(event.clientX - started.x, event.clientY - started.y) > threshold) return;

    if (pickAt(event.clientX, event.clientY)) deps.onActivate();
  };

  const onPointerCancel = (): void => {
    press = null;
  };

  deps.canvas.addEventListener('pointermove', onPointerMove);
  deps.canvas.addEventListener('pointerdown', onPointerDown);
  deps.canvas.addEventListener('pointerup', onPointerUp);
  deps.canvas.addEventListener('pointercancel', onPointerCancel);

  // The cluster's centre in world space, computed once: it is static scenery.
  const centre = new THREE.Vector3();
  {
    const box = new THREE.Box3();
    for (const mesh of meshes) box.expandByObject(mesh);
    box.getCenter(centre);
  }

  const projected = new THREE.Vector3();

  return {
    anchor(out: THREE.Vector3): THREE.Vector3 {
      return out.copy(centre);
    },

    screenPoint(): { x: number; y: number } | null {
      const rect = deps.canvas.getBoundingClientRect();
      const point = worldToClient(rect, deps.camera, centre, projected);
      return point === null ? null : { x: point.x, y: point.y };
    },

    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      if (!next) {
        press = null;
        setHover(false);
      }
    },

    update(): void {
      if (!enabled || !hoverSupported) {
        if (hovering) setHover(false);
        return;
      }
      // Hover resolves once per frame from the last pointer position rather than
      // raycasting inside the move handler, which would run a scene raycast per
      // pointer event.
      if (deps.blocked()) {
        setHover(false);
        return;
      }
      if (!hoverDirty) return;
      hoverDirty = false;
      setHover(pickAt(pointerX, pointerY));
    },

    dispose(): void {
      deps.canvas.removeEventListener('pointermove', onPointerMove);
      deps.canvas.removeEventListener('pointerdown', onPointerDown);
      deps.canvas.removeEventListener('pointerup', onPointerUp);
      deps.canvas.removeEventListener('pointercancel', onPointerCancel);
      deps.cursor.request(CURSOR_KEY, '');
    },
  };
}
