/**
 * Behavioural harness for Earth's drag orbit.  `npm run check:earth`
 *
 * Drives the REAL `createFocusCameraRig` through synthetic pointer sequences
 * against a stub canvas, then measures what the camera actually did. Nothing
 * here reimplements the rig's maths: expectations are derived from the drag
 * input alone (pixels x sensitivity = radians) and compared against the camera's
 * observed azimuth.
 *
 * WHY THIS FILE EXISTS. Earth's camera had no harness of any kind, and it was
 * hiding a defect of exactly the class `checks/navigation-feel.ts` was written
 * for. The rig stored rotation as an unbounded scalar (`orbit.theta`) and then
 * smoothed it in CARTESIAN space:
 *
 *     current.position.lerp(target.position, alpha).setLength(easedRadius)
 *
 * `target.position` is rebuilt from spherical coordinates every frame, so it
 * only depends on `theta mod 2*PI` — the winding is discarded. A straight lerp
 * between two points on a sphere always travels the MINOR arc, so the moment
 * the ease lagged the drag by more than half a turn, the interpolation pointed
 * the other way and the camera rotated BACKWARD while the user was still
 * dragging forward. Steady-state lag is omega/k; with `lerpK: 3` and
 * `orbitSensitivity: 0.004` that is half a turn at ~2356 px/s, and reachable
 * transiently from ~1400 px/s — an ordinary brisk drag.
 *
 * Murcia never had this: `CameraRig.yawDegrees` is an unbounded scalar that is
 * eased AS a scalar; the display district's flight harness asserted the
 * wound-up cases until that flight went with the district (plan 024). Section
 * 1 below is the Earth equivalent.
 *
 * Section 6 guards the opposite requirement, which is what made the original
 * mistake tempting: a RETURN from a close-up must take the short way round
 * rather than unwinding three turns. Drag preserves winding; the return does
 * not. One mechanism cannot do both, which is why the rig now has two.
 */
import * as THREE from 'three';
import { createFocusCameraRig } from '../src/experiences/earth/camera/createFocusCameraRig';
import {
  overviewRadiusForViewport,
  overviewRestPosition,
} from '../src/experiences/earth/camera/overviewPose';
import { INTERACTION_CONFIG } from '../src/experiences/earth/interaction/interactionConfig';
import { createCursorManager } from '../src/interaction/cursorManager';
import { EARTH_CONFIG } from '../src/experiences/earth/config/earthConfig';
import { banner, check, close, finish, section } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import type { StubElement } from './lib/stubDom';

const cfg = INTERACTION_CONFIG.camera;
const R = EARTH_CONFIG.radius;
// The real rest pose, angles included, so the harness drags from where the
// viewer actually starts rather than from the z axis it used to assume.
const OVERVIEW_POSE: [number, number, number] = overviewRestPosition();
/** The rest azimuth in the harness's own atan2(x, z) convention, radians. */
const REST_AZIMUTH = Math.atan2(OVERVIEW_POSE[0], OVERVIEW_POSE[2]);

const WIDTH = 1920;
const HEIGHT = 1080;
// The radius the rig rests at FOR THIS VIEWPORT, through the resolver the rig itself
// uses. `cfg.overviewRadius` stopped being that for a desktop canvas when desktop got
// a closer overview of its own, and a literal here went on asserting the phone's.
const OVERVIEW_RADIUS = overviewRadiusForViewport(WIDTH, HEIGHT);
const DEG = 180 / Math.PI;

// Pixels of horizontal drag that request one radian of yaw. The rig applies
// `theta -= dx * sensitivity`, so dragging LEFT (negative dx) increases theta,
// and `atan2(x, z)` reads that back as a rising azimuth.
const PX_PER_RADIAN = 1 / cfg.orbitSensitivity;

interface Harness {
  rig: ReturnType<typeof createFocusCameraRig>;
  /** Section 7 fires raw multi-pointer sequences the helpers below cannot express. */
  stub: StubElement;
  camera: THREE.PerspectiveCamera;
  /** Cumulative yaw the drag has ASKED for, radians. Independent of the rig. */
  requested: number;
  /** Camera azimuth, unwrapped across the +/-PI seam. Radians. */
  observed: number;
  /** Every per-frame change in `observed`, in order. */
  steps: number[];
  /** `camera.position.length()` sampled once per frame. */
  radii: number[];
  drag: (pxPerSec: number, seconds: number, fps: number) => void;
  dragPixels: (dx: number, dy: number) => void;
  settle: (seconds: number, fps?: number) => void;
  step: (fps: number) => void;
  pointerDown: () => void;
  pointerUp: () => void;
}

