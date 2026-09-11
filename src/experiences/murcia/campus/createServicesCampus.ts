import * as THREE from 'three';
import type { DistrictContent } from '../../../content/types';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import { attachServicesCampus, type ServicesCampus } from './attachServicesCampus';
import { createCampusCameraAdapter, type CampusCameraRig } from './campusCameraAdapter';
import { buildServicesContent } from './campusContent';
import { campusLabel, DEFAULT_LOCALE } from './campusLabels';
import { CAMPUS_WATER_NODE_NAME } from './campusConfig';
import { CAMPUS_ICONS } from './content/campusIcons';
import { rasterizeIcons } from './content/iconLibrary';
import type { CampusSnapshot } from './section/campusState';
import { gatherCampus } from './gatherCampus';

/**
 * The services section, assembled in the city: the one thing `MurciaExperience`
 * holds for it.
 *
 * It replaces the display district and keeps that district's outward shape —
 * `isEngaged`, `isFlying`, `anchor`, `screenPoint`, `releaseFocus`,
 * `setEnabled`, `update`, `dispose` — so the experience's aggregate reads
 * (`hasFocusedDistrict`, the compass, the pinch-out exit) change what they call
 * and not what they mean.
 *
 * What it puts together:
 *   - the campus's nodes, gathered so the lab's code sees a campus-only root;
 *   - its content, from the CMS plus the scene's symbol rows;
 *   - its symbols, rasterised once — the one asynchronous step;
 *   - the lab's `attachServicesCampus`, which brings the water, the strip, the
 *     particles, the section's camera and its copy;
 *   - the rig hand-over (`campusCameraAdapter.ts`).
 *
 * Every failure leaves the campus as scenery and says why once: a city whose
 * services cannot open is a quieter city, not a broken one. The palette was
 * put on in `loadCity` and does not depend on any of this.
 */

export interface ServicesCampusSectionOptions {
  /** The city. The campus is gathered out of it. */
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  /** For projecting the lake to the screen. Input arrives with the interaction. */
  canvas: HTMLCanvasElement;
  /** Murcia's UI host, where the copy mounts. */
  container: HTMLElement;
  content: DistrictContent;
  binding: DistrictSceneBinding;
  rig: CampusCameraRig;
  /** Toward the scene's key light; the water's glint follows it. */
  keyLightDirection: THREE.Vector3;
  /** Drawing-buffer height, for point-size attenuation. */
  viewportHeightPx: number;
  reducedMotion: boolean;
  anisotropy: number;
  maxTextureSize: number;
  /** After the rig has taken the camera back, so a deferred pose can land. */
  onCameraReturned?: () => void;
  /** When `isEngaged` flips. No payload: read `isEngaged`. */
  onEngagedChange?: () => void;
  locale?: string;
}

export interface ServicesCampusSection {
  /** Anywhere but the overview. */
  readonly isEngaged: boolean;
  readonly isFlying: boolean;
  /** While this must be the camera's only writer — the host defers pose writes. */
  readonly holdsCamera: boolean;
  readonly snapshot: CampusSnapshot;
  /** The lake's centre at the water, for the compass. */
  anchor(out: THREE.Vector3): THREE.Vector3;
  /** The lake's centre in client pixels; null when it is behind the camera. */
  screenPoint(): { x: number; y: number } | null;
  /** From the overview only. False when something else holds the camera. */
  enter(): boolean;
  next(): void;
  previous(): void;
  toggleDetail(): void;
  /** One level out: the detail, then the section. */
  back(): void;
  /** Leaves the section from wherever it is. */
  releaseFocus(): void;
  setEnabled(next: boolean): void;
  resize(viewportHeightPx: number): void;
  update(dt: number): void;
  dispose(): void;
}

/** Seconds, and the reduced-motion values that replace the lab's cinematic ones. */
const REDUCED = { flight: 0.12, morph: 0.3, emergence: 0.2, convergence: 0.3 } as const;

