/**
 * Behavioural harness for DragPanController.  `npm run check:navigation`
 *
 * Drives the REAL controller and the REAL camera rig through synthetic pointer
 * sequences against a stub DOM element, then measures what the camera actually
 * did. Signs, axis isolation and bounds are the things a typecheck cannot catch
 * and no visual check happened for.
 *
 * Per PROJECT_MEMORY, "How this repo verifies things", harnesses here must
 * exercise the real code path, not a convenient stand-in — the one bug that
 * hid longest did so behind
 * a harness that rebuilt what it was meant to be testing. Nothing below
 * reimplements controller maths; expectations are derived independently (by
 * raycasting, or by projecting a fixed world point to screen) and compared.
 *
 * Two real defects were found this way and are guarded by sections 3 and 8:
 * an inverted rotation sign, and momentum surviving a pointer held still
 * before release.
 */
import * as THREE from 'three';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import type { BoundsRect, NavigationConfig } from '../src/experiences/murcia/config/environmentConfig';
import { CameraRig } from '../src/experiences/murcia/camera/CameraRig';
import { DragPanController } from '../src/experiences/murcia/navigation/DragPanController';
import { expandRect } from '../src/experiences/murcia/navigation/navigationBounds';

const env = murciaConfig;
const nav = env.navigation;
const WIDTH = 1920;
const HEIGHT = 1080;
const ASPECT = WIDTH / HEIGHT;
const CENTRE_X = WIDTH / 2;
const CENTRE_Y = HEIGHT / 2;

const plate: BoundsRect = { ...env.contentBounds };
const bounds = expandRect(plate, -nav.boundsInset);

import { check, close, finish } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import { makeRig } from './lib/rig';


// --- Stub DOM ----------------------------------------------------------------

interface Harness {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  controller: DragPanController;
  fire: (type: string, event: Record<string, unknown>) => void;
  step: (seconds: number, frames?: number) => void;
  yawEvents: number;
  zoomEvents: number;
}

function makeHarness(
  config: NavigationConfig = nav,
  focusAt = env.initialFocus,
  limits: BoundsRect = bounds,
): Harness {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  const element = stub.element;

  const { camera, rig } = makeRig(env, ASPECT, focusAt);

  const harness: Harness = {
    rig,
    camera,
    controller: null as unknown as DragPanController,
    fire: stub.fire,
    step: (seconds, frames = Math.max(1, Math.round(seconds * 60))) => {
      for (let i = 0; i < frames; i += 1) harness.controller.update(seconds / frames);
    },
    yawEvents: 0,
    zoomEvents: 0,
  };

  harness.controller = new DragPanController(element, camera, rig, config, limits, {
    onYawChanged: () => {
      harness.yawEvents += 1;
    },
    onZoomChanged: () => {
      harness.zoomEvents += 1;
    },
  });
  return harness;
}

/** Independent ground projection, for computing expectations. */
function groundAt(camera: THREE.PerspectiveCamera, clientX: number, clientY: number): THREE.Vector3 {
  const rc = new THREE.Raycaster();
  camera.updateMatrixWorld();
  rc.setFromCamera(
    new THREE.Vector2((clientX / WIDTH) * 2 - 1, -(clientY / HEIGHT) * 2 + 1),
    camera,
  );
  const out = new THREE.Vector3();
  rc.ray.intersectPlane(new THREE.Plane(new THREE.Vector3(0, 1, 0), -nav.groundPlaneHeight), out);
  return out;
}

/** Screen x of a fixed world point, for checking which way the world moved. */
function screenX(camera: THREE.PerspectiveCamera, p: THREE.Vector3): number {
  camera.updateMatrixWorld();
  const v = p.clone().project(camera);
  return ((v.x + 1) / 2) * WIDTH;
}

/** Screen y of the same, for the vertical half of grab-the-point. */
function screenY(camera: THREE.PerspectiveCamera, p: THREE.Vector3): number {
  camera.updateMatrixWorld();
  const v = p.clone().project(camera);
  return ((1 - v.y) / 2) * HEIGHT;
}

/** One wheel notch. deltaMode 0 is pixels, which is what Chrome reports. */
function wheel(h: Harness, deltaY: number, options: { ctrlKey?: boolean; deltaMode?: number } = {}): void {
  h.fire('wheel', {
    deltaY,
    deltaMode: options.deltaMode ?? 0,
    ctrlKey: options.ctrlKey ?? false,
    preventDefault() {},
  });
}

/** Touch pointers are what select the two-finger path, so they carry a type. */
function touchDown(h: Harness, id: number, x: number, y: number, t = 1000): void {
  h.fire('pointerdown', { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: t });
}

function touchMove(h: Harness, id: number, x: number, y: number, t: number): void {
  h.fire('pointermove', { pointerId: id, pointerType: 'touch', clientX: x, clientY: y, timeStamp: t });
}

function touchUp(h: Harness, id: number, x: number, y: number, t: number, type = 'pointerup'): void {
  h.fire(type, { pointerId: id, pointerType: 'touch', button: 0, clientX: x, clientY: y, timeStamp: t });
}

/** pointerdown, cross the drag threshold, then one real move. */
function drag(h: Harness, dx: number, dy: number, button = 0): void {
  let t = 1000;
  h.fire('pointerdown', { pointerId: 1, button, clientX: CENTRE_X, clientY: CENTRE_Y, timeStamp: t });
  // First move only crosses the threshold and re-anchors; it applies no motion.
  t += 16;
  h.fire('pointermove', {
    pointerId: 1,
    clientX: CENTRE_X + Math.sign(dx) * 8,
    clientY: CENTRE_Y + Math.sign(dy) * 8,
    timeStamp: t,
  });
  t += 16;
  h.fire('pointermove', {
    pointerId: 1,
    clientX: CENTRE_X + Math.sign(dx) * 8 + dx,
    clientY: CENTRE_Y + Math.sign(dy) * 8 + dy,
    timeStamp: t,
  });
}

