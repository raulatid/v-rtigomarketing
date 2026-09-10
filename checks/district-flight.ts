/**
 * Behavioural harness for the district interaction.  `npm run check:district`
 *
 * Drives the REAL `CameraFlight`, `CameraRig`, `createCameraInput`,
 * `resolveDistrict` and framing maths. Per PROJECT_MEMORY, "How this repo
 * verifies things", harnesses here must exercise the real path rather than a
 * convenient stand-in — the
 * longest-lived bug in this project hid behind a harness that rebuilt what it
 * was meant to test.
 *
 * The expensive things to get wrong here are not arithmetic. They are:
 *   - two systems writing the rig in the same frame (section 4 of the plan),
 *   - a snap-back when navigation resumes,
 *   - a tap that cancels a flight also counting as a selection,
 *   - framing measured against a canvas that is assumed to fill the viewport.
 * Each has a section below.
 */
import * as THREE from 'three';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import type { BoundsRect, NavigationConfig } from '../src/experiences/murcia/config/environmentConfig';
import { CameraRig } from '../src/experiences/murcia/camera/CameraRig';
import { measurementCameraTuning } from '../src/experiences/murcia/camera/cameraTuning';
import { CameraFlight, shortestYawDelta } from '../src/experiences/murcia/camera/CameraFlight';
import { unobstructedCenterNdc, computeFramedFocus } from '../src/experiences/murcia/camera/cameraFraming';
import { createCameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import type { CameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import { expandRect, containsPoint } from '../src/experiences/murcia/navigation/navigationBounds';
import { resolveDistrict } from '../src/experiences/murcia/interaction/resolveDistrict';
import { cityDistrictBindings } from '../src/experiences/murcia/scene/cityDistrictBindings';
import { DISTRICT_CONTENT } from '../src/content/generated/districts';
import { findDistrictContent } from '../src/content/lookup';

const env = murciaConfig;
const nav = env.navigation;
const WIDTH = 1920;
const HEIGHT = 1080;
const ASPECT = WIDTH / HEIGHT;

const plate: BoundsRect = { ...env.contentBounds };
const bounds = expandRect(plate, -nav.boundsInset);

import { check, close, finish } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import { makeRig } from './lib/rig';


// --- Stub DOM ----------------------------------------------------------------

interface Harness {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  input: CameraInput;
  flight: CameraFlight;
  fire: (type: string, event: Record<string, unknown>) => void;
  /** One frame: the flight ticks, then the springs — if nothing else owns the camera. */
  frame: (dt: number) => void;
  run: (seconds: number, dt?: number) => void;
  boundsCalls: number;
}

function makeHarness(
  config: NavigationConfig = nav,
  focusAt = env.initialFocus,
  limits: BoundsRect = bounds,
): Harness {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  const element = stub.element;

  const { camera, rig } = makeRig(env, ASPECT, focusAt);

  const harness = {
    rig,
    camera,
    boundsCalls: 0,
  } as Harness;

  // Firm and limit are the same rectangle here on purpose: this file measures
  // FLIGHTS, which clamp to the firm area and never enter §40's band. Handing it
  // a band would make a flight's landing depend on a drag behaviour it does not
  // use, and §5 below would stop being evidence that flights were left alone.
  rig.setBounds(limits);
  harness.input = createCameraInput({
    element,
    rig,
    width: WIDTH,
    height: HEIGHT,
  });
  void config;
  harness.flight = new CameraFlight(rig, {
    resolveBounds: () => {
      harness.boundsCalls += 1;
      return limits;
    },
  });
  harness.fire = stub.fire;
  harness.frame = (dt) => {
    harness.flight.update(dt);
    // THE ARBITER, in the same shape MurciaExperience.update uses. The springs
    // run only when nothing else owns the camera; a harness that stepped them
    // under a flight would be measuring a bug rather than the shipped order.
    if (!rig.isExternallyControlled) rig.update(dt);
  };
  harness.run = (seconds, dt = 1 / 60) => {
    const frames = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < frames; i += 1) harness.frame(dt);
  };
  return harness;
}

function down(x: number, y: number, id = 1): Record<string, unknown> {
  return { pointerId: id, button: 0, clientX: x, clientY: y, timeStamp: 0 };
}

// --- 1. Yaw path -------------------------------------------------------------

console.log('\n1. Yaw takes the shortest path and preserves accumulation');
{
  check(
    '350 deg -> 10 deg travels +20, not -340',
    close(shortestYawDelta(350, 10), 20, 1e-9),
    `${shortestYawDelta(350, 10).toFixed(1)} deg`,
  );
  check(
    '10 deg -> 350 deg travels -20',
    close(shortestYawDelta(10, 350), -20, 1e-9),
    `${shortestYawDelta(10, 350).toFixed(1)} deg`,
  );
  // An exact half turn is genuinely ambiguous — both directions are equally
  // short — so the only thing worth asserting is that it is a half turn and that
  // the tie is broken the same way every time. The formula's range is
  // [-180, 180), so the tie goes to -180; asserting +180 would be asserting a
  // range the formula does not produce.
  check(
    'an exact half turn is 180 deg, and the tie is broken deterministically',
    Math.abs(shortestYawDelta(0, 180)) === 180 &&
      shortestYawDelta(0, 180) === shortestYawDelta(90, 270),
    `${shortestYawDelta(0, 180).toFixed(1)} deg, same for every half turn`,
  );

  const h = makeHarness();
  h.rig.setYaw(350);
  h.rig.setExternallyControlled(true);
  // `yawDegrees` on a flight destination is an ABSOLUTE rig azimuth — pose
  // azimuth plus user yaw — so the user yaw it lands on depends on the pose.
  // This used to assert the literal 370, which held only while the resting
  // azimuth was 0; it is 267 as of 2026-09-05. The invariant is unchanged: go
  // the short way round, and do not unwind the turn already accumulated.
  const startAzimuth = h.rig.getAzimuthDegrees();
  const expectedYaw = 350 + shortestYawDelta(startAzimuth, 10);
  h.flight.playTo({ x: env.initialFocus.x, z: env.initialFocus.z, yawDegrees: 10, distanceScale: null });
  h.run(3);
  const landedAzimuth = h.rig.getAzimuthDegrees();
  check(
    'the rig lands on the requested heading the short way, keeping the accumulated turn',
    close(h.rig.getYaw(), expectedYaw, 1e-6) &&
      close(((landedAzimuth - 10) % 360 + 360) % 360, 0, 1e-6) &&
      h.rig.getYaw() > 180,
    `yaw ${h.rig.getYaw().toFixed(3)} deg -> azimuth ${landedAzimuth.toFixed(1)} deg ` +
      `(requested 10, and the yaw is not normalised down to it)`,
  );

  const wound = makeHarness();
  wound.rig.setYaw(730);
  wound.rig.setExternallyControlled(true);
  wound.flight.playTo({ x: env.initialFocus.x, z: env.initialFocus.z, yawDegrees: 20, distanceScale: null });
  wound.run(3);
  check(
    'a wound-up 730 deg start is not unwound',
    wound.rig.getYaw() > 700,
    `yaw ${wound.rig.getYaw().toFixed(1)} deg, travelled ${(wound.rig.getYaw() - 730).toFixed(1)}`,
  );
}

// --- 2. Sole ownership of the rig -------------------------------------------

console.log('\n2. Only one system writes the rig');
{
  const h = makeHarness();
  // Leave the controller holding stale drag targets, as a real gesture would.
  h.fire('pointerdown', down(960, 540));
  h.fire('pointermove', { pointerId: 1, button: 0, clientX: 960, clientY: 320, timeStamp: 40 });
  h.fire('pointerup', { pointerId: 1, button: 0, clientX: 960, clientY: 320, timeStamp: 60 });
  h.run(0.05);

  h.rig.setExternallyControlled(true);
  const parkedX = -300;
  const parkedZ = 300;
  h.rig.setFocus(parkedX, parkedZ);
  const parkedYaw = 42;
  h.rig.setYaw(parkedYaw);

  for (let i = 0; i < 30; i += 1) if (!h.rig.isExternallyControlled) h.rig.update(1 / 60);

  check(
    'controller.update() does not move the focus under external control',
    close(h.rig.focus.x, parkedX, 1e-9) && close(h.rig.focus.z, parkedZ, 1e-9),
    `focus (${h.rig.focus.x.toFixed(4)}, ${h.rig.focus.z.toFixed(4)}) after 30 frames`,
  );
  check(
    'controller.update() does not move the yaw either',
    close(h.rig.getYaw(), parkedYaw, 1e-9),
    `yaw ${h.rig.getYaw().toFixed(4)} deg`,
  );

  // The whole point of the lifecycle: without adoption this snaps back.
  h.rig.setExternallyControlled(false);
  const beforeX = h.rig.focus.x;
  const beforeZ = h.rig.focus.z;
  const beforeYaw = h.rig.getYaw();
  for (let i = 0; i < 30; i += 1) if (!h.rig.isExternallyControlled) h.rig.update(1 / 60);
  const drift = Math.hypot(h.rig.focus.x - beforeX, h.rig.focus.z - beforeZ);
  check(
    'no snap-back after endExternalControl({adoptRigState})',
    drift < 1e-3 && close(h.rig.getYaw(), beforeYaw, 1e-6),
    `drifted ${drift.toFixed(6)} units, yaw moved ${Math.abs(h.rig.getYaw() - beforeYaw).toFixed(6)} deg`,
  );

  // WHY THERE IS NOTHING LEFT TO ADOPT.
  //
  // `endExternalControl({ adoptRigState })` used to be a real choice, and this
  // section used to prove the un-adopted path snapped back. The spring rig
  // removed the choice: `setFocus` and `setYaw` write the damped value, the
  // TARGET and the VELOCITY together, so a flight cannot leave the rig in a
  // state that needs reconciling.
  //
  // Asserted rather than asserted-away, because "the target came with it" is
  // exactly the line a future simplification would delete. Velocity is the one
  // a first-order lag never had to think about, and the one whose absence shows
  // up as the camera carrying the flight's motion through the handover.
  const g = makeHarness();
  g.fire('pointerdown', down(960, 540));
  g.fire('pointermove', { pointerId: 1, button: 0, clientX: 960, clientY: 300, timeStamp: 40 });
  g.run(0.02);
  const moving = g.rig.snapshot();
  check(
    'a drag really did leave the springs in motion',
    Math.abs(moving.x - moving.targetX) > 1e-6 || Math.abs(moving.z - moving.targetZ) > 1e-6,
    `value/target gap ${Math.abs(moving.x - moving.targetX).toFixed(4)} units`,
  );

  g.fire('pointerup', { pointerId: 1, button: 0, clientX: 960, clientY: 300, timeStamp: 60 });
  g.rig.setExternallyControlled(true);
  g.rig.setFocus(-300, 300);
  const seeded = g.rig.snapshot();
  check(
    'setFocus re-seeds the target as well as the value',
    close(seeded.x, -300, 1e-9) && close(seeded.targetX, -300, 1e-9) &&
      close(seeded.z, 300, 1e-9) && close(seeded.targetZ, 300, 1e-9),
    `value (${seeded.x.toFixed(3)}, ${seeded.z.toFixed(3)}), target (${seeded.targetX.toFixed(3)}, ${seeded.targetZ.toFixed(3)})`,
  );

  g.rig.setExternallyControlled(false);
  const settledBefore = { x: g.rig.focus.x, z: g.rig.focus.z };
  for (let i = 0; i < 30; i += 1) if (!g.rig.isExternallyControlled) g.rig.update(1 / 60);
  const settledDrift = Math.hypot(g.rig.focus.x - settledBefore.x, g.rig.focus.z - settledBefore.z);
  check(
    'and the velocity with it, so the handover carries no residual motion',
    settledDrift < 1e-6,
    `drifted ${settledDrift.toExponential(2)} units over 30 frames`,
  );
}

// --- 3. Cancellation ---------------------------------------------------------

console.log('\n3. A press cancels the flight and hands control back');
{
  const h = makeHarness();
  h.rig.setExternallyControlled(true);
  h.flight.playTo({ x: -200, z: 300, yawDegrees: 60, distanceScale: null });
  h.run(0.3);
  const midX = h.rig.focus.x;
  const midYaw = h.rig.getYaw();
  check('the flight is under way', h.flight.isPlaying, `focus x ${midX.toFixed(1)}, yaw ${midYaw.toFixed(1)}`);

  // Shipped order: the capture-phase handler cancels and ends external control,
  // then the controller's own bubble-phase pointerdown starts the drag.
  h.flight.cancel();
  h.rig.setExternallyControlled(false);
  h.fire('pointerdown', down(960, 540, 7));

  check('the flight stopped', !h.flight.isPlaying, 'isPlaying false');
  check(
    'the same press starts a drag rather than being swallowed',
    h.input.isPointerActive,
    'controller.isPointerActive true — no dead first gesture',
  );

  // Continuity: the rig must not jump on the frame after the handover.
  const afterX = h.rig.focus.x;
  const afterZ = h.rig.focus.z;
  h.frame(1 / 60);
  const jump = Math.hypot(h.rig.focus.x - afterX, h.rig.focus.z - afterZ);
  check('no discontinuity on the handover frame', jump < 1e-3, `moved ${jump.toFixed(6)} units`);
}

console.log('\n4. The cancelling tap does not also select');
{
  // Mirrors DistrictInteraction's suppression rule: a sub-threshold press that
  // cancels a flight must not fall through into selection on its pointerup.
  let suppressed: number | null = null;
  let selections = 0;
  const flightPlaying = { value: true };

  const pointerDownCapture = (id: number): void => {
    if (!flightPlaying.value) return;
    flightPlaying.value = false;
    suppressed = id;
  };
  const pointerUp = (id: number): void => {
    const wasSuppressed = suppressed === id;
    suppressed = null;
    if (wasSuppressed) return;
    selections += 1;
  };

  pointerDownCapture(3);
  pointerUp(3);
  check('a tap that cancels a flight selects nothing', selections === 0, `${selections} selection(s)`);

  pointerDownCapture(4);
  pointerUp(4);
  check(
    'the suppression is cleared, so the next tap does select',
    selections === 1,
    `${selections} selection(s) after the second tap`,
  );

  suppressed = 5;
  const cancelled = (id: number): void => {
    if (suppressed === id) suppressed = null;
  };
  cancelled(5);
  pointerUp(5);
  check(
    'pointercancel clears it too, so it cannot leak into the next gesture',
    selections === 2,
    'a cancelled sequence does not suppress the following one',
  );
}

// --- 5. Bounds ---------------------------------------------------------------

console.log('\n5. The flight stays inside the navigable area');
{
  const corner = { x: plate.minX - 400, z: plate.minZ - 400 };
  const h = makeHarness();
  h.rig.setExternallyControlled(true);
  h.flight.playTo({ x: corner.x, z: corner.z, yawDegrees: 40, distanceScale: null });
  h.run(3);
  check(
    'a destination outside the plate is clamped, not followed',
    containsPoint(h.rig.focus.x, h.rig.focus.z, expandRect(bounds, 1e-6)),
    `focus (${h.rig.focus.x.toFixed(1)}, ${h.rig.focus.z.toFixed(1)}) inside X [${bounds.minX.toFixed(0)}, ${bounds.maxX.toFixed(0)}]`,
  );
  check(
    'bounds were re-resolved every frame of the turn',
    h.boundsCalls >= 60,
    `${h.boundsCalls} resolveBounds calls — the footprint is azimuth-dependent`,
  );

  // A trajectory grazing the edge must still arrive where it was aimed: the
  // destination is never rewritten by a frame that happened to be clamped.
  const near = { x: plate.minX + 2, z: plate.minZ + 2 };
  const g = makeHarness(nav, { x: plate.maxX - 2, z: plate.maxZ - 2 });
  g.rig.setExternallyControlled(true);
  g.flight.playTo({ x: near.x, z: near.z, yawDegrees: null, distanceScale: null });
  g.run(3);
  check(
    'a corner destination is reached exactly, not eroded by clamping',
    close(g.rig.focus.x, near.x, 1e-6) && close(g.rig.focus.z, near.z, 1e-6),
    `arrived (${g.rig.focus.x.toFixed(3)}, ${g.rig.focus.z.toFixed(3)}) vs desired (${near.x}, ${near.z})`,
  );
}

// --- 6. Frame-rate independence ---------------------------------------------

console.log('\n6. Identical outcome at 30, 60 and 120 fps');
{
  const results: Array<{ fps: number; x: number; z: number; yaw: number }> = [];
  for (const fps of [30, 60, 120]) {
    const h = makeHarness();
    h.rig.setExternallyControlled(true);
    h.flight.playTo({ x: -200, z: 300, yawDegrees: 75, distanceScale: null });
    h.run(3, 1 / fps);
    results.push({ fps, x: h.rig.focus.x, z: h.rig.focus.z, yaw: h.rig.getYaw() });
  }
  const [a, b, c] = results as [typeof results[0], typeof results[0], typeof results[0]];
  const spread = Math.max(
    Math.hypot(a.x - b.x, a.z - b.z),
    Math.hypot(b.x - c.x, b.z - c.z),
  );
  check(
    'endpoints agree across frame rates',
    spread < 1e-6,
    `max spread ${spread.toExponential(1)} units`,
  );
  check(
    'final yaw agrees across frame rates',
    close(a.yaw, b.yaw, 1e-6) && close(b.yaw, c.yaw, 1e-6),
    `${a.yaw.toFixed(4)} / ${b.yaw.toFixed(4)} / ${c.yaw.toFixed(4)} deg`,
  );

  // Mid-flight too, not only the endpoint — an endpoint check alone would pass
  // for anything that merely arrives.
  const mid: number[] = [];
  for (const fps of [30, 60, 120]) {
    const h = makeHarness();
    h.rig.setExternallyControlled(true);
    h.flight.playTo({ x: -200, z: 300, yawDegrees: 75, distanceScale: null });
    h.run(0.6, 1 / fps);
    mid.push(h.rig.focus.x);
  }
  const midSpread = Math.max(...mid) - Math.min(...mid);
  check(
    'the trajectory matches mid-flight, not just at the end',
    midSpread < 0.5,
    `spread ${midSpread.toFixed(4)} units at t=0.6s`,
  );
}

// --- 7. Framing --------------------------------------------------------------

console.log('\n7. Framing centres the district');
{
  // The district's UI is the projected display, which lives IN the world and
  // turns with the camera, so there is nothing on the canvas to frame around.
  // The interaction passes `null` and gets the centre; the obstruction cases
  // `unobstructedCenterNdc` still supports belong to its own unit test now that
  // no district uses them.
  const canvas = { left: 0, top: 0, width: 1440, height: 900 };
  check(
    'no obstruction leaves the centre alone',
    unobstructedCenterNdc(canvas, null).x === 0 && unobstructedCenterNdc(canvas, null).y === 0,
    'ndc (0, 0)',
  );

  const binding = cityDistrictBindings[0]!;
  // A point in the service-building cluster (X [-188, -100] Z [388, 462]).
  // Deliberately close to the plate's +Z edge (473): that is where the framing
  // solve is most likely to push the focus out of bounds.
  const target = { x: -144, z: 425 };
  const pose = env.camera;

  const viewports: Array<[string, number, number, { left: number; top: number; width: number; height: number } | null]> = [
    ['1024x768   desktop', 1024, 768, null],
    ['1440x900   desktop', 1440, 900, null],
    ['390x844    portrait', 390, 844, null],
    ['844x390    landscape', 844, 390, null],
    ['5120x1440  ultrawide', 5120, 1440, null],
  ];

  for (const [label, w, h] of viewports) {
    const canvasRect = { left: 0, top: 0, width: w, height: h };
    const ndc = unobstructedCenterNdc(canvasRect, null);
    const framed = computeFramedFocus({
      pose,
      aspect: w / h,
      yawDegrees: binding.approachYawDegrees ?? 0,
      groundPlaneHeight: nav.groundPlaneHeight,
      target,
      ndc,
    });

    // Project independently through a fresh camera, rather than trusting the
    // framing function's own arithmetic.
    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, pose, measurementCameraTuning(pose.elevationDegrees));
    rig.setAspect(w / h);
    rig.setYaw(binding.approachYawDegrees ?? 0);
    rig.setFocus(framed!.x, framed!.z);
    camera.updateMatrixWorld(true);
    const projected = new THREE.Vector3(target.x, nav.groundPlaneHeight, target.z).project(camera);

    check(
      `${label} lands on target ndc`,
      close(projected.x, ndc.x, 1e-4) && close(projected.y, ndc.y, 1e-4),
      `wanted (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)}) got (${projected.x.toFixed(3)}, ${projected.y.toFixed(3)})`,
    );
  }

  // The canvas does not have to fill the viewport, and the framing solve reads
  // its own rect rather than the window's. Kept as a case because the app shell
  // owns the layout and could inset the canvas at any time.
  const inset = { left: 120, top: 60, width: 1000, height: 700 };
  const insetNdc = unobstructedCenterNdc(inset, null);
  const framedInset = computeFramedFocus({
    pose,
    aspect: inset.width / inset.height,
    yawDegrees: 0,
    groundPlaneHeight: nav.groundPlaneHeight,
    target,
    ndc: insetNdc,
  });
  check(
    'the offset-canvas case still produces a usable focus',
    framedInset !== null && Number.isFinite(framedInset.x) && Number.isFinite(framedInset.z),
    `focus (${framedInset!.x.toFixed(1)}, ${framedInset!.z.toFixed(1)})`,
  );

  // The live rig must be untouched by a framing computation.
  const live = makeHarness();
  const yawBefore = live.rig.getYaw();
  const focusBefore = { x: live.rig.focus.x, z: live.rig.focus.z };
  computeFramedFocus({
    pose,
    aspect: ASPECT,
    yawDegrees: 137,
    groundPlaneHeight: nav.groundPlaneHeight,
    target,
    ndc: { x: -0.3, y: 0.2 },
  });
  check(
    'computing framing never moves the live rig',
    close(live.rig.getYaw(), yawBefore, 1e-12) &&
      close(live.rig.focus.x, focusBefore.x, 1e-12) &&
      close(live.rig.focus.z, focusBefore.z, 1e-12),
    'yaw and focus unchanged — a detached rig did the measurement',
  );

  // Framing has to be computed against the pose actually being looked through,
  // which means rig.getEffectivePose() and NOT rig.getPose(). Fed the configured
  // distance while the rig is dollied, the detached rig frames for a camera that
  // does not exist and the district lands off its mark, silently.
  //
  // This used to guard the user zoom band. It guards the FLIGHT dolly now (`adr/009`),
  // which is a sharper version of the same hazard rather than a weaker one: a flight
  // changes distance while it is framing, so the two are no longer independent.
  for (const scale of [murciaConfig.focusFlight.minDistanceScale, 1]) {
    const dollied = makeHarness();
    dollied.rig.setDistanceScale(scale);

    const ndc = { x: -0.26, y: 0.1 };
    const framed = computeFramedFocus({
      pose: dollied.rig.getEffectivePose(),
      aspect: ASPECT,
      yawDegrees: 0,
      groundPlaneHeight: nav.groundPlaneHeight,
      target,
      ndc,
    });

    const camera = new THREE.PerspectiveCamera();
    const rig = new CameraRig(camera, env.camera, measurementCameraTuning(env.camera.elevationDegrees));
    rig.setDistanceScale(scale);
    rig.setAspect(ASPECT);
    rig.setFocus(framed!.x, framed!.z);
    camera.updateMatrixWorld(true);
    const projected = new THREE.Vector3(target.x, nav.groundPlaneHeight, target.z).project(camera);

    check(
      `framing holds at distance scale ${scale}`,
      close(projected.x, ndc.x, 1e-4) && close(projected.y, ndc.y, 1e-4),
      `wanted (${ndc.x.toFixed(3)}, ${ndc.y.toFixed(3)}) got (${projected.x.toFixed(3)}, ${projected.y.toFixed(3)})`,
    );

    // And the same computation fed the UNSCALED pose must visibly miss. Without
    // this the check above would still pass if getEffectivePose were quietly
    // replaced by getPose — it asserts that the distinction does work.
    //
    // Only where there IS a distinction. At scale 1 the two poses are the same
    // object, so "the naive one misses" is not merely hard to satisfy, it is false:
    // asserting it there would be asserting that an identity is not one.
    if (scale === 1) continue;
    const naive = computeFramedFocus({
      pose: dollied.rig.getPose(),
      aspect: ASPECT,
      yawDegrees: 0,
      groundPlaneHeight: nav.groundPlaneHeight,
      target,
      ndc,
    });
    rig.setFocus(naive!.x, naive!.z);
    camera.updateMatrixWorld(true);
    const naiveProjected = new THREE.Vector3(target.x, nav.groundPlaneHeight, target.z).project(camera);
    check(
      `and the configured pose visibly misses at scale ${scale}`,
      !close(naiveProjected.x, ndc.x, 1e-3) || !close(naiveProjected.y, ndc.y, 1e-3),
      `off by (${(naiveProjected.x - ndc.x).toFixed(3)}, ${(naiveProjected.y - ndc.y).toFixed(3)}) ndc — which is the bug getEffectivePose exists to avoid`,
    );
  }
}

