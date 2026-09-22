import * as THREE from 'three';
import { findByAnyNameSpelling } from '../assets/nodeNames';
import type { CursorManager } from '../../../interaction/cursorManager';
import { worldToClient } from '../../../interaction/screenSpace';
import { createBlogApproach, type BlogApproach } from './blogApproach';
import {
  BLOG_BUILDING_NODE_NAMES,
  PANEL_ELEVATION,
  PANEL_TILT_DEGREES,
} from './blogDisplayConfig';
import { createBlogDisplay, type BlogDisplay } from './blogDisplay';
import { createPageImageSource } from './pageImage';
import { createPanelPointer, type PanelPointer } from './panelPointer';
import { createBuildingHighlight } from '../interaction/buildingHighlight';

/**
 * The blog's entry point in the city: a display floating above the
 * `edificio-blog` building, and the flight that clicking it starts.
 *
 * ## What this replaced
 *
 * `interaction/BlogBuilding.ts`, which was a tap on the cluster that emitted one
 * signal and jumped straight to /blog. Its docblock said, correctly for what it
 * was, "it is not a district, and it must not become one" — and this is still not a
 * district: there is no `DistrictState`, no service meaning, no panel of controls,
 * no accordion, and the buildings underneath carry no interaction of their own —
 * they share the panel's one gesture and light on hover. What it
 * does have that the tap did not is a camera flight, and that is the whole point of
 * plan 022.
 *
 * The tap was REMOVED rather than kept beside this. Two ways into the blog from one
 * part of the scene, one of them with a three-second transition and one of them
 * instant, is not two affordances — it is a coin toss decided by which mesh a ray
 * reaches first, and the mesh nearer the camera is the cluster.
 *
 * ## Assembly, and what owns what
 *
 * - `blogDisplay` owns the geometry and the yaw follow.
 * - `panelPointer` owns the gesture and publishes a cursor hint.
 * - `blogApproach` owns both flights, the camera while one runs, and the cover.
 * - `pageImage` owns what the face wears.
 * - `buildingHighlight` owns the cluster's hover light.
 *
 * This module owns only the placement — where the panel hangs and which way it
 * faces — and the wiring between the four.
 */

export interface BlogDisplayEntryOptions {
  /** The loaded city root. */
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  canvas: HTMLCanvasElement;
  cursor: CursorManager;
  /** CSS pixels. The panel takes the viewport's shape from its first frame. */
  viewport: { width: number; height: number };
  /**
   * The rig's resting azimuth, in degrees — the display's resting yaw.
   *
   * The camera sits at direction (sin yaw, cos yaw) from the focus
   * (`applyPoseToCamera`, pose azimuth 0), so handing the panel the same number
   * points it at where a visitor stands when they arrive. Read from the live pose
   * rather than restated, because `murciaConfig`'s azimuth has moved twice and a
   * copy of it here would silently turn the panel away the third time.
   *
   * `cityDistrictBindings.ts` makes the same decision for the services display, and
   * has to write it down because a flight also has to fly to it. Nothing flies to
   * this one, so there is nothing to keep in agreement.
   */
  restingYawDegrees: number;
  /** Whether this build serves `dist/`. See `PageImageSourceOptions`. */
  buildAssetsAvailable: boolean;
  /** True while something else owns attention — a district panel, a flight. */
  blocked: () => boolean;
  /** The same thresholds the district uses, so a drag reads the same everywhere. */
  tapThresholdPx: { mouse: number; touch: number };
  beginExternalControl: () => void;
  endExternalControl: () => void;
  openBlog: () => boolean;
  onApproachStart: () => void;
}

export interface BlogDisplayEntry {
  readonly object3D: THREE.Object3D;
  /** True while the approach or the return owns the camera (DECISIONS §9). */
  readonly ownsCamera: boolean;
  setEnabled(next: boolean): void;
  /**
   * The panel's centre in world space, copied into `out`.
   *
   * For the compass, which bears on this point. It follows the PANEL rather than
   * the cluster, because the panel is now what a visitor is being pointed at.
   */
  anchor(out: THREE.Vector3): THREE.Vector3;
  /**
   * Where the panel is on screen right now, in client coordinates.
   *
   * FOR TESTS. The e2e round trip has to click the display, and its position is a
   * fact about the camera pose and the GLB — not something a spec can hardcode
   * without becoming a test of the city's layout. `null` when the panel is behind
   * the camera or off screen, which is a meaningful answer rather than a failure:
   * the caller should not click.
   */
  screenPoint(): { x: number; y: number } | null;
  /** The compass's nearness, 0..1, lit on the cluster under a hover (`buildingHighlight.ts`). */
  setProximity(strength: number): void;
  setViewport(width: number, height: number): void;
  beginReturn(): void;
  dismissCover(): void;
  update(deltaTime: number): void;
  dispose(): void;
}

