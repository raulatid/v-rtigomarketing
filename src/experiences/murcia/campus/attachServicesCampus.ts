import * as THREE from 'three';
import type { IconMasks } from './content/iconLibrary';
import type { ServicesContent } from './content/servicesContent';
import { findLakeBasin } from './lake/lakeBasin';
import { attachLakeWater, type LakeWater, type LakeWaterConfig } from './lake/lakeWater';
import { figureLayout, iconMotionLayout, type FigureMotion } from './particles/figureLayouts';
import { discLayout, type TargetLayout } from './particles/layouts';
import { sampleMask, seededRandom, type MaskSample } from './particles/maskSampling';
import { createParticleField, type ParticleFieldConfig } from './particles/particleField';
import { createCampusCamera, type CampusCameraTuning, type CampusFraming } from './section/campusCamera';
import { createCampusOverlay, type OverlayCopy } from './section/campusOverlay';
import { createCampusState, type CampusSnapshot } from './section/campusState';
import { attachCampusScreen, type CampusScreen } from './campusScreen/attachCampusScreen';
import type { FacadeContentDocument } from '../landmark/towerScreen/content/facadeContent';

/**
 * The services campus: the one entry point, and the portable module.
 *
 * Copied from the lab's `core/`, which imports `three` and itself and nothing
 * else. Given a loaded campus and a camera, it puts the water on the lake, the
 * particle field over it, and runs the section: enter, step through the
 * services — each turning between its symbol and its figure on its own —
 * back out.
 *
 * It owns no scene, no model, no render loop, no controls — and, on the site,
 * no input. The lab's own lake click and swipe listened on the canvas; here
 * the city's interaction already owns every pointer on that canvas, so it
 * calls `enter`, `next`, `previous` and `back` instead, and
 * reads `lake` to know where the click lands. The host ticks `update`,
 * resizes it, and hands the camera over around flights through
 * `onCameraControl`. Content and icons are injected, already parsed.
 *
 * Every tuning object is exposed live for a panel; a change that moves
 * geometry needs `rebuildParticles()`, the rest `applyParticles()` or
 * `applyWater()`.
 */

export interface ServicesCampusOptions {
  /** The loaded campus. The water node is found inside it by name. */
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  /** The vector the camera looks at; written by flights. The lab passes `controls.target`. */
  lookTarget: THREE.Vector3;
  /** The host disables its own camera control on `false` and takes it back on `true`. */
  onCameraControl: (enabled: boolean) => void;
  content: ServicesContent;
  /** Every service's `icon` must be a key here. */
  icons: IconMasks;
  keyLightDirection: THREE.Vector3;
  /** The water mesh's node name in the export. */
  waterNode?: string;
  overlay: {
    /** `leave` names the back button, when there is one. */
    labels: { readonly leave: string };
    fontFamily?: string;
    fontUrl?: string;
    /** Where the copy mounts. Defaults to the body. */
    container?: HTMLElement;
    /** A back arrow at the copy's top-left that does what `back` does. */
    closeButton?: boolean;
    /** The host's stylesheet places the copy. See `CampusOverlayOptions.hostLayout`. */
    hostLayout?: boolean;
  };
  /** Where the subject sits in the frame. See `CampusCameraOptions.framing`. */
  framing?: () => CampusFraming;
  /** Drawing-buffer height, for point-size attenuation. */
  viewportHeightPx: number;
  /** The ring's LED screen. Omit it and the strip keeps the export's material. */
  screen?: {
    anisotropy: number;
    reducedMotion: boolean;
    maxTextureSize?: number;
    document?: FacadeContentDocument;
    resolution?: number;
  };
}

/** Seconds. Edited live by a panel. */
export interface SectionTiming {
  flight: number;
  morph: number;
  /** Of the figure morph, how much staggers the starts: the draw-in-order. */
  figureSpread: number;
  /** How long a service holds its symbol, or its figure, once formed, before turning into the other. */
  formHold: number;
}

/** The screen's look. Edited live by a panel; applied through `applyScreen`. */
export interface ScreenTuning {
  brightness: number;
  led: number;
  /** How fast the word runs round the ring, in design metres per second. */
  scrollMetresPerSecond: number;
}

/** LED pitch in design metres, the same as the tower's. */
const LED_PITCH_METRES = 0.09;