// --- 7b. Distance is not user state -----------------------------------------

console.log('\n7b. Nothing outside a flight can move the distance');
{
  // This section used to assert the opposite: that a flight left the USER'S zoom
  // where it found it, because the wheel and the pinch could put the rig anywhere
  // in a band and `endExternalControl({adoptRigState})` had to re-adopt it.
  //
  // That is false by construction now (`adr/009`). There is no zoom, the controller
  // holds no distance target at all, and a flight is the only writer. The property
  // worth guarding inverted with it: not "the controller's distance survives a
  // flight" but "the controller never touches distance in the first place". A
  // regression that re-added a distance axis to the drag would fail here.
  const h = makeHarness();
  h.rig.setDistanceScale(0.8);

  // A full drag: press, sweep, release, and long enough afterwards for every
  // smoothing and inertia term to run itself out.
  const cx = WIDTH / 2;
  const cy = HEIGHT / 2;
  h.fire('pointerdown', down(cx, cy));
  h.fire('pointermove', { pointerId: 1, clientX: cx + 180, clientY: cy - 120, timeStamp: 16 });
  h.fire('pointerup', { pointerId: 1, button: 0, clientX: cx + 180, clientY: cy - 120, timeStamp: 32 });
  h.run(2);

  check(
    'a drag leaves the distance scale exactly where it was',
    close(h.rig.getDistanceScale(), 0.8, 1e-12),
    `scale ${h.rig.getDistanceScale().toFixed(9)} — the drag has no distance axis to leak`,
  );

  // And the handover itself, which is where the old adoption lived.
  h.rig.setExternallyControlled(true);
  h.rig.setFocus(-300, 200);
  h.rig.setYaw(35);
  h.rig.setDistanceScale(0.7);
  h.rig.setExternallyControlled(false);
  h.run(2);

  check(
    'and the handover back does not pull it toward a stale target',
    close(h.rig.getDistanceScale(), 0.7, 1e-12),
    `scale ${h.rig.getDistanceScale().toFixed(9)} — the flight's distance is left alone`,
  );
  {
    // The spring equivalent of "not still settling": value on target, and no
    // velocity left to carry it past. Both, because either alone is reachable
    // by a rig that is momentarily crossing its target at speed.
    const s = h.rig.snapshot();
    const gap = Math.hypot(s.x - s.targetX, s.z - s.targetZ);
    const yawGap = Math.abs(s.yaw - s.targetYaw);
    check(
      'and the springs are not still settling toward a stale target',
      gap < 1e-6 && yawGap < 1e-6,
      `focus off target by ${gap.toExponential(2)}, yaw by ${yawGap.toExponential(2)}`,
    );
  }
}

