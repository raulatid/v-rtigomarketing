/**
 * Behavioural harness for Murcia's camera.  `npm run check:navigation`
 *
 * Drives the REAL `CameraRig` and the REAL `createCameraInput` through synthetic
 * pointer sequences against a stub DOM element, then measures what the camera
 * actually did. Signs, the spring's shape and the bounds are the things a
 * typecheck cannot catch and no visual check happened for.
 *
 * Per PROJECT_MEMORY, "How this repo verifies things", harnesses here must
 * exercise the real code path, not a convenient stand-in — the one bug that hid
 * longest did so behind a harness that rebuilt what it was meant to be testing.
 * Nothing below reimplements rig maths; expectations are derived independently
 * (by raycasting, or by projecting a fixed world point to screen) and compared.
 *
 * ## What changed, and why most of this file did
 *
 * The model this used to guard was a MAP: one finger panned the ground 1:1
 * under the cursor via a ground-plane raycast, a second finger or the right
 * button rotated, and the two were told apart by a threshold. That was
 * DECISIONS §20 and it survived five amendments.
 *
 * It has been replaced by the model validated in `vertigo-lab`'s
 * `camera-navigation` experiment: ONE pointer carrying BOTH axes at once, over
 * a second-order spring. Three sections of this harness were therefore not
 * merely re-pointed but INVERTED or deleted, and the difference is worth being
 * explicit about:
 *
 *   - §2 used to assert gesture ISOLATION — that a drag moved one axis and left
 *     the other alone. Isolation is now the bug. It asserts simultaneity.
 *   - §9 used to assert grab-the-point: the ground under the cursor stays under
 *     the cursor. There is no raycast solve any more, so it is GONE rather than
 *     weakened. Nothing here should be read as a claim that it still holds.
 *   - §12/§13 used to assert a per-pointer-type gain split, because a finger
 *     runs out of glass sooner than a mouse. The ported model shipped one gain
 *     for both; a split came back on 2026-09-24 for the TURN only, for a
 *     different reason (a phone pixel yaws ~4x harder), and §11 asserts it.
 *
 * §6 is the other one to read carefully. The old smoothing could not overshoot;
 * this spring is DELIBERATELY under-damped on rotation and travel, so the camera
 * passes a stopped target and comes back. The assertion bounds the excursion
 * instead of forbidding it — a harness that demanded monotone convergence would
 * be demanding the feel be reverted.
 */
