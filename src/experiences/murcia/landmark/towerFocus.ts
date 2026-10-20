import * as THREE from 'three';
import { clamp01, easeInOutCubic } from '../../../utils/easing';
import type { ScreenFrame } from './towerTargets';

/**
 * Anuncios: the camera flies to stand square in front of the Vertigo tower's
 * LED screen, close enough to read what it is showing, and back again.
 *
 * There is nothing to open here — the screen IS the content, and it keeps
 * running its carousel as it always does. So this is a camera flight and its
 * hand-back, nothing else, built like the two the city already has:
 *
 *   - it writes the camera directly, as the blog's approach does, because its
 *     pose is the screen's own facing at a solved distance and the rig fixes
 *     elevation. It flies a POINT OF AIM with the eye, as the campus does,
 *     rather than turning the eye on its own: a turn interpolated apart from
 *     the travel swung the view across the city and lost the tower mid-flight;
 *   - it holds the rig under its own claim (`'tower'`) for the whole visit,
 *     taken at the start of the flight in and released only once the flight
 *     out has landed — and only the claim it took (trap: murcia-camara #17);
 *   - the flight out lands on EXACTLY the pose the viewer flew in from, so the
 *     rig adopts the camera it left and the springs resume with nothing to
 *     catch up on. The campus's `exit` keeps the same promise.
 *
 * Leaving is the host's business: Escape, or a tap anywhere but the screen
 * (`poiInteraction.ts`), or a pinch out through `releaseFocusedDistrict`.
 */

/** How much of the view the screen fills, on its tighter axis. */
export const SCREEN_FILL = 0.7;

/** Seconds: the campus's flight, so every flight in the city keeps one tempo. */
const FLIGHT_SECONDS = 1.4;
/** The campus's reduced-motion flight: a cut that still reads as a move. */
const REDUCED_FLIGHT_SECONDS = 0.12;

export interface TowerFocusCamera {
  /** False when something else holds the camera. Takes the claim when it returns true. */
  claim(): boolean;
  /** The flight out has landed: hand the camera back to the rig, and the claim with it. */
  release(): void;
}

export interface TowerFocusOptions {
  camera: THREE.PerspectiveCamera;
  frame: ScreenFrame;
  host: TowerFocusCamera;
  reducedMotion: boolean;
  /** When `isEngaged` flips. */
  onEngagedChange?: () => void;
}

export interface TowerFocus {
  /** Anywhere but the city: flying in, at the screen, or flying out. */
  readonly isEngaged: boolean;
  /** At the screen with no flight running. */
  readonly isHeld: boolean;
  /** False when already engaged or the camera is someone else's. */
  enter(): boolean;
  /** Flies back to where the viewer came from. A no-op unless in, or on the way in. */
  exit(): void;
  /** The screen's framing follows the viewport. Applied at once while held. */
  setViewport(aspect: number): void;
  update(deltaTime: number): void;
}

/**
 * Where to stand to see the screen square on, filling `fill` of the view on
 * whichever axis is tighter: a portrait phone is bound by the screen's width,
 * a desktop by its height.
 */
export function solveScreenView(
  frame: ScreenFrame,
  fovDegrees: number,
  aspect: number,
  fill = SCREEN_FILL,
): { position: THREE.Vector3; target: THREE.Vector3 } {
  const halfV = THREE.MathUtils.degToRad(fovDegrees) / 2;
  const tanH = Math.tan(halfV) * aspect;
  const byHeight = frame.height / fill / 2 / Math.tan(halfV);
  const byWidth = frame.width / fill / 2 / tanH;
  const distance = Math.max(byHeight, byWidth);
  return {
    position: frame.normal.clone().multiplyScalar(distance).add(frame.centre),
    target: frame.centre.clone(),
  };
}

type Phase = 'idle' | 'entering' | 'held' | 'leaving';

export function createTowerFocus(options: TowerFocusOptions): TowerFocus {
  const { camera, frame, host } = options;
  const seconds = options.reducedMotion ? REDUCED_FLIGHT_SECONDS : FLIGHT_SECONDS;

  // Where the viewer was, captured at the press; and the screen's pose. Each
  // with a point of aim: the origin's is straight ahead, as far out as the
  // screen is, so the flight's first frame turns nothing.
  const pose = () => ({ position: new THREE.Vector3(), quaternion: new THREE.Quaternion(), look: new THREE.Vector3() });
  const origin = pose();
  const view = pose();
  // The flight under way: from wherever the camera and its aim were when it began.
  const from = pose();
  const look = new THREE.Vector3();

  let phase: Phase = 'idle';
  let elapsed = 0;
  let aspect = camera.aspect;

  const solveView = (): void => {
    const solved = solveScreenView(frame, camera.fov, aspect);
    view.position.copy(solved.position);
    view.look.copy(solved.target);
    // Eye first, target second: the camera convention (a camera looks down -Z).
    view.quaternion.setFromRotationMatrix(
      new THREE.Matrix4().lookAt(solved.position, solved.target, THREE.Object3D.DEFAULT_UP),
    );
  };

  const setPhase = (next: Phase): void => {
    const wasEngaged = phase !== 'idle';
    phase = next;
    if (wasEngaged !== (phase !== 'idle')) options.onEngagedChange?.();
  };

  const beginFlight = (next: 'entering' | 'leaving'): void => {
    from.position.copy(camera.position);
    from.look.copy(look);
    elapsed = 0;
    setPhase(next);
  };

  const place = (at: ReturnType<typeof pose>): void => {
    camera.position.copy(at.position);
    camera.quaternion.copy(at.quaternion);
    camera.updateMatrixWorld();
    look.copy(at.look);
  };

  return {
    get isEngaged() {
      return phase !== 'idle';
    },

    get isHeld() {
      return phase === 'held';
    },

    enter(): boolean {
      if (phase !== 'idle' || !host.claim()) return false;
      origin.position.copy(camera.position);
      origin.quaternion.copy(camera.quaternion);
      const reach = camera.position.distanceTo(frame.centre);
      origin.look.copy(camera.getWorldDirection(look)).multiplyScalar(reach).add(camera.position);
      look.copy(origin.look);
      solveView();
      beginFlight('entering');
      return true;
    },

    exit(): void {
      if (phase === 'entering' || phase === 'held') beginFlight('leaving');
    },

    setViewport(nextAspect: number): void {
      aspect = nextAspect;
      if (phase === 'idle') return;
      solveView();
      if (phase === 'held') place(view);
    },

    update(deltaTime: number): void {
      if (phase !== 'entering' && phase !== 'leaving') return;
      elapsed += deltaTime;
      const t = clamp01(elapsed / seconds);
      const eased = easeInOutCubic(t);
      const to = phase === 'entering' ? view : origin;
      camera.position.lerpVectors(from.position, to.position, eased);
      look.lerpVectors(from.look, to.look, eased);
      camera.lookAt(look);
      camera.updateMatrixWorld();
      if (t < 1) return;
      // Landed exactly, so an adopt reads the pose it was promised.
      place(to);
      if (phase === 'entering') {
        setPhase('held');
      } else {
        host.release();
        setPhase('idle');
      }
    },
  };
}