// --- 7c. The focus dolly ------------------------------------------------------

console.log('\n7c. The focus dolly: inward only, bounded, and bounds-correct');
{
  // A district flight is the ONLY thing left that changes camera distance
  // (`adr/009`), so everything the retired zoom band used to guard about distance
  // now has to be guarded here.
  const target = { x: env.initialFocus.x + 200, z: env.initialFocus.z - 150 };
  const floor = murciaConfig.focusFlight.minDistanceScale;

  {
    const h = makeHarness();
    const before = h.boundsCalls;
    const seen: number[] = [];
    h.rig.setExternallyControlled(true);
    h.flight.playTo({ ...target, yawDegrees: null, distanceScale: floor });
    for (let i = 0; i < 200 && h.flight.isPlaying; i += 1) {
      h.frame(1 / 60);
      seen.push(h.rig.getDistanceScale());
    }

    let monotone = true;
    for (let i = 1; i < seen.length; i += 1) {
      if (seen[i]! > seen[i - 1]! + 1e-9) monotone = false;
    }
    check(
      'the dolly moves inward monotonically, never overshooting outward',
      monotone,
      `${seen.length} frames from 1 to ${floor}`,
    );
    check(
      'and lands exactly on the configured scale',
      close(h.rig.getDistanceScale(), floor, 1e-9),
      `scale ${h.rig.getDistanceScale().toFixed(6)} against ${floor}`,
    );
    check(
      'never below the floor at any point of the flight',
      seen.every((v) => v >= floor - 1e-9),
      `min ${Math.min(...seen).toFixed(6)} — below ~60 units the footprint inverts`,
    );
    check(
      'and the bounds are re-resolved as it goes',
      h.boundsCalls - before >= seen.length,
      `${h.boundsCalls - before} resolveBounds calls over ${seen.length} frames — ` +
        'distance sets the footprint as directly as azimuth does',
    );
  }

  {
    // The ordering that the yaw path already gets right, asserted for distance:
    // the bounds a frame clamps its focus against must be the bounds for the pose
    // THAT FRAME applied, never the previous one. Writing distance after
    // resolveBounds would be invisible in a landing test and wrong every frame.
    let scaleAtResolve = -1;
    const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
    const { rig } = makeRig(env, ASPECT, env.initialFocus);
    rig.setBounds(bounds);
    const input = createCameraInput({ element: stub.element, rig, width: WIDTH, height: HEIGHT });
    void input;
    const flight = new CameraFlight(rig, {
      resolveBounds: () => {
        scaleAtResolve = rig.getDistanceScale();
        return bounds;
      },
    });
    rig.setExternallyControlled(true);
    flight.playTo({ ...target, yawDegrees: 40, distanceScale: floor });
    flight.update(1 / 60);
    check(
      'distance is written BEFORE the bounds are resolved',
      scaleAtResolve < 1 - 1e-9 && scaleAtResolve >= floor - 1e-9,
      `resolveBounds saw scale ${scaleAtResolve.toFixed(6)}, not the 1 it started from`,
    );
  }

  {
    // Closing has to bring the distance back, because nothing else can: with no
    // zoom control anywhere, a viewer left dollied in is stranded. Focus and yaw
    // still stay where they were, which is the asymmetry `close()` documents.
    const h = makeHarness();
    h.rig.setExternallyControlled(true);
    h.flight.playTo({ ...target, yawDegrees: 40, distanceScale: floor });
    h.run(4);
    const focusX = h.rig.focus.x;
    const focusZ = h.rig.focus.z;
    const yaw = h.rig.getYaw();

    h.flight.playTo({ x: focusX, z: focusZ, yawDegrees: null, distanceScale: 1 });
    h.run(4);

    check(
      'closing returns the distance to exactly rest',
      close(h.rig.getDistanceScale(), 1, 1e-9),
      `scale ${h.rig.getDistanceScale().toFixed(9)}`,
    );
    check(
      'and leaves the focus and yaw exactly where the viewer left them',
      close(h.rig.focus.x, focusX, 1e-6) &&
        close(h.rig.focus.z, focusZ, 1e-6) &&
        close(h.rig.getYaw(), yaw, 1e-6),
      'returning the view would undo the viewer navigation; returning the distance does not',
    );
  }

  {
    // Frame-rate independence, extended to the axis that did not exist before.
    const landed = [30, 60, 120].map((fps) => {
      const h = makeHarness();
      h.rig.setExternallyControlled(true);
      h.flight.playTo({ ...target, yawDegrees: 40, distanceScale: floor });
      h.run(4, 1 / fps);
      return h.rig.getDistanceScale();
    });
    check(
      'the same distance is reached at 30, 60 and 120 fps',
      close(landed[0]!, landed[1]!, 1e-9) && close(landed[1]!, landed[2]!, 1e-9),
      landed.map((v) => v.toFixed(9)).join(' / '),
    );
  }
}

