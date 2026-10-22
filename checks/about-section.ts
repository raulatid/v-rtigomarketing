/**
 * Behavioural harness for Conócenos' camera.  `npm run check:about`
 *
 * `campus-section.ts` for the tower's section: drives the REAL `CameraRig`,
 * `createCameraInput`, `aboutCamera`, `aboutCameraAdapter` and the stops
 * `aboutPoses` solves, in the frame order `MurciaExperience.update` uses. Per
 * PROJECT_MEMORY, "How this repo verifies things": a harness exercises the
 * real path, never a convenient stand-in.
 *
 * The expensive things to get wrong are the campus's:
 *   - two systems writing the camera in one frame;
 *   - the city snapping when the section hands the camera back;
 *   - a flight that looks different at a different frame rate;
 *   - a hand-back that releases a rig somebody else holds;
 * and one of its own: the warp leaving from the sky stop, which must rise and
 * look up, and whose cut must put the camera back where the visit started.
 * What the section DRAWS is not here — it needs a GPU, and is judged by
 * looking.
 */
import * as THREE from 'three';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';
import { createCameraInput } from '../src/experiences/murcia/navigation/createCameraInput';
import { createAboutCamera } from '../src/experiences/murcia/about/aboutCamera';
import { createAboutCameraAdapter } from '../src/experiences/murcia/about/aboutCameraAdapter';
import { solveAboutStops, type AboutGeometry } from '../src/experiences/murcia/about/aboutPoses';
import { banner, check, close, finish, section } from './lib/assert';
import { createStubElement } from './lib/stubDom';
import { makeRig } from './lib/rig';

const env = murciaConfig;
const WIDTH = 1920;
const HEIGHT = 1080;
const ASPECT = WIDTH / HEIGHT;
const FLIGHT = 1.4;

// The tower as murcia-v6 places it, measured in the prototypes of 2026-10-22
// (`towerTargets.ts` measures the same at runtime). The numbers only have to
// be the right scale: every stop is solved from them, as it is in the city.
const GEOMETRY: AboutGeometry = {
  screen: {
    centre: new THREE.Vector3(-294.25, 35.24, 311.57),
    normal: new THREE.Vector3(-0.697, 0, 0.716).normalize(),
    height: 47.3,
    width: 30,
  },
  logo: new THREE.Vector3(-291.31, 67.86, 308.13),
  // The rest pose's shape (`murciaConfig`): 440 away, 42° up, azimuth 275.
  rest: { position: new THREE.Vector3(-610.7, 294.4, 328.5), target: new THREE.Vector3(-285, 10, 300) },
};

/** The city, its pan input, and the section's camera wired as `createAboutSection` wires it. */
function makeCity() {
  const stub = createStubElement({ left: 0, top: 0, width: WIDTH, height: HEIGHT });
  const { camera, rig } = makeRig(env, ASPECT, env.initialFocus);
  rig.setBounds(env.navigation.bounds);
  const input = createCameraInput({ element: stub.element, rig, width: WIDTH, height: HEIGHT });

  const returns: Array<{ controlled: boolean; position: THREE.Vector3 }> = [];
  let onReturn: (() => void) | null = null;
  const adapter = createAboutCameraAdapter(rig, {
    onReturn: () => {
      returns.push({ controlled: rig.isOwned, position: camera.position.clone() });
      onReturn?.();
    },
  });
  const about = createAboutCamera({
    camera,
    poses: () => solveAboutStops(GEOMETRY, { fov: camera.fov, aspect: camera.aspect }, 'docked'),
    onControl: adapter.onCameraControl,
  });

  /** The warp's amount while it leaves from the section; null when there is no warp. */
  const warp = { amount: null as number | null };
  /** One frame, in `MurciaExperience.update`'s order: the section, then the ladder. */
  const externalFrames = { total: 0 };
  const frame = (dt: number): void => {
    about.update(dt);
    if (warp.amount !== null && adapter.holding) about.departure(warp.amount);
    if (rig.isOwned) externalFrames.total += 1;
    else rig.update(dt);
    camera.updateMatrixWorld(true);
  };
  const run = (seconds: number, dt = 1 / 60): void => {
    const frames = Math.max(1, Math.round(seconds / dt));
    for (let i = 0; i < frames; i += 1) frame(dt);
  };
  const setOnReturn = (fn: () => void): void => {
    onReturn = fn;
  };
  return { stub, camera, rig, input, adapter, about, frame, run, returns, externalFrames, setOnReturn, warp };
}