/** World units, scaled from the lake radius. Edited live by a panel. */
export interface SectionShapes {
  discRadius: number;
  /** Height of the disc, and of the symbols, above the water. */
  lift: number;
  iconWidth: number;
}

export interface ServicesCampus {
  update(dt: number): void;
  resize(viewportHeightPx: number): void;
  dispose(): void;
  enter(): void;
  next(): void;
  previous(): void;
  /** Leaves the section. What Escape and the back arrow do. */
  back(): void;
  exit(): void;
  /** True while a camera flight is running. */
  readonly flying: boolean;
  /**
   * The water a click enters from. The node holds every pool on the site, so a
   * hit counts only within `radius * 1.1` of `center` on the ground plane.
   */
  readonly lake: { readonly mesh: THREE.Object3D; readonly center: THREE.Vector3; readonly radius: number };
  readonly state: {
    readonly snapshot: CampusSnapshot;
    subscribe(listener: (snapshot: CampusSnapshot, previous: CampusSnapshot) => void): () => void;
  };
  /** The lake's radius: what every default was scaled from. */
  readonly lakeRadius: number;
  readonly tuning: {
    readonly particles: ParticleFieldConfig;
    readonly water: LakeWaterConfig;
    readonly shapes: SectionShapes;
    readonly timing: SectionTiming;
    readonly camera: CampusCameraTuning;
    readonly figureMotion: FigureMotion;
    readonly screen: ScreenTuning;
  };
  /** Null when no screen was asked for or the strip is missing. */
  readonly screen: CampusScreen | null;
  applyParticles(): void;
  rebuildParticles(): void;
  applyWater(): void;
  applyScreen(): void;
  /** The rise, 0..1. Scrubbing it pauses playback. */
  progress(): number;
  setProgress(value: number): void;
  playing(): boolean;
  setPlaying(value: boolean): void;
}

const DEFAULT_WATER_NODE = 'PARK_Water';

