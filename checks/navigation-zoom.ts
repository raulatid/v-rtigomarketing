/**
 * Footprint safety of the user zoom band.  `npm run check:zoom`
 *
 * This is the check that has to exist.
 *
 * Zoom-in is free — pulling closer shrinks the viewport's ground footprint, so
 * nothing downstream is at risk. Zoom-OUT spends the terrain skirt: the further
 * back the camera sits, the further its corner rays reach across the ground,
 * and the skirt is the only thing keeping the hard plate edge out of frame.
 * Worse, it spends it *unevenly*. The footprint of a yawed frustum measured
 * against a plate-aligned rectangle is worst on wide viewports at oblique
 * azimuths, so a `maxDistanceScale` that is a few hundredths too high looks
 * perfect on the 16:9 monitor it was chosen on and shows the edge of the world
 * to an ultrawide visitor. PROJECT_MEMORY, "The number that can hurt you",
 * records that regression happening once already.
 *
 * So `navigation.zoom.maxDistanceScale` is a MEASUREMENT, and this is where it
 * is measured. Same rule as the rest of checks/: the real placement maths
 * (`applyPoseToCamera` + `scalePoseDistance`), the real footprint maths
 * (`computeGroundFootprint`), the real bounds derivation
 * (`computeEffectiveBounds`) and the real visual extent
 * (`terrainVisualBounds`). A guard that asserts a reimplementation guards
 * nothing.
 *
 * The assertion is deliberately stronger than "nothing visibly breaks": the
 * navigable area must stay the whole plate at every scale. Zoom-out must not
 * cost a single unit of it. A weaker bound would pass while quietly dragging
 * the focus toward the plate centre as the user zoomed out, which reads as the
 * controls fighting back rather than as a limit.
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

import { banner, check as rawCheck, finish, section } from './lib/assert';

const check = (label: string, ok: boolean, detail = '') => rawCheck(label, ok, detail, 58);

const nav = murciaConfig.navigation;
const zoom = nav.zoom;

banner('Navigation zoom — the band must not out-reach the skirt');

// ---------------------------------------------------------------------------
section('1. The band is coherent before anything is measured against it');

check(
  'the band straddles the resting distance',
  zoom.minDistanceScale < 1 && zoom.maxDistanceScale > 1,
  `${zoom.minDistanceScale} .. ${zoom.maxDistanceScale} — a band that excludes 1 means the ` +
    'resting pose is unreachable, and every other number here was measured at it',
);

// Below roughly 60 units the fixed lookAtHeight tilts the camera up faster than
// the shorter distance narrows the view, and the footprint starts GROWING again
// as you zoom in. That would silently invert the direction this whole check
// assumes is safe.
const closestDistance = murciaConfig.camera.distance * zoom.minDistanceScale;
check(
  'the closest approach stays above the footprint inversion floor',
  closestDistance > 60,
  `${closestDistance.toFixed(1)} units (floor ~60) — below this the fixed lookAtHeight widens ` +
    'the footprint again and zooming IN stops being the safe direction',
);

check(
  'the wheel cannot cross the band in a single event',
  Math.exp(120 * zoom.wheelSensitivity * zoom.ctrlWheelMultiplier) <
    zoom.maxDistanceScale / zoom.minDistanceScale,
  'one capped wheel event must not jump end to end, or the band has no interior to aim in',
);

// ---------------------------------------------------------------------------
section('2. The whole plate stays navigable at every scale');

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
  applyPoseToCamera(camera, scalePoseDistance(murciaConfig.camera, scale), at, yaw);
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
      const scale =
        zoom.minDistanceScale +
        (zoom.maxDistanceScale - zoom.minDistanceScale) * (i / SCALE_STEPS);

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
  'zoom never costs a unit of navigable area',
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

// If this failed, the sweep above would be proving something about the wrong
// end of the band and its pass would mean nothing.
const centre = new THREE.Vector3(murciaConfig.initialFocus.x, 0, murciaConfig.initialFocus.z);
const binding = 5120 / 1440;
const reachMin = maxReach(footprintAt(zoom.minDistanceScale, binding, 30, centre));
const reachRest = maxReach(footprintAt(1, binding, 30, centre));
const reachMax = maxReach(footprintAt(zoom.maxDistanceScale, binding, 30, centre));

check(
  'reach grows monotonically with distance',
  reachMin < reachRest && reachRest < reachMax,
  `${reachMin.toFixed(1)} < ${reachRest.toFixed(1)} < ${reachMax.toFixed(1)} units ` +
    '(5120x1440, yaw 30)',
);

// The binding sample must sit at the far end of the band. If the worst case
// were anywhere else, section 2 would be bounding something other than the
// growth this whole check exists to bound, and its pass would mean nothing
// about raising maxDistanceScale.
const scaleStep = (zoom.maxDistanceScale - zoom.minDistanceScale) / SCALE_STEPS;
check(
  'the worst case is at full zoom-out, not somewhere in the interior',
  worstScale >= zoom.maxDistanceScale - scaleStep * 1.5,
  `worst slack found at scale ${worstScale.toFixed(3)} of ${zoom.maxDistanceScale} — ` +
    'the ceiling is what section 2 is really asserting',
);

// ---------------------------------------------------------------------------
finish();
