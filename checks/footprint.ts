/**
 * Footprint safety of every distance the camera can reach.  `npm run check:footprint`
 *
 * This is the check that has to exist.
 *
 * The further back the camera sits, the further its corner rays reach across the
 * ground, and the terrain skirt is the only thing keeping the hard plate edge out of
 * frame. Worse, distance spends that skirt *unevenly*: the footprint of a yawed
 * frustum measured against a plate-aligned rectangle is worst on wide viewports at
 * oblique azimuths, so a distance a few units too great looks perfect on the 16:9
 * monitor it was chosen on and shows the edge of the world to an ultrawide visitor.
 * PROJECT_MEMORY, "The number that can hurt you", records that regression happening
 * once already.
 *
 * WHAT THIS GUARDS. It was `check:zoom`, and it measured the user zoom band’s
 * `maxDistanceScale` — the one number in that band that was a MEASUREMENT rather than
 * a judgement, because zooming out was the direction that spent skirt. `adr/009`
 * removed zoom from the product and the sweep shrank to the focus-flight range, which
 * only moves inward. `adr/014` put a zoom back, so this file is once again the gate
 * that decides how far out a viewer may go — and once again the reason a config
 * number may not simply be retuned by eye.
 *
 * What is different the second time round is that the far end is not a distance. A
 * pull-back at the resting pitch runs out of skirt almost immediately; the band
 * RISES as it recedes, and steepening the pitch shrinks the ground footprint faster
 * than the extra distance grows it (ADR 006). So the sweep runs over the real
 * `murciaZoomPose` — distance and elevation together — rather than over a scale.
 *
 * Two things move the camera and they COMPOSE, so both are swept together:
 *
 *   the zoom   — a pose the viewer parks at, anywhere from the near end out to
 *                `zoomFarDistance`. Persistent, so every pose in it is one they can
 *                sit and look at rather than pass through.
 *   a flight   — a district dolly, which multiplies whatever distance the zoom
 *                resolved to and may only ever move inward.
 *
 * A viewer can zoom out and then open a district, so the grid is genuinely
 * two-dimensional and not the union of two axes.
 *
 * The worst case is expected at REST — the pose nobody chose — and section 3 asserts
 * that rather than assuming it. That is a stronger result than it sounds: the band
 * shrinks the footprint in BOTH directions, inward by shortening the distance and
 * outward by rising faster than it recedes, so rest is a local maximum and every pose
 * the viewer can reach has more skirt margin than the one they started from. The day
 * the rise stops out-running the recession, the worst case moves to the far end and
 * that assertion is what says so.
 *
 * Same rule as the rest of checks/: the real placement maths (`applyPoseToCamera` +
 * `scalePoseDistance`), the real footprint maths (`computeGroundFootprint`), the real
 * bounds derivation (`computeEffectiveBounds`) and the real visual extent
 * (`terrainVisualBounds`). A guard that asserts a reimplementation guards nothing.
 *
 * The assertion is deliberately stronger than "nothing visibly breaks": the navigable
 * area must stay the whole plate at every distance. Neither a flight nor a zoom may
 * cost a single unit of it. A weaker bound would pass while quietly dragging the
 * focus toward the plate centre, which reads as the controls fighting back rather
 * than as a limit.
 */
import * as THREE from 'three';