function release(h: Harness, button = 0): void {
  h.fire('pointerup', { pointerId: 1, button, clientX: 0, clientY: 0, timeStamp: 2000 });
}

/**
 * The feel this replaced: weight carried by momentum after release, rejected
 * because the view kept travelling once the pointer was gone.
 *
 * Kept for two reasons. It is the comparison that gives "it stops" any meaning,
 * and it is still reachable at runtime through `?inertia=`, so the section 4.8
 * standstill bug it once exposed is guarded rather than merely unreachable.
 */
const MOMENTUM: NavigationConfig = {
  ...nav,
  feel: {
    smoothingTimeConstant: 0.05,
    releaseTimeConstant: 0.3,
    inertiaTimeConstant: 1.1,
    minInertiaSpeed: 1.5,
    maxInertiaSpeed: 260,
    velocityBlend: 0.25,
  },
  rotation: {
    ...nav.rotation,
    feel: { ...nav.rotation.feel, releaseTimeConstant: 0.3, inertiaTimeConstant: 1.1 },
  },
};

interface ReleaseMeasurement {
  /** Speed of the rendered focus over the last frame of the drag, units/s. */
  dragSpeed: number;
  /** Distance the focus travelled after the pointer was released. */
  travel: number;
  /** Seconds to cover 95% of that travel. */
  t95: number;
}

/**
 * Sweeps downward at a steady rate, optionally holds still, releases, and
 * measures what the view did on its own afterwards.
 *
 * Post-release travel is reported alongside the drag speed because the two are
 * what separate a coast from a catch-up. With inertia off the focus is still
 * behind its target when the pointer goes — smoothing guarantees that — so some
 * travel is inevitable and is bounded by `dragSpeed * smoothingTimeConstant`,
 * the steady-state lag of a first-order filter. Momentum is unbounded by that
 * figure instead: it travels `dragSpeed * inertiaTimeConstant`, which at the
 * rejected settings was more than ten times larger.
 */
function measureRelease(h: Harness, pauseSeconds = 0): ReleaseMeasurement {
  let t = 1000;
  h.fire('pointerdown', { pointerId: 1, button: 0, clientX: CENTRE_X, clientY: CENTRE_Y, timeStamp: t });

  let previous = { x: h.rig.focus.x, z: h.rig.focus.z };
  for (let i = 1; i <= 10; i += 1) {
    t += 16;
    previous = { x: h.rig.focus.x, z: h.rig.focus.z };
    h.fire('pointermove', { pointerId: 1, clientX: CENTRE_X, clientY: CENTRE_Y + i * 30, timeStamp: t });
    h.controller.update(1 / 60);
  }
  const dragSpeed = Math.hypot(h.rig.focus.x - previous.x, h.rig.focus.z - previous.z) * 60;

  // A pause bleeds the recorded velocity by design (see section 8), so this is
  // deliberately optional rather than part of the standard sweep.
  if (pauseSeconds > 0) h.step(pauseSeconds);

  const atRelease = { x: h.rig.focus.x, z: h.rig.focus.z };
  release(h);

  const trail: Array<{ seconds: number; distance: number }> = [];
  let seconds = 0;
  while (h.controller.isSettling && seconds < 20) {
    h.controller.update(1 / 60);
    seconds += 1 / 60;
    trail.push({
      seconds,
      distance: Math.hypot(h.rig.focus.x - atRelease.x, h.rig.focus.z - atRelease.z),
    });
  }

  const travel = trail.at(-1)?.distance ?? 0;
  const t95 = trail.find((s) => s.distance >= travel * 0.95)?.seconds ?? 0;
  return { dragSpeed, travel, t95 };
}

// =============================================================================
console.log('\n1. Pan — sign and ground fidelity, in both axes');
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;

  // Expectation computed against the camera as it stands before the real move,
  // on BOTH components — the pan is no longer projected onto a forward axis.
  // The gain is read from config rather than hardcoded: the point is that
  // displacement equals the ground the cursor crossed, whatever it is tuned to.
  const anchorY = CENTRE_Y + 8;
  const from = groundAt(h.camera, CENTRE_X, anchorY);
  const to = groundAt(h.camera, CENTRE_X, anchorY + 100);
  const expectedX = (from.x - to.x) * nav.translationGain;
  const expectedZ = (from.z - to.z) * nav.translationGain;
  const forward = h.rig.getForward();

  drag(h, 0, 100);
  h.step(1.0); // converge while the pointer is still down (no inertia yet)

  const movedX = h.rig.focus.x - startX;
  const movedZ = h.rig.focus.z - startZ;
  const alongForward = movedX * forward.x + movedZ * forward.z;

  check(
    'drag DOWN moves forward (into the scene)',
    alongForward > 0,
    `along forward = ${alongForward.toFixed(2)} units`,
  );
  check(
    'displacement matches the ground the cursor crossed',
    close(movedX, expectedX, 0.05) && close(movedZ, expectedZ, 0.05),
    `got (${movedX.toFixed(2)}, ${movedZ.toFixed(2)}), expected (${expectedX.toFixed(2)}, ${expectedZ.toFixed(2)}) (gain ${nav.translationGain})`,
  );
}
{
  const h = makeHarness();
  const forward = h.rig.getForward();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;
  drag(h, 0, -100);
  h.step(1.0);
  const along =
    (h.rig.focus.x - startX) * forward.x + (h.rig.focus.z - startZ) * forward.z;
  check('drag UP moves backward', along < 0, `along forward = ${along.toFixed(2)} units`);
}
{
  // Strafe. This did not exist before the rework — a horizontal drag rotated —
  // and its absence is what users reported as the controls being unnatural.
  const h = makeHarness();
  const forward = h.rig.getForward().clone();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;

  const anchorX = CENTRE_X + 8;
  const from = groundAt(h.camera, anchorX, CENTRE_Y);
  const to = groundAt(h.camera, anchorX + 150, CENTRE_Y);
  const expectedX = (from.x - to.x) * nav.translationGain;
  const expectedZ = (from.z - to.z) * nav.translationGain;

  drag(h, 150, 0);
  h.step(1.0);

  const movedX = h.rig.focus.x - startX;
  const movedZ = h.rig.focus.z - startZ;
  const along = movedX * forward.x + movedZ * forward.z;
  const lateral = Math.hypot(movedX, movedZ);

  check(
    'a horizontal drag strafes rather than turning',
    lateral > 1,
    `moved ${lateral.toFixed(1)} units sideways`,
  );
  check(
    'the strafe is perpendicular to the view direction',
    Math.abs(along) < 1e-6,
    `component along forward = ${Math.abs(along).toExponential(2)}`,
  );
  check(
    'and it too matches the ground the cursor crossed',
    close(movedX, expectedX, 0.05) && close(movedZ, expectedZ, 0.05),
    `got (${movedX.toFixed(2)}, ${movedZ.toFixed(2)}), expected (${expectedX.toFixed(2)}, ${expectedZ.toFixed(2)})`,
  );
}

