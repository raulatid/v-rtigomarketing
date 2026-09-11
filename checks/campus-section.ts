/**
 * Behavioural harness for the services campus's camera.  `npm run check:campus`
 *
 * Replaces `district-flight.ts`, whose subject — the display district's
 * `CameraFlight` — went with the district (plan 024). Drives the REAL
 * `CameraRig`, `createCameraInput`, the lab's `campusCamera` and the site's
 * `campusCameraAdapter`, in the frame order `MurciaExperience.update` uses.
 * Per PROJECT_MEMORY, "How this repo verifies things": a harness exercises the
 * real path, never a convenient stand-in.
 *
 * The expensive things to get wrong here are not arithmetic. They are:
 *   - two systems writing the camera in one frame;
 *   - the city snapping when the campus hands the camera back;
 *   - a flight that looks different at a different frame rate;
 *   - a hand-back that releases a rig somebody else holds.
 * Each has a section below. What the campus DRAWS is not here — it needs a
 * GPU, and is judged by looking.
 */
import * as THREE from 'three';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';
import { createCameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import { createCampusCamera } from '../src/experiences/murcia/campus/section/campusCamera';
import type { CampusCameraTuning } from '../src/experiences/murcia/campus/section/campusCamera';
import { createCampusCameraAdapter } from '../src/experiences/murcia/campus/campusCameraAdapter';
import { banner, check, close, finish, section } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import { makeRig } from './lib/rig';

const env = murciaConfig;
const WIDTH = 1920;
const HEIGHT = 1080;
const ASPECT = WIDTH / HEIGHT;

// The campus as murcia-v6 places it: the lake's centre and a radius of the
// size the basin finder measures there. The numbers only have to be the right
// scale — every campus pose is derived from them, as it is at runtime.
const LAKE = { center: new THREE.Vector3(-150.2, 0.235, 413.4), radius: 20 };
const LIFT = LAKE.radius * 0.8;
const FOCUS = new THREE.Vector3(LAKE.center.x, LAKE.center.y + LIFT, LAKE.center.z);
/** The intro and five services. */
const STOPS = 6;
const FLIGHT = 1.4;

function tuning(): CampusCameraTuning {
  return { distance: LAKE.radius * 4.5, elevationDeg: 24, direction: 1 };
}

/** The city, its pan input, and a campus camera wired as `createServicesCampus` wires it. */
function makeCity() {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  const { camera, rig } = makeRig(env, ASPECT, env.initialFocus);
  rig.setBounds(env.navigation.bounds);
  const input = createCameraInput({ element: stub.element, rig, width: WIDTH, height: HEIGHT });

  const returns: Array<{ controlled: boolean; position: THREE.Vector3 }> = [];
  let onReturn: (() => void) | null = null;
  const adapter = createCampusCameraAdapter(rig, {
    onReturn: () => {
      returns.push({ controlled: rig.isExternallyControlled, position: camera.position.clone() });
      onReturn?.();
    },
  });
  const campus = createCampusCamera({
    camera,
    lookTarget: adapter.lookTarget,
    onControl: adapter.onCameraControl,
    focus: FOCUS,
    stops: STOPS,
    tuning: tuning(),
  });

  /** One frame, in `MurciaExperience.update`'s order: the campus, then the owner switch. */
  const externalFrames = { total: 0 };
  const frame = (dt: number): void => {
    campus.update(dt);
    if (rig.isExternallyControlled) externalFrames.total += 1;
    else rig.update(dt);
    camera.updateMatrixWorld(true);
  };
  const run = (seconds: number, dt = 1 / 60): void => {
    const frames = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < frames; i += 1) frame(dt);
  };
  const enter = (): void => {
    adapter.seed();
    campus.enter(FLIGHT);
  };
  const setOnReturn = (fn: () => void): void => {
    onReturn = fn;
  };
  return { stub, camera, rig, input, adapter, campus, frame, run, enter, returns, externalFrames, setOnReturn };
}

const forward = (camera: THREE.Camera): THREE.Vector3 =>
  new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

banner('campus section — the camera hand-over');

// --- 1. One writer per frame --------------------------------------------------

