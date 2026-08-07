/**
 * Behavioural harness for the Earth <-> Murcia warp.  `npm run check:warp`
 *
 * Drives the REAL curve module, the REAL pose mapping and the REAL camera
 * placement — not reimplementations. Same rule as checks/navigation-feel.ts and
 * scripts/simulate-intro.mjs: a guard that tests a convenient stand-in guards
 * nothing.
 *
 * The assertion that matters is section 6. Murcia's terrain skirt is 600 units
 * wide because that is what a camera at the resting pose needs at every azimuth
 * on a 5120x1440 viewport, with only +50 units to spare. Any warp pose that
 * reaches further across the ground than rest does puts the plate edge on
 * screen for ultrawide viewers only, silently, with nothing visible on the
 * machine the change was made on. PROJECT_MEMORY, "The number that can hurt
 * you", records that exact regression happening once already.
 *
 * Sections 1-2 keep the cheap distance bounds as a first line of defence, but
 * they are only a proxy — since ADR 006 the departure trades distance against
 * elevation, and neither number means anything without section 6.
 */
import * as THREE from 'three';

import {
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  flash,
  motionBlur,
  speed,
  transitionLeg,
} from '../src/app/warpTransition';
import {
  murciaArrivalPose,
  murciaDeparturePose,
  murciaWarpPose,
} from '../src/experiences/murcia/camera/warpPose';
import type { MurciaWarpTargets } from '../src/experiences/murcia/camera/warpPose';
import { applyPoseToCamera } from '../src/experiences/murcia/camera/applyPoseToCamera';
import { computeGroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import type { GroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  const tag = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  ${tag}  ${label.padEnd(56)} ${detail}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

/** Dense sweep — the envelope must hold everywhere, not at sampled corners. */
const STEPS = 2000;
const samples: number[] = [];
for (let i = 0; i <= STEPS; i++) samples.push(i / STEPS);

/** The ends of the warp, exactly as MurciaExperience.applyWarpPose builds them. */
const targets: MurciaWarpTargets = {
  restDistance: murciaConfig.camera.distance,
  restElevation: murciaConfig.camera.elevationDegrees,
  closeDistance: murciaConfig.warpCloseDistance,
  departDistance: murciaConfig.warpDepartDistance,
  departElevation: murciaConfig.warpDepartElevationDegrees,
};

console.log('='.repeat(70));
console.log('Warp transition — Earth <-> Murcia');
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
section('1. Murcia distance stays inside the safe envelope, per leg');

let maxArrival = -Infinity;
let minArrival = Infinity;
let maxDeparture = -Infinity;
let minDeparture = Infinity;
let maxDepartureAt = 0;
for (const p of samples) {
  const { amount } = dollyAmount(p);
  const arrival = murciaArrivalPose(targets, amount).distance;
  const departure = murciaDeparturePose(targets, amount).distance;
  if (arrival > maxArrival) maxArrival = arrival;
  if (arrival < minArrival) minArrival = arrival;
  if (departure > maxDeparture) { maxDeparture = departure; maxDepartureAt = p; }
  if (departure < minDeparture) minDeparture = departure;
}

check(
  'arriving never pulls back past the resting distance',
  maxArrival <= WARP_TRANSITION.murciaMaxDistance + 1e-9,
  `max ${maxArrival.toFixed(3)} (ceiling ${WARP_TRANSITION.murciaMaxDistance})`,
);
check(
  'departing stays under the rising ceiling',
  maxDeparture <= WARP_TRANSITION.murciaDepartMaxDistance + 1e-9,
  `max ${maxDeparture.toFixed(3)} at p=${maxDepartureAt.toFixed(3)} (ceiling ${WARP_TRANSITION.murciaDepartMaxDistance})`,
);
check(
  'neither leg dives below the footprint floor',
  Math.min(minArrival, minDeparture) >= WARP_TRANSITION.murciaMinDistance - 1e-9,
  `min ${Math.min(minArrival, minDeparture).toFixed(3)} (floor ${WARP_TRANSITION.murciaMinDistance})`,
);
check(
  'the departure only ever leaves rest by rising',
  WARP_TRANSITION.murciaDepartElevation > WARP_TRANSITION.murciaRestElevation,
  `${WARP_TRANSITION.murciaRestElevation} -> ${WARP_TRANSITION.murciaDepartElevation} deg — extra distance without extra elevation is unpaid for`,
);

// The whole envelope is meaningless if it is measured against the wrong pose.
check(
  'rest distance matches the environment config it was measured for',
  WARP_TRANSITION.murciaRestDistance === murciaConfig.camera.distance,
  `warp ${WARP_TRANSITION.murciaRestDistance} vs murciaConfig ${murciaConfig.camera.distance}`,
);
check(
  'rest elevation matches the environment config',
  WARP_TRANSITION.murciaRestElevation === murciaConfig.camera.elevationDegrees,
  `warp ${WARP_TRANSITION.murciaRestElevation} vs murciaConfig ${murciaConfig.camera.elevationDegrees}`,
);
check(
  'close distance matches the environment config',
  WARP_TRANSITION.murciaCloseDistance === murciaConfig.warpCloseDistance,
  `warp ${WARP_TRANSITION.murciaCloseDistance} vs murciaConfig ${murciaConfig.warpCloseDistance}`,
);
check(
  'departure pose matches the environment config',
  WARP_TRANSITION.murciaDepartDistance === murciaConfig.warpDepartDistance &&
    WARP_TRANSITION.murciaDepartElevation === murciaConfig.warpDepartElevationDegrees,
  `warp ${WARP_TRANSITION.murciaDepartDistance}/${WARP_TRANSITION.murciaDepartElevation} vs murciaConfig ${murciaConfig.warpDepartDistance}/${murciaConfig.warpDepartElevationDegrees}`,
);
check(
  'the arrival ceiling is the rest distance, not merely near it',
  WARP_TRANSITION.murciaMaxDistance === murciaConfig.camera.distance,
  'arriving does not change elevation, so it has nothing to pay extra reach with',
);
check(
  'the departure ceiling is the departure distance',
  WARP_TRANSITION.murciaDepartMaxDistance === murciaConfig.warpDepartDistance,
  'a ceiling above it would spend skirt margin section 6 never measured',
);

// ---------------------------------------------------------------------------
section('2. Both worlds return exactly to rest');

for (const [name, pose] of [
  ['arriving', murciaArrivalPose(targets, dollyAmount(0).amount)],
  ['departing', murciaDeparturePose(targets, dollyAmount(0).amount)],
] as const) {
  check(
    `Murcia is at the resting pose at p=0 (${name})`,
    Math.abs(pose.distance - targets.restDistance) < 1e-9 &&
      Math.abs(pose.elevationDegrees - targets.restElevation) < 1e-9,
    `${pose.distance.toFixed(6)} @ ${pose.elevationDegrees.toFixed(6)} deg`,
  );
}
for (const [name, pose] of [
  ['arriving', murciaArrivalPose(targets, dollyAmount(1).amount)],
  ['departing', murciaDeparturePose(targets, dollyAmount(1).amount)],
] as const) {
  check(
    `Murcia is at the resting pose at p=1 (${name})`,
    Math.abs(pose.distance - targets.restDistance) < 1e-9 &&
      Math.abs(pose.elevationDegrees - targets.restElevation) < 1e-9,
    `${pose.distance.toFixed(6)} @ ${pose.elevationDegrees.toFixed(6)} deg — a residual offset would persist for the session, and a residual tilt would too`,
  );
}

check(
  'Earth radius scale is 1 at p=0',
  Math.abs(earthRadiusScale(dollyAmount(0).amount) - 1) < 1e-9,
  `${earthRadiusScale(dollyAmount(0).amount).toFixed(6)}`,
);
check(
  'Earth radius scale is 1 at p=1',
  Math.abs(earthRadiusScale(dollyAmount(1).amount) - 1) < 1e-9,
  'otherwise the rig hands back to a camera that moved',
);

check(
  'Earth FOV returns to rest at p=0',
  Math.abs(earthFov(0) - WARP_TRANSITION.earthRestFov) < 1e-9,
  `${earthFov(0).toFixed(4)}`,
);
check(
  'Earth FOV returns to rest at p=1',
  Math.abs(earthFov(1) - WARP_TRANSITION.earthRestFov) < 1e-9,
  `${earthFov(1).toFixed(4)} — a residual surge would leave the site permanently wide`,
);
check(
  'the FOV surge actually peaks at the cut',
  Math.abs(earthFov(WARP_TRANSITION.cut) - WARP_TRANSITION.earthWarpFov) < 1e-6,
  `${earthFov(WARP_TRANSITION.cut).toFixed(2)} deg`,
);

// ---------------------------------------------------------------------------
section('3. The flash covers the cut and clears both ends');

check(
  'reaches full cover at the cut',
  Math.abs(flash(WARP_TRANSITION.cut) - 1) < 1e-9,
  `${flash(WARP_TRANSITION.cut).toFixed(6)} — anything less shows the jump`,
);
check('clear at p=0', flash(0) === 0, `${flash(0)}`);
check('clear at p=1', flash(1) === 0, `${flash(1)} — a stuck overlay blacks out the page`);

// The cover has to be total for long enough to hide the swap frame, not just
// touch 1.0 at a single instant.
const covered = samples.filter((p) => flash(p) > 0.995).length / samples.length;
check(
  'full cover spans a real window, not one instant',
  covered > 0.02,
  `${(covered * 100).toFixed(1)}% of the transition at >0.995`,
);

// ---------------------------------------------------------------------------
section('4. Motion blur ramps and self-returns');

check('no blur at p=0', motionBlur(0) === 0, `${motionBlur(0)}`);
check(
  'no blur at p=1',
  motionBlur(1) === 0,
  `${motionBlur(1)} — a nonzero damp holds a ghost frame indefinitely`,
);
check(
  'peaks at the cut',
  Math.abs(motionBlur(WARP_TRANSITION.cut) - WARP_TRANSITION.motionBlurStrength) < 1e-6,
  `${motionBlur(WARP_TRANSITION.cut).toFixed(4)}`,
);

// The nested-width relationship is the design (DECISIONS.md:195-196): the blur
// ramps over a wide window so acceleration feels gradual, the flash spikes over
// a narrow one so it reads as a flicker. Invert them and the warp stops reading.
const blurWindow = samples.filter((p) => speed(p) > 0.01).length;
const flashWindow = samples.filter((p) => flash(p) > 0.01).length;
check(
  'the blur window is wider than the flash window',
  blurWindow > flashWindow,
  `blur ${blurWindow} samples vs flash ${flashWindow}`,
);

// ---------------------------------------------------------------------------
section('5. The two legs partition the transition, and go the right way');

const { departing: depAtStart } = transitionLeg(0);
const { departing: depAtEnd } = transitionLeg(1);
check('departing at p=0', depAtStart === true);
check('arriving at p=1', depAtEnd === false);

let monotonicIn = true;
let monotonicOut = true;
let prevIn = -Infinity;
let prevOut = Infinity;
for (const p of samples) {
  const { departing, amount } = dollyAmount(p);
  if (departing) {
    if (amount < prevIn - 1e-9) monotonicIn = false;
    prevIn = amount;
  } else {
    if (amount > prevOut + 1e-9) monotonicOut = false;
    prevOut = amount;
  }
}
check('the envelope rises without reversing', monotonicIn, 'a reversal reads as a stumble');
check('and falls without reversing', monotonicOut);

const peak = dollyAmount(WARP_TRANSITION.cut).amount;
check(
  'the envelope is at its extreme at the cut',
  peak > 0.99,
  `amount ${peak.toFixed(4)} — the cut must land under the most extreme, most covered frame`,
);

// ADR 006. Leaving a city that sits INSIDE the Earth has to recede; driving
// forward into it and cutting to a globe is the concept error this replaced.
const departFar = murciaDeparturePose(targets, peak);
const arriveNear = murciaArrivalPose(targets, peak);
check(
  'departing Murcia moves AWAY from the city',
  departFar.distance > targets.restDistance &&
    departFar.elevationDegrees > targets.restElevation,
  `${departFar.distance.toFixed(1)} @ ${departFar.elevationDegrees.toFixed(1)} deg vs rest ${targets.restDistance} @ ${targets.restElevation}`,
);
check(
  'arriving into Murcia still comes from close in',
  arriveNear.distance < targets.restDistance,
  `${arriveNear.distance.toFixed(1)} vs rest ${targets.restDistance}`,
);

// ---------------------------------------------------------------------------
section('6. No warp pose reaches further across the ground than rest');

// The real placement maths and the real footprint maths, over the aspects and
// azimuths the skirt was sized against. 3.56 is 5120x1440, the binding case.
const ASPECTS: Array<[string, number]> = [
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
  ['5120x1440', 5120 / 1440],
  ['portrait', 0.5],
];
const YAW_STEP = 15;
const FOOTPRINT_STEPS = 200;

const nav = murciaConfig.navigation;
const focus = new THREE.Vector3(
  murciaConfig.initialFocus.x,
  0,
  murciaConfig.initialFocus.z,
);
const camera = new THREE.PerspectiveCamera();

function footprintAt(
  pose: { distance: number; elevationDegrees: number },
  aspect: number,
  yaw: number,
): GroundFootprint {
  camera.aspect = aspect;
  applyPoseToCamera(camera, { ...murciaConfig.camera, ...pose }, focus, yaw);
  return computeGroundFootprint(camera, focus, nav.groundPlaneHeight, nav.maxGroundDistance);
}

function maxReach(f: GroundFootprint): number {
  return Math.max(f.reachNegX, f.reachPosX, f.reachNegZ, f.reachPosZ);
}

let worstExcess = -Infinity;
let worstLabel = '';
let anyClamped = false;
let clampedLabel = '';
let poses = 0;

for (const [aspectName, aspect] of ASPECTS) {
  for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
    const restReach = maxReach(footprintAt(murciaConfig.camera, aspect, yaw));

    for (let i = 0; i <= FOOTPRINT_STEPS; i++) {
      const p = i / FOOTPRINT_STEPS;
      const { amount, departing } = dollyAmount(p);
      const pose = murciaWarpPose(targets, amount, departing);
      const f = footprintAt(pose, aspect, yaw);
      poses++;

      if (f.clampedRays && !anyClamped) {
        anyClamped = true;
        clampedLabel = `${aspectName} yaw ${yaw} p=${p.toFixed(3)} d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)}`;
      }

      const excess = maxReach(f) - restReach;
      if (excess > worstExcess) {
        worstExcess = excess;
        worstLabel = `${aspectName} yaw ${yaw} p=${p.toFixed(3)} d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)}`;
      }
    }
  }
}

check(
  'the warp never out-reaches the pose the skirt was sized for',
  worstExcess <= 1e-6,
  `worst ${worstExcess >= 0 ? '+' : ''}${worstExcess.toFixed(1)} units at ${worstLabel} (${poses} poses)`,
);
check(
  'no frustum corner misses the ground plane',
  !anyClamped,
  anyClamped
    ? `clamped at ${clampedLabel} — a clamped ray is a degenerate pose, not the mechanism working`
    : 'every corner ray still hits the ground at every warp pose',
);

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(70)}`);
const total = 32;
if (failures === 0) {
  console.log(`${total}/${total} checks passed`);
} else {
  console.log(`${failures} check(s) FAILED`);
  process.exitCode = 1;
}