// =============================================================================
console.log('\n2. Gesture isolation — one input, one effect');
{
  // The premise this replaces was "axis isolation": one gesture carried both
  // translation and rotation, so the guard was that each SCREEN AXIS drove only
  // its own. The gestures are separate inputs now, so what has to be isolated
  // is the inputs.
  const h = makeHarness();
  const startYaw = h.rig.getYaw();
  const startZoom = h.rig.getZoomScale();
  drag(h, 200, 140);
  h.step(1.0);
  check(
    'a left drag moves the focus and nothing else',
    Math.abs(h.rig.getYaw() - startYaw) < 1e-9 && close(h.rig.getZoomScale(), startZoom, 1e-9),
    `yaw delta ${Math.abs(h.rig.getYaw() - startYaw).toExponential(2)} deg, zoom ${h.rig.getZoomScale().toFixed(6)}`,
  );
}
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;
  const startZoom = h.rig.getZoomScale();
  drag(h, 200, 140, 2); // right button
  h.step(1.0);
  check(
    'a right drag rotates and nothing else',
    Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ) < 1e-9 &&
      close(h.rig.getZoomScale(), startZoom, 1e-9),
    `focus moved ${Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ).toExponential(2)} units`,
  );
  check(
    'and it really does rotate',
    Math.abs(h.rig.getYaw()) > 1,
    `yaw = ${h.rig.getYaw().toFixed(2)} deg`,
  );
}
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;
  const startYaw = h.rig.getYaw();
  wheel(h, -100);
  h.step(1.0);
  check(
    'a wheel event zooms and nothing else',
    Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ) < 1e-9 &&
      Math.abs(h.rig.getYaw() - startYaw) < 1e-9,
    `focus moved ${Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ).toExponential(2)} units`,
  );
  check(
    'and it really does zoom',
    h.rig.getZoomScale() < 1 - 1e-6,
    `scale = ${h.rig.getZoomScale().toFixed(4)} (wheel up pulls closer)`,
  );
}

// =============================================================================
console.log('\n3. Rotation sign — does the ground follow the cursor?');
{
  const h = makeHarness();
  // A fixed world point ahead of the camera, tracked across the rotation.
  const marker = groundAt(h.camera, CENTRE_X, CENTRE_Y - 200).clone();
  const before = screenX(h.camera, marker);
  drag(h, 300, 0, 2); // right-drag RIGHT
  h.step(1.0);
  const after = screenX(h.camera, marker);
  check(
    'drag RIGHT carries the ground right',
    after > before,
    `marker screen x ${before.toFixed(0)} -> ${after.toFixed(0)}`,
  );

  const expectedYaw = 300 * (nav.rotation.degreesPerViewportWidth / WIDTH);
  check(
    'yaw magnitude matches degreesPerViewportWidth',
    close(h.rig.getYaw(), expectedYaw, 0.01),
    `got ${h.rig.getYaw().toFixed(3)} deg, expected ${expectedYaw.toFixed(3)}`,
  );
}
{
  const h = makeHarness();
  const marker = groundAt(h.camera, CENTRE_X, CENTRE_Y - 200).clone();
  const before = screenX(h.camera, marker);
  drag(h, -300, 0, 2);
  h.step(1.0);
  check(
    'drag LEFT carries the ground left',
    screenX(h.camera, marker) < before,
    `marker screen x ${before.toFixed(0)} -> ${screenX(h.camera, marker).toFixed(0)}`,
  );
}

