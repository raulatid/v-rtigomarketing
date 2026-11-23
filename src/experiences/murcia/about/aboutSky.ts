import * as THREE from 'three';
import { worldToClient, type ElementRect } from '../../../interaction/screenSpace';
import { createBrandCrossings, CROSS_SECONDS, type BrandCrossings, type BrandLane } from '../sky/brandLanes';
import { createSkySatellites, skyFocusOf, type SkySatellites } from '../sky/createSkySatellites';
import { createSkyPasses, type Direction, type SkyPass } from '../sky/skyPasses';
import type { AboutPose, NdcLane } from './aboutPoses';
import { createBrandPanels, type Brand, type BrandPanels } from './brandPanels';

/**
 * The sky of the Conócenos sky stop: satellites crossing the dark in straight
 * lines, and the brands' own satellites crossing the free sky along fixed
 * lanes, each with its panel, two or three at a time (plan 029b §2.4).
 *
 * Two kinds of satellite. The ambient ones (`sky/skyPasses.ts`) lap the whole
 * sky at random and carry nothing. The brand ones (`sky/brandLanes.ts`) are
 * one per brand, on a timetable over lanes drawn in the stop's frame, so a
 * brand is in view whenever the stop is: before 2026-11-23 a panel waited for
 * an ambient pass to cross the free sky, and a logo was on screen a third of
 * the time.
 *
 * Plan 027 decision 6: none of it answers to reduced motion. With the camera
 * held, this is a still view with points of light moving across it, and
 * taking them away takes the stop's point away — the opposite of the campus's
 * particles, which hold still. The camera's flights in and out do answer to it.
 *
 * Costs nothing outside the section: the points are hidden and nothing is
 * computed unless the section holds the camera, and the brands only show
 * while the sky stop is held. The clocks run on regardless — one addition a
 * frame — so the sky is where it would be when it is next seen.
 */

export interface AboutSkyOptions {
  /** Murcia's UI host: the panels mount here. */
  container: HTMLElement;
  /** The CMS's cases that have an isotype, one satellite each. */
  brands: readonly Brand[];
  /** The camera whose lens the sky stop is seen through. Its far plane places the points, as the dome's does. */
  lens: THREE.PerspectiveCamera;
  /** The sky stop for the current layout, where in its frame the passes aim, and the brands' lanes. */
  skyView: () => {
    readonly pose: AboutPose;
    readonly focus: { readonly x: number; readonly y: number };
    readonly lanes: readonly NdcLane[];
  };
}

export interface AboutSkyState {
  /** The section holds the camera: the sky can be looked at. */
  readonly lit: boolean;
  /** The sky stop is held, the camera still: the brands may show. */
  readonly panels: boolean;
}

export interface AboutSky {
  readonly object3D: THREE.Object3D;
  /** After whoever moved the camera, so a panel sits on its satellite. */
  update(delta: number, camera: THREE.Camera, rect: ElementRect, state: AboutSkyState): void;
  /** The layout may have changed: the passes and the lanes are drawn in its frame again. */
  reframe(): void;
  setPixelRatio(ratio: number): void;
  dispose(): void;
}

/**
 * Ambient satellites, whatever the number of brands. At this many, four or
 * five are in the dark sky at once, slowly.
 */
const SATELLITES = 16;
/** Same sky every visit. */
const SEED = 0x027;
/**
 * Client px round a satellite that its panel covers, as murcia.css hangs it
 * from the point (`.about-brands__panel`), with a little air: the desktop's,
 * the larger. Up: the 20px tether, the 76px plate, 6px and the name's line.
 * Across: half the widest name in the content (about 110px) rather than half
 * the plate. The lanes (`BRAND_LANES_NDC`) are drawn so two of these never
 * touch and none is cut at the top: `sky/brandLanes.test.ts`.
 */
export const PANEL_REACH = { left: 64, right: 64, up: 120, down: 8 } as const;
/** Seconds the brands take to fade in once the stop is held. */
const REVEAL_SECONDS = 0.5;
/**
 * How far along its lane the newest crossing is when the stop is reached. The
 * one before is an interval further on, so two brands are already well into
 * the sky rather than one about to leave and one about to come.
 */
const ARRIVAL_PHASE = 0.2;
/** World units out along a direction to project it: far, like the points. */
const PROJECT_DISTANCE = 1000;

