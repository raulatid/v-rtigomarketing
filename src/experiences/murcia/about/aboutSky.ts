import * as THREE from 'three';
import { worldToClient, type ElementRect } from '../../../interaction/screenSpace';
import { createBrandCrossings, CROSS_SECONDS, type BrandCrossings, type BrandLane } from '../sky/brandLanes';
import { createSkySatellites, skyFocusOf, type SkySatellites } from '../sky/createSkySatellites';
import { createSkyPasses, type Direction, type SkyPass } from '../sky/skyPasses';
import { createSkyVeil, type SkyVeil, type SkyVeilColors } from '../sky/createSkyVeil';
import { isotypeGlowAt, PULSE_LEAD, PULSE_SECONDS, pulseAt, revealedAt, type PulseFrame } from '../sky/skyPulse';
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
 * The stop is revealed by a pulse (plan 029b §2.3, `sky/skyPulse.ts`): the
 * ring leaves the rooftop isotype just before the flight lands, with the sky
 * of always outside it (`sky/createSkyVeil.ts`) and the night inside. Every
 * satellite and panel comes in as the front crosses it, a panel growing into
 * place, and the isotype flashes and keeps an ember for as long as the stop
 * does (`isotypeGlow`, which the host hands the tower's logo).
 *
 * Plan 027 decision 6: none of it answers to reduced motion. With the camera
 * held, this is a still view with points of light moving across it, and
 * taking them away takes the stop's point away — the opposite of the campus's
 * particles, which hold still. The camera's flights in and out do answer to it.
 * The pulse does not either (decision R8, 2026-11-22): it crosses once, in
 * under two seconds, and a reduced-motion cut only makes it leave sooner.
 *
 * Costs nothing outside the section: the points are hidden and nothing is
 * computed unless the section holds the camera, and the brands only show
 * while the sky stop is flown to or held. The veil exists only while the ring
 * runs. The clocks run on regardless — one addition a frame — so the sky is
 * where it would be when it is next seen.
 */

export interface AboutSkyOptions {
  /** Murcia's UI host: the panels mount here. */
  container: HTMLElement;
  /** The CMS's cases that have an isotype, one satellite each. */
  brands: readonly Brand[];
  /** The camera whose lens the sky stop is seen through. Its far plane places the points, as the dome's does. */
  lens: THREE.PerspectiveCamera;
  /** The middle of the rooftop isotype, world space: where the pulse leaves from. */
  origin: THREE.Vector3;
  /** The dome's colours under the night: the sky of always, outside the pulse. */
  skyColors: SkyVeilColors;
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
  /** The sky stop is flown to or held, and not being left: the brands may show. */
  readonly panels: boolean;
}

export interface AboutSky {
  readonly object3D: THREE.Object3D;
  /** Parts born hidden, which `compileAsync` skips: the host's warm-up reveals them for the compile. */
  readonly precompileTargets: readonly THREE.Object3D[];
  /**
   * The isotype's `emissiveIntensity` this frame: the flash and the ember of
   * the pulse, falling away once the stop is left. 0 outside it.
   */
  readonly isotypeGlow: number;
  /**
   * The visit is flying to the sky stop: the ring leaves `PULSE_LEAD` before a
   * flight of `flightSeconds` lands, and the brands' timetable is set so two
   * are well into the sky as it does.
   */
  arrive(flightSeconds: number): void;
  /** The sky stop is left: the isotype's light goes. A ring still running runs out. */
  leave(): void;
  /** The warp leaves from the stop: a ring still running is over, everything revealed. */
  completeReveal(): void;
  /** After whoever moved the camera, so a panel sits on its satellite. */
  update(delta: number, camera: THREE.Camera, rect: ElementRect, state: AboutSkyState): void;
  /** The layout may have changed: the passes and the lanes are drawn in its frame again. */
  reframe(): void;
  /** The veil's horizon follows the fog, as the dome's does (the city's night). */
  setHorizon(color: THREE.Color): void;
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
/** The share of its size a panel starts at as the front reaches it: it grows into place. */
const PANEL_POP_FROM = 0.72;
/** Seconds the isotype's light takes to go once the stop is left. */
const GLOW_FADE_SECONDS = 0.6;
/**
 * How far along its lane the newest crossing is when the ring leaves. The
 * one before is an interval further on, so two brands are already well into
 * the sky rather than one about to leave and one about to come.
 */
const ARRIVAL_PHASE = 0.2;
/** World units out along a direction to project it: far, like the points. */
const PROJECT_DISTANCE = 1000;

const easeOutCubic = (t: number): number => 1 - Math.pow(1 - t, 3);

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

  // The pulse: seconds since the ring left, negative before it does. Never
  // sent, it has long run out, and everything is revealed.
  let pulseClock = Number.POSITIVE_INFINITY;
  let pulse: PulseFrame = pulseAt(pulseClock);
  /** The isotype's direction from this frame's eye. */
  const origin = new THREE.Vector3(0, 1, 0);
  const eyeAt = new THREE.Vector3();
  const revealOf = (d: Direction): number =>
    revealedAt(pulse, Math.acos(Math.min(1, Math.max(-1, d[0] * origin.x + d[1] * origin.y + d[2] * origin.z))));
  let glowOn = false;
  let glow = 0;
  let glowFadeRate = 0;

  // Every point of light comes in as the front crosses it, a brand's panel with it.
  const revealedPasses = (source: () => readonly SkyPass[]): SkyPass[] =>
    source().map((_, index) => ({
      direction: (t) => source()[index]!.direction(t),
      alpha: (t) => {
        const pass = source()[index]!;
        return pass.alpha(t) * revealOf(pass.direction(t));
      },
    }));
  const ambientPasses = revealedPasses(() => passes);
  const brandPasses = revealedPasses(() => crossings.passes);

  const ambient: SkySatellites = createSkySatellites(SATELLITES, options.lens.far);
  const branded: SkySatellites = createSkySatellites(options.brands.length, options.lens.far);
  branded.object3D.name = 'sky-brand-satellites';
  const veil: SkyVeil = createSkyVeil(options.skyColors, options.lens.far);
  const object3D = new THREE.Group();
  object3D.add(veil.object3D, ambient.object3D, branded.object3D);
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
    branded.setVisible(false);
    panels.update([]);
  };

  return {
    object3D,
    precompileTargets: [veil.object3D, ambient.object3D, branded.object3D],

    get isotypeGlow() {
      return glow;
    },

    arrive(flightSeconds) {
      const wait = Math.max(0, flightSeconds - PULSE_LEAD);
      pulseClock = -wait;
      glowOn = true;
      // The timetable is set so the newest crossing is ARRIVAL_PHASE along as
      // the ring leaves, on the next turn of the brands — they rotate across visits.
      const { interval } = crossings;
      laneClock = Math.ceil(laneClock / interval) * interval + ARRIVAL_PHASE * CROSS_SECONDS - wait;
    },

    leave() {
      if (!glowOn) return;
      glowOn = false;
      glowFadeRate = glow / GLOW_FADE_SECONDS;
    },

    completeReveal() {
      if (pulseClock < PULSE_SECONDS) pulseClock = PULSE_SECONDS;
    },

    update(delta, camera, rect, state) {
      const step = Math.max(0, delta);
      clock += step;
      laneClock += step;
      pulseClock += step;
      pulse = pulseAt(pulseClock);
      glow = glowOn ? isotypeGlowAt(pulseClock) : Math.max(0, glow - glowFadeRate * step);

      camera.getWorldPosition(eyeAt);
      origin.copy(options.origin).sub(eyeAt).normalize();
      const veiled = state.lit && !pulse.done;
      veil.setVisible(veiled);
      if (veiled) veil.set(origin, pulse.front, pulse.glow);

      ambient.setVisible(state.lit);
      if (state.lit) ambient.update(ambientPasses, clock);

      if (!state.panels) {
        if (panelsOn) hideBrands();
        return;
      }
      panelsOn = true;
      branded.setVisible(true);
      branded.update(brandPasses, laneClock);

      const placed = [];
      for (let brand = 0; brand < crossings.passes.length; brand += 1) {
        const pass = crossings.passes[brand]!;
        const direction = pass.direction(laneClock);
        const revealed = revealOf(direction);
        const opacity = pass.alpha(laneClock) * revealed;
        if (opacity <= 0.01) continue;
        const point = worldToClient(rect, camera, toWorld(direction, camera, world), client);
        if (!point) continue;
        const scale = PANEL_POP_FROM + (1 - PANEL_POP_FROM) * easeOutCubic(revealed);
        placed.push({ brand, opacity, scale, x: point.x - rect.left, y: point.y - rect.top });
      }
      panels.update(placed);
    },

    reframe() {
      eye = eyeOnStop();
      passes = passesFor(eye);
      crossings = createBrandCrossings(lanesFor(eye), options.brands.length);
    },

    setHorizon(color) {
      veil.setHorizon(color);
    },

    setPixelRatio(ratio) {
      ambient.setPixelRatio(ratio);
      branded.setPixelRatio(ratio);
    },

    dispose() {
      veil.dispose();
      ambient.dispose();
      branded.dispose();
      object3D.removeFromParent();
      panels.dispose();
    },
  };
}