const forward = (camera: THREE.Camera): THREE.Vector3 =>
  new THREE.Vector3(0, 0, -1).applyQuaternion(camera.quaternion);

banner('about section — the camera hand-over');

// --- 1. One writer per frame --------------------------------------------------

section('1. From the first flight to the exit landing, the section is the only writer');
{
  const c = makeCity();
  c.run(3);
  c.about.enter(FLIGHT);
  let heldEveryFrame = true;
  const hold = (seconds: number) => {
    const frames = Math.round(seconds * 60);
    for (let i = 0; i < frames; i += 1) {
      c.frame(1 / 60);
      if (!c.rig.isOwned) heldEveryFrame = false;
    }
  };
  hold(FLIGHT + 0.2);
  c.about.flyTo(1, FLIGHT);
  hold(FLIGHT + 0.2);
  c.about.flyTo(2, FLIGHT);
  hold(FLIGHT + 0.2);
  check(
    'the rig is held on every frame of the visit',
    heldEveryFrame && c.adapter.holding,
    `${c.externalFrames.total} frames held`,
  );
  c.about.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  check(
    'and handed back exactly once, when the exit lands',
    !c.rig.isOwned && !c.adapter.holding && c.returns.length === 1,
    `${c.returns.length} hand-back(s)`,
  );
  check(
    'the rig was already free when the hand-back hook ran',
    c.returns[0]?.controlled === false,
    'a deferred pose applied there moves a camera the rig owns',
  );
}

// --- 2. The pan is deaf while the section flies --------------------------------

section('2. A drag during the visit moves nothing');
{
  const c = makeCity();
  c.run(3);
  c.about.enter(FLIGHT);
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

/** A visitor who has walked and turned before clicking, and where they stood. */
function walkedCity() {
  const c = makeCity();
  c.run(3);
  c.rig.setFocus(-250, 340);
  c.rig.setYaw(40);
  c.run(3);
  return {
    c,
    position: c.camera.position.clone(),
    look: forward(c.camera),
    focus: c.rig.focus.clone(),
    azimuth: c.rig.getAzimuthDegrees(),
  };
}

/** Degrees between two headings, round the circle: `adoptFromCamera` solves yaw with atan2. */
const turnBetween = (a: number, b: number): number => ((((a - b) % 360) + 540) % 360) - 180;

section('3. The city resumes exactly where the visitor left it');
{
  const { c, position, look, focus, azimuth } = walkedCity();
  c.about.enter(FLIGHT);
  c.frame(1e-4);
  check(
    'the fly-in starts looking where the visitor was looking',
    forward(c.camera).angleTo(look) < 1e-3,
    `${forward(c.camera).angleTo(look).toExponential(1)} rad on the first frame`,
  );
  c.run(FLIGHT + 0.2);
  c.about.flyTo(1, FLIGHT);
  c.run(FLIGHT + 0.2);
  c.about.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  const landed = c.camera.position.distanceTo(position);
  c.run(2);
  const drifted = c.camera.position.distanceTo(position);
  check('the exit lands on the pose entered from', landed < 1e-3, `${landed.toExponential(1)} units`);
  check('and the springs leave it there', drifted < 1e-3, `${drifted.toExponential(1)} units after 2 s`);
  const turn = turnBetween(c.rig.getAzimuthDegrees(), azimuth);
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
    c.about.enter(FLIGHT);
    c.run(FLIGHT + 0.1, dt);
    c.about.flyTo(2, FLIGHT);
    c.run(FLIGHT + 0.1, dt);
    return c.camera.position.clone();
  });
  const spread = Math.max(landings[0]!.distanceTo(landings[1]!), landings[1]!.distanceTo(landings[2]!));
  check('the landing does not depend on the frame rate', spread < 1e-6, `${spread.toExponential(1)} units apart`);
}

// --- 5. What the hand-back must never do --------------------------------------------

section('5. A hand-back gives back one name, not the camera');
{
  const c = makeCity();
  c.run(3);
  c.rig.claim('inactive');
  check('it cannot take a rig somebody else holds', !c.adapter.canTake, 'entry is refused upstream');
  c.about.dispose();
  check(
    'a dispose that never flew leaves the rig held',
    c.rig.isOwned && c.returns.length === 0,
    c.rig.isOwned ? 'still held' : 'RELEASED',
  );

  const d = makeCity();
  d.run(3);
  d.about.enter(FLIGHT);
  d.run(FLIGHT + 0.2);
  d.rig.claim('inactive');
  d.about.exit(FLIGHT);
  d.run(FLIGHT + 0.2);
  check(
    'the section let go, and the rig is STILL held by the other owner',
    !d.adapter.holding && d.rig.hasClaim('inactive') && d.returns.length === 1,
    d.rig.isOwned ? d.rig.claimList().join('+') : 'RELEASED — the city would take Earth\'s drags',
  );
}