function makeHarness(): Harness {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  // `focusOn` measures the close-up's screen offset against these, and the stub
  // carries only what the pointer-driven controllers needed. Set here rather
  // than in the shared stub: no other harness reads them, and widening a shared
  // fixture for one consumer is how fixtures stop describing anything.
  Object.assign(stub.element, { clientWidth: WIDTH, clientHeight: HEIGHT });

  const camera = new THREE.PerspectiveCamera(50, WIDTH / HEIGHT, 0.1, 5000);
  const cursor = createCursorManager(stub.element);

  const rig = createFocusCameraRig({
    camera,
    domElement: stub.element,
    cursor,
    overviewPose: OVERVIEW_POSE,
    onEmptyClick: () => {},
    isOverSatellite: () => false,
  });
  rig.activate();

  let pointerX = WIDTH / 2;
  let pointerY = HEIGHT / 2;
  // From the pose the rig was just seeded with, not from `camera.position`:
  // the camera object is only written on the first update(), so reading it
  // here gave the origin's azimuth (0) and the first step then booked the whole
  // rest azimuth as travel. Invisible while the rest sat on the z axis.
  let previousAzimuth = REST_AZIMUTH;

  const h: Harness = {
    rig,
    stub,
    camera,
    requested: 0,
    observed: 0,
    steps: [],
    radii: [],

    pointerDown() {
      stub.fire('pointerdown', {
        button: 0,
        clientX: pointerX,
        clientY: pointerY,
        pointerId: 1,
        pointerType: 'mouse',
      });
    },

    pointerUp() {
      stub.fire('pointerup', { pointerId: 1 });
    },

    dragPixels(dx, dy) {
      pointerX += dx;
      pointerY += dy;
      stub.fire('pointermove', { clientX: pointerX, clientY: pointerY, pointerId: 1 });
      h.requested -= dx * cfg.orbitSensitivity;
    },

    step(fps) {
      rig.update(1 / fps);
      const azimuth = Math.atan2(camera.position.x, camera.position.z);
      let delta = azimuth - previousAzimuth;
      // Unwrap: the camera can legitimately cross the seam, and a raw atan2
      // difference would read that as a full turn backward.
      while (delta > Math.PI) delta -= 2 * Math.PI;
      while (delta < -Math.PI) delta += 2 * Math.PI;
      previousAzimuth = azimuth;
      h.observed += delta;
      h.steps.push(delta);
      h.radii.push(camera.position.length());
    },

    drag(pxPerSec, seconds, fps) {
      const frames = Math.round(seconds * fps);
      // Negative dx: leftward, which is the direction that increases theta.
      const dxPerFrame = -(pxPerSec / fps);
      for (let f = 0; f < frames; f += 1) {
        h.dragPixels(dxPerFrame, 0);
        h.step(fps);
      }
    },

    settle(seconds, fps = 60) {
      const frames = Math.round(seconds * fps);
      for (let f = 0; f < frames; f += 1) h.step(fps);
    },
  };

  return h;
}

/** Total distance walked, ignoring direction — a path length, not a displacement. */
function pathLength(steps: number[]): number {
  return steps.reduce((sum, s) => sum + Math.abs(s), 0);
}

/** The largest single backward step, in degrees. Zero when nothing reversed. */
function worstReversalDeg(steps: number[]): number {
  let worst = 0;
  // The first step is skipped: it is measured from the seeded pose before any
  // input has been applied, so its sign carries no information about tracking.
  for (let i = 1; i < steps.length; i += 1) {
    if (steps[i] < worst) worst = steps[i];
  }
  return worst * DEG;
}

function countReversals(steps: number[]): number {
  let n = 0;
  for (let i = 1; i < steps.length; i += 1) {
    // Floating-point noise around a stationary camera is not a reversal.
    if (steps[i] < -1e-9) n += 1;
  }
  return n;
}

