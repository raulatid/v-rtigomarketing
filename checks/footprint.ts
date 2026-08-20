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
 * WHAT THIS USED TO GUARD, AND WHY IT STILL EXISTS. It was `check:zoom`, and it
 * measured the user zoom band’s `maxDistanceScale` — the one number in that
 * band that was a MEASUREMENT rather than a judgement, because zooming out was the
 * direction that spent skirt. There is no zoom any more (`adr/009`), so that number
 * is gone and with it the only way a *user* could grow the footprint.
 *
 * It would have been easy to delete this file along with the feature. That would have
 * retired the only place in the repository where the resting footprint is measured
 * against the real skirt across aspect x azimuth x plate corner — a property that was
 * never about zoom, only ever exercised through it. What changed is the range: the
 * sweep now runs from the focus-flight floor up to REST, because a flight is the only
 * thing left that moves distance and it may only move inward.
 *
 * That also inverts where the worst case lives. It used to be full zoom-out, the far
 * end of the band; it is now the RESTING pose, because nothing may reach further than
 * rest. Section 3 asserts that inversion rather than assuming it.
 *
 * Same rule as the rest of checks/: the real placement maths (`applyPoseToCamera` +
 * `scalePoseDistance`), the real footprint maths (`computeGroundFootprint`), the real
 * bounds derivation (`computeEffectiveBounds`) and the real visual extent
 * (`terrainVisualBounds`). A guard that asserts a reimplementation guards nothing.
 *
 * The assertion is deliberately stronger than "nothing visibly breaks": the navigable
 * area must stay the whole plate at every distance. A flight must not cost a single
 * unit of it. A weaker bound would pass while quietly dragging the focus toward the
 * plate centre, which reads as the controls fighting back rather than as a limit.
 */
import * as THREE from 'three';

import { murciaConfig } from '../src/experiences/murcia/config/murciaConfig';
import {
  applyPoseToCamera,
  scalePoseDistance,
} from '../src/experiences/murcia/camera/applyPoseToCamera';
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

banner('Ground footprint — no reachable distance may out-reach the skirt');

// ---------------------------------------------------------------------------
section('1. The flight range is coherent before anything is measured against it');

check(
  'the flight floor is inward of rest',
  flight.minDistanceScale > 0 && flight.minDistanceScale < 1,
  `${flight.minDistanceScale} — a floor at or above 1 would ask a flight to dolly OUT, which is ` +
    'the direction that spends skirt margin and the reason this file exists',
);

// Below roughly 60 units the fixed lookAtHeight tilts the camera up faster than
// the shorter distance narrows the view, and the footprint starts GROWING again
// as the camera flies in. That would silently invert the direction this whole check
// assumes is safe.
const closestDistance = restPose.distance * flight.minDistanceScale;
check(
  'the closest approach stays above the footprint inversion floor',
  closestDistance > 60,
  `${closestDistance.toFixed(1)} units (floor ~60) — below this the fixed lookAtHeight widens ` +
    'the footprint again and flying IN stops being the safe direction',
);

// ---------------------------------------------------------------------------
section('2. The whole plate stays navigable at every reachable distance');

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
const SCALE_STEPS = 200;

const plate: BoundsRect = { ...murciaConfig.contentBounds };
const visualBounds = terrainVisualBounds(plate, murciaConfig.terrainTransition);

const camera = new THREE.PerspectiveCamera();
const focus = new THREE.Vector3();

function footprintAt(scale: number, aspect: number, yaw: number, at: THREE.Vector3): GroundFootprint {
  camera.aspect = aspect;
  applyPoseToCamera(camera, scalePoseDistance(restPose, scale), at, yaw);
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
let worstScale = 0;
let shrunk = false;
let shrunkLabel = '';
let anyClamped = false;
let clampedLabel = '';
let samples = 0;

for (const [aspectName, aspect] of ASPECTS) {
  for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
    for (let i = 0; i <= SCALE_STEPS; i++) {
      // Floor to REST, not to a zoom ceiling. Rest is the furthest the camera can be.
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
        const f = footprintAt(scale, aspect, yaw, focus);
        samples++;

        const label =
          `${aspectName} yaw ${yaw} scale ${scale.toFixed(3)} ` +
          `(d=${(murciaConfig.camera.distance * scale).toFixed(1)})`;

        if (f.clampedRays && !anyClamped) {
          anyClamped = true;
          clampedLabel = label;
        }

        const s = slack(f);
        if (s < worstSlack) {
          worstSlack = s;
          worstLabel = label;
          worstScale = scale;
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

check(
  'no reachable distance costs a unit of navigable area',
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

// If this failed, the sweep above would be proving something about the wrong end of
// the range and its pass would mean nothing.
const centre = new THREE.Vector3(murciaConfig.initialFocus.x, 0, murciaConfig.initialFocus.z);
const binding = 5120 / 1440;
const reachFloor = maxReach(footprintAt(flight.minDistanceScale, binding, 30, centre));
const reachRest = maxReach(footprintAt(1, binding, 30, centre));

check(
  'reach grows monotonically with distance',
  reachFloor < reachRest,
  `${reachFloor.toFixed(1)} < ${reachRest.toFixed(1)} units (5120x1440, yaw 30)`,
);

// The property that makes a focus flight safe at all, asserted rather than assumed:
// dollying IN never grows the footprint anywhere between the floor and rest. The old
// three-point version of this could not see a non-monotonic interior, and the whole
// reason a floor exists is that the relationship DOES invert somewhere below it.
{
  const STEPS = 200;
  let previous = Infinity;
  let monotone = true;
  let brokeAt = 0;
  for (let i = STEPS; i >= 0; i -= 1) {
    const scale = flight.minDistanceScale + (1 - flight.minDistanceScale) * (i / STEPS);
    const reach = maxReach(footprintAt(scale, binding, 30, centre));
    if (reach > previous + 1e-9) {
      monotone = false;
      brokeAt = scale;
      break;
    }
    previous = reach;
  }
  check(
    'and shrinks monotonically all the way in to the floor',
    monotone,
    monotone
      ? `${STEPS + 1} samples from rest to ${flight.minDistanceScale}, never widening`
      : `reach GREW while flying in, at scale ${brokeAt.toFixed(4)} — the floor is too low`,
  );
}

// The worst case must sit at REST. This inverted with `adr/009`: it used to be full
// zoom-out, the far end of a band that reached past rest. Nothing reaches past rest
// now, so if the worst slack were found in the interior, section 2 would be bounding
// something other than the distance that actually costs skirt.
const scaleStep = (1 - flight.minDistanceScale) / SCALE_STEPS;
check(
  'the worst case is at the resting pose, not somewhere in the interior',
  worstScale >= 1 - scaleStep * 1.5,
  `worst slack found at scale ${worstScale.toFixed(3)} of 1 — rest is what section 2 is ` +
    'really asserting, and every other pose is inward of it',
);

// ---------------------------------------------------------------------------
finish();