section('1. From the first flight to the exit landing, the campus is the only writer');
{
  const c = makeCity();
  c.run(3); // let the rig settle at rest first
  c.enter();
  let heldEveryFrame = true;
  const hold = (seconds: number) => {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i += 1) {
      c.frame(1 / 60);
      if (!c.rig.isExternallyControlled) heldEveryFrame = false;
    }
  };
  hold(FLIGHT + 0.2);
  c.campus.flyTo(1, FLIGHT);
  hold(FLIGHT + 0.2);
  c.campus.dollyTo(0.8, FLIGHT);
  hold(FLIGHT + 0.2);
  c.campus.flyTo(2, FLIGHT);
  hold(FLIGHT + 0.2);
  check(
    'the rig is externally controlled on every frame of the visit',
    heldEveryFrame && c.adapter.holding,
    `${c.externalFrames.total} frames held`,
  );
  c.campus.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  check(
    'and handed back exactly once, when the exit lands',
    !c.rig.isExternallyControlled && !c.adapter.holding && c.returns.length === 1,
    `${c.returns.length} hand-back(s)`,
  );
  check(
    'the rig was already free when the hand-back hook ran',
    c.returns[0]?.controlled === false,
    'a deferred pose applied there moves a camera the rig owns',
  );
}

// --- 2. The pan is deaf while the campus flies ------------------------------------

section('2. A drag during the visit moves nothing');
{
  const c = makeCity();
  c.run(3);
  c.enter();
  c.run(FLIGHT + 0.2);
  const before = c.camera.position.clone();
  c.stub.fire('pointerdown', { pointerId: 7, button: 0, clientX: 900, clientY: 500, timeStamp: 0 });
  c.stub.fire('pointermove', { pointerId: 7, button: 0, clientX: 500, clientY: 520, timeStamp: 16 });
  c.stub.fire('pointerup', { pointerId: 7, button: 0, clientX: 500, clientY: 520, timeStamp: 32 });
  c.run(1);
  check(
    'createCameraInput refuses the press while the rig is held',
    !c.input.isDragging && c.camera.position.distanceTo(before) < 1e-6,
    `camera moved ${c.camera.position.distanceTo(before).toExponential(1)} units`,
  );
}

// --- 3. No snap on the way out ------------------------------------------------

section('3. The city resumes exactly where the visitor left it');
{
  const c = makeCity();
  c.run(3);
  // A visitor who has walked and turned before clicking.
  c.rig.setFocus(-190, 380);
  c.rig.setYaw(40);
  c.run(3);
  const position = c.camera.position.clone();
  const look = forward(c.camera);
  const focus = c.rig.focus.clone();
  const azimuth = c.rig.getAzimuthDegrees();

  c.enter();
  c.frame(1e-4);
  check(
    'the fly-in starts looking where the visitor was looking',
    forward(c.camera).angleTo(look) < 1e-3,
    `${forward(c.camera).angleTo(look).toExponential(1)} rad on the first frame`,
  );
  c.run(FLIGHT + 0.2);
  c.campus.flyTo(1, FLIGHT);
  c.run(FLIGHT + 0.2);
  c.campus.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  const landed = c.camera.position.distanceTo(position);
  // The springs have run since the hand-back; a stale spring would have moved it.
  c.run(2);
  const drifted = c.camera.position.distanceTo(position);
  check('the exit lands on the pose entered from', landed < 1e-3, `${landed.toExponential(1)} units`);
  check('and the springs leave it there', drifted < 1e-3, `${drifted.toExponential(1)} units after 2 s`);
  // The heading is compared round the circle: `adoptFromCamera` solves yaw
  // back out with atan2, so an accumulated 307 comes back as -53 — the same
  // direction, and the camera above proves the pose is the same.
  const turn = ((((c.rig.getAzimuthDegrees() - azimuth) % 360) + 540) % 360) - 180;
  check(
    'the rig adopted the same focus and heading',
    c.rig.focus.distanceTo(focus) < 1e-3 && close(turn, 0, 1e-3),
    `focus off by ${c.rig.focus.distanceTo(focus).toExponential(1)}, heading off by ${turn.toExponential(1)} deg`,
  );
}

// --- 4. Frame-rate independence --------------------------------------------------