export function attachServicesCampus(options: ServicesCampusOptions): ServicesCampus {
  const { root, camera, lookTarget, content, icons } = options;

  for (const service of content.services) {
    if (!icons.has(service.icon)) {
      throw new Error(
        `[service-campus] service "${service.id}" names icon "${service.icon}", which the library does not have`,
      );
    }
  }

  const lake = findLakeBasin(root, options.waterNode ?? DEFAULT_WATER_NODE);
  if (!lake) throw new Error('[service-campus] no water node in the campus; the particles have no source');
  const { basin } = lake;
  const r = basin.radius;

  // ---- the water -------------------------------------------------------------

  const water: LakeWaterConfig = {
    waveLength: r * 0.12,
    speed: 0.5,
    strength: 1.8,
    gloss: 220,
    caustics: 0.45,
    deep: 0x0d3a52,
    shallow: 0x2a7d9c,
    sky: 0x8fb8d4,
    horizon: 0xd6e6ef,
  };
  const surface: LakeWater = attachLakeWater(lake.mesh, options.keyLightDirection, water);

  // ---- the ring screen -------------------------------------------------------

  const screenTuning: ScreenTuning = { brightness: 1.35, led: 0.34, scrollMetresPerSecond: 6 };
  const screen: CampusScreen | null = options.screen
    ? attachCampusScreen(root, {
        anisotropy: options.screen.anisotropy,
        reducedMotion: options.screen.reducedMotion,
        ...(options.screen.maxTextureSize === undefined ? {} : { maxTextureSize: options.screen.maxTextureSize }),
        ...(options.screen.document === undefined ? {} : { document: options.screen.document }),
        ...(options.screen.resolution === undefined ? {} : { resolution: options.screen.resolution }),
      })
    : null;
  const applyScreen = (): void => {
    screen?.facade?.setBrightness(screenTuning.brightness);
    screen?.facade?.setLed(screenTuning.led, LED_PITCH_METRES);
    screen?.facade?.setScroll(screenTuning.scrollMetresPerSecond / (screen.facade.metresWide || 1));
  };
  applyScreen();

  // ---- the particles ---------------------------------------------------------

  // Everything below is scaled from the lake, so a re-export at a different
  // size still starts sensibly.
  const particles: ParticleFieldConfig = {
    count: 4000,
    emergenceHeight: r * 0.3,
    // 2 s from the first particle to the disc, where the lab took 9: on the
    // site the intro copy waits for the last settle, and nine seconds read as
    // the section stalling. Close to the lab's 4:5 split, so the rise keeps
    // its shape.
    emergenceSeconds: 0.9,
    convergenceSeconds: 1.1,
    size: r * 0.04,
    swellAmplitude: r * 0.03,
    swellLength: r * 1.2,
    swellSpeed: 0.5,
    color: 0xdfeef7,
    opacity: 0.85,
  };
  const shapes: SectionShapes = { discRadius: r * 0.85, lift: r * 0.8, iconWidth: r * 1.4 };
  const timing: SectionTiming = { flight: 1.4, morph: 1.8, figureSpread: 0.85, formHold: 3 };
  const cameraTuning: CampusCameraTuning = { distance: r * 4.5, elevationDeg: 24, direction: 1 };
  const figureMotion: FigureMotion = { speed: 1, amplitude: 1 };

  /** The disc's centre, and what every camera stop looks at. */
  const focus = (): THREE.Vector3 =>
    new THREE.Vector3(basin.center.x, basin.center.y + shapes.lift, basin.center.z);

  const field = createParticleField(basin, particles);
  field.setViewport(options.viewportHeightPx);
  root.add(field.points);

  // Icons sampled once per name at the current count; a rebuild empties the
  // cache, because a layout must hand every particle a point.
  const samples = new Map<string, MaskSample[]>();
  const iconSamples = (name: string): MaskSample[] => {
    let cached = samples.get(name);
    if (!cached) {
      cached = sampleMask(icons.get(name)!, particles.count, seededRandom(hash(name)));
      samples.set(name, cached);
    }
    return cached;
  };

  const campusCamera = createCampusCamera({
    camera,
    lookTarget,
    onControl: options.onCameraControl,
    focus: focus(),
    stops: content.services.length + 1,
    tuning: cameraTuning,
    ...(options.framing === undefined ? {} : { framing: options.framing }),
  });

  const disc = (): TargetLayout => discLayout(focus(), shapes.discRadius);
  /** A vertical plane above the lake that faces the camera at `stop`. */
  const facing = (stop: number) => {
    const a = campusCamera.azimuthOf(stop);
    return {
      center: focus(),
      right: new THREE.Vector3(Math.cos(a), 0, -Math.sin(a)),
      up: new THREE.Vector3(0, 1, 0),
      width: shapes.iconWidth,
    };
  };
  const icon = (name: string, stop: number, time: number): TargetLayout =>
    iconMotionLayout(iconSamples(name), facing(stop), time, figureMotion);
  const figure = (kind: ServicesContent['services'][number]['figure'], stop: number, time: number): TargetLayout =>
    figureLayout(kind, facing(stop), time, figureMotion);

  const rebuildParticles = (): void => {
    samples.clear();
    field.rebuild(particles, disc());
  };
  rebuildParticles();

  // ---- the section -----------------------------------------------------------

  const state = createCampusState(content.services.length);

  let playing = false;
  /** The section's clock, so copy can be shown after a flight or a morph lands. */
  let clock = 0;
  /** When the current step's own morph lands. The symbol ⇄ figure turns do not count. */
  let stepMorphUntil = 0;
  /**
   * Nothing steps while a flight or the step's morph is still running. Not
   * `field.morph`: a service turns between its forms on its own, and a swipe
   * must not be refused for half of every turn.
   */
  const settled = (): boolean => !campusCamera.flying && clock >= stepMorphUntil;

  const back = (): void => state.exit();

  const overlay = createCampusOverlay({
    labels: options.overlay.labels,
    ...(options.overlay.container === undefined ? {} : { container: options.overlay.container }),
    ...(options.overlay.closeButton ? { onClose: back } : {}),
    ...(options.overlay.fontFamily === undefined ? {} : { fontFamily: options.overlay.fontFamily }),
    ...(options.overlay.fontUrl === undefined ? {} : { fontUrl: options.overlay.fontUrl }),
    ...(options.overlay.hostLayout ? { hostLayout: true } : {}),
  });

  let pendingCopy: { at: number; copy: OverlayCopy } | null = null;
  const showLater = (copy: OverlayCopy, after: number): void => {
    pendingCopy = { at: clock + after, copy };
  };

  /**
   * A service's two forms in turn: its symbol, then its figure, then its
   * symbol again, each held `formHold` once formed. Null outside a service.
   */
  type Form = 'icon' | 'figure';
  let cycle: { service: ServicesContent['services'][number]; stop: number; form: Form; swapAt: number } | null =
    null;
  const showForm = (form: Form, seconds: number): void => {
    if (!cycle) return;
    const { service, stop } = cycle;
    // `setLayout` clears the live layout, so the live one is set after it.
    if (form === 'icon') {
      field.setLayout(icon(service.icon, stop, 0), seconds);
      field.setLiveLayout((time) => icon(service.icon, stop, time));
    } else {
      // Drawn in order, as the figure always was.
      field.setLayout(figure(service.figure, stop, 0), seconds, timing.figureSpread);
      field.setLiveLayout((time) => figure(service.figure, stop, time));
    }
    cycle.form = form;
    cycle.swapAt = clock + seconds + timing.formHold;
  };

  // The one place a state change becomes something on screen.
  const unsubscribe = state.subscribe((snapshot, previous) => {
    overlay.hide();
    pendingCopy = null;
    cycle = null;

    if (snapshot.stage === 'overview') {
      playing = false;
      field.setElapsed(0);
      field.setLayout(disc(), 0.01);
      campusCamera.exit(timing.flight);
      return;
    }

    if (snapshot.stage === 'intro') {
      if (previous.stage === 'overview') {
        campusCamera.enter(timing.flight);
        // The rise. The copy waits for the last particle to settle.
        field.setElapsed(0);
        playing = true;
        showLater(content.intro, field.duration);
      } else {
        campusCamera.flyTo(snapshot.position, timing.flight);
        field.setLayout(disc(), timing.morph);
        stepMorphUntil = clock + timing.morph;
        showLater(content.intro, timing.morph);
      }
      return;
    }

    const service = content.services[snapshot.index];
    if (!service) return;
    // The whole copy, always: there is no read-more any more.
    const copy: OverlayCopy = { title: service.title, subtitle: service.subtitle, detail: service.detail };

    campusCamera.flyTo(snapshot.position, timing.flight);
    cycle = { service, stop: snapshot.position, form: 'icon', swapAt: Infinity };
    showForm('icon', timing.morph);
    stepMorphUntil = clock + timing.morph;
    showLater(copy, Math.max(timing.morph, timing.flight));
  });

  let disposed = false;

  return {
    update(dt) {
      if (disposed) return;
      clock += dt;
      surface.update(dt);
      screen?.update(dt);
      campusCamera.update(dt);
      const elapsed = field.tick(dt, playing);
      if (playing && elapsed >= field.duration) playing = false;
      if (pendingCopy && clock >= pendingCopy.at) {
        overlay.show(pendingCopy.copy);
        pendingCopy = null;
      }
      if (cycle && clock >= cycle.swapAt && !campusCamera.flying) {
        showForm(cycle.form === 'icon' ? 'figure' : 'icon', timing.morph);
      }
    },
    resize(viewportHeightPx) {
      field.setViewport(viewportHeightPx);
      // The framing is a fraction of the frame, so a new aspect moves it.
      campusCamera.reframe();
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      unsubscribe();
      screen?.dispose();
      overlay.dispose();
      campusCamera.dispose();
      root.remove(field.points);
      field.dispose();
      // Hands the export's own water material back before the host sweeps.
      surface.dispose();
    },

    enter: () => state.enter(),
    next: () => {
      if (settled()) state.next();
    },
    previous: () => {
      if (settled()) state.previous();
    },
    back,
    exit: () => state.exit(),
    get flying() {
      return campusCamera.flying;
    },
    lake: { mesh: lake.mesh, center: basin.center, radius: r },
    state: {
      get snapshot() {
        return state.snapshot;
      },
      subscribe: (listener) => state.subscribe(listener),
    },

    lakeRadius: r,
    tuning: { particles, water, shapes, timing, camera: cameraTuning, figureMotion, screen: screenTuning },
    screen,
    applyParticles: () => field.configure(particles),
    rebuildParticles,
    applyWater: () => surface.configure(water),
    applyScreen,

    progress: () => Math.min(1, field.elapsed / field.duration),
    setProgress(value) {
      playing = false;
      field.setElapsed(value * field.duration);
    },
    playing: () => playing,
    setPlaying(value) {
      playing = value;
    },
  };
}

/** A stable seed from a name, so an icon samples the same way every visit. */
function hash(name: string): number {
  let h = 2166136261;
  for (let i = 0; i < name.length; i += 1) h = Math.imul(h ^ name.charCodeAt(i), 16777619);
  return h >>> 0;
}