// --- 6. Resize -------------------------------------------------------------------

section('6. A resize during the visit waits for the hand-back');
{
  const c = makeCity();
  c.run(3);
  const entered = c.camera.position.clone();
  let deferred: ReturnType<typeof resolveCameraPose> | null = null;
  let appliedWhileFree = false;
  c.setOnReturn(() => {
    if (!deferred) return;
    appliedWhileFree = !c.rig.isOwned;
    c.rig.setPose(deferred);
    deferred = null;
  });
  c.about.enter(FLIGHT);
  c.run(FLIGHT + 0.2);
  deferred = resolveCameraPose(env, ASPECT);
  // What `MurciaExperience.setViewport` does besides deferring: the held stop
  // is re-solved for the viewport, which here has not changed.
  const held = c.camera.position.clone();
  c.about.reframe();
  c.run(0.5);
  check('kept, it leaves the held stop where it is', c.camera.position.distanceTo(held) < 1e-6, 'deferred');
  c.about.exit(FLIGHT);
  c.run(FLIGHT + 0.2);
  c.run(1);
  const snap = c.camera.position.distanceTo(entered);
  check(
    'applied after the hand-back, it lands without a snap',
    deferred === null && appliedWhileFree && snap < 1e-3,
    `${snap.toExponential(1)} units from the pose entered from`,
  );
}

// --- 7. Leaving for Earth from the sky ------------------------------------------------

section('7. «Ver sus casos»: the warp leaves from the sky stop, and its cut restores the entry pose');
{
  const { c, position, focus, azimuth } = walkedCity();
  c.about.enter(FLIGHT);
  c.run(FLIGHT + 0.2);
  c.about.flyTo(1, FLIGHT);
  c.run(FLIGHT + 0.2);
  c.about.flyTo(2, FLIGHT);
  c.run(FLIGHT + 0.2);
  const atSky = c.camera.position.clone();
  const skyPitch = Math.asin(forward(c.camera).y);

  // The warp claims the rig beside the section, as `setWarpPose` does.
  c.rig.claim('warp');
  let monotonic = true;
  let lastY = atSky.y;
  let lastPitch = skyPitch;
  for (let i = 0; i <= 60; i += 1) {
    c.warp.amount = i / 60;
    c.frame(1 / 60);
    const pitch = Math.asin(forward(c.camera).y);
    if (c.camera.position.y < lastY - 1e-9 || pitch < lastPitch - 1e-9) monotonic = false;
    lastY = c.camera.position.y;
    lastPitch = pitch;
  }
  check(
    'the camera only rises and tips up as the warp grows',
    monotonic && c.camera.position.y > atSky.y + 1 && lastPitch > skyPitch,
    `rose ${(c.camera.position.y - atSky.y).toFixed(1)} units, pitch ${THREE.MathUtils.radToDeg(skyPitch).toFixed(1)}° → ${THREE.MathUtils.radToDeg(lastPitch).toFixed(1)}°`,
  );
  check('and the section still holds the rig until the cut', c.adapter.holding && c.returns.length === 0, 'held');

  // The cut: `setActive(false)` takes `'inactive'` and abandons the visit.
  c.rig.claim('inactive');
  c.about.abandon();
  c.warp.amount = null;
  check(
    'the cut puts the camera back on the pose the visit started from',
    c.camera.position.distanceTo(position) < 1e-3,
    `${c.camera.position.distanceTo(position).toExponential(1)} units`,
  );
  check(
    'and hands back only its own claim',
    !c.adapter.holding && c.rig.hasClaim('warp') && c.rig.hasClaim('inactive') && c.returns.length === 1,
    c.rig.claimList().join('+'),
  );
  const turn = turnBetween(c.rig.getAzimuthDegrees(), azimuth);
  check(
    'the rig adopted where the visitor was standing',
    c.rig.focus.distanceTo(focus) < 1e-3 && close(turn, 0, 1e-3),
    `focus off by ${c.rig.focus.distanceTo(focus).toExponential(1)}, heading off by ${turn.toExponential(1)} deg`,
  );
}

finish();