section('4. A flight lands in the same place at 30, 60 and 120 fps');
{
  const landings = [1 / 30, 1 / 60, 1 / 120].map((dt) => {
    const c = makeCity();
    c.run(3);
    c.enter();
    c.run(FLIGHT + 0.1, dt);
    c.campus.flyTo(3, FLIGHT);
    c.run(FLIGHT + 0.1, dt);
    return c.camera.position.clone();
  });
  const spread = Math.max(landings[0]!.distanceTo(landings[1]!), landings[1]!.distanceTo(landings[2]!));
  check('the landing does not depend on the frame rate', spread < 1e-6, `${spread.toExponential(1)} units apart`);
}

// --- 5. The ring ------------------------------------------------------------------

section('5. The stops divide the ring evenly and the ring closes');
{
  const c = makeCity();
  c.run(3);
  c.enter();
  c.run(FLIGHT + 0.2);
  const step = c.campus.azimuthOf(1) - c.campus.azimuthOf(0);
  check(
    `one step is a sixth of a turn (${STOPS} stops)`,
    close(step, (Math.PI * 2) / STOPS, 1e-9),
    `${THREE.MathUtils.radToDeg(step).toFixed(3)} deg`,
  );
  const atStop = (stop: number): THREE.Vector3 => {
    c.campus.flyTo(stop, FLIGHT);
    c.run(FLIGHT + 0.2);
    return c.camera.position.clone();
  };
  const first = atStop(0);
  const lap = atStop(STOPS);
  check('a lap on, the camera is back where it started', first.distanceTo(lap) < 1e-6, `${first.distanceTo(lap).toExponential(1)} units`);
  const distance = c.camera.position.distanceTo(FOCUS);
  check(
    'every stop stands at the tuned distance from the focus',
    close(distance, tuning().distance, 1e-6),
    `${distance.toFixed(3)} of ${tuning().distance.toFixed(3)}`,
  );
}

// --- 6. What the hand-back must never do --------------------------------------------

section('6. The adapter never gives back a camera it did not take');
{
  const c = makeCity();
  c.run(3);
  // Earth is showing: MurciaExperience.setActive(false) holds the rig.
  c.rig.setExternallyControlled(true);
  check('it cannot take a rig somebody else holds', !c.adapter.canTake, 'entry is refused upstream');
  // The campus camera reports `true` on dispose whether or not it ever flew.
  c.campus.dispose();
  check(
    'a dispose while Earth holds the rig leaves it held',
    c.rig.isExternallyControlled && c.returns.length === 0,
    c.rig.isExternallyControlled ? 'still held' : 'RELEASED',
  );
}

section('7. A resize during the visit waits for the hand-back');
{
  // The hazard, measured. `setPose` places the camera from the rig's own state,
  // which is where the visitor was before the campus took over — so even the
  // same pose, re-applied by a resize, would yank the parked camera out of the
  // campus. This is why MurciaExperience.setViewport keeps it instead.
  const bare = makeCity();
  bare.run(3);
  bare.enter();
  bare.run(FLIGHT + 0.2);
  const parked = bare.camera.position.clone();
  bare.rig.setPose(resolveCameraPose(env, ASPECT));
  const yank = bare.camera.position.distanceTo(parked);
  check('an undeferred setPose would move the camera the campus holds', yank > 1, `${yank.toFixed(1)} units`);

  const c = makeCity();
  c.run(3);
  const entered = c.camera.position.clone();
  let deferred: ReturnType<typeof resolveCameraPose> | null = null;
  let appliedWhileFree = false;
  c.setOnReturn(() => {
    if (!deferred) return;
    appliedWhileFree = !c.rig.isExternallyControlled;
    c.rig.setPose(deferred);
    deferred = null;
  });
  c.enter();
  c.run(FLIGHT + 0.2);
  deferred = resolveCameraPose(env, ASPECT);
  const held = c.camera.position.clone();
  c.run(0.5);
  check('kept, it leaves the parked camera where it is', c.camera.position.distanceTo(held) < 1e-9, 'deferred');
  c.campus.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  c.run(1);
  const snap = c.camera.position.distanceTo(entered);
  check(
    'applied after the hand-back, it lands without a snap',
    deferred === null && appliedWhileFree && snap < 1e-3,
    `${snap.toExponential(1)} units from the pose entered from`,
  );
}

finish();