export async function createServicesCampus(
  options: ServicesCampusSectionOptions,
): Promise<ServicesCampusSection | null> {
  const locale = options.locale ?? DEFAULT_LOCALE;

  const group = gatherCampus(options.root);
  if (!group) return null;

  const content = buildServicesContent(options.content, options.binding.services, locale);
  if (!content) {
    console.error(
      `[campus] "${options.content.id}" did not make a campus document — a service with no ` +
        'symbol row in scene/cityDistrictBindings.ts, or copy the parser refused. The campus stays scenery.',
    );
    return null;
  }

  let icons;
  try {
    icons = await rasterizeIcons(CAMPUS_ICONS);
  } catch (error) {
    console.error('[campus] the symbols did not rasterise; the campus stays scenery', error);
    return null;
  }

  const adapter = createCampusCameraAdapter(options.rig, {
    ...(options.onCameraReturned ? { onReturn: options.onCameraReturned } : {}),
  });

  let campus: ServicesCampus;
  try {
    campus = attachServicesCampus({
      root: group,
      camera: options.camera,
      lookTarget: adapter.lookTarget,
      onCameraControl: adapter.onCameraControl,
      content,
      icons,
      keyLightDirection: options.keyLightDirection,
      waterNode: CAMPUS_WATER_NODE_NAME,
      overlay: {
        labels: {
          readMore: campusLabel(locale, 'readMore'),
          close: campusLabel(locale, 'close'),
          leave: campusLabel(locale, 'leave'),
        },
        // The site's `/` declares no Inter face of its own (the blog's
        // stylesheet does), so the overlay registers it from the same woff2
        // the LED facade already loads.
        fontFamily: 'Vertigo Campus Inter',
        fontUrl: '/fonts/inter-latin-3100e775.woff2',
        container: options.container,
        closeButton: true,
      },
      viewportHeightPx: options.viewportHeightPx,
      screen: {
        anisotropy: options.anisotropy,
        reducedMotion: options.reducedMotion,
        maxTextureSize: options.maxTextureSize,
        // Half the lab's 16384. The facade keeps two canvas slots for its
        // crossfade, each 8192 x 159 RGBA — about 5 MB before mips, where 16384
        // is 21 MB — against a phone GPU budget measured at ~70 MB. A 3 m word
        // is 72 px tall. Raised only if the LED grid is seen to eat it.
        resolution: 8192,
      },
    });
  } catch (error) {
    console.error('[campus] the section did not attach; the campus stays scenery', error);
    return null;
  }

  if (options.reducedMotion) {
    // Cinematic motion goes; what is on screen does not. Flights become cuts,
    // the rise and the morphs are over almost as they start, and the settled
    // shapes stop swelling and swinging. The copy still follows each step.
    const { timing, particles, figureMotion } = campus.tuning;
    timing.flight = REDUCED.flight;
    timing.morph = REDUCED.morph;
    timing.figureSpread = 0;
    particles.emergenceSeconds = REDUCED.emergence;
    particles.convergenceSeconds = REDUCED.convergence;
    particles.swellAmplitude = 0;
    figureMotion.amplitude = 0;
    campus.applyParticles();
  }

  let enabled = true;
  let engaged = false;
  const unsubscribe = campus.state.subscribe((snapshot) => {
    const next = snapshot.stage !== 'overview';
    if (next === engaged) return;
    engaged = next;
    options.onEngagedChange?.();
  });

  const projected = new THREE.Vector3();

  return {
    get isEngaged() {
      return engaged;
    },
    get isFlying() {
      return campus.flying;
    },
    get holdsCamera() {
      return adapter.holding;
    },
    get snapshot() {
      return campus.state.snapshot;
    },
    anchor(out) {
      return out.copy(campus.lake.center);
    },
    screenPoint() {
      projected.copy(campus.lake.center).project(options.camera);
      if (projected.z > 1) return null;
      const rect = options.canvas.getBoundingClientRect();
      return {
        x: rect.left + ((projected.x + 1) / 2) * rect.width,
        y: rect.top + ((1 - projected.y) / 2) * rect.height,
      };
    },
    enter() {
      if (!enabled || engaged || !adapter.canTake) return false;
      adapter.seed();
      campus.enter();
      return true;
    },
    next: () => campus.next(),
    previous: () => campus.previous(),
    toggleDetail: () => campus.toggleDetail(),
    back: () => campus.back(),
    releaseFocus() {
      if (engaged) campus.exit();
    },
    setEnabled(next) {
      enabled = next;
    },
    resize(viewportHeightPx) {
      campus.resize(viewportHeightPx);
    },
    update(dt) {
      campus.update(dt);
    },
    dispose() {
      unsubscribe();
      // Hands back the water's and the strip's own materials, removes the
      // particles and the copy, and — if a visit was under way — the camera.
      campus.dispose();
    },
  };
}