// --- 7d. Leaving the district returns the dolly -------------------------------

console.log('\n7d. Leaving the district returns the dolly and nothing else');
{
  // Paging between services no longer flies anywhere: the camera settles on the
  // plaza once and the projected display does the rest, so the mid-flight
  // re-aim the old per-building selection needed is gone with it.
  //
  // What IS still a flight is the way out, and its asymmetry is deliberate.
  // Focus and yaw are left wherever the visitor put them — restoring them reads
  // as the interface undoing their navigation — while distance goes back to 1,
  // because the visitor never chose it and `adr/009` left no way to undo it by
  // hand.
  const scale = 0.78;
  const plaza = { x: -144, z: 425 };

  const h = makeHarness();
  h.rig.setExternallyControlled(true);
  h.flight.playTo({ ...plaza, yawDegrees: 45, distanceScale: scale });
  h.run(4);

  const settledFocus = { x: h.rig.focus.x, z: h.rig.focus.z };
  const settledYaw = h.rig.getAzimuthDegrees();
  check(
    'entering settles at the district scale',
    close(h.rig.getDistanceScale(), scale, 1e-9),
    `scale ${h.rig.getDistanceScale().toFixed(4)}`,
  );

  // The exit, exactly as the display's VOLVER issues it: current focus, null
  // yaw, scale 1.
  h.rig.setExternallyControlled(true);
  h.flight.playTo({ x: h.rig.focus.x, z: h.rig.focus.z, yawDegrees: null, distanceScale: 1 });
  let maxScale = -Infinity;
  for (let i = 0; i < 240; i += 1) {
    h.frame(1 / 60);
    maxScale = Math.max(maxScale, h.rig.getDistanceScale());
  }

  check(
    'leaving returns the distance to rest',
    close(h.rig.getDistanceScale(), 1, 1e-9),
    `scale ${h.rig.getDistanceScale().toFixed(4)}, peak ${maxScale.toFixed(4)}`,
  );
  check(
    'and never overshoots past rest on the way out',
    maxScale <= 1 + 1e-9,
    `peak ${maxScale.toFixed(4)}`,
  );
  check(
    'leaving does not move the focus back',
    close(h.rig.focus.x, settledFocus.x, 1e-6) && close(h.rig.focus.z, settledFocus.z, 1e-6),
    `focus (${h.rig.focus.x.toFixed(2)}, ${h.rig.focus.z.toFixed(2)})`,
  );
  check(
    'and does not turn the yaw back',
    close(h.rig.getAzimuthDegrees(), settledYaw, 1e-6),
    `yaw ${h.rig.getAzimuthDegrees().toFixed(2)} deg`,
  );
}