export function createBlogDisplayEntry(
  options: BlogDisplayEntryOptions,
): BlogDisplayEntry | null {
  const meshes: THREE.Object3D[] = [];
  for (const name of BLOG_BUILDING_NODE_NAMES) {
    const match = findByAnyNameSpelling(options.root, name);
    if (match === null) {
      // Reported rather than thrown: a city that shipped without the cluster should
      // still run, and the missing way into the blog should be loud.
      console.error(
        `[blogDisplay] node "${name}" is not in the city, so the blog has no entry point. ` +
          'checks/city-asset.ts asserts this contract — run `npm run check:asset:contract`.',
      );
      continue;
    }
    match.object.traverse((obj) => {
      if ((obj as THREE.Mesh).isMesh) meshes.push(obj);
    });
  }
  if (meshes.length === 0) return null;

  // The cluster's footprint, measured once: it is static scenery.
  const bounds = new THREE.Box3();
  for (const mesh of meshes) bounds.expandByObject(mesh);
  const centre = new THREE.Vector3();
  bounds.getCenter(centre);

  const aspect = options.viewport.width / Math.max(1, options.viewport.height);

  const display: BlogDisplay = createBlogDisplay({
    centre,
    // "Above" is measured from the cluster's TOP FACE, not from the ground: the
    // clearance that reads as floating is clearance over the thing it floats over.
    groundY: bounds.max.y,
    elevation: PANEL_ELEVATION,
    aspect,
    tiltDegrees: PANEL_TILT_DEGREES,
    baseYawDegrees: options.restingYawDegrees,
  });

  const approach: BlogApproach = createBlogApproach({
    camera: options.camera,
    display,
    pageImages: createPageImageSource({
      buildAssetsAvailable: options.buildAssetsAvailable,
    }),
    beginExternalControl: options.beginExternalControl,
    endExternalControl: options.endExternalControl,
    openBlog: options.openBlog,
    onApproachStart: options.onApproachStart,
  });

  const highlight = createBuildingHighlight(meshes);

  const pointer: PanelPointer = createPanelPointer({
    canvas: options.canvas,
    camera: options.camera,
    panel: display.panel,
    invitations: [display.invitation],
    buildings: meshes,
    onHoverChange: (hovering) => highlight.setTarget(hovering),
    cursor: options.cursor,
    tapThresholdPx: options.tapThresholdPx,
    blocked: options.blocked,
    isBusy: () => approach.isBusy,
    onActivate: () => approach.commit(),
  });

  // The first page image, requested through the same debounced path a resize takes
  // so there is one route to the panel's texture rather than two. `init` deliberately
  // does not await it: the scene is complete and renderable without the page, and the
  // face wears a transparent placeholder over its own core colour until it lands.
  approach.setViewport(options.viewport.width, options.viewport.height);

  const projected = new THREE.Vector3();
  let enabled = false;

  return {
    object3D: display.object,

    get ownsCamera() {
      return approach.ownsCamera;
    },

    setEnabled(next: boolean): void {
      if (next === enabled) return;
      enabled = next;
      pointer.setEnabled(next);
    },

    anchor(out: THREE.Vector3): THREE.Vector3 {
      return out.copy(display.anchor());
    },

    screenPoint(): { x: number; y: number } | null {
      const rect = options.canvas.getBoundingClientRect();
      const point = worldToClient(rect, options.camera, display.anchor(), projected);
      return point === null ? null : { x: point.x, y: point.y };
    },

    setProximity(strength: number): void {
      highlight.setProximity(strength);
    },

    setViewport(width: number, height: number): void {
      approach.setViewport(width, height);
    },

    beginReturn(): void {
      approach.beginReturn();
    },

    dismissCover(): void {
      approach.dismissCover();
    },

    update(deltaTime: number): void {
      pointer.update();
      highlight.update(deltaTime);
      // Before the display's own update: the approach can freeze the yaw follow on
      // this very frame, and a panel that turned once more after being frozen is a
      // panel the camera is no longer arriving square to.
      approach.update(deltaTime);
      display.update(deltaTime, options.camera);
    },

    dispose(): void {
      pointer.dispose();
      highlight.dispose();
      approach.dispose();
      display.dispose();
    },
  };
}
