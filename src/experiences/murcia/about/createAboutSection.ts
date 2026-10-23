import type * as THREE from 'three';
import type { AboutSectionContent, AboutStop } from '../../../content/types';
import { createCampusOverlay, type OverlayAction, type OverlayCopy } from '../campus/section/campusOverlay';
import { CAMPUS_DOCK_QUERY } from '../campus/campusMobileLayout';
import { createAboutCamera } from './aboutCamera';
import { createAboutCameraAdapter, type AboutCameraRig } from './aboutCameraAdapter';
import { AboutInteraction } from './aboutInteraction';
import { createAboutScreenPaging } from './aboutScreenPaging';
import { ABOUT_LABELS } from './aboutLabels';
import { CITY_MARK, SKY_FOCUS_NDC, solveAboutStops, type AboutGeometry, type AboutPose } from './aboutPoses';

/**
 * Conócenos: the visit that starts at the base of the Vértigo tower. The one
 * thing `MurciaExperience` holds for it, shaped like the services section
 * (`campus/createServicesCampus.ts`) so the experience's aggregate reads —
 * `hasFocusedDistrict`, the pinch-out exit, the deferred resize — treat both
 * alike.
 *
 * Three stops, in a row that does not wrap: the screen, the city with the
 * isotype drawn over it, the sky. They are walked as the services are: the
 * plate's arrows under the copy, a horizontal swipe and ←/→ (user direction,
 * 2026-10-23: scrolling through them was not understood). The back arrow,
 * Escape or a pinch out flies back to where the visitor was standing. The
 * screen stop has no plate: the slide on the tower's screen is all it says,
 * with only the plate's arrows under it (`aboutScreenPaging.ts`). The last stop's plate carries the
 * call to action: Auditoría opens its dialog, and «Ver sus casos» asks the
 * application for the warp to Earth, which leaves from this stop
 * (`aboutCamera.ts`, `departure`).
 *
 * What the section shows besides its plate — the screen's sentences, the
 * isotype over the city, the satellites — answers to `stop` and `isEngaged`,
 * read by the host.
 */

/** Seconds: the campus's flight, so every flight in the city keeps one tempo. */
const FLIGHT_SECONDS = 1.4;
/** The campus's reduced-motion flight: a cut that still reads as a move. */
const REDUCED_FLIGHT_SECONDS = 0.12;

/** The stops, in order. */
export const ABOUT_STOPS = ['screen', 'city', 'sky'] as const;
export type AboutStopName = (typeof ABOUT_STOPS)[number];
const LAST_STOP = ABOUT_STOPS.length - 1;
/** The plate's modifier class: murcia.css places it, and `plateRect` finds it by it. */
const PLATE_CLASS = 'campus-overlay--about';

export interface AboutSectionOptions {
  camera: THREE.PerspectiveCamera;
  /** The shared canvas: the swipe listens on it. */
  canvas: HTMLCanvasElement;
  /** Murcia's UI host, where the plate mounts. */
  container: HTMLElement;
  content: AboutSectionContent;
  geometry: Omit<AboutGeometry, 'rest'>;
  /** The city's configured rest pose for this aspect: the city stop is solved from it. */
  restPose: (aspect: number) => AboutPose;
  rig: AboutCameraRig;
  reducedMotion: boolean;
  /** After the rig has taken the camera back, so a deferred pose can land. */
  onCameraReturned?: () => void;
  /** When `isEngaged` flips. No payload: read `isEngaged`. */
  onEngagedChange?: () => void;
  /** When the stop changes, and on leaving (null). */
  onStopChange?: (stop: AboutStopName | null) => void;
  onRequestAudit?: () => void;
  /** «Ver sus casos»: the warp to Earth, from the sky stop. */
  onRequestEarth?: () => void;
}