banner('EARTH ORBIT — the drag rotates the globe, and only forwards');

section('1. A forward drag never turns the camera backward');

// The defect. Below ~1400 px/s the ease keeps within half a turn of the drag and
// the old Cartesian lerp happened to be correct; above it, the interpolation
// took the short way round and the camera was shoved backward mid-gesture.
for (const fps of [60, 30]) {
  for (const pxPerSec of [900, 1500, 3000, 6000]) {
    const h = makeHarness();
    h.pointerDown();
    h.drag(pxPerSec, 1, fps);
    h.pointerUp();

    const reversals = countReversals(h.steps);
    const worst = worstReversalDeg(h.steps);
    check(
      `${fps}fps ${String(pxPerSec).padStart(4)}px/s — no backward frame`,
      reversals === 0,
      reversals === 0
        ? `turned ${(h.observed * DEG).toFixed(1)} deg of a requested ${(h.requested * DEG).toFixed(1)}`
        : `${reversals} backward frame(s), worst ${worst.toFixed(2)} deg/frame — camera reached only ` +
          `${(h.observed * DEG).toFixed(1)} deg of ${(h.requested * DEG).toFixed(1)}`,
    );
  }
}

section('2. Travel is not thrown away — a wound-up drag arrives wound up');

{
  // Two full turns, fast enough that the ease lags well past half a turn. The
  // camera must still WALK those two turns; converging on an equivalent angle by
  // going backwards is the failure, and it is invisible in the settled pose
  // because 720 deg and 0 deg are the same point.
  const h = makeHarness();
  h.pointerDown();
  h.dragPixels(-720 * (Math.PI / 180) * PX_PER_RADIAN, 0);
  h.pointerUp();
  h.settle(6);

  const requestedDeg = h.requested * DEG;
  const travelledDeg = pathLength(h.steps) * DEG;
  check(
    'a 720 deg drag walks 720 deg',
    close(travelledDeg, requestedDeg, 15),
    `walked ${travelledDeg.toFixed(1)} deg of a requested ${requestedDeg.toFixed(1)} deg`,
  );
  check(
    'and ends where it was sent, not at an equivalent angle it reached backwards',
    close(h.observed * DEG, requestedDeg, 15),
    `net ${(h.observed * DEG).toFixed(1)} deg`,
  );
}

section('3. A half-turn request is not a deadlock');

{
  // The degenerate case, and the clearest statement of the old bug: with the
  // target exactly antipodal, the chord through the two points passes through
  // the origin, the lerp lands on the SAME ray it started on, and re-projecting
  // it put the camera back precisely where it was. Not slow — stationary.
  const h = makeHarness();
  h.pointerDown();
  h.dragPixels(-Math.PI * PX_PER_RADIAN, 0);
  h.pointerUp();
  h.settle(6);

  check(
    'an exactly antipodal target is reached',
    close(Math.abs(h.observed) * DEG, 180, 1),
    `camera moved ${(h.observed * DEG).toFixed(4)} deg toward a 180.0000 deg request`,
  );
}

section('4. Panning is distance-stable');

{
  // The property the old re-projection existed to protect, and the reason the
  // rewrite must not simply drop to a plain lerp: a Cartesian ease between two
  // points on the orbit sphere cuts the chord, so the camera visibly dips toward
  // the planet and back out as it pans.
  const h = makeHarness();
  h.pointerDown();
  h.drag(3000, 1, 60);
  h.pointerUp();
  h.settle(2);

  const min = Math.min(...h.radii);
  const max = Math.max(...h.radii);
  check(
    'the orbit radius never dips while panning',
    close(min, OVERVIEW_RADIUS, 1e-6) && close(max, OVERVIEW_RADIUS, 1e-6),
    `radius stayed within [${min.toFixed(6)}, ${max.toFixed(6)}] of ${OVERVIEW_RADIUS} (R=${R})`,
  );
}

section('5. Vertical drag stays inside the pole clamps');