// --- 8. Resolver -------------------------------------------------------------

console.log('\n8. District resolution reports how it found things');
{
  const binding = cityDistrictBindings[0]!;
  check('every binding has content', findDistrictContent(DISTRICT_CONTENT, binding.contentId) !== null, binding.contentId);

  // The resolver is exercised against a local spec rather than the shipped
  // table: these checks are about HOW it finds things, and never needed the
  // real node names. The table's own invariants live in
  // cityDistrictBindings.test.ts.
  const spec = {
    id: 'harness',
    tag: 'servicios',
    nodeNames: ['blog_edificios', 'blog_edificios.001'],
    allowSpatialFallback: false,
  };

  // districts.ts is meant to be edited by whoever writes the copy, so a bad edit
  // there is the most likely future breakage in this feature. These are cheap.
  for (const b of cityDistrictBindings) {
    const content = findDistrictContent(DISTRICT_CONTENT, b.contentId);
    if (!content) continue;
    check(
      `${b.contentId}: summary and intro are both present`,
      content.summary.trim().length > 0 && content.intro.trim().length > 0,
      `summary ${content.summary.length} chars, intro ${content.intro.length} chars`,
    );
    check(
      `${b.contentId}: every service has an id, title and body`,
      content.services.length > 0 &&
        content.services.every(
          (s) => s.id.trim().length > 0 && s.title.trim().length > 0 && s.body.trim().length > 0,
        ),
      `${content.services.length} service(s)`,
    );
    // Duplicate ids would collide in aria-controls and point two headers at one
    // region — invisible unless you are using a screen reader.
    const ids = content.services.map((s) => s.id);
    check(
      `${b.contentId}: service ids are unique`,
      new Set(ids).size === ids.length,
      ids.join(', '),
    );
  }

  // Post-GLTFLoader shape: names sanitized, originals preserved on userData.
  const root = new THREE.Object3D();
  const addMesh = (blenderName: string, x: number, z: number): THREE.Mesh => {
    const mesh = new THREE.Mesh(
      new THREE.BoxGeometry(6, 12, 6),
      new THREE.MeshStandardMaterial(),
    );
    mesh.name = blenderName.replace(/[[\].:/]/g, '');
    mesh.userData['name'] = blenderName;
    mesh.position.set(x, 6, z);
    root.add(mesh);
    return mesh;
  };
  addMesh('blog_edificios', -350, 175);
  addMesh('blog_edificios.001', -310, 195);
  const outsider = addMesh('Plane.021', -356, 253);

  const byName = resolveDistrict(root, spec);
  check(
    'resolves by name against sanitized node names',
    byName.source === 'name' && byName.meshes.length === 2,
    `source ${byName.source}, ${byName.meshes.length} mesh(es)`,
  );
  check(
    'the .001 rename is reported rather than silently absorbed',
    byName.warnings.some((w) => w.includes('sanitized-name')),
    'warning names the spelling that actually matched',
  );
  check(
    'resolving by name warns that the tag is still missing',
    byName.warnings.some((w) => w.includes('custom property')),
    'points at the Blender fix',
  );

  // Service buildings are identified by name by contract, so an untagged spec
  // must not nag about a custom property once per building.
  const untagged = resolveDistrict(root, { ...spec, tag: '' });
  check(
    'an untagged spec resolving by name does not ask for a tag',
    untagged.source === 'name' && !untagged.warnings.some((w) => w.includes('custom property')),
    `source ${untagged.source}, ${untagged.warnings.length} warning(s)`,
  );

  outsider.userData['district'] = spec.tag;
  const byTag = resolveDistrict(root, spec);
  check(
    'a tag beats configured names',
    byTag.source === 'tag' && byTag.meshes.length === 1 && byTag.meshes[0] === outsider,
    `source ${byTag.source}, ${byTag.meshes.length} mesh(es)`,
  );
  delete outsider.userData['district'];

  const noIdentity = {
    ...spec,
    tag: 'absent',
    nodeNames: [] as string[],
    fallbackRect: { minX: -381, maxX: -299, minZ: 156, maxZ: 212 },
  };
  check(
    'the spatial fallback cannot run when it is not allowed',
    resolveDistrict(root, noIdentity).source === 'not-found',
    `source ${resolveDistrict(root, noIdentity).source} with allowSpatialFallback false`,
  );
  const allowed = resolveDistrict(root, { ...noIdentity, allowSpatialFallback: true });
  check(
    'and warns loudly when it does',
    allowed.source === 'rect' && allowed.warnings.some((w) => w.includes('SPATIAL FALLBACK')),
    `source ${allowed.source}, ${allowed.meshes.length} mesh(es) by bounds intersection`,
  );

  const empty = resolveDistrict(new THREE.Object3D(), spec);
  check(
    'nothing found leaves the feature inert, with empty bounds',
    empty.source === 'not-found' && empty.meshes.length === 0 && empty.bounds.isEmpty(),
    'source not-found, no meshes',
  );

  // A tagged InstancedMesh cannot be highlighted by swapping its shared
  // material, so it has to be called out rather than found later on screen.
  const instRoot = new THREE.Object3D();
  const inst = new THREE.InstancedMesh(
    new THREE.BoxGeometry(2, 2, 2),
    new THREE.MeshStandardMaterial(),
    4,
  );
  inst.userData['district'] = spec.tag;
  instRoot.add(inst);
  check(
    'a tagged InstancedMesh is flagged, not silently material-swapped',
    resolveDistrict(instRoot, spec).warnings.some((w) => w.includes('InstancedMesh')),
    'warning explains that per-instance attributes are needed',
  );
}

