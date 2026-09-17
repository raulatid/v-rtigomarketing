import * as THREE from 'three';
import type { DistrictContent } from '../../../content/types';
import type { CursorManager } from '../../../interaction/cursorManager';
import { worldToClient } from '../../../interaction/screenSpace';
import { DistrictA11y, type DistrictA11yView } from '../district/ui/districtA11y';
import type { DistrictSceneBinding } from '../scene/cityDistrictBindings';
import { attachServicesCampus, type ServicesCampus } from './attachServicesCampus';
import { createCampusCameraAdapter, type CampusCameraRig } from './campusCameraAdapter';
import type { CampusFraming } from './section/campusCamera';
import { CampusInteraction } from './campusInteraction';
import { buildServicesContent } from './campusContent';
import { campusLabel, DEFAULT_LOCALE } from './campusLabels';
import { CAMPUS_BUILDING_NODE_NAMES, CAMPUS_WATER_NODE_NAME } from './campusConfig';
import { createBuildingHighlight } from '../interaction/buildingHighlight';
import { CAMPUS_ICONS } from './content/campusIcons';
import { rasterizeIcons } from './content/iconLibrary';
import type { CampusSnapshot } from './section/campusState';
import { gatherCampus } from './gatherCampus';
import { CAMPUS_DOCK_QUERY, campusMobileFraming } from './campusMobileLayout';

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
 *   - the rig hand-over (`campusCameraAdapter.ts`);
 *   - the buildings' hover light (`interaction/buildingHighlight.ts`);
 *   - the city's pointer and keyboard (`campusInteraction.ts`), and the
 *     keyboard and screen-reader surface (`district/ui/districtA11y.ts`),
 *     both driving the same intents.
 *
 * Every failure leaves the campus as scenery and says why once: a city whose
 * services cannot open is a quieter city, not a broken one. The palette was
 * put on in `loadCity` and does not depend on any of this.
 */

export interface ServicesCampusSectionOptions {
  /** The city. The campus is gathered out of it. */
  root: THREE.Object3D;
  camera: THREE.PerspectiveCamera;
  /** The shared canvas: the interaction listens on it. */
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
  /** Arbitrates the cursor across every source on the shared canvas. */
  cursor: CursorManager;
  /** True while a pointer is panning the city. */
  isDragging: () => boolean;
  /** Tap tolerance per pointer type, the numbers the pan uses. */
  tapThresholdPx: { mouse: number; touch: number };
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
  /** Leaves the section: what Escape and the back arrow do. */
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

/**
 * Where the copy docks beside the subject instead of lying under it: the
 * satellite close-up's composition, mirrored — the plate on the left, the
 * particles on the right. The SAME string as the dock's media query in
 * murcia.css; they are two halves of one layout.
 *
 * Desktop and tablets in landscape, not the case panel's 768: a satellite is
 * small and the lake's disc is not. Its radius is ~0.34 of the half-width at
 * 16:9 and ~0.45 at 4:3, and ~0.8 on a portrait tablet — no room beside a
 * plate there, so a portrait tablet is framed as a phone.
 */
const DOCK_QUERY = CAMPUS_DOCK_QUERY;

/**
 * The disc's radius over the frame's half-height, at the tuned distance and
 * the city's 35° lens: 0.85 r / (tan 17.5° × 4.5 r). Over the half-WIDTH it is
 * this divided by the aspect, which is what the docked framing solves with.
 */
const DISC_OVER_HALF_HEIGHT = 0.6;

/**
 * Docked: the plate stays in the left half (murcia.css), so the focus goes
 * right by the disc's radius plus a margin, and the disc's left edge always
 * lands ~0.08 right of centre — 0.42 at 16:9, 0.53 at 4:3.
 */
const dockedFraming = (aspect: number): CampusFraming => ({
  x: DISC_OVER_HALF_HEIGHT / aspect + 0.08,
  y: 0,
  distanceScale: 1,
});

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