{
  const h = makeHarness();
  h.pointerDown();
  // Far past both clamps in both directions, fast, so nothing stays in range
  // merely because the ease was too slow to leave it. Sampled every frame
  // rather than at the turn, because an overshoot mid-sweep is still an
  // overshoot — and the drag inverts, so which end of the sweep is "up" is not
  // worth encoding in the assertion.
  let lowest = Infinity;
  let highest = -Infinity;
  const sweep = (dy: number, frames: number) => {
    for (let i = 0; i < frames; i += 1) {
      h.dragPixels(0, dy);
      h.step(60);
      lowest = Math.min(lowest, h.camera.position.y);
      highest = Math.max(highest, h.camera.position.y);
    }
  };
  sweep(-400, 60);
  sweep(400, 120);
  sweep(-400, 60);
  h.pointerUp();

  // phi is measured from +Y and is clamped to [phiMin, phiMax], so the camera's
  // height is bounded by the cosines of the two clamps.
  const ceiling = OVERVIEW_RADIUS * Math.cos(cfg.phiMin);
  const floor = OVERVIEW_RADIUS * Math.cos(cfg.phiMax);
  check(
    'never flips over the north pole',
    highest <= ceiling + 1e-6,
    `peaked at y=${highest.toFixed(4)} against a ceiling of ${ceiling.toFixed(4)}`,
  );
  check(
    'never dives under the planet',
    lowest >= floor - 1e-6,
    `bottomed at y=${lowest.toFixed(4)} against a floor of ${floor.toFixed(4)}`,
  );
}

section('6. Returning from a close-up takes the SHORT way');

{
  // The opposite requirement to section 2, and the one that made a single
  // shortest-arc mechanism tempting in the first place. A viewer who has wound
  // the globe round one and a half turns and then closes a case panel must not
  // watch it unwind all of it.
  const h = makeHarness();
  h.pointerDown();
  h.dragPixels(-500 * (Math.PI / 180) * PX_PER_RADIAN, 0);
  h.pointerUp();
  h.settle(6);

  const beforeFocus = h.observed * DEG;

  // Placed at the azimuth the viewer is ALREADY looking from, deliberately. A
  // satellite on the z axis would sit at azimuth 0 and the close-up would do the
  // unwinding itself, leaving the return with nothing to travel and the
  // assertion below passing on an empty measurement.
  //
  // Off the orbit sphere, which is what a close-up target actually is — it
  // carries a lift and a shifted look-at.
  const parked = (500 * Math.PI) / 180;
  h.rig.focusOn(
    new THREE.Vector3(4 * R * Math.sin(parked), 1.2 * R, 4 * R * Math.cos(parked)),
  );
  h.settle(4);

  const beforeReturn = h.steps.length;
  h.rig.returnToOverview();
  h.settle(6);

  const returnPath = pathLength(h.steps.slice(beforeReturn)) * DEG;
  // 500 deg is 140 deg from the overview the short way, 220 the long way, and
  // 500 if the winding is unwound literally.
  check(
    'the return does not unwind the accumulated turns',
    returnPath < 200,
    `travelled ${returnPath.toFixed(1)} deg (short way is ~140, unwinding would be ~500)`,
  );

  const settled = Math.atan2(h.camera.position.x, h.camera.position.z) * DEG;
  check(
    'and settles at the overview pose',
    // Against the configured rest azimuth, not world Z: the pose has an
    // orientation of its own since 2026-09-05.
    close(settled, REST_AZIMUTH * DEG, 1),
    `azimuth ${settled.toFixed(3)} deg, from ${beforeFocus.toFixed(1)} deg before the close-up`,
  );
  check(
    'at the overview radius',
    close(h.camera.position.length(), OVERVIEW_RADIUS, 0.05),
    `${h.camera.position.length().toFixed(4)} vs ${OVERVIEW_RADIUS}`,
  );
}


section('7. A second contact point is a passenger, never a driver');

// Earth has no multi-touch navigation and is not gaining one here: what a second
// finger must do is NOTHING, and it must do it without damaging the gesture the
// first finger is already making. Both halves were wrong until 2026-08-25 and
// both were invisible while two fingers on the globe were an accident. A pinch
// makes every navigation gesture two fingers, so they become load-bearing.