import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import {
  applyPoseToCamera,
  scalePoseDistance,
} from '../src/experiences/murcia/camera/applyPoseToCamera';
import {
  murciaZoomPose,
  murciaZoomTargets,
} from '../src/experiences/murcia/camera/zoomPose';
import {
  computeGroundFootprint,
  computeEffectiveBounds,
} from '../src/experiences/murcia/navigation/viewportFootprint';
import type { GroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import { terrainVisualBounds } from '../src/experiences/murcia/environment/createTerrainTransition';
import type { BoundsRect } from '../src/experiences/murcia/config/environmentConfig';
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';

import { banner, check, finish, section } from './lib/assert';


const nav = murciaConfig.navigation;
const flight = murciaConfig.focusFlight;

// The pose a viewport actually resolves to, not the configured literal. They are the
// same today because `cameraPortraitOverrides` is null, and reading it through the
// resolver is what makes this check keep telling the truth on the day it is not.
const restPose = resolveCameraPose(murciaConfig, 16 / 9);
const zoomBand = murciaZoomTargets(murciaConfig, restPose);

banner('Ground footprint — no reachable pose may out-reach the skirt');

// ---------------------------------------------------------------------------
section('1. The reachable range is coherent before anything is measured against it');

check(
  'the flight floor is inward of rest',
  flight.minDistanceScale > 0 && flight.minDistanceScale < 1,
  `${flight.minDistanceScale} — a floor at or above 1 would ask a flight to dolly OUT, which is ` +
    'the direction that spends skirt margin and the reason this file exists',
);

check(
  'the zoom band brackets rest, out one way and in the other',
  zoomBand.nearDistance < restPose.distance && zoomBand.farDistance > restPose.distance,
  `${zoomBand.nearDistance.toFixed(1)} .. ${restPose.distance} .. ${zoomBand.farDistance} — ` +
    'a band that did not straddle rest would leave the viewer unable to get back to the pose ' +
    'the city was composed for',
);

// THE reason the far end is reachable at all. Distance alone cannot buy it: at the
// resting 30 deg, ground reach grows about 1.33 units per unit of distance and rest
// already spends all but ~59 units of skirt. The rise is what pays.
check(
  'the far end rises as it recedes',
  zoomBand.farElevation > zoomBand.restElevation,
  `${zoomBand.restElevation} deg -> ${zoomBand.farElevation} deg over ` +
    `${(zoomBand.farDistance - restPose.distance).toFixed(1)} extra units — pulling back at the ` +
    'resting pitch would put the plate edge on screen, and only on wide viewports',
);

// Below roughly 60 units the fixed lookAtHeight tilts the camera up faster than
// the shorter distance narrows the view, and the footprint starts GROWING again
// as the camera flies in. That would silently invert the direction this whole check
// assumes is safe.
//
// Measured at the compound minimum, which is a real place: zoom fully in, then open
// a district. The two floors multiply, and neither one alone would find this.
const closestDistance = zoomBand.nearDistance * flight.minDistanceScale;
check(
  'the closest approach stays above the footprint inversion floor',
  closestDistance > 60,
  `${closestDistance.toFixed(1)} units (floor ~60) — full zoom-in then a district flight, so the ` +
    'two floors compound; below this the fixed lookAtHeight widens the footprint again and ' +
    'flying IN stops being the safe direction',
);

// ---------------------------------------------------------------------------
section('2. The whole plate stays navigable at every reachable pose');

// 3.56 is 5120x1440, the binding case the skirt was sized against. Azimuth
// steps of 5 rather than warp-transition's 15 because azimuth is the binding
// term here — the worst case sits near yaw 30, which a coarser sweep steps over.
const ASPECTS: Array<[string, number]> = [
  ['16:9', 16 / 9],
  ['21:9', 21 / 9],
  ['5120x1440', 5120 / 1440],
  ['portrait', 0.5],
];
const YAW_STEP = 5;
// Coarser per axis than the single axis this replaced, because the grid is now the
// PRODUCT of two. The fine resolution moved to section 3, which sweeps each axis on
// its own at the binding aspect and yaw — which is where a non-monotonic interior
// would show up, and it is the only thing the density was ever buying.
const DEPTH_STEPS = 20;
const SCALE_STEPS = 20;

const plate: BoundsRect = { ...murciaConfig.contentBounds };
const visualBounds = terrainVisualBounds(plate, murciaConfig.terrainTransition);

const camera = new THREE.PerspectiveCamera();
const focus = new THREE.Vector3();

/**
 * The camera exactly where the application would put it: the zoom resolves a pose,
 * the flight scales its distance.
 *
 * The composition order is `MurciaExperience.applyRigPose` followed by
 * `CameraRig.getEffectivePose`, and it matters — a flight scales the ZOOMED distance,
 * not the configured one, so the two multiply rather than one overriding the other.
 */
function poseFor(depth: number, scale: number) {
  const zoomed = murciaZoomPose(zoomBand, depth);
  return scalePoseDistance(
    { ...restPose, distance: zoomed.distance, elevationDegrees: zoomed.elevationDegrees },
    scale,
  );
}

function footprintAt(
  depth: number,
  scale: number,
  aspect: number,
  yaw: number,
  at: THREE.Vector3,
): GroundFootprint {
  camera.aspect = aspect;
  applyPoseToCamera(camera, poseFor(depth, scale), at, yaw);
  return computeGroundFootprint(camera, at, nav.groundPlaneHeight, nav.maxGroundDistance);
}

function maxReach(f: GroundFootprint): number {
  return Math.max(f.reachNegX, f.reachPosX, f.reachNegZ, f.reachPosZ);
}

/**
 * How much room is left over on the tightest side.
 *
 * Positive means the footprint term did not bind — the navigable area is the
 * full plate and this many units of skirt were never needed. Negative means the
 * area has already been eaten into, and the focus is being pulled off the plate
 * corners.
 */
function slack(f: GroundFootprint): number {
  return Math.min(
    plate.minX - (visualBounds.minX + f.reachNegX + nav.edgeSafetyMargin),
    visualBounds.maxX - f.reachPosX - nav.edgeSafetyMargin - plate.maxX,
    plate.minZ - (visualBounds.minZ + f.reachNegZ + nav.edgeSafetyMargin),
    visualBounds.maxZ - f.reachPosZ - nav.edgeSafetyMargin - plate.maxZ,
  );
}

function rectsMatch(a: BoundsRect, b: BoundsRect, tolerance: number): boolean {
  return (
    Math.abs(a.minX - b.minX) <= tolerance &&
    Math.abs(a.maxX - b.maxX) <= tolerance &&
    Math.abs(a.minZ - b.minZ) <= tolerance &&
    Math.abs(a.maxZ - b.maxZ) <= tolerance
  );
}

let worstSlack = Infinity;
let worstLabel = '';
let worstDepth = 0;
let shrunk = false;
let shrunkLabel = '';
let anyClamped = false;
let clampedLabel = '';
let samples = 0;

for (const [aspectName, aspect] of ASPECTS) {
  for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
    for (let d = 0; d <= DEPTH_STEPS; d++) {
      // The whole band, near end to far end. `adr/014` put the outward half back:
      // rest is no longer the furthest the camera can be.
      const depth = -1 + (2 * d) / DEPTH_STEPS;

      for (let i = 0; i <= SCALE_STEPS; i++) {
        // Flight floor to no flight at all. Only ever inward of the zoom.
        const scale =
          flight.minDistanceScale + (1 - flight.minDistanceScale) * (i / SCALE_STEPS);

        // The focus is measured at the plate corners, not at the centre: the
        // navigable area is the whole plate, so a corner is a position the user
        // can actually reach, and it is where the footprint has least room.
        for (const [cx, cz] of [
          [plate.minX, plate.minZ],
          [plate.maxX, plate.minZ],
          [plate.minX, plate.maxZ],
          [plate.maxX, plate.maxZ],
        ]) {
          focus.set(cx, 0, cz);
          const f = footprintAt(depth, scale, aspect, yaw, focus);
          samples++;

          const pose = poseFor(depth, scale);
          const label =
            `${aspectName} yaw ${yaw} zoom ${depth.toFixed(2)} flight ${scale.toFixed(3)} ` +
            `(d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)})`;

          if (f.clampedRays && !anyClamped) {
            anyClamped = true;
            clampedLabel = label;
          }

          const s = slack(f);
          if (s < worstSlack) {
            worstSlack = s;
            worstLabel = label;
            worstDepth = depth;
          }

          const effective = computeEffectiveBounds(plate, visualBounds, f, nav.edgeSafetyMargin);
          if (!shrunk && !rectsMatch(effective, plate, 1e-6)) {
            shrunk = true;
            shrunkLabel = label;
          }
        }
      }
    }
  }
}