export interface AboutSection {
  /** Inside the section: from the press until the way out starts. */
  readonly isEngaged: boolean;
  readonly isFlying: boolean;
  /** While this must be the camera's only writer — the host defers pose writes. */
  readonly holdsCamera: boolean;
  /** The stop held or flown to; null outside. */
  readonly stop: AboutStopName | null;
  /** Held at the sky stop, where the warp may leave from. */
  readonly canDepart: boolean;
  /** From the overview only. False when disabled, already in, or the camera is someone else's. */
  enter(): boolean;
  next(): void;
  previous(): void;
  /** Leaves the section: the back arrow and Escape. */
  back(): void;
  /** Leaves from wherever it is. */
  releaseFocus(): void;
  /** The warp has taken over from the sky stop: the plate goes. */
  beginDeparture(): void;
  /** The warp's amount, while it leaves from here. */
  departure(amount: number): void;
  /** Back on the entry pose at once and the camera handed back: the warp's cut. */
  abandon(): void;
  setEnabled(next: boolean): void;
  /** The viewport changed: a held stop is re-framed for it. */
  reframe(): void;
  /** The sky stop for the current viewport, held or not, and where in its frame the satellites aim. */
  skyView(): { readonly pose: AboutPose; readonly focus: { readonly x: number; readonly y: number } };
  /** The city stop for the current viewport, held or not, and where in its frame the isotype is centred, and how large. */
  cityView(): { readonly pose: AboutPose; readonly mark: { readonly x: number; readonly y: number; readonly size: number } };
  /** How long a flight between stops takes, in seconds: the cut's under reduced motion. */
  readonly flightSeconds: number;
  /** Where the plate (or the phone's sheet) is on screen; null when it is not mounted. */
  plateRect(): DOMRect | null;
  update(dt: number): void;
  readonly snapshot: { readonly stop: AboutStopName | null; readonly flying: boolean; readonly holding: boolean };
  dispose(): void;
}

function paragraphsCopy(stop: AboutStop): Pick<OverlayCopy, 'title' | 'subtitle' | 'detail'> {
  const [first = '', ...rest] = stop.paragraphs;
  return { title: stop.title, subtitle: first, ...(rest.length > 0 ? { detail: rest.join('\n\n') } : {}) };
}