{
  const h = makeHarness();
  h.pointerDown();
  h.dragPixels(-200, 0);
  // Settled to REST, not merely stepped. The rig eases at `lerpK: 3`, so a short
  // settle leaves the camera still travelling toward the first drag's target and
  // the residual would be measured as the second pointer's doing (~8 deg at 0.5s).
  h.settle(4);
  const afterFirst = h.observed;

  // A second finger lands and sweeps a long way. It was rejected at pointerdown
  // and its moves are dropped in pointermove, so the camera must not move.
  h.stub.fire('pointerdown', {
    button: 0,
    clientX: 900,
    clientY: 500,
    pointerId: 2,
    pointerType: 'touch',
  });
  h.stub.fire('pointermove', { clientX: 1500, clientY: 900, pointerId: 2 });
  h.stub.fire('pointermove', { clientX: 300, clientY: 200, pointerId: 2 });
  h.settle(4);

  // Tolerance in DEGREES, not an exact equality: the rig eases asymptotically, so
  // a settled camera is still converging by ~1e-4 deg per frame forever. The
  // number that makes this assertion mean something is the contrast — 1800px of
  // travel WOULD be 412 deg if this pointer drove the orbit, so the guard is four
  // and a half orders of magnitude below the effect it exists to catch.
  const passengerDeg = Math.abs(h.observed - afterFirst) * DEG;
  const ifItDroveDeg = 1800 * cfg.orbitSensitivity * DEG;
  check(
    'a second pointer moves the camera by nothing at all',
    passengerDeg < 0.01,
    `azimuth moved ${passengerDeg.toFixed(6)} deg across 1800px of second-finger travel, which would be ${ifItDroveDeg.toFixed(0)} deg if it drove`,
  );

  check(
    'and the first finger still owns the gesture',
    h.rig.isDragging(),
    'a passenger arriving must not end the drag it arrived during',
  );

  // THE FIX. The passenger lifts. `onPointerUp` took no argument and checked no
  // id, so this ended the first finger's drag and released capture for a pointer
  // still on the glass.
  h.stub.fire('pointerup', { pointerId: 2 });

  check(
    'the passenger lifting does not end the drag',
    h.rig.isDragging(),
    'onPointerUp must compare pointerId against the pointer that claimed the gesture',
  );

  // And the survivor must still steer, not merely still be flagged as dragging.
  const beforeResume = h.observed;
  h.dragPixels(-200, 0);
  h.settle(4);
  check(
    'and the owning finger still steers afterwards',
    Math.abs(h.observed - beforeResume) > 0.05,
    `azimuth moved ${((h.observed - beforeResume) * DEG).toFixed(2)} deg on the next 200px — a drag that survives in name only is no better than one that ended`,
  );

  h.pointerUp();
  check(
    'and the owning finger still ends it',
    !h.rig.isDragging(),
    'the id check must not make the gesture unstoppable',
  );
}

{
  // The tap half. `dragDistance` accumulates only the ACTIVE pointer's travel,
  // so a two-finger gesture whose anchor barely moves would end under the tap
  // tolerance — and a click synthesised from it would read as a clean tap and
  // select a satellite.
  const h = makeHarness();
  h.pointerDown();
  h.dragPixels(-2, 0); // the anchor finger barely moves, as in a real pinch

  check(
    'one nearly-still finger alone still reads as a tap',
    h.rig.getDragDistance() <= h.rig.getDragClickThreshold(),
    `dragDistance ${h.rig.getDragDistance()} against a threshold of ${h.rig.getDragClickThreshold()} — the premise of the check below`,
  );

  h.stub.fire('pointerdown', {
    button: 0,
    clientX: 900,
    clientY: 500,
    pointerId: 2,
    pointerType: 'touch',
  });

  check(
    'a second contact point can never be a tap',
    h.rig.getDragDistance() > h.rig.getDragClickThreshold(),
    `dragDistance ${h.rig.getDragDistance()} against a threshold of ${h.rig.getDragClickThreshold()}`,
  );

  // It must not poison the NEXT gesture, or every tap after a pinch is dead.
  h.stub.fire('pointerup', { pointerId: 2 });
  h.pointerUp();
  h.pointerDown();
  check(
    'and the next single-pointer gesture starts clean',
    h.rig.getDragDistance() <= h.rig.getDragClickThreshold(),
    `dragDistance ${h.rig.getDragDistance()} — pointerdown reseeds it, so the poison cannot outlive its gesture`,
  );
}

finish();