check(
  'no reachable pose costs a unit of navigable area',
  !shrunk,
  shrunk
    ? `the area shrank inside the plate at ${shrunkLabel} — the focus would be pulled off the corners`
    : `the full plate stays reachable across ${samples} samples`,
);
check(
  'the skirt still has room to spare at the worst case',
  worstSlack > 0,
  `worst slack ${worstSlack >= 0 ? '+' : ''}${worstSlack.toFixed(1)} units at ${worstLabel} ` +
    `(skirt width ${murciaConfig.terrainTransition.width})`,
);
check(
  'no frustum corner misses the ground plane',
  !anyClamped,
  anyClamped
    ? `clamped at ${clampedLabel} — a clamped ray UNDER-reports the footprint, which is the ` +
      'unsafe direction: the maths then believes the view is smaller than it is'
    : 'every corner ray hits the ground at every scale, so no reach is under-reported',
);

// ---------------------------------------------------------------------------
section('3. The check is bounding the end that actually grows');

// If these failed, the sweep above would be proving something about the wrong end of
// the range and its pass would mean nothing.
const centre = new THREE.Vector3(murciaConfig.initialFocus.x, 0, murciaConfig.initialFocus.z);
const binding = 5120 / 1440;
const reachFloor = maxReach(footprintAt(0, flight.minDistanceScale, binding, 30, centre));
const reachRest = maxReach(footprintAt(0, 1, binding, 30, centre));