export function createAboutSky(options: AboutSkyOptions): AboutSky {
  // A camera stood on the sky stop's pose with the live lens: the frame the
  // passes aim at and the lanes are drawn in.
  const eyeOnStop = (): THREE.PerspectiveCamera => {
    const { pose } = options.skyView();
    const eye = new THREE.PerspectiveCamera(options.lens.fov, options.lens.aspect, options.lens.near, options.lens.far);
    eye.position.copy(pose.position);
    eye.lookAt(pose.target);
    eye.updateMatrixWorld();
    return eye;
  };
  const passesFor = (eye: THREE.Camera): SkyPass[] =>
    createSkyPasses({ count: SATELLITES, focus: skyFocusOf(eye, options.skyView().focus), seed: SEED });
  const lanesFor = (eye: THREE.Camera): BrandLane[] =>
    options.skyView().lanes.map((lane) => ({ from: skyFocusOf(eye, lane.from), to: skyFocusOf(eye, lane.to) }));

  let eye = eyeOnStop();
  let passes = passesFor(eye);
  let crossings: BrandCrossings = createBrandCrossings(lanesFor(eye), options.brands.length);

  // The brand satellites' light follows the reveal, as their panels do.
  let reveal = 0;
  const brandPasses: SkyPass[] = options.brands.map((_, brand) => ({
    direction: (t) => crossings.passes[brand]!.direction(t),
    alpha: (t) => crossings.passes[brand]!.alpha(t) * reveal,
  }));

  const ambient: SkySatellites = createSkySatellites(SATELLITES, options.lens.far);
  const branded: SkySatellites = createSkySatellites(options.brands.length, options.lens.far);
  branded.object3D.name = 'sky-brand-satellites';
  const object3D = new THREE.Group();
  object3D.add(ambient.object3D, branded.object3D);
  const panels: BrandPanels = createBrandPanels(options.container, options.brands);

  const world = new THREE.Vector3();
  const client = new THREE.Vector3();
  let clock = 0;
  let laneClock = 0;
  let panelsOn = false;

  const toWorld = (direction: Direction, camera: THREE.Camera, out: THREE.Vector3): THREE.Vector3 =>
    out.set(direction[0], direction[1], direction[2]).multiplyScalar(PROJECT_DISTANCE).add(camera.position);

  const hideBrands = (): void => {
    panelsOn = false;
    reveal = 0;
    branded.setVisible(false);
    panels.update([]);
  };

  return {
    object3D,

    update(delta, camera, rect, state) {
      const step = Math.max(0, delta);
      clock += step;
      laneClock += step;
      ambient.setVisible(state.lit);
      if (state.lit) ambient.update(passes, clock);

      if (!state.panels) {
        if (panelsOn) hideBrands();
        return;
      }
      if (!panelsOn) {
        // Arrival: the timetable is set so the newest crossing is ARRIVAL_PHASE
        // along, on the next turn of the brands — they rotate across visits.
        panelsOn = true;
        const { interval } = crossings;
        laneClock = Math.ceil(laneClock / interval) * interval + ARRIVAL_PHASE * CROSS_SECONDS;
      }
      reveal = Math.min(1, reveal + step / REVEAL_SECONDS);
      branded.setVisible(true);
      branded.update(brandPasses, laneClock);

      const placed = [];
      for (let brand = 0; brand < brandPasses.length; brand += 1) {
        const pass = brandPasses[brand]!;
        const opacity = pass.alpha(laneClock);
        if (opacity <= 0.01) continue;
        const point = worldToClient(rect, camera, toWorld(pass.direction(laneClock), camera, world), client);
        if (!point) continue;
        placed.push({ brand, opacity, x: point.x - rect.left, y: point.y - rect.top });
      }
      panels.update(placed);
    },

    reframe() {
      eye = eyeOnStop();
      passes = passesFor(eye);
      crossings = createBrandCrossings(lanesFor(eye), options.brands.length);
    },

    setPixelRatio(ratio) {
      ambient.setPixelRatio(ratio);
      branded.setPixelRatio(ratio);
    },

    dispose() {
      ambient.dispose();
      branded.dispose();
      object3D.removeFromParent();
      panels.dispose();
    },
  };
}