// =============================================================================
console.log('\n4. Free 360 rotation');
{
  const h = makeHarness();
  let t = 1000;
  h.fire('pointerdown', { pointerId: 1, button: 2, clientX: 0, clientY: CENTRE_Y, timeStamp: t });
  // Sweep sideways far enough for 450 degrees, derived from the configured
  // sensitivity rather than hardcoded — this section asserted a fixed 40 x 240
  // px sweep and started failing the moment degreesPerViewportWidth halved,
  // which measured the harness rather than the controller.
  const fullTurnPx = (450 / nav.rotation.degreesPerViewportWidth) * WIDTH;
  const steps = 40;
  for (let i = 1; i <= steps; i += 1) {
    t += 16;
    h.fire('pointermove', {
      pointerId: 1,
      clientX: -(fullTurnPx * i) / steps,
      clientY: CENTRE_Y,
      timeStamp: t,
    });
    h.controller.update(1 / 60);
  }
  h.step(2.0);
  check(
    'yaw accumulates past 360 without wrapping',
    Math.abs(h.rig.getYaw()) > 360,
    `yaw = ${h.rig.getYaw().toFixed(1)} deg`,
  );
  check(
    'a full turn leaves the zoom untouched',
    close(h.rig.getZoomScale(), 1, 1e-9),
    `scale = ${h.rig.getZoomScale().toFixed(6)}`,
  );
  check(
    'camera offset stays on the pose sphere through the turn',
    close(
      Math.hypot(h.rig.getOffset().x, h.rig.getOffset().y, h.rig.getOffset().z),
      env.camera.distance,
      1e-6,
    ),
    `|offset| = ${Math.hypot(h.rig.getOffset().x, h.rig.getOffset().y, h.rig.getOffset().z).toFixed(4)}`,
  );
  check(
    'elevation is untouched by yaw (no vertical rotation)',
    close(h.rig.getHeight(), env.camera.distance * Math.sin((30 * Math.PI) / 180), 1e-6),
    `height = ${h.rig.getHeight().toFixed(4)}`,
  );
  check('yaw changes notified for bounds recompute', h.yawEvents > 0, `${h.yawEvents} events`);
}

// =============================================================================
console.log('\n5. Pan follows the turned rig');
{
  const h = makeHarness();
  // Turn a quarter circle the way a person would: over ~0.4s, then hold still
  // briefly before letting go. The earlier version of this test moved 960px in
  // a single 16ms sample — a 60,000 px/s flick — and then asserted no coast,
  // which measured the harness rather than the controller.
  const quarterTurnPx = (90 / nav.rotation.degreesPerViewportWidth) * WIDTH;
  let t = 1000;
  h.fire('pointerdown', { pointerId: 1, button: 2, clientX: CENTRE_X, clientY: CENTRE_Y, timeStamp: t });
  const steps = 24;
  for (let i = 1; i <= steps; i += 1) {
    t += 16;
    h.fire('pointermove', {
      pointerId: 1,
      clientX: CENTRE_X + (quarterTurnPx * i) / steps,
      clientY: CENTRE_Y,
      timeStamp: t,
    });
    h.controller.update(1 / 60);
  }
  h.step(0.25); // hold still before release, as a person aiming a turn does
  release(h, 2);
  h.step(4.0);

  const yaw = h.rig.getYaw();
  const forward = h.rig.getForward().clone();

  // Some overshoot is the feature working — this is a system with weight.
  // The bar is that a deliberate stop lands close, not exactly.
  check(
    'a deliberate quarter turn lands where it was aimed',
    close(Math.abs(yaw), 90, 6),
    `yaw = ${yaw.toFixed(2)} deg (target 90)`,
  );

  {
    const startX = h.rig.focus.x;
    const startZ = h.rig.focus.z;
    drag(h, 0, 120);
    h.step(1.0);
    const movedX = h.rig.focus.x - startX;
    const movedZ = h.rig.focus.z - startZ;
    const along = movedX * forward.x + movedZ * forward.z;
    const lateral = Math.hypot(movedX - forward.x * along, movedZ - forward.z * along);
    check(
      'a downward drag advances along the NEW heading',
      along > 0 && lateral < 1e-6,
      `along = ${along.toFixed(2)}, lateral = ${lateral.toExponential(2)}`,
    );
    check(
      'motion is genuinely on a different world axis than before',
      Math.abs(movedX) > Math.abs(movedZ),
      `moved dX ${movedX.toFixed(1)}, dZ ${movedZ.toFixed(1)} (was Z-dominant at yaw 0)`,
    );
    // `drag` does not release, and a second pointerdown on an id already
    // tracked is ignored by design (it is how a mouse's second button is kept
    // from switching mode mid-gesture). Without this the next drag below would
    // silently continue THIS gesture from its end position, and measure a
    // diagonal move while claiming to measure a horizontal one.
    release(h);
    h.step(1.0);
  }
  {
    // And the strafe turns with the rig too, which is the half that would go
    // unnoticed: a sideways drag has to stay perpendicular to the heading, not
    // to the world axis it happened to start on.
    const startX = h.rig.focus.x;
    const startZ = h.rig.focus.z;
    drag(h, 120, 0);
    h.step(1.0);
    const movedX = h.rig.focus.x - startX;
    const movedZ = h.rig.focus.z - startZ;
    const along = movedX * forward.x + movedZ * forward.z;
    check(
      'a sideways drag strafes perpendicular to the NEW heading',
      Math.abs(along) < 1e-6 && Math.hypot(movedX, movedZ) > 1,
      `along = ${Math.abs(along).toExponential(2)}, moved ${Math.hypot(movedX, movedZ).toFixed(1)} units`,
    );
  }
}

