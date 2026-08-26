/**
 * Behavioural harness for the Earth <-> Murcia warp.  `npm run check:warp`
 *
 * Drives the REAL curve module, the REAL pose mapping and the REAL camera
 * placement — not reimplementations. Same rule as checks/navigation-feel.ts and
 * src/intro-draw/playhead.test.ts: a guard that tests a convenient stand-in
 * guards nothing.
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
  SCRUB_CEILING,
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  flash,
  motionBlur,
  scrubProgress,
  speed,
  transitionLeg,
} from '../src/app/warpTransition';
import {
  murciaArrivalPose,
  murciaDeparturePose,
  murciaWarpPose,
} from '../src/experiences/murcia/camera/warpPose';
import type { MurciaWarpTargets } from '../src/experiences/murcia/camera/warpPose';
import {
  applyPoseToCamera,
  scalePoseDistance,
} from '../src/experiences/murcia/camera/applyPoseToCamera';
import { computeGroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import type { GroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';

import { banner, check, finish, section } from './lib/assert';


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

banner('Warp transition — Earth <-> Murcia');

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

// The nested-width relationship is the design (DECISIONS.md 26.6): the blur
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
//
// Swept across the user's zoom band as well, because distance is user state
// now: a visitor can be zoomed out when they trigger the warp. The invariant is
// stated RELATIVE to the same scale — "no warp pose out-reaches the resting pose
// at the user's current zoom" — because comparing against a rest pose they are
// not actually at would be the wrong comparison. That the resting pose is itself
// safe at every scale is what checks/footprint.ts proves; this section
// only has to show the warp adds nothing on top.
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
  scale: number,
): GroundFootprint {
  camera.aspect = aspect;
  // Composed through the same helper the rig uses, so this measures how zoom
  // ACTUALLY combines with a warp pose rather than a second opinion about it.
  applyPoseToCamera(
    camera,
    scalePoseDistance({ ...murciaConfig.camera, ...pose }, scale),
    focus,
    yaw,
  );
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

// The distance scales a warp can find the rig already sitting at.
//
// This used to be the user zoom band, min/1/max, because the wheel could leave the
// camera anywhere in it when a warp started. There is no zoom now (`adr/009`): the
// only thing that scales distance is a district flight, and a flight can only be in
// progress or closed. So the sweep is the flight floor and rest.
//
// The out-of-band scale is gone with the band, which removes the one entry here that
// was reaching FURTHER than rest — the direction the skirt cannot absorb.
const DISTANCE_SCALES: number[] = [murciaConfig.focusFlight.minDistanceScale, 1];

for (const scale of DISTANCE_SCALES) {
  for (const [aspectName, aspect] of ASPECTS) {
    for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
      const restReach = maxReach(footprintAt(murciaConfig.camera, aspect, yaw, scale));

      for (let i = 0; i <= FOOTPRINT_STEPS; i++) {
        const p = i / FOOTPRINT_STEPS;
        const { amount, departing } = dollyAmount(p);
        const pose = murciaWarpPose(targets, amount, departing);
        const f = footprintAt(pose, aspect, yaw, scale);
        poses++;

        const label =
          `${aspectName} yaw ${yaw} zoom ${scale} p=${p.toFixed(3)} ` +
          `d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)}`;

        if (f.clampedRays && !anyClamped) {
          anyClamped = true;
          clampedLabel = label;
        }

        const excess = maxReach(f) - restReach;
        if (excess > worstExcess) {
          worstExcess = excess;
          worstLabel = label;
        }
      }
    }
  }
}

check(
  'the warp never out-reaches rest, at any user zoom',
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
section('7. The reversible scrub band is safe to drive from a gesture');

// The band is where a GESTURE drives the warp: reversible, usually abandoned,
// never concealed. `adr/009` refused to let gesture progress become
// `state.transitionProgress` because "the warp's progress is monotonic through a
// concealed cut; the gesture's is reversible and usually never arrives". This
// section is the answer to that objection, asserted rather than argued.
//
// Section 6 above already sweeps the whole departing leg through the real
// footprint maths, and the band is a strict subset of it — so the safety case
// costs nothing new. What is asserted here is what makes the band a band.

const bandPoses = samples.map(scrubProgress);

check(
  'the band is derived from the flash bell, not chosen',
  Math.abs(SCRUB_CEILING - (WARP_TRANSITION.cut - WARP_TRANSITION.flashWidth)) < 1e-12,
  `SCRUB_CEILING ${SCRUB_CEILING.toFixed(4)} = cut ${WARP_TRANSITION.cut} - flashWidth ${WARP_TRANSITION.flashWidth}`,
);

const litBand = bandPoses.filter((p) => flash(p) > 0);
check(
  'no gesture position anywhere in the band darkens the screen',
  litBand.length === 0,
  litBand.length === 0
    ? `flash is exactly 0 across all ${bandPoses.length} sampled gesture positions`
    : `${litBand.length} positions carry a flash — an abandoned gesture would strand a dimmed screen`,
);

const arrivingInBand = bandPoses.filter((p) => !transitionLeg(p).departing);
check(
  'the whole band lies in the departing leg, so a reversal cannot cross a leg',
  arrivingInBand.length === 0,
  arrivingInBand.length === 0
    ? 'transitionLeg().departing is true at every sampled gesture position'
    : `${arrivingInBand.length} positions fall in the arriving leg — transitionLeg assumes a single pass`,
);

let bandMonotone = true;
for (let i = 1; i < bandPoses.length; i++) {
  if (bandPoses[i] <= bandPoses[i - 1]) bandMonotone = false;
}
check(
  'more gesture is always more travel',
  bandMonotone && bandPoses[0] === 0 && bandPoses[bandPoses.length - 1] === SCRUB_CEILING,
  `0 -> ${bandPoses[bandPoses.length - 1].toFixed(4)}, strictly increasing: ${bandMonotone}`,
);

// The band must not eat the whole departure, or the committed warp has nothing
// left to play and the cut arrives with no acceleration behind it.
const bandAmount = dollyAmount(SCRUB_CEILING).amount;
check(
  'the band spends less than two thirds of the departure',
  bandAmount > 0.2 && bandAmount < 0.67,
  `dolly amount at the ceiling is ${bandAmount.toFixed(3)} of the way to the cut`,
);

check(
  'the cinematic still owns the surge, the blur peak and the whole flash',
  earthFov(SCRUB_CEILING) < earthFov(WARP_TRANSITION.cut) &&
    motionBlur(SCRUB_CEILING) < motionBlur(WARP_TRANSITION.cut) &&
    speed(SCRUB_CEILING) < 1,
  `at the ceiling: fov ${earthFov(SCRUB_CEILING).toFixed(1)} of ${earthFov(WARP_TRANSITION.cut).toFixed(1)}, blur ${motionBlur(SCRUB_CEILING).toFixed(3)} of ${motionBlur(WARP_TRANSITION.cut).toFixed(3)}`,
);

// Stated as a number so a regression reads as one, rather than as "the scrub
// feels different now".
check(
  'Earth visibly closes on the planet across the band',
  earthRadiusScale(bandAmount) < 0.75 && earthRadiusScale(bandAmount) > 0.4,
  `radius scales to ${(earthRadiusScale(bandAmount) * 100).toFixed(1)}% at full gesture`,
);

// ── What the gesture actually looks like, which is not the same as how far the
//    camera moved ──
//
// Angular size goes as 1/distance AND as 1/tan(fov/2). The scrub used to write
// `earthFov` for continuity with the cinematic, and that made the two fight: the
// dolly magnifies x1.587 across the band while the surge de-magnifies x0.725, so
// the net PEAKED around half a gesture and went backwards after it. `scrubPose`
// now holds the lens at rest and the commit pays for the continuity instead.
//
// Both halves are asserted, because both are easy to undo by accident and they
// fail in opposite directions.

const halfAngle = (deg: number) => Math.tan((deg * Math.PI) / 360);
const restHalfAngle = halfAngle(WARP_TRANSITION.earthRestFov);

/** On-screen scale as the scrub actually draws it: lens fixed, dolly only. */
const scrubScale = (g: number) => 1 / earthRadiusScale(dollyAmount(scrubProgress(g)).amount);