  const dock = window.matchMedia(DOCK_QUERY);

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
        labels: { leave: campusLabel(locale, 'leave'), measures: campusLabel(locale, 'measures'),
          expand: campusLabel(locale, 'expand'), collapse: campusLabel(locale, 'collapse'),
          previous: campusLabel(locale, 'previous'), next: campusLabel(locale, 'next') },
        // The site's text face, declared once for every document in
        // siteHeader.css — so no `fontUrl`, and the overlay registers nothing.
        // Its title takes the display face from murcia.css.
        fontFamily: 'Vertigo Text',
        container: options.container,
        closeButton: true,
        // murcia.css places it: under the subject, or docked at DOCK_QUERY.
        hostLayout: true,
      },
      framing: () => (dock.matches ? dockedFraming(options.camera.aspect)
        : campusMobileFraming(options.canvas.clientWidth, options.canvas.clientHeight)),
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
    // shapes stop swelling and swinging. The copy still follows each step. A
    // service still turns from its symbol into its figure, once: the figure
    // is content, and the plate's legend names it. The turn is a short morph,
    // and the figure stands still — nothing travels along it.
    const { timing, particles, figureMotion } = campus.tuning;
    timing.flight = REDUCED.flight;
    timing.morph = REDUCED.morph;
    timing.figureSpread = 0;
    particles.emergenceSeconds = REDUCED.emergence;
    particles.convergenceSeconds = REDUCED.convergence;
    particles.swellAmplitude = 0;
    particles.rotationSpeed = 0;
    figureMotion.amplitude = 0;
    campus.applyParticles();
  }

  let enabled = true;
  let engaged = false;

  const enter = (): boolean => {
    if (!enabled || engaged || !adapter.canTake) return false;
    adapter.seed();
    campus.enter();
    return true;
  };

  // Sanitized, as every lookup is: `ARCH_Porcelain_White.001` arrives without its dot.
  const buildingNames = new Set(
    CAMPUS_BUILDING_NODE_NAMES.map((name) => THREE.PropertyBinding.sanitizeNodeName(name)),
  );
  const buildings = group.children.filter((node) => buildingNames.has(node.name));
  const highlight = createBuildingHighlight(buildings);

  const interaction = new CampusInteraction({
    canvas: options.canvas,
    camera: options.camera,
    cursor: options.cursor,
    isDragging: options.isDragging,
    tapThresholdPx: options.tapThresholdPx,
    lake: campus.lake,
    buildings,
    onHoverChange: (hovering) => highlight.setTarget(hovering),
    section: {
      get stage() {
        return campus.state.snapshot.stage;
      },
      enter,
      next: () => campus.next(),
      previous: () => campus.previous(),
      back: () => campus.back(),
    },
    id: options.content.id,
  });

  const a11y = new DistrictA11y(options.container, options.content.label, locale, {
    onEnter: () => {
      enter();
    },
    onPrevious: () => campus.previous(),
    onNext: () => campus.next(),
    onBack: () => campus.back(),
  });

  const total = content.services.length;
  const pad = (n: number): string => String(n).padStart(2, '0');
  const viewFor = (snapshot: CampusSnapshot): DistrictA11yView | null => {
    if (snapshot.stage === 'overview') return null;
    if (snapshot.stage === 'intro') {
      // The intro's title IS the district's label, so it is not said twice.
      return { eyebrow: options.content.label, title: '', summary: content.intro.subtitle };
    }
    const service = content.services[snapshot.index];
    if (!service) return null;
    return {
      eyebrow: `${options.content.label} · ${pad(snapshot.index + 1)} / ${pad(total)}`,
      title: service.title,
      summary: service.subtitle,
    };
  };
  const a11yFor = (snapshot: CampusSnapshot) => ({ districtActive: snapshot.stage !== 'overview' });

  // The one subscription: the announcement, then the attention edge the
  // application stands its navigation down on.
  const unsubscribe = campus.state.subscribe((snapshot) => {
    a11y.update(a11yFor(snapshot), viewFor(snapshot));
    const next = snapshot.stage !== 'overview';
    if (next === engaged) return;
    engaged = next;
    options.onEngagedChange?.();
  });
  a11y.update(a11yFor(campus.state.snapshot), null);

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
      const point = worldToClient(
        options.canvas.getBoundingClientRect(),
        options.camera,
        campus.lake.center,
        projected,
      );
      return point === null ? null : { x: point.x, y: point.y };
    },
    enter,
    next: () => campus.next(),
    previous: () => campus.previous(),
    back: () => campus.back(),
    releaseFocus() {
      if (engaged) campus.exit();
    },
    setEnabled(next) {
      enabled = next;
      interaction.setEnabled(next);
    },
    resize(viewportHeightPx) {
      campus.resize(viewportHeightPx);
    },
    update(dt) {
      interaction.update();
      highlight.update(dt);
      campus.update(dt);
    },
    dispose() {
      unsubscribe();
      interaction.dispose();
      highlight.dispose();
      a11y.dispose();
      // Hands back the water's and the strip's own materials, removes the
      // particles and the copy, and — if a visit was under way — the camera.
      campus.dispose();
    },
  };
}
