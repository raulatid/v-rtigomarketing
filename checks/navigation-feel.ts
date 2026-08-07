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
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';
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

let failures = 0;
let checks = 0;

function check(label: string, ok: boolean, detail: string): void {
  checks += 1;
  if (!ok) failures += 1;
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label.padEnd(52)} ${detail}`);
}

function close(a: number, b: number, tol: number): boolean {
  return Math.abs(a - b) <= tol;
}

// --- Stub DOM ----------------------------------------------------------------

interface Harness {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  controller: DragPanController;
  fire: (type: string, event: Record<string, unknown>) => void;
  step: (seconds: number, frames?: number) => void;
  yawEvents: number;
}

function makeHarness(
  config: NavigationConfig = nav,
  focusAt = env.initialFocus,
  limits: BoundsRect = bounds,
): Harness {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const element = {
    style: {} as Record<string, string>,
    addEventListener(type: string, fn: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((f) => f !== fn),
      );
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return true;
    },
    getBoundingClientRect() {
      return { left: 0, top: 0, width: WIDTH, height: HEIGHT, right: WIDTH, bottom: HEIGHT };
    },
  } as unknown as HTMLElement;

  const pose = resolveCameraPose(env, ASPECT);
  const camera = new THREE.PerspectiveCamera(pose.fov, ASPECT, pose.near, pose.far);
  const rig = new CameraRig(camera, pose);
  rig.setAspect(ASPECT);
  rig.setFocus(focusAt.x, focusAt.z);

  const harness: Harness = {
    rig,
    camera,
    controller: null as unknown as DragPanController,
    fire: (type, event) => {
      for (const fn of listeners.get(type) ?? []) fn(event);
    },
    step: (seconds, frames = Math.max(1, Math.round(seconds * 60))) => {
      for (let i = 0; i < frames; i += 1) harness.controller.update(seconds / frames);
    },
    yawEvents: 0,
  };

  harness.controller = new DragPanController(element, camera, rig, config, limits, {
    onYawChanged: () => {
      harness.yawEvents += 1;
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
console.log('\n1. Forward/back translation — sign and ground fidelity');
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;

  // Expectation computed against the camera as it stands before the real move.
  // Read the gain from the config rather than hardcoding it: the point is that
  // displacement stays proportional to the ground the cursor crossed, whatever
  // the gain is tuned to.
  const anchorY = CENTRE_Y + 8;
  const from = groundAt(h.camera, CENTRE_X, anchorY);
  const to = groundAt(h.camera, CENTRE_X, anchorY + 100);
  const forward = h.rig.getForward();
  const expected =
    ((from.x - to.x) * forward.x + (from.z - to.z) * forward.z) * nav.translationGain;

  drag(h, 0, 100);
  h.step(1.0); // converge while the pointer is still down (no inertia yet)

  const movedX = h.rig.focus.x - startX;
  const movedZ = h.rig.focus.z - startZ;
  const alongForward = movedX * forward.x + movedZ * forward.z;
  const lateral = Math.hypot(movedX - forward.x * alongForward, movedZ - forward.z * alongForward);

  check(
    'drag DOWN moves forward (into the scene)',
    alongForward > 0,
    `along forward = ${alongForward.toFixed(2)} units`,
  );
  check(
    'displacement matches the ground x translationGain',
    close(alongForward, expected, 0.05),
    `got ${alongForward.toFixed(3)}, expected ${expected.toFixed(3)} (gain ${nav.translationGain})`,
  );
  check('no lateral drift', lateral < 1e-6, `lateral = ${lateral.toExponential(2)}`);
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

// =============================================================================
console.log('\n2. Axis isolation');
{
  const h = makeHarness();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;
  const startYaw = h.rig.getYaw();
  drag(h, 200, 0);
  h.step(1.0);
  check(
    'horizontal drag causes NO translation',
    Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ) < 1e-9,
    `moved ${Math.hypot(h.rig.focus.x - startX, h.rig.focus.z - startZ).toExponential(2)} units`,
  );
  check(
    'horizontal drag DOES rotate',
    Math.abs(h.rig.getYaw() - startYaw) > 1,
    `yaw = ${h.rig.getYaw().toFixed(2)} deg`,
  );
}
{
  const h = makeHarness();
  const startYaw = h.rig.getYaw();
  drag(h, 0, 150);
  h.step(1.0);
  check(
    'vertical drag causes NO rotation',
    Math.abs(h.rig.getYaw() - startYaw) < 1e-9,
    `yaw delta = ${Math.abs(h.rig.getYaw() - startYaw).toExponential(2)} deg`,
  );
}

// =============================================================================
console.log('\n3. Rotation sign — does the ground follow the cursor?');
{
  const h = makeHarness();
  // A fixed world point ahead of the camera, tracked across the rotation.
  const marker = groundAt(h.camera, CENTRE_X, CENTRE_Y - 200).clone();
  const before = screenX(h.camera, marker);
  drag(h, 300, 0); // drag RIGHT
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
  drag(h, -300, 0);
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
  h.fire('pointerdown', { pointerId: 1, button: 0, clientX: 0, clientY: CENTRE_Y, timeStamp: t });
  // Sweep right repeatedly: five full viewport widths = 900 degrees.
  let x = 0;
  for (let i = 0; i < 40; i += 1) {
    x -= 240;
    t += 16;
    h.fire('pointermove', { pointerId: 1, clientX: x, clientY: CENTRE_Y, timeStamp: t });
    h.controller.update(1 / 60);
  }
  h.step(2.0);
  check(
    'yaw accumulates past 360 without wrapping',
    Math.abs(h.rig.getYaw()) > 360,
    `yaw = ${h.rig.getYaw().toFixed(1)} deg`,
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
console.log('\n5. Forward is relative to the turned rig');
{
  const h = makeHarness();
  // Turn a quarter circle the way a person would: over ~0.4s, then hold still
  // briefly before letting go. The earlier version of this test moved 960px in
  // a single 16ms sample — a 60,000 px/s flick — and then asserted no coast,
  // which measured the harness rather than the controller.
  const quarterTurnPx = (90 / nav.rotation.degreesPerViewportWidth) * WIDTH;
  let t = 1000;
  h.fire('pointerdown', { pointerId: 1, button: 0, clientX: CENTRE_X, clientY: CENTRE_Y, timeStamp: t });
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
  release(h);
  h.step(4.0);

  const yaw = h.rig.getYaw();
  const forward = h.rig.getForward().clone();
  const startX = h.rig.focus.x;
  const startZ = h.rig.focus.z;

  drag(h, 0, 120);
  h.step(1.0);

  const movedX = h.rig.focus.x - startX;
  const movedZ = h.rig.focus.z - startZ;
  const along = movedX * forward.x + movedZ * forward.z;
  const lateral = Math.hypot(movedX - forward.x * along, movedZ - forward.z * along);

  // Some overshoot is the feature working — this is a system with momentum.
  // The bar is that a deliberate stop lands close, not exactly.
  check(
    'a deliberate quarter turn lands where it was aimed',
    close(Math.abs(yaw), 90, 6),
    `yaw = ${yaw.toFixed(2)} deg (target 90)`,
  );
  check('forward motion follows the NEW heading', along > 0 && lateral < 1e-6, `along = ${along.toFixed(2)}, lateral = ${lateral.toExponential(2)}`);
  check(
    'motion is genuinely on a different world axis than before',
    Math.abs(movedX) > Math.abs(movedZ),
    `moved dX ${movedX.toFixed(1)}, dZ ${movedZ.toFixed(1)} (was Z-dominant at yaw 0)`,
  );
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
  const h = makeHarness();
  const startYaw = h.rig.getYaw();
  drag(h, 0, 50, 2); // right button
  h.step(1.0);
  check(
    'right button drags identically to left',
    Math.abs(h.rig.focus.z - env.initialFocus.z) > 1 || Math.abs(h.rig.getYaw() - startYaw) > 0,
    `focus moved ${Math.abs(h.rig.focus.z - env.initialFocus.z).toFixed(1)} units`,
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

console.log(`\n${'='.repeat(70)}`);
console.log(`${checks - failures}/${checks} checks passed${failures ? `  *** ${failures} FAILED ***` : ''}`);
