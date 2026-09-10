/**
 * Behavioural harness for the Earth <-> Murcia warp.  `npm run check:warp`
 *
 * Drives the REAL curve module, the REAL pose mapping and the REAL camera
 * placement — not reimplementations. Same rule as checks/navigation-feel.ts and
 * src/intro-draw/playhead.test.ts: a guard that tests a convenient stand-in
 * guards nothing.
 *
 * The assertion that matters is section 6: no warp pose may show the viewer the
 * edge of the world. It puts that edge on screen for ultrawide viewers only,
 * silently, with nothing visible on the machine the change was made on.
 * PROJECT_MEMORY, "The number that can hurt you", records that exact regression
 * happening once already.
 *
 * HOW SECTION 6 SAYS IT CHANGED ON 2026-09-04, and the section says so in place.
 * It used to assert that no warp pose reaches further across the ground than
 * rest. That worked while rest was 30 degrees and its reach was a number. Rest
 * is 19 degrees now — the client asked for a horizontal arrival — so the resting
 * frustum passes the horizon and its "reach" is the `maxGroundDistance` clamp.
 * The skirt, meanwhile, moved out to wrap the filler city rather than the
 * authored plate. So the question is no longer how far the camera SEES but where
 * the camera IS, and section 6 sweeps the same 270k poses to answer it.
 *
 * Sections 1-2 keep the cheap distance bounds as a first line of defence, but
 * they are only a proxy — since ADR 006 the departure trades distance against
 * elevation, and neither number means anything without section 6.
 */
import * as THREE from 'three';