check(
  'reach grows monotonically with a flight distance',
  reachFloor < reachRest,
  `${reachFloor.toFixed(1)} < ${reachRest.toFixed(1)} units (5120x1440, yaw 30)`,
);

// The property that makes a focus flight safe at all, asserted rather than assumed:
// dollying IN never grows the footprint anywhere between the floor and rest. The old
// three-point version of this could not see a non-monotonic interior, and the whole
// reason a floor exists is that the relationship DOES invert somewhere below it.
//
// Run at BOTH ends of the zoom band, because the flight now starts from wherever the
// zoom left the camera and the elevation differs by 22 degrees between them.
for (const [name, depth] of [
  ['at rest', 0],
  ['from full zoom-out', 1],
  ['from full zoom-in', -1],
] as Array<[string, number]>) {
  const STEPS = 200;
  let previous = Infinity;
  let monotone = true;
  let brokeAt = 0;
  for (let i = STEPS; i >= 0; i -= 1) {
    const scale = flight.minDistanceScale + (1 - flight.minDistanceScale) * (i / STEPS);
    const reach = maxReach(footprintAt(depth, scale, binding, 30, centre));
    if (reach > previous + 1e-9) {
      monotone = false;
      brokeAt = scale;
      break;
    }
    previous = reach;
  }
  check(
    `and a flight shrinks it monotonically to the floor, ${name}`,
    monotone,
    monotone
      ? `${STEPS + 1} samples down to scale ${flight.minDistanceScale}, never widening`
      : `reach GREW while flying in, at scale ${brokeAt.toFixed(4)} — the floor is too low`,
  );
}

// THE measurement `zoomFarDistance` / `zoomFarElevationDegrees` were chosen against.
//
// Zooming out is the only thing in the product that moves the camera further from the
// city than the pose it was composed for, so this is the assertion the whole file
// exists to make. It is a claim about the ARC, not about either number: distance and
// elevation are tuned together and only their combination is safe. Raising
// `zoomFarDistance` alone fails here, which is the point.
//
// Swept away from rest in each direction rather than across the band in one pass,
// because the two halves are not one curve. Rest is a maximum, so a single sweep from
// -1 to +1 would climb before it fell and could report nothing useful about either.
for (const [name, endDepth, why] of [
  [
    'zooming OUT shrinks it, because the rise outruns the recession',
    1,
    'the elevation is not keeping up with the distance there, and the arc has to be re-tuned ' +
      'as a pair rather than one number at a time',
  ],
  [
    'zooming IN shrinks it too, so neither half of the band costs skirt',
    -1,
    'flying in is supposed to be free — if it widens the footprint the near end is below the ' +
      'pitch collapse and section 1 is measuring the wrong floor',
  ],
] as Array<[string, number, string]>) {
  const STEPS = 400;
  let previous = Infinity;
  let monotone = true;
  let brokeAt = 0;
  for (let i = 0; i <= STEPS; i++) {
    const depth = (endDepth * i) / STEPS;
    const reach = maxReach(footprintAt(depth, 1, binding, 30, centre));
    if (reach > previous + 1e-9) {
      monotone = false;
      brokeAt = depth;
      break;
    }
    previous = reach;
  }
  check(
    name,
    monotone,
    monotone
      ? `${STEPS + 1} samples from rest out to depth ${endDepth}, never widening`
      : `reach GREW at depth ${brokeAt.toFixed(4)} — ${why}`,
  );
}

// So the worst case sits at REST, the one pose nobody chose. That is the shape the
// band is supposed to have: both halves move the camera somewhere with MORE skirt
// margin than it started with, which is why a viewer cannot zoom themselves into
// seeing the edge of the world.
//
// It is also the assertion that fails first if the far end is ever pushed out without
// the pitch to pay for it — the worst slack moves to depth +1 and lands here before it
// lands in section 2, with a message that says which knob moved.
const depthStep = 2 / DEPTH_STEPS;
check(
  'the worst case is the resting pose, which is what the band is measured against',
  Math.abs(worstDepth) <= depthStep * 1.5,
  `worst slack found at depth ${worstDepth.toFixed(3)} — every pose the viewer can zoom to is ` +
    'either nearer than rest or steeper than it, and both directions buy margin back',
);

// ---------------------------------------------------------------------------
finish();