// =============================================================================
console.log('\n6. Release stops the view — no coast');
{
  // Unbounded, deliberately. With the real rectangle both configs run into the
  // navigable edge partway through the coast and the measurement compares
  // walls rather than weight — the heavier feel hits it sooner and reads as
  // travelling *less*.
  const UNBOUNDED: BoundsRect = { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 };

  const withMomentum = measureRelease(makeHarness(MOMENTUM, env.initialFocus, UNBOUNDED));
  const shipped = measureRelease(makeHarness(nav, env.initialFocus, UNBOUNDED));

  // The bound is the outstanding tracking lag, computed from the measured drag
  // speed rather than assumed. Some allowance over it: the filter has not
  // reached steady state after ten frames, and the release constant differs
  // from the drag one.
  const lagBound = shipped.dragSpeed * nav.feel.smoothingTimeConstant * 1.5;

  console.log(
    `      momentum feel: ${withMomentum.dragSpeed.toFixed(0)} u/s at release, ` +
      `then travelled ${withMomentum.travel.toFixed(1)} units (95% in ${withMomentum.t95.toFixed(2)}s)`,
  );
  console.log(
    `      shipped feel:  ${shipped.dragSpeed.toFixed(0)} u/s at release, ` +
      `then travelled ${shipped.travel.toFixed(1)} units (95% in ${shipped.t95.toFixed(2)}s)`,
  );
  check(
    'post-release travel is catch-up, not a coast',
    shipped.travel < lagBound,
    `${shipped.travel.toFixed(1)} units against an outstanding lag of ${lagBound.toFixed(1)}`,
  );
  check(
    'the view is visibly stopped within 0.3s',
    shipped.t95 < 0.3,
    `95% of it done in ${shipped.t95.toFixed(3)}s`,
  );
  check(
    'the rejected momentum feel would have overrun that bound',
    withMomentum.travel > lagBound * 3,
    `${withMomentum.travel.toFixed(1)} units — ${(withMomentum.travel / shipped.travel).toFixed(1)}x the shipped travel`,
  );
}

// =============================================================================
console.log('\n7. Bounds still hold');
{
  const h = makeHarness();
  // Drive hard toward an edge, repeatedly, then let momentum run out.
  for (let i = 0; i < 30; i += 1) {
    drag(h, 0, 400);
    h.step(0.2);
    release(h);
    h.step(0.3);
  }
  h.step(10);
  const inside =
    h.rig.focus.x >= bounds.minX - 1e-6 &&
    h.rig.focus.x <= bounds.maxX + 1e-6 &&
    h.rig.focus.z >= bounds.minZ - 1e-6 &&
    h.rig.focus.z <= bounds.maxZ + 1e-6;
  check(
    'focus never escapes the navigable rectangle',
    inside,
    `focus (${h.rig.focus.x.toFixed(1)}, ${h.rig.focus.z.toFixed(1)}) in X [${bounds.minX.toFixed(0)}, ${bounds.maxX.toFixed(0)}] Z [${bounds.minZ.toFixed(0)}, ${bounds.maxZ.toFixed(0)}]`,
  );
}
{
  // This used to assert that the right button dragged identically to the left,
  // which was true when one gesture carried everything. It now has to assert
  // the opposite, because that is the whole point of the split: a right-drag
  // must not translate, however far it goes.
  const h = makeHarness();
  drag(h, 0, 400, 2);
  h.step(1.0);
  check(
    'a vertical right-drag translates nothing at all',
    Math.hypot(h.rig.focus.x - env.initialFocus.x, h.rig.focus.z - env.initialFocus.z) < 1e-9,
    `focus moved ${Math.hypot(h.rig.focus.x - env.initialFocus.x, h.rig.focus.z - env.initialFocus.z).toExponential(2)} units`,
  );
  check(
    'and a purely vertical one does not turn either',
    Math.abs(h.rig.getYaw()) < 1e-9,
    `yaw = ${h.rig.getYaw().toExponential(2)} deg — rotation is horizontal only`,
  );
}
{
  const h = makeHarness();
  h.fire('pointerdown', { pointerId: 1, button: 0, clientX: 500, clientY: 500, timeStamp: 1000 });
  h.fire('pointermove', { pointerId: 1, clientX: 502, clientY: 501, timeStamp: 1016 });
  release(h);
  h.step(2.0);
  check(
    'a tap below the drag threshold never coasts',
    Math.hypot(h.rig.focus.x - env.initialFocus.x, h.rig.focus.z - env.initialFocus.z) < 1e-9,
    'focus unchanged',
  );
}

// =============================================================================
console.log('\n8. Release stops the view, mid-sweep or after a pause');
{
  // This section originally guarded the standstill-release bug recorded in
  // PROJECT_MEMORY, "Murcia's navigation": velocity is sampled only on
  // pointermove, so a pointer held still kept its last speed
  // and the view flung on a gesture that had ended at a standstill. With
  // inertia disabled that bug is unreachable — there is no coast to inherit a
  // stale speed — so what is asserted now is the stronger property: neither
  // release moves the view at all.
  //
  // The bleed in decayStalledVelocity is deliberately retained even so, and the
  // momentum config below is still run through the same pause: ?inertia= can
  // turn momentum back on at runtime, and this is the only thing standing
  // between that and the original bug.
  const paused = measureRelease(makeHarness(), 0.4);
  const pausedWithMomentum = measureRelease(
    makeHarness(MOMENTUM, env.initialFocus, { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 }),
    0.4,
  );

  console.log(`      released after 0.4s still: ${paused.travel.toFixed(3)} units`);
  console.log(`      the same with momentum on:  ${pausedWithMomentum.travel.toFixed(3)} units`);
  check(
    'a gesture that ends at a standstill releases at a standstill',
    paused.travel < 0.5,
    `${paused.travel.toFixed(3)} units after release`,
  );
  check(
    'the standstill bleed still holds with momentum re-enabled',
    pausedWithMomentum.travel < 1,
    `${pausedWithMomentum.travel.toFixed(3)} units with inertiaTimeConstant 1.1`,
  );
}