import {
  WARP_LIMITS,
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  flash,
  motionBlur,
  speed,
  transitionLeg,
} from '../src/utils/warpTransition';
import {
  murciaArrivalPose,
  murciaDeparturePose,
  murciaWarpPose,
} from '../src/experiences/murcia/camera/warpPose';
import type { MurciaWarpTargets } from '../src/experiences/murcia/camera/warpPose';
import {
  murciaZoomPose,
  murciaZoomTargets,
} from '../src/experiences/murcia/camera/zoomPose';
import { earthZoomRadius, earthZoomScale } from '../src/experiences/earth/camera/zoomPose';
import { EARTH_CONFIG } from '../src/experiences/earth/config/earthConfig';
import { INTERACTION_CONFIG } from '../src/experiences/earth/interaction/interactionConfig';
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';
import {
  applyPoseToCamera,
  scalePoseDistance,
} from '../src/experiences/murcia/camera/applyPoseToCamera';
import { computeGroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import type { GroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import { terrainVisualBounds } from '../src/experiences/murcia/environment/createTerrainTransition';

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
  const { amount } = dollyAmount(p, WARP_LIMITS);
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
  ['arriving', murciaArrivalPose(targets, dollyAmount(0, WARP_LIMITS).amount)],
  ['departing', murciaDeparturePose(targets, dollyAmount(0, WARP_LIMITS).amount)],
] as const) {
  check(
    `Murcia is at the resting pose at p=0 (${name})`,
    Math.abs(pose.distance - targets.restDistance) < 1e-9 &&
      Math.abs(pose.elevationDegrees - targets.restElevation) < 1e-9,
    `${pose.distance.toFixed(6)} @ ${pose.elevationDegrees.toFixed(6)} deg`,
  );
}
for (const [name, pose] of [
  ['arriving', murciaArrivalPose(targets, dollyAmount(1, WARP_LIMITS).amount)],
  ['departing', murciaDeparturePose(targets, dollyAmount(1, WARP_LIMITS).amount)],
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
  Math.abs(earthRadiusScale(dollyAmount(0, WARP_LIMITS).amount, WARP_LIMITS) - 1) < 1e-9,
  `${earthRadiusScale(dollyAmount(0, WARP_LIMITS).amount, WARP_LIMITS).toFixed(6)}`,
);
check(
  'Earth radius scale is 1 at p=1',
  Math.abs(earthRadiusScale(dollyAmount(1, WARP_LIMITS).amount, WARP_LIMITS) - 1) < 1e-9,
  'otherwise the rig hands back to a camera that moved',
);

check(
  'Earth FOV returns to rest at p=0',
  Math.abs(earthFov(0, WARP_LIMITS) - WARP_TRANSITION.earthRestFov) < 1e-9,
  `${earthFov(0, WARP_LIMITS).toFixed(4)}`,
);
check(
  'Earth FOV returns to rest at p=1',
  Math.abs(earthFov(1, WARP_LIMITS) - WARP_TRANSITION.earthRestFov) < 1e-9,
  `${earthFov(1, WARP_LIMITS).toFixed(4)} — a residual surge would leave the site permanently wide`,
);
check(
  'the FOV surge actually peaks at the cut',
  Math.abs(earthFov(WARP_TRANSITION.cut, WARP_LIMITS) - WARP_TRANSITION.earthWarpFov) < 1e-6,
  `${earthFov(WARP_TRANSITION.cut, WARP_LIMITS).toFixed(2)} deg`,
);

// ---------------------------------------------------------------------------
section('3. The flash covers the cut and clears both ends');

check(
  'reaches full cover at the cut',
  Math.abs(flash(WARP_TRANSITION.cut, WARP_LIMITS) - 1) < 1e-9,
  `${flash(WARP_TRANSITION.cut, WARP_LIMITS).toFixed(6)} — anything less shows the jump`,
);
check('clear at p=0', flash(0, WARP_LIMITS) === 0, `${flash(0, WARP_LIMITS)}`);
check('clear at p=1', flash(1, WARP_LIMITS) === 0, `${flash(1, WARP_LIMITS)} — a stuck overlay blacks out the page`);

// The cover has to be total for long enough to hide the swap frame, not just
// touch 1.0 at a single instant.
const covered = samples.filter((p) => flash(p, WARP_LIMITS) > 0.995).length / samples.length;
check(
  'full cover spans a real window, not one instant',
  covered > 0.02,
  `${(covered * 100).toFixed(1)}% of the transition at >0.995`,
);

// ---------------------------------------------------------------------------
section('4. Motion blur ramps and self-returns');

check('no blur at p=0', motionBlur(0, WARP_LIMITS) === 0, `${motionBlur(0, WARP_LIMITS)}`);
check(
  'no blur at p=1',
  motionBlur(1, WARP_LIMITS) === 0,
  `${motionBlur(1, WARP_LIMITS)} — a nonzero damp holds a ghost frame indefinitely`,
);
check(
  'peaks at the cut',
  Math.abs(motionBlur(WARP_TRANSITION.cut, WARP_LIMITS) - WARP_TRANSITION.motionBlurStrength) < 1e-6,
  `${motionBlur(WARP_TRANSITION.cut, WARP_LIMITS).toFixed(4)}`,
);

// The nested-width relationship is the design (DECISIONS.md 26.6): the blur
// ramps over a wide window so acceleration feels gradual, the flash spikes over
// a narrow one so it reads as a flicker. Invert them and the warp stops reading.
const blurWindow = samples.filter((p) => speed(p, WARP_LIMITS) > 0.01).length;
const flashWindow = samples.filter((p) => flash(p, WARP_LIMITS) > 0.01).length;
check(
  'the blur window is wider than the flash window',
  blurWindow > flashWindow,
  `blur ${blurWindow} samples vs flash ${flashWindow}`,
);

// ---------------------------------------------------------------------------
section('5. The two legs partition the transition, and go the right way');

const { departing: depAtStart } = transitionLeg(0, WARP_LIMITS);
const { departing: depAtEnd } = transitionLeg(1, WARP_LIMITS);
check('departing at p=0', depAtStart === true);
check('arriving at p=1', depAtEnd === false);

let monotonicIn = true;
let monotonicOut = true;
let prevIn = -Infinity;
let prevOut = Infinity;
for (const p of samples) {
  const { departing, amount } = dollyAmount(p, WARP_LIMITS);
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

const peak = dollyAmount(WARP_TRANSITION.cut, WARP_LIMITS).amount;
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
section('6. No warp pose escapes the world the skirt draws');

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

// The rectangle the ground actually ends at: the skirt, wrapped around whichever
// mesh carries the model's outer edge. Past this there is nothing but background.
const skirtOuter = terrainVisualBounds(
  murciaConfig.groundBounds ?? murciaConfig.contentBounds,
  murciaConfig.terrainTransition,
);

let worstCameraMargin = Infinity;
let worstLabel = '';
let furthestSkirtCorner = 0;
let anyClamped = false;
/** How many sampled poses reach the clamp. Reported, so a change is visible. */
let clampedSamples = 0;
/**
 * How far past the authored plate there is real ground: the filler city plus the
 * skirt's fade. What a clamped footprint has to land inside.
 */
const realGroundReach = (() => {
  const g = murciaConfig.groundBounds;
  const p = murciaConfig.contentBounds;
  const past = g
    ? Math.min(p.minX - g.minX, g.maxX - p.maxX, p.minZ - g.minZ, g.maxZ - p.maxZ)
    : 0;
  return (
    past +
    murciaConfig.terrainTransition.width * murciaConfig.terrainTransition.fadeEndFraction
  );
})();
let clampedLabel = '';
let poses = 0;

// The poses a warp can find the rig already sitting at.
//
// Two independent things move the camera before a warp starts, and both have to
// be in the sweep because the warp composes with both:
//
//   the ZOOM       — a position the viewer parked at (`adr/014`), reached
//                    through the real `murciaZoomPose`, distance AND elevation.
//                    This is what the departing leg is re-based on.
//   a FLIGHT scale — a district dolly, which multiplies whatever distance the
//                    zoom resolved to.
//
// The zoom is swept as a band rather than at its ends, because the departing
// warp lerps FROM it: a commit half way through a zoom is an ordinary thing to
// do and produces a pose neither end predicts.
//
// The invariant is stated relative to the RESTING pose at the same flight scale
// — "no warp pose out-reaches the pose the viewer would be at if they had not
// zoomed" — which is the line the terrain skirt was sized against. That the
// zoomed poses are themselves safe is what checks/footprint.ts proves.
const FLIGHT_SCALES: number[] = [murciaConfig.focusFlight.minDistanceScale, 1];
const ZOOM_DEPTHS: number[] = [-1, -0.5, 0, 0.25, 0.5, 0.75, 1];

for (const scale of FLIGHT_SCALES) {
  for (const [aspectName, aspect] of ASPECTS) {
    for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
      for (const depth of ZOOM_DEPTHS) {
        // Exactly what MurciaExperience.applyRigPose builds: the zoom resolves a
        // pose, and the warp's rest end IS that pose.
        const zoomed = murciaZoomPose(
          murciaZoomTargets(murciaConfig, resolveCameraPose(murciaConfig, aspect)),
          depth,
        );
        const zoomedTargets: MurciaWarpTargets = {
          ...targets,
          restDistance: zoomed.distance,
          restElevation: zoomed.elevationDegrees,
        };

        for (let i = 0; i <= FOOTPRINT_STEPS; i++) {
          const p = i / FOOTPRINT_STEPS;
          const { amount, departing } = dollyAmount(p, WARP_LIMITS);
          // Only the departing leg is re-based. Arriving lands in a world whose
          // zoom was reset at the cut, so it always starts from the configured
          // rest — modelling it otherwise would assert something that cannot
          // happen and would hide the case that can.
          const pose = departing
            ? murciaDeparturePose(zoomedTargets, amount)
            : murciaWarpPose(targets, amount, departing);
          const f = footprintAt(pose, aspect, yaw, scale);
          poses++;

          const label =
            `${aspectName} yaw ${yaw} flight ${scale} zoom ${depth} p=${p.toFixed(3)} ` +
            `d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)}`;

          if (f.clampedRays) clampedSamples += 1;
          if (f.clampedRays && !anyClamped) {
            anyClamped = true;
            clampedLabel = label;
          }

          // `footprintAt` has just placed the camera at this pose, through the
          // real `applyPoseToCamera`. Read it rather than recomputing the
          // spherical offset, so a change to the placement is caught here too.
          const margin = Math.min(
            camera.position.x - skirtOuter.minX,
            skirtOuter.maxX - camera.position.x,
            camera.position.z - skirtOuter.minZ,
            skirtOuter.maxZ - camera.position.z,
          );
          if (margin < worstCameraMargin) {
            worstCameraMargin = margin;
            worstLabel = label;
          }

          for (const [sx, sz] of [
            [skirtOuter.minX, skirtOuter.minZ],
            [skirtOuter.maxX, skirtOuter.minZ],
            [skirtOuter.minX, skirtOuter.maxZ],
            [skirtOuter.maxX, skirtOuter.maxZ],
          ]) {
            furthestSkirtCorner = Math.max(
              furthestSkirtCorner,
              Math.hypot(sx - camera.position.x, camera.position.y, sz - camera.position.z),
            );
          }
        }
      }
    }
  }
}

// THIS ASSERTION WAS "the warp never out-reaches rest, from any user zoom", and it
// was retired on 2026-09-04 for the same reason `checks/footprint.ts` §3 was: the
// resting pose is now 19 degrees, its frustum passes the horizon, and its reach is a
// `maxGroundDistance` clamp rather than a measurement. Comparing a clamped reach
// against a clamped reach measures the difference in how far the two cameras sit
// BEHIND the focus — at the arrival's closest pose that came out as +141.8 units,
// which is a fact about `distance * cos(elevation)` and not about anything visible.
//
// What it was protecting is unchanged: a warp pose must not show the viewer the edge
// of the world. That is now a statement about where the CAMERA is rather than about
// how far it sees, because the skirt wraps the filler city and the camera cannot see
// past a gradient that completes 888 units out. So the sweep is kept, every pose in
// it is kept, and what is read off each pose changed.
check(
  'no warp pose puts the camera outside the skirt',
  worstCameraMargin > 0,
  `worst margin ${worstCameraMargin >= 0 ? '+' : ''}${worstCameraMargin.toFixed(1)} units at ` +
    `${worstLabel} (${poses} poses) — outside this the ground is an island in the background ` +
    'colour and no amount of fade helps',
);
check(
  'the far plane clears the skirt from every warp pose',
  murciaConfig.camera.far > furthestSkirtCorner,
  `far ${murciaConfig.camera.far} vs ${furthestSkirtCorner.toFixed(1)} units to the furthest ` +
    'corner — the departure is the furthest the camera ever gets, so this is where a far ' +
    'plane that clips the skirt would show first',
);
// RESTATED with the camera-navigation port, and the history is the point.
//
// This was `!anyClamped`, then `anyClamped`, then `!anyClamped` again — once per
// change to Murcia's pitch. It asked whether a warp pose out-reaches the horizon,
// because a frustum that does has no finite ground footprint and `NavigableArea`
// INSET the navigable rectangle by that footprint. Insetting by a clamp is
// insetting by a number nobody measured, so the pipeline dropped the inset for
// those poses and this check was the tripwire saying the question was live.
//
// The pipeline is gone. §39 and §40 retired with it, nothing is derived from the
// ground footprint any more, and "measurement or clamp?" decides nothing. What
// is still worth asserting is the property underneath — that a clamped pose is
// still drawing real ground rather than the edge of the model — so that is what
// is asserted, with the count reported so a change in it is visible.
check(
  'where a warp pose out-reaches the horizon, the clamp still lands on real ground',
  !anyClamped || murciaConfig.navigation.maxGroundDistance < realGroundReach,
  anyClamped
    ? `${clampedSamples} samples reach the clamp (first at ${clampedLabel}); the clamp is ` +
      `${murciaConfig.navigation.maxGroundDistance} units against ${realGroundReach.toFixed(1)} ` +
      'of real ground, so what those poses draw is ground'
    : 'no warp pose reaches past the horizon — the footprint is a measurement everywhere',
);

// ---------------------------------------------------------------------------
section('7. The zoom band and the warp are continuous with each other');

// `adr/014` replaced the reversible scrub with a persistent zoom, and what this
// section used to assert went with it: the scrub's job was to be a SAFE SUBSET
// of the departing leg, so everything here was about staying inside it.
//
// The zoom is not a subset of anything. It is the camera's own range, owned by
// the viewer, and the warp starts from wherever it left them. So the question
// changed with the mechanism: not "can a gesture reach somewhere the cinematic
// cannot conceal", but "does the cinematic CONTINUE the zoom, or contradict it".
// A commit that reversed the direction the viewer had been pushing would read as
// the world flinching on the way out, and it is the one failure this design can
// have that nothing else would catch.
//
// Section 6 above already runs every one of these poses through the real ground
// footprint maths, so the safety case costs nothing new here.

const zoomDepths: number[] = [];
for (let i = 0; i <= 40; i++) zoomDepths.push(-1 + (2 * i) / 40);

// ── Murcia: one arc, three regions ──

const murciaRest = resolveCameraPose(murciaConfig, 16 / 9);
const murciaBand = murciaZoomTargets(murciaConfig, murciaRest);

check(
  'zooming out is a rise, not a pull-back',
  murciaBand.farDistance > murciaBand.restDistance &&
    murciaBand.farElevation > murciaBand.restElevation,
  `rest ${murciaBand.restDistance} @ ${murciaBand.restElevation} deg -> far ` +
    `${murciaBand.farDistance} @ ${murciaBand.farElevation} deg — extra distance without ` +
    'extra elevation is unpaid for (ADR 006), and this end is a pose a viewer can PARK at',
);
check(
  'zooming in keeps the resting pitch',
  murciaBand.nearDistance < murciaBand.restDistance,
  `near ${murciaBand.nearDistance.toFixed(1)} — flying in shrinks the footprint, so it has ` +
    'nothing to pay for and nothing to change',
);
// The near end WAS asserted to equal the district flight floor exactly, on the
// grounds that a closer one would need its own footprint measurement. It has one
// now (`adr/015`): the reuse made a full pinch-in worth x1.43 and the client
// reported the inward half as not working, so the two were separated and swept.
//
// What replaces the equality is the margin, because that is what the equality
// was really buying. `check:footprint` owns the absolute gate at the compound
// minimum — zoom fully in, then open a district — and this asserts that the
// chosen value is not sitting hard against it. The sweep put the cliff between
// 0.35 and 0.30; anything that leaves less than a quarter of the floor in hand
// is a value someone tightened without re-measuring.
const compoundClosest = murciaBand.nearDistance * murciaConfig.focusFlight.minDistanceScale;
check(
  'the near end is measured, and keeps its margin over the inversion floor',
  murciaBand.nearDistance < murciaRest.distance * murciaConfig.focusFlight.minDistanceScale &&
    compoundClosest > 60 * 1.25,
  `${murciaBand.nearDistance.toFixed(1)} near, ${compoundClosest.toFixed(1)} compound against a ` +
    '~60 floor — inward of the flight floor because the viewer may put themselves closer than a ' +
    'flight will dolly them, and clear of the cliff by more than a rounding error',
);

// THE continuity assertion. The departure has to lie BEYOND the far end of the
// zoom along the same arc, or a warp committed from full zoom-out opens by
// moving back toward the city the viewer is leaving.
check(
  'the departure continues the zoom-out rather than reversing it',
  murciaConfig.warpDepartDistance > murciaBand.farDistance &&
    murciaConfig.warpDepartElevationDegrees > murciaBand.farElevation,
  `zoom reaches ${murciaBand.farDistance} @ ${murciaBand.farElevation} deg and the warp ` +
    `departs to ${murciaConfig.warpDepartDistance} @ ${murciaConfig.warpDepartElevationDegrees} deg`,
);

// And the same thing stated as motion rather than as two numbers: from EVERY
// depth in the band, the first thing the cinematic does is keep going.
let murciaReversedAt: number | null = null;
let murciaWorstStep = Infinity;
for (const depth of zoomDepths) {
  const zoomed = murciaZoomPose(murciaBand, depth);
  const departTargets: MurciaWarpTargets = {
    ...targets,
    restDistance: zoomed.distance,
    restElevation: zoomed.elevationDegrees,
  };
  let previous = zoomed.distance;
  for (let i = 1; i <= 100; i++) {
    const { amount } = dollyAmount((WARP_TRANSITION.cut * i) / 100, WARP_LIMITS);
    const step = murciaDeparturePose(departTargets, amount).distance - previous;
    if (step < -1e-9 && murciaReversedAt === null) murciaReversedAt = depth;
    if (step < murciaWorstStep) murciaWorstStep = step;
    previous += step;
  }
}
check(
  'and does so from every depth in the band, not merely from the ends',
  murciaReversedAt === null,
  murciaReversedAt === null
    ? `the departing distance never decreases from any of ${zoomDepths.length} depths ` +
      `(smallest step ${murciaWorstStep.toFixed(4)})`
    : `committing from depth ${murciaReversedAt} moves the camera back IN — the viewer ` +
      'pushed away from the city and the transition answered by approaching it',
);

check(
  'a commit from rest still departs, so the keyboard route is not a special case',
  murciaDeparturePose(targets, dollyAmount(WARP_TRANSITION.cut, WARP_LIMITS).amount).distance >
    targets.restDistance,
  'the accessible control commits outright from wherever the viewer is, including depth 0',
);

// ── Earth: the band and the dolly are the same multiplication ──

const earthRest = INTERACTION_CONFIG.camera.overviewRadius;

check(
  'zooming in moves toward Murcia and zooming out away from it',
  earthZoomRadius(1) < earthRest && earthZoomRadius(-1) > earthRest,
  `${earthZoomRadius(-1).toFixed(1)} <- ${earthRest} -> ${earthZoomRadius(1).toFixed(1)} — ` +
    "+1 faces the other world in both experiences, which is the band's whole convention",
);
check(
  'the depth is exactly 1 at rest',
  earthZoomScale(0) === 1,
  'the arriving warp pulls back to a hardcoded EARTH_REST, so this has to match to the bit',
);

// Earth's continuity is structural rather than tuned: `applyWarp` captures
// `cam.position` and multiplies it, so the cinematic is relative to the zoom by
// construction. What has to be checked is where that composition ENDS.
const earthClosest = earthZoomRadius(1) * earthRadiusScale(dollyAmount(WARP_TRANSITION.cut, WARP_LIMITS).amount, WARP_LIMITS);
check(
  'a commit from full zoom-in still stops outside the planet',
  earthClosest > EARTH_CONFIG.radius,
  `closest approach ${earthClosest.toFixed(2)} against a planet of radius ${EARTH_CONFIG.radius} — ` +
    'the dolly multiplies whatever radius the viewer left, so the zoom and the warp compound',
);
check(
  'and a commit from full zoom-out is still a real approach',
  earthZoomRadius(-1) * earthRadiusScale(dollyAmount(WARP_TRANSITION.cut, WARP_LIMITS).amount, WARP_LIMITS) < earthRest,
  `${(earthZoomRadius(-1) * earthRadiusScale(dollyAmount(WARP_TRANSITION.cut, WARP_LIMITS).amount, WARP_LIMITS)).toFixed(1)} ` +
    `from ${earthZoomRadius(-1).toFixed(1)} — the furthest a viewer can park is still inside the cut`,
);

// The lens. The scrub used to hold the FOV at rest and hand the cinematic a
// 14.5 degree disagreement to blend away over FOV_CATCHUP_SECONDS. A zoom never
// touches the lens at all, so the disagreement is the same one and the catch-up
// is still load-bearing — if this stops being true it is dead weight.
check(
  'the commit inherits a lens the cinematic immediately disagrees with',
  earthFov(WARP_TRANSITION.cut, WARP_LIMITS) - WARP_TRANSITION.earthRestFov > 10,
  `the zoom holds the lens at ${WARP_TRANSITION.earthRestFov} deg and the cinematic peaks at ` +
    `${earthFov(WARP_TRANSITION.cut, WARP_LIMITS).toFixed(1)} deg — blended over FOV_CATCHUP_SECONDS rather than cut`,
);

// What the gesture actually looks like, which is not the same as how far the
// camera moved. Angular size goes as 1/distance AND as 1/tan(fov/2). This is why
// the zoom must not write a FOV: the scrub did, for continuity with the
// cinematic, and the two fought — the dolly magnified x1.587 across the band
// while the surge de-magnified x0.725, so the net PEAKED at half a gesture and
// went backwards after it. A control that means "bring it closer" cannot shrink
// what it is driving.
const zoomScale = (depth: number) => earthRest / earthZoomRadius(depth);
let zoomMonotone = true;
for (let i = 1; i < zoomDepths.length; i++) {
  if (zoomScale(zoomDepths[i]) <= zoomScale(zoomDepths[i - 1])) zoomMonotone = false;
}
check(
  'more zoom always makes the world bigger, across the whole band',
  zoomMonotone,
  `on-screen scale runs x${zoomScale(-1).toFixed(3)} -> x${zoomScale(1).toFixed(3)}, strictly ` +
    `increasing across ${zoomDepths.length} samples`,
);
check(
  'and each half is worth a scale change a person can see',
  zoomScale(1) > 1.5 && zoomScale(-1) < 0.67,
  `x${zoomScale(1).toFixed(3)} in, x${zoomScale(-1).toFixed(3)} out — below about 1.5 either ` +
    'way the control stops reading as a zoom',
);

// ---------------------------------------------------------------------------
// Counted live. The literal that used to sit here said 32 while this file ran
// 36 assertions — it had drifted by four without anyone noticing, which is the
// whole argument for not writing the number down twice.
finish();