/** And as it would be if the surge were applied here, which it must not be. */
const scaleWithSurge = (g: number) => {
  const p = scrubProgress(g);
  return scrubScale(g) * (restHalfAngle / halfAngle(earthFov(p)));
};

let scrubMonotone = true;
for (let i = 1; i < samples.length; i++) {
  if (scrubScale(samples[i]) <= scrubScale(samples[i - 1])) scrubMonotone = false;
}
check(
  'more gesture always makes the world BIGGER, not merely nearer',
  scrubMonotone,
  `on-screen scale runs 1.000 -> ${scrubScale(1).toFixed(3)}, strictly increasing across ${samples.length} samples`,
);

check(
  'and a full gesture is worth a scale change a person can see',
  scrubScale(1) > 1.5,
  `x${scrubScale(1).toFixed(3)} at full gesture — below about 1.5 the gesture stops reading as an approach`,
);

// The guard against the natural-looking regression: "the scrub should set the
// FOV too, so the cinematic has nothing to jump over."
let surgePeak = 0;
for (const g of samples) surgePeak = Math.max(surgePeak, scaleWithSurge(g));
check(
  'applying the surge here would cancel the gesture, so it is not applied here',
  scaleWithSurge(1) < surgePeak - 0.02 && surgePeak < 1.25,
  `with the surge the scale would peak at x${surgePeak.toFixed(3)} and fall back to x${scaleWithSurge(1).toFixed(3)} at full gesture — the world would shrink while the viewer kept pulling`,
);

// And the pop that the commit's FOV catch-up exists to absorb. If this ever
// stops being true, FOV_CATCHUP_SECONDS in CameraController is dead weight.
check(
  'the commit inherits a lens the cinematic immediately disagrees with',
  earthFov(SCRUB_CEILING) - WARP_TRANSITION.earthRestFov > 10,
  `the scrub hands over at ${WARP_TRANSITION.earthRestFov} deg and the cinematic wants ${earthFov(SCRUB_CEILING).toFixed(1)} deg — blended over FOV_CATCHUP_SECONDS rather than cut`,
);

// ---------------------------------------------------------------------------
// Counted live. The literal that used to sit here said 32 while this file ran
// 36 assertions — it had drifted by four without anyone noticing, which is the
// whole argument for not writing the number down twice.
finish();