// =============================================================================
console.log('\n9. Grab-the-point — the property the rework exists for');
{
  // Record the world point under the cursor at the start of a drag, follow an
  // L-shaped path, and check where it ends up. This is the users' complaint
  // stated as an assertion.
  //
  // It is run TWICE, and the split is the point.
  //
  // The solve is exact: at `translationGain: 1` the grabbed point must land
  // under the cursor to within a pixel, in both axes. That is a definition, not
  // a taste, and it is what the rework exists for — so it is asserted at gain 1
  // regardless of what the shipped gain happens to be.
  //
  // The shipped gain is a judgement (0.7 as of 2026-08-13, murciaConfig.ts) and
  // deliberately lands the point short. Asserting the screen position at that
  // gain would be asserting somebody's taste, and would fail the next time it is
  // re-judged. What is asserted instead is PROPORTIONALITY: the focus covers
  // exactly `gain` of the exact answer. That still catches an inverted sign, a
  // dropped delta, a clamp eating part of the drag, or the solve drifting with
  // camera lag — every failure the original assertion caught — without pinning a
  // number a person owns.
  const startPx = { x: CENTRE_X - 200, y: CENTRE_Y + 120 };
  const path = [
    { x: startPx.x + 160, y: startPx.y },
    { x: startPx.x + 300, y: startPx.y },
    { x: startPx.x + 300, y: startPx.y - 120 },
    { x: startPx.x + 300, y: startPx.y - 260 },
  ];
  const end = path[path.length - 1];

  /** Drive the L-shaped drag at a given gain and report where things landed. */
  function runDrag(gain: number) {
    const h = makeHarness({ ...nav, translationGain: gain });
    const startFocus = { x: h.rig.focus.x, z: h.rig.focus.z };

    let t = 1000;
    h.fire('pointerdown', { pointerId: 1, button: 0, clientX: startPx.x, clientY: startPx.y, timeStamp: t });

    // The threshold crossing re-anchors, so the marker is re-read there — a
    // gesture only becomes a drag once it has moved 6px, and the controller
    // deliberately does not apply that first 6px.
    t += 16;
    h.fire('pointermove', { pointerId: 1, clientX: startPx.x + 8, clientY: startPx.y, timeStamp: t });
    const anchor = groundAt(h.camera, startPx.x + 8, startPx.y).clone();

    for (const p of path) {
      t += 16;
      h.fire('pointermove', { pointerId: 1, clientX: p.x, clientY: p.y, timeStamp: t });
      h.controller.update(1 / 60);
    }
    h.step(2.0); // let the render catch up to the target
    release(h);
    h.step(2.0);

    // The exact answer, derived independently of the controller: the camera sits
    // at a rigid offset from the focus, so `ground(pixel) - focus` is the same
    // vector whatever the focus is, and the difference of two of them is the
    // focus travel that would put the grabbed point back under the cursor. Both
    // are read off the settled camera, so no lag enters.
    const fromGround = groundAt(h.camera, startPx.x + 8, startPx.y);
    const toGround = groundAt(h.camera, end.x, end.y);
    return {
      landedX: screenX(h.camera, anchor),
      landedY: screenY(h.camera, anchor),
      movedX: h.rig.focus.x - startFocus.x,
      movedZ: h.rig.focus.z - startFocus.z,
      exactX: fromGround.x - toGround.x,
      exactZ: fromGround.z - toGround.z,
    };
  }

  const exact = runDrag(1);
  check(
    'at gain 1 the grabbed point is under the cursor, horizontally',
    close(exact.landedX, end.x, 1),
    `${exact.landedX.toFixed(1)}px against a cursor at ${end.x}`,
  );
  check(
    'and vertically',
    close(exact.landedY, end.y, 1),
    `${exact.landedY.toFixed(1)}px against a cursor at ${end.y}`,
  );

  const shipped = runDrag(nav.translationGain);
  check(
    'the shipped gain covers exactly that fraction of it, in x',
    close(shipped.movedX, shipped.exactX * nav.translationGain, 0.02),
    `moved ${shipped.movedX.toFixed(2)} against ${(shipped.exactX * nav.translationGain).toFixed(2)} ` +
      `(gain ${nav.translationGain} of ${shipped.exactX.toFixed(2)})`,
  );
  check(
    'and in z',
    close(shipped.movedZ, shipped.exactZ * nav.translationGain, 0.02),
    `moved ${shipped.movedZ.toFixed(2)} against ${(shipped.exactZ * nav.translationGain).toFixed(2)} ` +
      `(gain ${nav.translationGain} of ${shipped.exactZ.toFixed(2)})`,
  );
}
{
  // Path independence. The deltas telescope only because the offset from focus
  // to camera is rigid and cancels in each subtraction — so a closed loop must
  // return the focus EXACTLY, not approximately. Assert it tightly: a loose
  // tolerance here would pass while the solve slowly drifted.
  //
  // Unbounded, so the clamp cannot absorb part of the loop and fake the result.
  const UNBOUNDED: BoundsRect = { minX: -1e6, maxX: 1e6, minZ: -1e6, maxZ: 1e6 };
  const h = makeHarness(nav, env.initialFocus, UNBOUNDED);
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;

  let t = 1000;
  const origin = { x: CENTRE_X, y: CENTRE_Y };
  h.fire('pointerdown', { pointerId: 1, button: 0, clientX: origin.x, clientY: origin.y, timeStamp: t });
  t += 16;
  h.fire('pointermove', { pointerId: 1, clientX: origin.x + 8, clientY: origin.y, timeStamp: t });

  // A deliberately irregular loop, ending back where the drag was anchored.
  const loop = [
    { x: origin.x + 260, y: origin.y - 140 },
    { x: origin.x + 90, y: origin.y - 300 },
    { x: origin.x - 220, y: origin.y - 210 },
    { x: origin.x - 340, y: origin.y + 130 },
    { x: origin.x - 60, y: origin.y + 260 },
    { x: origin.x + 8, y: origin.y },
  ];
  for (const p of loop) {
    t += 16;
    h.fire('pointermove', { pointerId: 1, clientX: p.x, clientY: p.y, timeStamp: t });
    h.controller.update(1 / 60);
  }
  release(h);
  h.step(4.0);

  const drift = Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ);
  check(
    'a closed drag loop returns the focus exactly where it started',
    drift < 1e-6,
    `drift ${drift.toExponential(2)} units over a 6-waypoint loop — proves the solve is lag-free, not merely close`,
  );
}

