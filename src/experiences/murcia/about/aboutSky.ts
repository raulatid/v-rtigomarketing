import * as THREE from 'three';
import { worldToClient, type ElementRect } from '../../../interaction/screenSpace';
import { createSkySatellites, skyFocusOf, type SkySatellites } from '../sky/createSkySatellites';
import { createPanelSchedule, type PanelSchedule } from '../sky/panelSchedule';
import { createSkyPasses, type Direction, type SkyPass } from '../sky/skyPasses';
import type { AboutPose } from './aboutPoses';
import { createBrandPanels, type Brand, type BrandPanels } from './brandPanels';

/**
 * The sky of the Conócenos sky stop: satellites crossing the dark in straight
 * lines, and two at a time a small panel with a client's isotype beside one.
 *
 * Plan 027 decision 6: none of it answers to reduced motion. With the camera
 * held, this is a still view with points of light moving across it, and
 * taking them away takes the stop's point away — the opposite of the campus's
 * particles, which hold still. The camera's flights in and out do answer to it.
 *
 * Costs nothing outside the section: the points are hidden and nothing is
 * computed unless the section holds the camera, and the panels are only
 * scheduled while the sky stop is held. The clock runs on regardless — one
 * addition a frame — so the sky is where it would be when it is next seen.
 */

export interface AboutSkyOptions {
  /** Murcia's UI host: the panels mount here. */
  container: HTMLElement;
  /** The CMS's cases that have an isotype, shown in turns. */
  brands: readonly Brand[];
  /** The camera whose lens the sky stop is seen through. Its far plane places the points, as the dome's does. */
  lens: THREE.PerspectiveCamera;
  /** The sky stop for the current layout, and where in its frame the passes aim. */
  skyView: () => { readonly pose: AboutPose; readonly focus: { readonly x: number; readonly y: number } };
  /** Where the plate is, in client px: a panel that would pass under it is not put up. */
  plateRect: () => DOMRect | null;
}

export interface AboutSkyState {
  /** The section holds the camera: the sky can be looked at. */
  readonly lit: boolean;
  /** The sky stop is held, the camera still: the panels may show. */
  readonly panels: boolean;
}

export interface AboutSky {
  readonly object3D: THREE.Object3D;
  /** After whoever moved the camera, so a panel sits on its satellite. */
  update(delta: number, camera: THREE.Camera, rect: ElementRect, state: AboutSkyState): void;
  /** The layout may have changed: the passes are aimed at its frame again. */
  reframe(): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/**
 * How many satellites, whatever the number of brands: a panel goes on any of
 * them (`panelSchedule.ts`). At this many, four or five are in the dark sky at
 * once, slowly, and a turn usually finds one in the frame.
 */
const SATELLITES = 16;
/** Same sky every visit. */
const SEED = 0x027;
/** A panel only goes on a satellite at least this lit for its whole time. */
const PANEL_MIN_ALPHA = 0.6;
/** NDC, both axes: a panel's satellite stays this far inside the frame, so the panel beside it is not cut. */
const PANEL_FRAME = 0.8;
/** Seconds between the samples that check a satellite stays in frame. */
const LOOKAHEAD_STEP = 0.25;
/**
 * Client px round a satellite that its panel covers: up and to the right of the
 * point, as murcia.css places it (`.about-brands__panel`), with a little air.
 */
const PANEL_REACH = { left: 8, right: 64, up: 64, down: 8 } as const;
/** World units out along a direction to project it: far, like the points. */
const PROJECT_DISTANCE = 1000;

export function createAboutSky(options: AboutSkyOptions): AboutSky {
  const count = SATELLITES;

  // Where the sky stop looks, through a camera stood on its pose with the live lens.
  const focus = (): Direction => {
    const { pose, focus: ndc } = options.skyView();
    const eye = new THREE.PerspectiveCamera(options.lens.fov, options.lens.aspect, options.lens.near, options.lens.far);
    eye.position.copy(pose.position);
    eye.lookAt(pose.target);
    return skyFocusOf(eye, ndc);
  };
  let passes: SkyPass[] = createSkyPasses({ count, focus: focus(), seed: SEED });
  const satellites: SkySatellites = createSkySatellites(count, options.lens.far);
  const schedule: PanelSchedule = createPanelSchedule(count, options.brands.length);
  const panels: BrandPanels = createBrandPanels(options.container, options.brands);

  const world = new THREE.Vector3();
  const ndc = new THREE.Vector3();
  const client = new THREE.Vector3();
  let clock = 0;
  let panelsOn = false;

  const toWorld = (direction: Direction, camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 =>
    out.set(direction[0], direction[1], direction[2]).multiplyScalar(PROJECT_DISTANCE).add(camera.position);

  return {
    object3D: satellites.object3D,

    update(delta, camera, rect, state) {
      clock += Math.max(0, delta);
      satellites.setVisible(state.lit);
      if (state.lit) satellites.update(passes, clock);

      if (!state.panels) {
        if (panelsOn) {
          panelsOn = false;
          schedule.reset();
          panels.update([]);
        }
        return;
      }
      panelsOn = true;

      // The camera is held still at the stop, so where a satellite will be is
      // where it will be ON SCREEN: its future is the pass's.
      // The plate is read once, and only when a pair is being chosen.
      let plate: DOMRect | null | undefined;
      const underPlate = (x: number, y: number): boolean => {
        if (plate === undefined) plate = options.plateRect();
        return (
          plate !== null &&
          x + PANEL_REACH.right > plate.left &&
          x - PANEL_REACH.left < plate.right &&
          y - PANEL_REACH.up < plate.bottom &&
          y + PANEL_REACH.down > plate.top
        );
      };
      const canShow = (satellite: number, from: number, to: number): boolean => {
        const pass = passes[satellite]!;
        for (let t = from; t <= to + 1e-6; t += LOOKAHEAD_STEP) {
          if (pass.alpha(t) < PANEL_MIN_ALPHA) return false;
          toWorld(pass.direction(t), camera, ndc).project(camera);
          if (ndc.z > 1 || Math.abs(ndc.x) > PANEL_FRAME || Math.abs(ndc.y) > PANEL_FRAME) return false;
          const point = worldToClient(rect, camera, toWorld(pass.direction(t), camera, world), client);
          if (!point || underPlate(point.x, point.y)) return false;
        }
        return true;
      };

      const placed = [];
      for (const shown of schedule.update(clock, canShow)) {
        const point = worldToClient(rect, camera, toWorld(passes[shown.satellite]!.direction(clock), camera, world), client);
        if (!point) continue;
        placed.push({ brand: shown.brand, opacity: shown.opacity, x: point.x - rect.left, y: point.y - rect.top });
      }
      panels.update(placed);
    },

    reframe() {
      passes = createSkyPasses({ count, focus: focus(), seed: SEED });
      schedule.reset();
      panels.update([]);
    },

    setPixelRatio(ratio) {
      satellites.setPixelRatio(ratio);
    },

    dispose() {
      satellites.dispose();
      panels.dispose();
    },
  };
}