export function createAboutSection(options: AboutSectionOptions): AboutSection {
  const { content } = options;
  const seconds = options.reducedMotion ? REDUCED_FLIGHT_SECONDS : FLIGHT_SECONDS;
  const dock = window.matchMedia(CAMPUS_DOCK_QUERY);

  const adapter = createAboutCameraAdapter(options.rig, {
    ...(options.onCameraReturned ? { onReturn: options.onCameraReturned } : {}),
  });
  const solve = (): AboutPose[] =>
    solveAboutStops(
      { ...options.geometry, rest: options.restPose(options.camera.aspect) },
      { fov: options.camera.fov, aspect: options.camera.aspect },
      dock.matches ? 'docked' : 'sheet',
    );
  const camera = createAboutCamera({
    camera: options.camera,
    poses: solve,
    onControl: adapter.onCameraControl,
  });

  let enabled = true;
  let engaged = false;
  let departing = false;
  /** What waits for the flight to land: a stop's copy, or the screen stop's arrows. */
  let pendingCopy: OverlayCopy | 'paging' | null = null;

  const overlay = createCampusOverlay({
    labels: ABOUT_LABELS,
    onClose: () => back(),
    onPrevious: () => previous(),
    onNext: () => next(),
    container: options.container,
    // The site's text face, declared in siteHeader.css, as the campus passes it.
    fontFamily: 'Vertigo Text',
    hostLayout: true,
    // murcia.css docks this one on the right: the subject is framed left.
    className: PLATE_CLASS,
  });

  const paging = createAboutScreenPaging({
    container: options.container,
    labels: ABOUT_LABELS,
    onPrevious: () => previous(),
    onNext: () => next(),
  });

  const actions: OverlayAction[] = [
    { label: content.sky.auditLabel, variant: 'primary', onSelect: () => options.onRequestAudit?.() },
    { label: content.sky.casesLabel, variant: 'secondary', onSelect: () => options.onRequestEarth?.() },
  ];

  const copyFor = (index: number): OverlayCopy | 'paging' => {
    const name = ABOUT_STOPS[index]!;
    if (name === 'screen') return 'paging';
    return {
      ...paragraphsCopy(content[name]),
      ...(name === 'sky' ? { actions } : {}),
      hasPrevious: index > 0,
      hasNext: index < LAST_STOP,
    };
  };

  const setEngaged = (next: boolean): void => {
    if (next === engaged) return;
    engaged = next;
    options.onEngagedChange?.();
  };

  const goTo = (index: number): void => {
    overlay.hide();
    paging.hide();
    pendingCopy = copyFor(index);
    camera.flyTo(index, seconds);
    options.onStopChange?.(ABOUT_STOPS[index]!);
  };

  // A step is refused mid-flight, as the campus's is: its flights cannot be
  // cancelled in the air, and they are short.
  const next = (): void => {
    if (!engaged || departing || camera.flying || camera.stop >= LAST_STOP) return;
    goTo(camera.stop + 1);
  };
  const previous = (): void => {
    if (!engaged || departing || camera.flying || camera.stop <= 0) return;
    goTo(camera.stop - 1);
  };
  const leave = (): void => {
    if (!engaged || departing) return;
    overlay.hide();
    paging.hide();
    pendingCopy = null;
    camera.exit(seconds);
    setEngaged(false);
    options.onStopChange?.(null);
  };
  const back = leave;

  const interaction = new AboutInteraction(options.canvas, {
    get engaged() {
      return engaged;
    },
    next,
    previous,
    back,
  });

  return {
    get isEngaged() {
      return engaged;
    },
    get isFlying() {
      return camera.flying;
    },
    get holdsCamera() {
      return adapter.holding;
    },
    get stop() {
      return engaged ? ABOUT_STOPS[camera.stop]! : null;
    },
    get canDepart() {
      return engaged && !departing && !camera.flying && camera.stop === LAST_STOP;
    },
    get snapshot() {
      return { stop: this.stop, flying: camera.flying, holding: adapter.holding };
    },

    enter() {
      if (!enabled || engaged || !adapter.canTake) return false;
      departing = false;
      pendingCopy = copyFor(0);
      camera.enter(seconds);
      setEngaged(true);
      options.onStopChange?.(ABOUT_STOPS[0]);
      return true;
    },
    next,
    previous,
    back,
    releaseFocus: leave,

    beginDeparture() {
      if (!engaged || departing) return;
      departing = true;
      overlay.hide();
      paging.hide();
      pendingCopy = null;
    },

    departure(amount) {
      camera.departure(amount);
    },

    abandon() {
      if (!adapter.holding) return;
      overlay.hide();
      paging.hide();
      pendingCopy = null;
      departing = false;
      const wasEngaged = engaged;
      camera.abandon();
      setEngaged(false);
      if (wasEngaged) options.onStopChange?.(null);
    },

    setEnabled(nextEnabled) {
      enabled = nextEnabled;
      interaction.setEnabled(nextEnabled);
    },

    reframe() {
      camera.reframe();
    },

    skyView() {
      return { pose: solve()[LAST_STOP]!, focus: SKY_FOCUS_NDC[dock.matches ? 'docked' : 'sheet'] };
    },

    cityView() {
      return { pose: solve()[ABOUT_STOPS.indexOf('city')]!, mark: CITY_MARK[dock.matches ? 'docked' : 'sheet'] };
    },

    flightSeconds: seconds,

    plateRect() {
      return options.container.querySelector('.' + PLATE_CLASS)?.getBoundingClientRect() ?? null;
    },

    update(dt) {
      camera.update(dt);
      if (pendingCopy && engaged && !camera.flying && !departing) {
        if (pendingCopy === 'paging') paging.show({ hasPrevious: camera.stop > 0, hasNext: camera.stop < LAST_STOP });
        else overlay.show(pendingCopy);
        pendingCopy = null;
      }
    },

    dispose() {
      interaction.dispose();
      overlay.dispose();
      paging.dispose();
      camera.dispose();
    },
  };
}