// =============================================================================
console.log('\n10. Two fingers — rotate, pinch, and the transitions between');
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;
  let t = 1000;
  touchDown(h, 1, CENTRE_X - 100, CENTRE_Y, t);
  touchDown(h, 2, CENTRE_X + 100, CENTRE_Y, t);
  // Sweep the centroid right, holding the separation constant so nothing zooms.
  for (let i = 1; i <= 10; i += 1) {
    t += 16;
    touchMove(h, 1, CENTRE_X - 100 + i * 20, CENTRE_Y, t);
    touchMove(h, 2, CENTRE_X + 100 + i * 20, CENTRE_Y, t);
    h.controller.update(1 / 60);
  }
  h.step(1.0);
  check(
    'a two-finger sideways sweep turns the rig',
    h.rig.getYaw() > 1,
    `yaw = ${h.rig.getYaw().toFixed(2)} deg`,
  );
  check(
    'and moves the focus not at all',
    Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ) < 1e-9,
    `focus moved ${Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ).toExponential(2)} units`,
  );
}
{
  // Pinch apart means a closer look. Driven hard enough to reach the stop, so
  // the clamp is asserted at its exact configured value rather than near it.
  const h = makeHarness();
  let t = 1000;
  touchDown(h, 1, CENTRE_X - 40, CENTRE_Y, t);
  touchDown(h, 2, CENTRE_X + 40, CENTRE_Y, t);
  for (let i = 1; i <= 20; i += 1) {
    t += 16;
    touchMove(h, 1, CENTRE_X - 40 - i * 30, CENTRE_Y, t);
    touchMove(h, 2, CENTRE_X + 40 + i * 30, CENTRE_Y, t);
    h.controller.update(1 / 60);
  }
  h.step(3.0);
  check(
    'fingers apart pulls the camera in, and stops at the configured floor',
    close(h.rig.getZoomScale(), nav.zoom.minDistanceScale, 1e-9),
    `scale ${h.rig.getZoomScale().toFixed(6)} against a floor of ${nav.zoom.minDistanceScale}`,
  );
}
{
  const h = makeHarness();
  let t = 1000;
  touchDown(h, 1, CENTRE_X - 600, CENTRE_Y, t);
  touchDown(h, 2, CENTRE_X + 600, CENTRE_Y, t);
  for (let i = 1; i <= 20; i += 1) {
    t += 16;
    const gap = Math.max(20, 600 - i * 30);
    touchMove(h, 1, CENTRE_X - gap, CENTRE_Y, t);
    touchMove(h, 2, CENTRE_X + gap, CENTRE_Y, t);
    h.controller.update(1 / 60);
  }
  h.step(3.0);
  check(
    'fingers together pushes it out, and stops at the measured ceiling',
    close(h.rig.getZoomScale(), nav.zoom.maxDistanceScale, 1e-9),
    `scale ${h.rig.getZoomScale().toFixed(6)} against a ceiling of ${nav.zoom.maxDistanceScale} — ` +
      'the value checks/navigation-zoom.ts proved footprint-safe',
  );
}
{
  // The transitions. Every gesture here is a delta against a baseline, so a
  // 1 <-> 2 change costs nothing PROVIDED no delta spans it. These two are what
  // that guarantee looks like from outside.
  const h = makeHarness();
  let t = 1000;
  touchDown(h, 1, CENTRE_X, CENTRE_Y, t);
  t += 16;
  touchMove(h, 1, CENTRE_X + 60, CENTRE_Y + 40, t);
  t += 16;
  touchMove(h, 1, CENTRE_X + 120, CENTRE_Y + 80, t);
  h.controller.update(1 / 60);
  h.step(1.0);

  const beforeSecond = { x: h.rig.focus.x, z: h.rig.focus.z, yaw: h.rig.getYaw() };
  t += 16;
  touchDown(h, 2, CENTRE_X - 300, CENTRE_Y - 200, t);
  h.controller.update(1 / 60);
  check(
    'a second finger arriving mid-pan moves nothing by itself',
    close(h.rig.focus.x, beforeSecond.x, 1e-9) &&
      close(h.rig.focus.z, beforeSecond.z, 1e-9) &&
      close(h.rig.getYaw(), beforeSecond.yaw, 1e-9),
    'the baselines are reseeded, so no delta spans the transition',
  );

  // Now lift the FIRST finger. The survivor is far away; if the controller
  // resumed panning from the leaving pointer's position instead of the
  // survivor's own, the next move would jump by the gap between them.
  t += 16;
  touchUp(h, 1, CENTRE_X + 120, CENTRE_Y + 80, t);
  const afterLift = { x: h.rig.focus.x, z: h.rig.focus.z };
  t += 16;
  touchMove(h, 2, CENTRE_X - 300 + 10, CENTRE_Y - 200, t);
  h.controller.update(1 / 60);
  h.step(1.0);
  const jump = Math.hypot(h.rig.focus.x - afterLift.x, h.rig.focus.z - afterLift.z);
  check(
    'lifting one of two resumes panning without a jump',
    jump < 20,
    `moved ${jump.toFixed(2)} units on a 10px move — the gap between the fingers was ~470px`,
  );
}
{
  const h = makeHarness();
  let t = 1000;
  touchDown(h, 1, CENTRE_X - 100, CENTRE_Y, t);
  touchDown(h, 2, CENTRE_X + 100, CENTRE_Y, t);
  check(
    'a two-finger press counts as a drag immediately',
    h.controller.isDragging,
    'otherwise lifting the first finger would register as a district click',
  );
  t += 16;
  // pointercancel on one of two must behave exactly as pointerup does.
  touchUp(h, 2, CENTRE_X + 100, CENTRE_Y, t, 'pointercancel');
  check(
    'a cancelled finger leaves the gesture alive on the survivor',
    h.controller.isPointerActive && h.controller.isDragging,
    'an OS-level cancel of one finger must not strand the other',
  );
  t += 16;
  touchUp(h, 1, CENTRE_X - 100, CENTRE_Y, t);
  check(
    'and the last one lifting ends it cleanly',
    !h.controller.isPointerActive && !h.controller.isDragging,
    'a pointer left tracked here swallows every later gesture',
  );
}