import * as THREE from 'three';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import type { BoundsRect } from '../src/experiences/murcia/config/environmentConfig';
import { CameraRig } from '../src/experiences/murcia/camera/CameraRig';
import { createCameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import type { CameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import { expandRect } from '../src/experiences/murcia/navigation/navigationBounds';
import { createDefaultCameraTuning } from '../src/experiences/murcia/camera/cameraTuning';

const env = murciaConfig;
const nav = env.navigation;
const WIDTH = 1920;
const HEIGHT = 1080;
const ASPECT = WIDTH / HEIGHT;
const CENTRE_X = WIDTH / 2;
const CENTRE_Y = HEIGHT / 2;

const plate: BoundsRect = { ...env.contentBounds };
const bounds = expandRect(plate, -nav.boundsInset);

import { check, close, finish, section } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import { makeRig } from './lib/rig';

interface Harness {
  rig: CameraRig;
  camera: THREE.PerspectiveCamera;
  input: CameraInput;
  fire: (type: string, event: Record<string, unknown>) => void;
  /** Steps the springs, which is the only thing that moves the camera. */
  step: (seconds: number, frames?: number) => void;
}

function makeHarness(focusAt = env.initialFocus, limits: BoundsRect = bounds): Harness {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  const { camera, rig } = makeRig(env, ASPECT, focusAt);
  rig.setBounds(limits);

  const harness: Harness = {
    rig,
    camera,
    input: null as unknown as CameraInput,
    fire: stub.fire,
    step: (seconds, frames = Math.max(1, Math.round(seconds * 60))) => {
      for (let i = 0; i < frames; i += 1) rig.update(seconds / frames);
    },
  };

  harness.input = createCameraInput({
    element: stub.element,
    rig,
    width: WIDTH,
    height: HEIGHT,
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

const down = (x: number, y: number, pointerId = 1, pointerType = 'mouse') => ({
  pointerId,
  pointerType,
  button: 0,
  buttons: 1,
  clientX: x,
  clientY: y,
  timeStamp: 0,
});

const move = (x: number, y: number, pointerId = 1, pointerType = 'mouse', timeStamp = 16) => ({
  pointerId,
  pointerType,
  button: -1,
  buttons: 1,
  clientX: x,
  clientY: y,
  timeStamp,
});

/** A straight drag from the centre, delivered in `steps` separate moves. */
function drag(h: Harness, dx: number, dy: number, steps = 8, pointerType = 'mouse'): void {
  h.fire('pointerdown', down(CENTRE_X, CENTRE_Y, 1, pointerType));
  for (let i = 1; i <= steps; i += 1) {
    h.fire(
      'pointermove',
      move(CENTRE_X + (dx * i) / steps, CENTRE_Y + (dy * i) / steps, 1, pointerType, i * 16),
    );
  }
}

function release(h: Harness, dx: number, dy: number, pointerType = 'mouse'): void {
  h.fire('pointerup', {
    ...move(CENTRE_X + dx, CENTRE_Y + dy, 1, pointerType, 200),
    buttons: 0,
  });
}

/** Settles the springs. Long enough that the under-damped return has finished. */
const SETTLE_SECONDS = 6;

// ─────────────────────────────────────────────────────────────────────────────
section('1. One pointer carries both axes, and never classifies');

{
  // The founding property of the ported model, and the one the old harness
  // asserted the exact opposite of. A pure-X drag must yaw and NOT travel; a
  // pure-Y drag must travel and NOT yaw; a diagonal must do both.
  const x = makeHarness();
  drag(x, 300, 0);
  x.step(SETTLE_SECONDS);
  const xs = x.rig.snapshot();

  check(
    'a horizontal drag turns the rig',
    Math.abs(xs.targetYaw) > 1,
    `yaw target ${xs.targetYaw.toFixed(2)} deg`,
  );
  check(
    'and moves the target nowhere',
    close(xs.targetX, env.initialFocus.x, 1e-9) && close(xs.targetZ, env.initialFocus.z, 1e-9),
    `target (${xs.targetX.toFixed(4)}, ${xs.targetZ.toFixed(4)})`,
  );

  const y = makeHarness();
  drag(y, 0, 300);
  y.step(SETTLE_SECONDS);
  const ys = y.rig.snapshot();

  check(
    'a vertical drag moves the target',
    Math.hypot(ys.targetX - env.initialFocus.x, ys.targetZ - env.initialFocus.z) > 1,
    `moved ${Math.hypot(ys.targetX - env.initialFocus.x, ys.targetZ - env.initialFocus.z).toFixed(2)} units`,
  );
  check(
    'and leaves the yaw alone',
    close(ys.targetYaw, 0, 1e-9),
    `yaw target ${ys.targetYaw.toFixed(6)} deg`,
  );

  // The part that would survive an `if (|dx| > |dy|)` branch being reintroduced
  // is "both changed". What would NOT survive is the path being curved: yaw is
  // applied first and the heading is re-derived from it inside the same call, so
  // a diagonal traces an arc rather than a straight line at an angle.
  const oneShot = makeHarness();
  drag(oneShot, 240, 240, 1);
  const oneShotState = oneShot.rig.snapshot();

  const stepped = makeHarness();
  drag(stepped, 240, 240, 24);
  const steppedState = stepped.rig.snapshot();

  check(
    'a diagonal drag changes both axes at once',
    Math.abs(steppedState.targetYaw) > 1 &&
      Math.hypot(
        steppedState.targetX - env.initialFocus.x,
        steppedState.targetZ - env.initialFocus.z,
      ) > 1,
    `yaw ${steppedState.targetYaw.toFixed(2)} deg, moved ${Math.hypot(steppedState.targetX - env.initialFocus.x, steppedState.targetZ - env.initialFocus.z).toFixed(2)} units`,
  );

  check(
    'the same diagonal in many steps curves away from the same diagonal in one',
    Math.hypot(
      steppedState.targetX - oneShotState.targetX,
      steppedState.targetZ - oneShotState.targetZ,
    ) > 1,
    `endpoints differ by ${Math.hypot(steppedState.targetX - oneShotState.targetX, steppedState.targetZ - oneShotState.targetZ).toFixed(2)} units — ` +
      'the heading is re-derived per event, so the path is an arc',
  );
  check(
    'and the total yaw does not depend on how the drag was sampled',
    close(steppedState.targetYaw, oneShotState.targetYaw, 1e-9),
    `${steppedState.targetYaw.toFixed(6)} vs ${oneShotState.targetYaw.toFixed(6)} deg — yaw is a plain sum`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('2. The signs, which were reported wrong once already');

{
  // DIRECT MANIPULATION: the world follows the finger. The rejected reading —
  // the camera moves the way the finger moves — is self-consistent and shipped
  // once in the sandbox, where it was called backwards on first use.
  const forward = makeHarness();
  const before = forward.rig.getForward().clone();
  drag(forward, 0, 200);
  forward.step(SETTLE_SECONDS);
  const after = forward.rig.snapshot();
  const advanced =
    (after.targetX - env.initialFocus.x) * before.x + (after.targetZ - env.initialFocus.z) * before.z;

  check(
    'dragging DOWN advances along the heading',
    advanced > 0,
    `moved ${advanced.toFixed(2)} units along forward — the ground comes toward the viewer`,
  );

  const back = makeHarness();
  const backForward = back.rig.getForward().clone();
  drag(back, 0, -200);
  back.step(SETTLE_SECONDS);
  const backState = back.rig.snapshot();
  const retreated =
    (backState.targetX - env.initialFocus.x) * backForward.x +
    (backState.targetZ - env.initialFocus.z) * backForward.z;
  check(
    'and dragging UP retreats',
    retreated < 0,
    `moved ${retreated.toFixed(2)} units along forward`,
  );

  const right = makeHarness();
  drag(right, 200, 0);
  const rightState = right.rig.snapshot();
  check(
    'dragging RIGHT yaws the rig positively, so the world slides right',
    rightState.targetYaw > 0,
    `yaw target ${rightState.targetYaw.toFixed(2)} deg`,
  );

  // THE HONEST CAVEAT, asserted so nobody re-derives it as a bug. The yaw is an
  // ORBIT about the target, so which way a point appears to sweep depends on
  // whether it is nearer or further than the target. Only at the target itself
  // is it stationary — "the point under the cursor stays under the cursor" is
  // true there and nowhere else, and expecting it in the foreground will read as
  // a defect that is not one.
  const orbit = makeHarness();
  orbit.step(0.5);
  const pivot = new THREE.Vector3(orbit.rig.focus.x, nav.groundPlaneHeight, orbit.rig.focus.z);
  const fwd = orbit.rig.getForward().clone();
  const beyond = pivot.clone().addScaledVector(fwd, 300);
  const nearer = pivot.clone().addScaledVector(fwd, -120);

  const screenX = (p: THREE.Vector3): number => {
    orbit.camera.updateMatrixWorld(true);
    return p.clone().project(orbit.camera).x;
  };
  const pivotBefore = screenX(pivot);
  const beyondBefore = screenX(beyond);
  const nearerBefore = screenX(nearer);

  drag(orbit, 120, 0);
  orbit.step(SETTLE_SECONDS);

  const pivotShift = screenX(pivot) - pivotBefore;
  const beyondShift = screenX(beyond) - beyondBefore;
  const nearerShift = screenX(nearer) - nearerBefore;

  check(
    'the pivot itself barely moves on screen — it is the centre of rotation',
    Math.abs(pivotShift) < 0.02,
    `pivot moved ${pivotShift.toFixed(4)} NDC`,
  );
  check(
    'a point BEYOND the target follows the finger, a point NEARER sweeps the other way',
    beyondShift * nearerShift < 0,
    `beyond ${beyondShift.toFixed(4)}, nearer ${nearerShift.toFixed(4)} NDC — opposite signs, by construction`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('3. The spring lands rather than stopping');

{
  // Under-damped on travel by design (`dampingRatio` below 1). The camera passes
  // a stopped target once and returns. Bounded, not forbidden.
  const h = makeHarness();
  drag(h, 0, 260);
  release(h, 0, 260);

  const target = h.rig.snapshot();
  let peakBeyond = 0;
  let settled = 0;
  for (let i = 0; i < 600; i += 1) {
    h.rig.update(1 / 60);
    const s = h.rig.snapshot();
    const along =
      (s.x - target.targetX) * (target.targetX - env.initialFocus.x) +
      (s.z - target.targetZ) * (target.targetZ - env.initialFocus.z);
    if (along > 0) {
      peakBeyond = Math.max(peakBeyond, Math.hypot(s.x - target.targetX, s.z - target.targetZ));
    }
    settled = Math.hypot(s.x - target.targetX, s.z - target.targetZ);
  }

  check(
    'the travel spring overshoots — that is the landing, not a bug',
    peakBeyond > 0.05,
    `peaked ${peakBeyond.toFixed(3)} units past the target`,
  );
  check(
    'but by a bounded amount a viewer reads as weight, not as a wobble',
    peakBeyond < 4,
    `${peakBeyond.toFixed(3)} units — the sandbox measured ~1.4 at travelDamping 7`,
  );
  check(
    'and it settles',
    settled < 1e-3,
    `${settled.toExponential(2)} units from target after 10 s`,
  );

  // The zoom is the exception, and it is hard-wired: an overshooting zoom would
  // dip BELOW minRadius, because the clamp is on the target and a spring that
  // lands is a spring that passes its target.
  const z = makeHarness();
  const floor = env.camera.distance * env.zoomNearScale;
  z.rig.setTargetZoom(Math.log(floor));
  let minRadius = Infinity;
  for (let i = 0; i < 600; i += 1) {
    z.rig.update(1 / 60);
    minRadius = Math.min(minRadius, z.rig.snapshot().radius);
  }
  check(
    'the zoom never dips below its floor, because it is critically damped',
    minRadius >= floor - 1e-6,
    `closest ${minRadius.toFixed(4)} against a floor of ${floor.toFixed(4)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('4. Frame-rate independence, exactly rather than approximately');

{
  // The closed-form step matrix is the exact solution over dt, so 60Hz and
  // 240Hz agree to float noise. The lag this replaced was only approximately
  // frame-rate independent; a tolerance loose enough for it would not notice
  // someone reintroducing an integrated spring here.
  const slow = makeHarness();
  drag(slow, 180, 180);
  release(slow, 180, 180);
  for (let i = 0; i < 120; i += 1) slow.rig.update(1 / 60);

  const fast = makeHarness();
  drag(fast, 180, 180);
  release(fast, 180, 180);
  for (let i = 0; i < 480; i += 1) fast.rig.update(1 / 240);

  const a = slow.rig.snapshot();
  const b = fast.rig.snapshot();
  const gap = Math.hypot(a.x - b.x, a.z - b.z);
  check(
    '60Hz and 240Hz land in the same place',
    gap < 1e-9,
    `${gap.toExponential(2)} units apart after 2 s`,
  );
  check(
    'and at the same yaw',
    close(a.yaw, b.yaw, 1e-9),
    `${a.yaw.toFixed(9)} vs ${b.yaw.toFixed(9)} deg`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('5. Travel follows the rig it has turned');

{
  // Forward is re-derived from the CURRENT yaw, so a drag after a turn goes
  // where the camera is now looking rather than where it was looking when the
  // gesture began.
  const h = makeHarness();
  drag(h, 500, 0);
  h.step(SETTLE_SECONDS);
  const turned = h.rig.getForward().clone();

  const from = { x: h.rig.snapshot().targetX, z: h.rig.snapshot().targetZ };
  drag(h, 0, 200);
  h.step(SETTLE_SECONDS);
  const after = h.rig.snapshot();

  const moved = new THREE.Vector3(after.targetX - from.x, 0, after.targetZ - from.z);
  const alongTurned = moved.x * turned.x + moved.z * turned.z;
  check(
    'travel after a turn runs along the TURNED heading',
    moved.length() > 1 && close(alongTurned, moved.length(), 1e-3),
    `|moved| ${moved.length().toFixed(3)}, component along the turned forward ${alongTurned.toFixed(3)}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('6. The target stays inside the navigable rectangle');

{
  // The clamp is on the TARGET, and it is the only thing bounding where the
  // viewer can go now that §39's camera-station rectangle and §40's resistance
  // band are retired. The rectangle is GROWN past the authored plate rather than
  // inset into it, so the plate's own edges can be brought to the middle of the
  // frame.
  const h = makeHarness();
  for (let i = 0; i < 40; i += 1) {
    drag(h, 0, 400, 4);
    release(h, 0, 400);
    h.step(1);
  }
  const s = h.rig.snapshot();
  check(
    'a sustained push cannot leave the rectangle',
    s.targetX >= bounds.minX - 1e-6 &&
      s.targetX <= bounds.maxX + 1e-6 &&
      s.targetZ >= bounds.minZ - 1e-6 &&
      s.targetZ <= bounds.maxZ + 1e-6,
    `target (${s.targetX.toFixed(1)}, ${s.targetZ.toFixed(1)}) in X[${bounds.minX.toFixed(1)}, ${bounds.maxX.toFixed(1)}] Z[${bounds.minZ.toFixed(1)}, ${bounds.maxZ.toFixed(1)}]`,
  );
  check(
    'and it really did reach an edge, so the clamp was exercised',
    close(s.targetX, bounds.minX, 1) ||
      close(s.targetX, bounds.maxX, 1) ||
      close(s.targetZ, bounds.minZ, 1) ||
      close(s.targetZ, bounds.maxZ, 1),
    `target (${s.targetX.toFixed(1)}, ${s.targetZ.toFixed(1)})`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('7. Two contacts are a pinch, and the pinch is not ours');

{
  // The app layer owns the pinch (`app/navigation/createNavigationInput`), and
  // it dispatches a `pointercancel` per contact when the pair arms. This module
  // must simply stop dragging — there is nothing to arbitrate, which is the
  // whole of the two-finger simplification.
  const h = makeHarness();
  h.fire('pointerdown', down(CENTRE_X, CENTRE_Y, 1, 'touch'));
  h.fire('pointermove', move(CENTRE_X + 60, CENTRE_Y + 60, 1, 'touch'));
  const afterOne = h.rig.snapshot();
  check('one finger drags', Math.abs(afterOne.targetYaw) > 0, `yaw ${afterOne.targetYaw.toFixed(3)} deg`);
  check('and reports itself as dragging', h.input.isDragging, 'isDragging true');

  h.fire('pointerdown', down(CENTRE_X + 200, CENTRE_Y, 2, 'touch'));
  check('a second contact ends the drag', !h.input.isDragging, 'isDragging false');

  const parked = h.rig.snapshot();
  h.fire('pointermove', move(CENTRE_X + 400, CENTRE_Y + 400, 1, 'touch', 120));
  h.fire('pointermove', move(CENTRE_X - 400, CENTRE_Y - 400, 2, 'touch', 130));
  const afterTwo = h.rig.snapshot();
  check(
    'and neither finger moves the camera afterwards',
    close(afterTwo.targetX, parked.targetX, 1e-9) &&
      close(afterTwo.targetZ, parked.targetZ, 1e-9) &&
      close(afterTwo.targetYaw, parked.targetYaw, 1e-9),
    'the pair belongs to the app layer',
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('8. The lean is an ornament, not a navigation');

{
  // Added at pose time and never entering the targets, so the bounds clamp, a
  // handover and a snapshot all stay clean. Gated on stillness, because a lean
  // that arrived while the viewer was working would be a camera moving under
  // their hands.
  const h = makeHarness();
  h.step(0.5);
  const beforeTargets = h.rig.snapshot();
  const beforePosition = h.camera.position.clone();

  h.fire('pointermove', move(WIDTH - 40, 60, 99, 'mouse', 500));
  h.step(0.5);
  const duringIdleGap = h.rig.snapshot();

  check(
    'a hover before the idle delay moves nothing at all',
    close(duringIdleGap.cursorYawOffsetDegrees, 0, 1e-6),
    `lean ${duringIdleGap.cursorYawOffsetDegrees.toFixed(6)} deg after 0.5 s of stillness`,
  );

  // Past the delay the lean eases in.
  h.step(4);
  const leaning = h.rig.snapshot();
  check(
    'past the idle delay it leans toward the cursor',
    Math.abs(leaning.cursorYawOffsetDegrees) > 0.5,
    `lean ${leaning.cursorYawOffsetDegrees.toFixed(3)} deg`,
  );
  check(
    'and the camera actually moved for it',
    h.camera.position.distanceTo(beforePosition) > 1e-3,
    `camera moved ${h.camera.position.distanceTo(beforePosition).toFixed(4)} units`,
  );
  check(
    'while the navigation targets are untouched',
    close(leaning.targetX, beforeTargets.targetX, 1e-9) &&
      close(leaning.targetZ, beforeTargets.targetZ, 1e-9) &&
      close(leaning.targetYaw, beforeTargets.targetYaw, 1e-9),
    'the lean never enters the targets',
  );

  // Two separate mechanisms, and conflating them is easy enough that it is worth
  // two assertions.
  //
  // A pointer going DOWN is not hovering, so the hover target becomes (0, 0) and
  // the lean eases home. That alone does not restart the idle clock — nothing has
  // been navigated yet, and a press that turns out to be a tap should leave the
  // viewer where they were in the lean's own timeline.
  h.fire('pointerdown', down(CENTRE_X, CENTRE_Y, 1));
  h.step(1);
  const pressed = h.rig.snapshot();
  check(
    'a press sends the lean home, because a pointer that is down is not hovering',
    Math.abs(pressed.cursorYawOffsetDegrees) < Math.abs(leaning.cursorYawOffsetDegrees) * 0.2,
    `lean ${pressed.cursorYawOffsetDegrees.toFixed(3)} deg, from ${leaning.cursorYawOffsetDegrees.toFixed(3)}`,
  );

  // Actually navigating is what restarts the clock, so the lean has to earn its
  // way back over the full delay rather than returning the instant a drag stops.
  h.fire('pointermove', move(CENTRE_X + 80, CENTRE_Y + 40, 1, 'mouse', 600));
  const dragged = h.rig.snapshot();
  check(
    'and a drag restarts the idle clock, so the lean waits again',
    dragged.secondsSinceNavigation < 1e-6,
    `${dragged.secondsSinceNavigation.toExponential(2)} s since navigating`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('9. The ground under the pointer, for scale rather than for grabbing');

{
  // NOT grab-the-point. That solve is gone with the map model, and this does not
  // reinstate it. What is still worth pinning is that the drag gain produces a
  // motion on the order of the visible ground rather than orders out — a gain
  // typo is otherwise invisible until someone opens the page.
  const h = makeHarness();
  h.step(0.5);
  const top = groundAt(h.camera, CENTRE_X, CENTRE_Y - 300);
  const bottom = groundAt(h.camera, CENTRE_X, CENTRE_Y + 300);
  const visibleDepth = top.distanceTo(bottom);

  const before = { x: h.rig.snapshot().targetX, z: h.rig.snapshot().targetZ };
  drag(h, 0, 600);
  const after = h.rig.snapshot();
  const travelled = Math.hypot(after.targetX - before.x, after.targetZ - before.z);

  check(
    'a 600px drag moves the target on the order of the ground it crosses',
    travelled > visibleDepth * 0.15 && travelled < visibleDepth * 3,
    `travelled ${travelled.toFixed(1)} units against ${visibleDepth.toFixed(1)} units of visible depth`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('10. Travel scales with distance, so a drag means one thing');

{
  // Without this a drag that crosses the frame when zoomed in barely moves when
  // zoomed out, and the gesture stops meaning anything consistent.
  const near = makeHarness();
  near.rig.setTargetZoom(Math.log(env.camera.distance * env.zoomNearScale), true);
  const nearBefore = near.rig.snapshot();
  drag(near, 0, 300);
  const nearMoved = Math.hypot(
    near.rig.snapshot().targetX - nearBefore.targetX,
    near.rig.snapshot().targetZ - nearBefore.targetZ,
  );

  const far = makeHarness();
  far.rig.setTargetZoom(Math.log(env.zoomFarDistance), true);
  const farBefore = far.rig.snapshot();
  drag(far, 0, 300);
  const farMoved = Math.hypot(
    far.rig.snapshot().targetX - farBefore.targetX,
    far.rig.snapshot().targetZ - farBefore.targetZ,
  );

  check(
    'the same drag covers more ground when the camera is further back',
    farMoved > nearMoved * 1.5,
    `${farMoved.toFixed(1)} units zoomed out against ${nearMoved.toFixed(1)} zoomed in`,
  );
}

// ─────────────────────────────────────────────────────────────────────────────
section('11. A finger turns by its own gain, and only the turn differs');

{
  // Yaw is normalised by viewport WIDTH, which makes a portrait phone pixel
  // turn ~4x harder than a desktop one while travel barely changes, so a thumb's
  // sideways drift bent every stroke (DECISIONS §44, amended 2026-09-24). The
  // mouse blocks above are the desktop and must not have moved.
  const shipped = createDefaultCameraTuning(
    env,
    env.camera.distance,
    env.camera.elevationDegrees,
    env.navigation.bounds,
  );

  const mouse = makeHarness();
  drag(mouse, 300, 300, 8, 'mouse');
  const ms = mouse.rig.snapshot();

  const touch = makeHarness();
  drag(touch, 300, 300, 8, 'touch');
  const ts = touch.rig.snapshot();

  check(
    'a touch drag yaws by touchRotationGain',
    close(ts.targetYaw, (300 / WIDTH) * shipped.touchRotationGain, 1e-9),
    `${ts.targetYaw.toFixed(4)} deg for 300px at ${shipped.touchRotationGain} deg/width`,
  );
  check(
    'a mouse drag still yaws by rotationGain',
    close(ms.targetYaw, (300 / WIDTH) * shipped.rotationGain, 1e-9),
    `${ms.targetYaw.toFixed(4)} deg for 300px at ${shipped.rotationGain} deg/width`,
  );
  check(
    'the two gains are distinct, with the same sign',
    shipped.touchRotationGain !== shipped.rotationGain &&
      Math.sign(ts.targetYaw) === Math.sign(ms.targetYaw),
    `touch ${shipped.touchRotationGain} against mouse ${shipped.rotationGain}`,
  );

  const mouseTravel = makeHarness();
  drag(mouseTravel, 0, 300, 8, 'mouse');
  const touchTravel = makeHarness();
  drag(touchTravel, 0, 300, 8, 'touch');
  const mt = mouseTravel.rig.snapshot();
  const tt = touchTravel.rig.snapshot();
  check(
    'and a straight vertical stroke travels the same for both',
    close(mt.targetX, tt.targetX, 1e-9) && close(mt.targetZ, tt.targetZ, 1e-9),
    `mouse (${mt.targetX.toFixed(3)}, ${mt.targetZ.toFixed(3)}) touch (${tt.targetX.toFixed(3)}, ${tt.targetZ.toFixed(3)})`,
  );
}

finish();