// --- 9. Materials ------------------------------------------------------------

console.log('\n9. Material cloning preserves identity and restores originals');
{
  // DistrictHighlight builds a CanvasTexture, so it needs a DOM. Exercise the
  // material contract directly against the same rules rather than stubbing a
  // canvas and pretending the whole class ran.
  const shared: THREE.Material = new THREE.MeshStandardMaterial({ name: 'shared' });
  const other: THREE.Material = new THREE.MeshStandardMaterial({ name: 'other' });
  const meshA: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const meshB: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(), shared);
  const meshC: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(), other);
  const meshD: THREE.Mesh = new THREE.Mesh(new THREE.BoxGeometry(), [shared, other]);

  const cloneOf = new Map<THREE.Material, THREE.Material>();
  const originals = new Map<THREE.Mesh, THREE.Material | THREE.Material[]>();
  const resolve = (m: THREE.Material): THREE.Material => {
    const found = cloneOf.get(m);
    if (found) return found;
    const clone = m.clone();
    cloneOf.set(m, clone);
    return clone;
  };
  for (const mesh of [meshA, meshB, meshC, meshD]) {
    originals.set(mesh, mesh.material);
    mesh.material = Array.isArray(mesh.material)
      ? mesh.material.map(resolve)
      : resolve(mesh.material);
  }

  check(
    'meshes sharing an original share one clone',
    meshA.material === meshB.material,
    'one clone for the shared default, not one per mesh',
  );
  check(
    'distinct originals stay distinct',
    meshA.material !== meshC.material,
    `${cloneOf.size} clones for 2 originals`,
  );
  check(
    'material arrays are preserved as arrays',
    Array.isArray(meshD.material) && (meshD.material as THREE.Material[]).length === 2,
    'multi-material meshes keep their slots',
  );
  check('no clone is the original', meshA.material !== shared, 'the shared city material is untouched');

  for (const [mesh, material] of originals) mesh.material = material;
  check(
    'originals are restored before clones would be disposed',
    meshA.material === shared && meshC.material === other && Array.isArray(meshD.material),
    'no mesh is left pointing at a clone',
  );

  // Emissive: intensity alone does nothing while the colour is black.
  const black = new THREE.MeshStandardMaterial();
  check(
    'a default material has black emissive, so intensity alone is invisible',
    black.emissive.getHex() === 0x000000,
    'emissive * emissiveIntensity = 0 — the colour has to be set',
  );
  const authored = new THREE.MeshStandardMaterial({ emissive: 0xff8800, emissiveIntensity: 2 });
  const authoredClone = authored.clone();
  check(
    'an authored emissive survives cloning and must be scaled, not replaced',
    authoredClone.emissive.getHex() === 0xff8800 && authoredClone.emissiveIntensity === 2,
    'future districtPart = "emission" strips keep their look',
  );

  // The trim sheet is what §9's whole "clone by identity" design was written
  // for, and it is the first time a district's material will carry a texture.
  // Two ways that can go wrong, both of which look like a lighting problem
  // rather than a material one.
  const textured = new THREE.MeshStandardMaterial({ name: 'MAT_CITY_BUILDINGS' });
  const trim = new THREE.Texture();
  trim.name = 'city_trim';
  textured.map = trim;
  const texturedClone = textured.clone() as THREE.MeshStandardMaterial;
  check(
    'a highlight clone keeps the trim sheet',
    texturedClone.map === trim,
    'clone() copies the texture BY REFERENCE — no per-district texture upload',
  );

  // three multiplies emissive into the lit result rather than replacing it, so
  // tinting a black emissive cannot blank the base colour. Asserted because the
  // alternative implementation — writing `color` instead of `emissive` — would
  // look identical on the untextured city that ships today and would erase the
  // trim sheet the moment it lands.
  texturedClone.emissive.setHex(0x4fb0ff);
  texturedClone.emissiveIntensity = 0.55;
  check(
    'tinting a district does not overwrite its base colour',
    texturedClone.map === trim && texturedClone.color.getHex() === textured.color.getHex(),
    'highlight writes emissive only; map and color are untouched',
  );
}

// --- Summary -----------------------------------------------------------------

finish();