// =============================================================================
console.log('\n11. Wheel zoom plumbing');
{
  const h = makeHarness();
  wheel(h, -100);
  check(
    'the wheel sets a target rather than applying it on the spot',
    close(h.rig.getZoomScale(), 1, 1e-12),
    'nothing has moved before the first update — the dolly is eased, not cut',
  );
  h.controller.update(1 / 60);
  const afterOneFrame = h.rig.getZoomScale();
  h.step(2.0);
  const settled = h.rig.getZoomScale();
  check(
    'one frame lands strictly between the old value and the new',
    afterOneFrame < 1 - 1e-9 && afterOneFrame > settled + 1e-9,
    `1 -> ${afterOneFrame.toFixed(5)} -> ${settled.toFixed(5)}`,
  );
  check('zoom changes are notified for bounds recompute', h.zoomEvents > 0, `${h.zoomEvents} events`);
}
{
  // Multiplicative, so equal and opposite deltas must cancel EXACTLY. An
  // additive mapping passes every other test here and fails this one.
  const h = makeHarness();
  wheel(h, -100);
  h.step(2.0);
  wheel(h, 100);
  h.step(2.0);
  check(
    'zooming in then out by the same amount returns exactly to rest',
    close(h.rig.getZoomScale(), 1, 1e-12),
    `scale = ${h.rig.getZoomScale().toFixed(12)}`,
  );
}
{
  // Firefox reports deltaMode 1 (lines) where Chrome reports 0 (pixels). Without
  // normalisation the same physical notch zooms ~16x faster in one of them.
  //
  // Deliberately small: at deltaY 10 the line-mode event normalises to 160px
  // and runs into the momentum-scroll cap, so the ratio would measure the cap
  // rather than the conversion.
  const pixels = makeHarness();
  wheel(pixels, -5, { deltaMode: 0 });
  pixels.step(3.0);
  const lines = makeHarness();
  wheel(lines, -5, { deltaMode: 1 });
  lines.step(3.0);

  const pixelEfolds = -Math.log(pixels.rig.getZoomScale());
  const lineEfolds = -Math.log(lines.rig.getZoomScale());
  check(
    'a line-mode wheel counts for about 16 pixels, not 1',
    close(lineEfolds / pixelEfolds, 16, 0.5),
    `line/pixel ratio ${(lineEfolds / pixelEfolds).toFixed(2)}`,
  );
}
{
  const h = makeHarness();
  wheel(h, -10, { ctrlKey: true });
  h.step(3.0);
  const plain = makeHarness();
  wheel(plain, -10);
  plain.step(3.0);
  check(
    'a trackpad pinch (ctrl+wheel) is amplified as configured',
    close(
      Math.log(h.rig.getZoomScale()) / Math.log(plain.rig.getZoomScale()),
      nav.zoom.ctrlWheelMultiplier,
      0.01,
    ),
    `${(Math.log(h.rig.getZoomScale()) / Math.log(plain.rig.getZoomScale())).toFixed(3)}x against a configured ${nav.zoom.ctrlWheelMultiplier}`,
  );
}
{
  // A flick of momentum scroll can carry an enormous single delta. Capped, it
  // must not cross the band in one event, or there is no interior to aim in.
  const h = makeHarness();
  wheel(h, 100000);
  h.step(3.0);
  check(
    'one absurd wheel event cannot cross the whole band',
    h.rig.getZoomScale() < nav.zoom.maxDistanceScale - 1e-6,
    `scale ${h.rig.getZoomScale().toFixed(4)} of a possible ${nav.zoom.maxDistanceScale}`,
  );
}
{
  // Handing the rig back has to adopt the zoom along with focus and yaw.
  // Without it the next wheel event eases from a stale target and snaps.
  const h = makeHarness();
  wheel(h, -200);
  h.step(3.0);
  const zoomed = h.rig.getZoomScale();

  h.controller.beginExternalControl();
  h.rig.setZoomScale(1.1);
  h.rig.setYaw(42);
  h.controller.endExternalControl({ adoptRigState: true });
  h.step(2.0);

  check(
    'resuming from a flight adopts the zoom it left behind',
    close(h.rig.getZoomScale(), 1.1, 1e-9) && !close(h.rig.getZoomScale(), zoomed, 1e-6),
    `held ${h.rig.getZoomScale().toFixed(4)} rather than easing back to ${zoomed.toFixed(4)}`,
  );
}

// This harness could not fail a build until 2026-08-13: it printed its failures
// and left process.exitCode at 0, so `npm run check` chained past it with &&.
// finish() sets the code from the same counter it prints.
finish();
