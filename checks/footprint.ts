/**
 * Footprint safety of every distance the camera can reach.  `npm run check:footprint`
 *
 * This is the check that has to exist.
 *
 * The further back the camera sits, the further its corner rays reach across the
 * ground, and the terrain skirt is the only thing keeping the hard edge of the world
 * out of frame. Worse, distance spends that skirt *unevenly*: the footprint of a yawed
 * frustum measured against an axis-aligned rectangle is worst on wide viewports at
 * oblique azimuths, so a distance a few units too great looks perfect on the 16:9
 * monitor it was chosen on and shows the edge of the world to an ultrawide visitor.
 * PROJECT_MEMORY, "The number that can hurt you", records that regression happening
 * once already.
 *
 * WHAT THE SKIRT WRAPS CHANGED ON 2026-09-04, and it is the difference between the two
 * halves of this file. The 352-unit authored plate used to be the whole world; it now
 * sits in the middle of `SUELO_CIUDAD`, a 2170 x 1925 filler city, and the skirt wraps
 * THAT. The client asked for a low, horizontal arrival, and 19 degrees puts the horizon
 * in frame — which is only sayable because there is 741 units of city out there in the
 * thinnest direction before anything ends.
 *
 * The consequence for this file is that REACH STOPPED BEING A MEASUREMENT. A frustum
 * that passes the horizon has no ground intersection at its top corners, so
 * `computeGroundFootprint` returns the `maxGroundDistance` clamp. Section 2 still
 * sweeps it and still refuses to give up a unit of navigable area — that assertion got
 * stronger, not weaker, and it passes with hundreds of units to spare. Section 3 used
 * to assert that reach shrinks away from rest in both directions; six assertions about
 * a quantity that is now a constant. It states what actually holds the line instead,
 * and says so in place rather than quietly dropping them.
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
 * The zoom band still moves the camera somewhere safer than rest in both directions —
 * inward by shortening the distance, outward by rising faster than it recedes (ADR 006)
 * — and section 1 still asserts the shape that makes that true. What is no longer
 * asserted is that rest is therefore the WORST case: with every low pose clamped, the
 * worst slack lands at the near end, and it lands there at +700 units.
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
  computeStationLimitedBounds,
} from '../src/experiences/murcia/navigation/viewportFootprint';
import type { GroundFootprint } from '../src/experiences/murcia/navigation/viewportFootprint';
import { terrainVisualBounds } from '../src/experiences/murcia/environment/createTerrainTransition';
import type { BoundsRect } from '../src/experiences/murcia/config/environmentConfig';
import { resolveCameraPose } from '../src/experiences/murcia/config/environmentConfig';
import { clampToRect, containsRect } from '../src/experiences/murcia/navigation/navigationBounds';

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

// THE reason the far end is reachable at all, and the reason it is still asserted now
// that reach is clamped rather than measured: the rise is also what takes the horizon
// back OUT of frame on the way out. At 19 deg the resting frustum passes the horizon;
// at 55 deg no ground edge enters it at any aspect or yaw. So zooming out puts the lid
// back on the view, and a far end that receded without rising would take it off.
check(
  'the far end rises as it recedes',
  zoomBand.farElevation > zoomBand.restElevation,
  `${zoomBand.restElevation} deg -> ${zoomBand.farElevation} deg over ` +
    `${(zoomBand.farDistance - restPose.distance).toFixed(1)} extra units — pulling back at the ` +
    'resting pitch would leave the horizon in frame all the way out, and on wide viewports ' +
    'would reach the edge of the filler city with it',
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
const visualBounds = terrainVisualBounds(
  murciaConfig.groundBounds ?? plate,
  murciaConfig.terrainTransition,
);

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

function rect(r: BoundsRect): string {
  return `X [${r.minX.toFixed(0)}, ${r.maxX.toFixed(0)}] Z [${r.minZ.toFixed(0)}, ${r.maxZ.toFixed(0)}]`;
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
// This assertion has been `!anyClamped`, then `anyClamped`, and is now back —
// which is the whole history of Murcia's pitch, and worth keeping rather than
// tidying.
//
// A frustum that reaches past the horizon has no finite ground footprint:
// `computeGroundFootprint` returns the `maxGroundDistance` clamp rather than a
// measurement, and insetting the navigable area by a clamp drags the focus off
// the plate corners for a reach nobody measured. At 19 and then 18 degrees the
// horizon WAS in frame by client direction, so clamping was expected and the
// inset was switched off at load to stop it lying.
//
// The 2026-09-08 rise to 35 degrees (DECISIONS §39) put the horizon back out of
// frame at every reachable pose, so the footprint is a measurement again
// everywhere and the inset is back on. `NavigableArea.recompute` now asks per
// pose rather than trusting a load-time flag, so a future pitch that reopens the
// horizon degrades safely instead of silently — but this check is what says the
// question is not currently live, and it is the tripwire on lowering the pitch
// again.
check(
  'the horizon is out of frame everywhere, so the footprint is a measurement',
  !anyClamped,
  anyClamped
    ? `first clamped at ${clampedLabel} — a pose reaches past the horizon, so its footprint ` +
      'is the maxGroundDistance clamp and not a measurement. NavigableArea drops the inset ' +
      'for those poses, so this is not unsafe — but the pitch has been lowered back into ' +
      'the regime section 3 exists to survive, and §39 should be re-read before shipping it'
    : `no ray reached the clamp across ${samples} samples — every pose has a real ground ` +
      'footprint, which is what lets the inset be applied rather than disabled',
);

// ---------------------------------------------------------------------------
section('3. The world surrounds every pose the viewer can reach');

// WHAT USED TO BE HERE, and why it is not any more.
//
// Section 3 asserted that ground reach shrinks monotonically away from rest in both
// directions, and therefore that the worst case sits at the resting pose. Six
// assertions, all of them about the same quantity: how far the frustum reaches across
// the ground.
//
// That quantity stopped existing on 2026-09-04. At 19 degrees the resting frustum
// passes the horizon, so its reach is not a smaller or larger number than it used to
// be — it is unbounded, and `computeGroundFootprint` returns the `maxGroundDistance`
// clamp. Monotonicity assertions over a constant are not conservative, they are
// vacuous: they pass on every clamped pair and fail the moment one end stops clamping,
// which is the opposite of the signal they were written to give.
//
// The assertions were not retired because they became inconvenient. They were retired
// because the mechanism they guarded was replaced. Reach mattered while the skirt was
// the only thing between the frustum and the edge of the world; the skirt now wraps
// `SUELO_CIUDAD` and the edge of the world is 741 units past the plate before the
// skirt even starts. What has to be true instead is stated below, and it is checked
// against the same real `terrainVisualBounds` and the same real `applyPoseToCamera`.
//
// Section 2 above is unchanged and is now the stronger half of this file: it still
// sweeps 508k real poses and still refuses to let a single unit of navigable area go.

const groundRect = murciaConfig.groundBounds;
const transition = murciaConfig.terrainTransition;

check(
  'the model carries ground beyond the plate, which is what the low pose rests on',
  groundRect !== null,
  groundRect === null
    ? 'groundBounds is null — the plate is the whole world again, and a 19 degree pose ' +
      'puts its edge on screen. Either restore the ground or raise camera.elevationDegrees'
    : `plate ${rect(plate)} inside ground ${rect(groundRect)}`,
);

if (groundRect) {
  // How much filler city sits between the authored plate and the hard edge, per side.
  // The thinnest side is what every other number here is measured against.
  const headroom = Math.min(
    plate.minX - groundRect.minX,
    groundRect.maxX - plate.maxX,
    plate.minZ - groundRect.minZ,
    groundRect.maxZ - plate.maxZ,
  );

  check(
    'the plate sits strictly inside the ground, with room on every side',
    headroom > 0,
    `${headroom.toFixed(1)} units on the thinnest side — this is the distance the camera can ` +
      'look past the authored city before it is looking at the edge of the model',
  );

  // The skirt fades to fully transparent over `width * fadeEndFraction`; everything
  // past that is transparent geometry that exists only to guarantee coverage. So the
  // ground visibly ENDS at this radius, in a gradient, and the collar has to finish
  // well inside it or the terrain stops in a hard line instead of dissolving.
  const fadeWidth = transition.width * transition.fadeEndFraction;
  check(
    'the ground ends in a gradient, not a cut',
    transition.enabled && transition.collarWidth < fadeWidth && fadeWidth < transition.width,
    `collar ${transition.collarWidth} < fade ${fadeWidth.toFixed(1)} < skirt ${transition.width}` +
      (transition.enabled ? '' : ' — but the transition is DISABLED, so there is no gradient'),
  );

  // The one thing that would genuinely break: a camera that gets outside the skirt.
  // From out there the world is a rectangle floating in the background colour, and no
  // amount of fade helps. Measured through the real placement rather than
  // `distance * cos(elevation)`, so a change to `applyPoseToCamera` is caught too.
  const skirtOuter = terrainVisualBounds(groundRect, transition);
  let worstCameraMargin = Infinity;
  let cameraLabel = '';
  let furthestSkirtCorner = 0;

  for (const [aspectName, aspect] of ASPECTS) {
    for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
      for (const depth of [-1, 0, 1]) {
        for (const scale of [flight.minDistanceScale, 1]) {
          for (const [cx, cz] of [
            [plate.minX, plate.minZ],
            [plate.maxX, plate.minZ],
            [plate.minX, plate.maxZ],
            [plate.maxX, plate.maxZ],
          ]) {
            focus.set(cx, 0, cz);
            camera.aspect = aspect;
            applyPoseToCamera(camera, poseFor(depth, scale), focus, yaw);

            const margin = Math.min(
              camera.position.x - skirtOuter.minX,
              skirtOuter.maxX - camera.position.x,
              camera.position.z - skirtOuter.minZ,
              skirtOuter.maxZ - camera.position.z,
            );
            if (margin < worstCameraMargin) {
              worstCameraMargin = margin;
              cameraLabel = `${aspectName} yaw ${yaw} zoom ${depth} flight ${scale}`;
            }

            // The far plane has to clear the skirt, or its outer corner is clipped and
            // a straight line of background cuts across the ground as the viewer pans.
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

  check(
    'the camera never leaves the skirt, so the world always surrounds it',
    worstCameraMargin > 0,
    `worst margin ${worstCameraMargin >= 0 ? '+' : ''}${worstCameraMargin.toFixed(1)} units ` +
      `at ${cameraLabel} — outside this the ground is an island in the background colour`,
  );

  check(
    'the far plane clears the furthest skirt corner the camera can be from',
    restPose.far > furthestSkirtCorner,
    `far ${restPose.far} vs ${furthestSkirtCorner.toFixed(1)} units to the furthest corner — ` +
      'short of this the skirt is clipped, which reads as a moving line of background ' +
      'across the ground rather than as a distance',
  );

  // Anything past `maxGroundDistance` is reported as a clamp rather than a hit, and
  // section 2 takes that at face value. That is only honest while the clamp is inside
  // the ground: clamp beyond the far edge and the sweep would be measuring a footprint
  // over terrain that does not exist.
  check(
    'the footprint clamp lands on real ground rather than past the edge of it',
    nav.maxGroundDistance < headroom + fadeWidth,
    `${nav.maxGroundDistance} < ${(headroom + fadeWidth).toFixed(1)} (${headroom.toFixed(1)} of ` +
      `filler city + ${fadeWidth.toFixed(1)} of fade) — the clamp is a distance the viewer can ` +
      'actually see ground at, so section 2 is measuring something real',
  );
}

// ---------------------------------------------------------------------------
section('4. The camera never leaves the navigable area (DECISIONS §39)');

/*
 * The rule this file did NOT have.
 *
 * Section 3 bounds the camera against the SKIRT — the outer visual world, some
 * 2170 x 1925 units of filler city. That is the assertion that stops the ground
 * becoming an island in the background colour, and it is a low bar: an eye
 * hundreds of units off the authored plate, standing on empty filler and looking
 * back in at a district, clears it comfortably. That is exactly what shipped, and
 * exactly what was reported on 2026-09-08.
 *
 * §39 says the eye stays inside the NAVIGABLE rectangle. `NavigableArea` enforces
 * it by intersecting `computeStationLimitedBounds` into the effective area, which
 * works because the camera offset depends only on yaw, pitch and distance and
 * never on the focus — so "eye inside R" is itself a rectangle in focus space.
 *
 * BE PRECISE ABOUT WHAT THE FIRST ASSERTION PROVES, because it reads stronger
 * than it is. It clamps the plate corner into the station bounds and then measures
 * where `applyPoseToCamera` actually puts the eye — so given a correct station
 * term it is true by construction, and it passes at the 18 deg / 285 pose that
 * produced the bug report. It is not a check on whether the CONFIG is well chosen.
 *
 * What it does catch is the arithmetic drifting from the placement: a sign or axis
 * error in `computeStationLimitedBounds`, or a change to `applyPoseToCamera` that
 * stops the offset being independent of the focus — which is the assumption the
 * whole rectangle trick rests on. Negative control, 2026-09-08: flipping one sign
 * in the station term takes the worst margin to -229.8.
 *
 * The assertion that has teeth about the config is the SECOND one, and the number
 * to watch is its usable area: 114 x 115 at 35/220 against 65 x 66 at 18/285.
 *
 * Neither says anything about the term actually being wired into
 * `NavigableArea.recompute` — this file imports it directly, so deleting that call
 * would not fail here. `navigableArea.test.ts` guards the wiring. Both are needed.
 */

let worstStationMargin = Infinity;
let stationLabel = '';
let worstUsableWidth = Infinity;
let worstUsableDepth = Infinity;
let usableLabel = '';

// §40. The same sweep, against the rectangle a push may REACH rather than the one
// panning is 1:1 within. Gathered in the loop below and asserted in section 5.
const ring: BoundsRect = { ...nav.extendedBounds };
let worstRingMargin = Infinity;
let ringLabel = '';
let furthestPastPlate = 0;
let pastPlateLabel = '';
let ringContainsStationEverywhere = true;
let containmentLabel = '';
let worstRingUsableWidth = Infinity;
let worstRingUsableDepth = Infinity;

for (const [aspectName, aspect] of ASPECTS) {
  for (let yaw = 0; yaw < 360; yaw += YAW_STEP) {
    for (let d = 0; d <= DEPTH_STEPS; d++) {
      const depth = -1 + (2 * d) / DEPTH_STEPS;

      for (let i = 0; i <= SCALE_STEPS; i++) {
        const scale =
          flight.minDistanceScale + (1 - flight.minDistanceScale) * (i / SCALE_STEPS);

        const pose = poseFor(depth, scale);
        const label =
          `${aspectName} yaw ${yaw} zoom ${depth.toFixed(2)} flight ${scale.toFixed(3)} ` +
          `(d=${pose.distance.toFixed(1)} e=${pose.elevationDegrees.toFixed(1)})`;

        // The offset for this pose, read the way NavigableArea reads it — off the
        // placed camera about a focus at the origin, so a change to
        // `applyPoseToCamera` is caught here rather than reimplemented.
        camera.aspect = aspect;
        focus.set(0, 0, 0);
        applyPoseToCamera(camera, pose, focus, yaw);
        const station = computeStationLimitedBounds(
          plate,
          camera.position.x,
          camera.position.z,
          nav.edgeSafetyMargin,
        );

        if (station.maxX - station.minX < worstUsableWidth) {
          worstUsableWidth = station.maxX - station.minX;
          usableLabel = label;
        }
        worstUsableDepth = Math.min(worstUsableDepth, station.maxZ - station.minZ);

        // §40's rectangle, derived exactly as the runtime derives it.
        const ringStation = computeStationLimitedBounds(
          ring,
          camera.position.x,
          camera.position.z,
          nav.edgeSafetyMargin,
        );
        worstRingUsableWidth = Math.min(worstRingUsableWidth, ringStation.maxX - ringStation.minX);
        worstRingUsableDepth = Math.min(worstRingUsableDepth, ringStation.maxZ - ringStation.minZ);

        // The ramp needs the limit to contain the firm area. It does not in the
        // degenerate collapse, which `NavigableArea` handles by giving up the
        // band — this proves that fallback never fires inside the reachable band.
        if (!containsRect(ringStation, station)) {
          ringContainsStationEverywhere = false;
          containmentLabel = label;
        }

        for (const [cx, cz] of [
          [ring.minX, ring.minZ],
          [ring.maxX, ring.minZ],
          [ring.minX, ring.maxZ],
          [ring.maxX, ring.maxZ],
        ]) {
          const legal = clampToRect(cx!, cz!, ringStation);
          focus.set(legal.x, 0, legal.z);
          applyPoseToCamera(camera, pose, focus, yaw);

          const margin = Math.min(
            camera.position.x - ring.minX,
            ring.maxX - camera.position.x,
            camera.position.z - ring.minZ,
            ring.maxZ - camera.position.z,
          );
          if (margin < worstRingMargin) {
            worstRingMargin = margin;
            ringLabel = label;
          }

          // How far §40 actually lets the eye off the authored plate. Negative
          // margins are the measurement here, not a failure.
          const past = Math.max(
            plate.minX - camera.position.x,
            camera.position.x - plate.maxX,
            plate.minZ - camera.position.z,
            camera.position.z - plate.maxZ,
          );
          if (past > furthestPastPlate) {
            furthestPastPlate = past;
            pastPlateLabel = label;
          }
        }

        // Restore the pose the firm sweep below expects to read.
        focus.set(0, 0, 0);
        applyPoseToCamera(camera, pose, focus, yaw);

        // Every corner the viewer can drive the focus at, clamped into the area
        // the runtime would have given them.
        for (const [cx, cz] of [
          [plate.minX, plate.minZ],
          [plate.maxX, plate.minZ],
          [plate.minX, plate.maxZ],
          [plate.maxX, plate.maxZ],
        ]) {
          const legal = clampToRect(cx!, cz!, station);
          focus.set(legal.x, 0, legal.z);
          applyPoseToCamera(camera, pose, focus, yaw);

          const margin = Math.min(
            camera.position.x - plate.minX,
            plate.maxX - camera.position.x,
            camera.position.z - plate.minZ,
            plate.maxZ - camera.position.z,
          );
          if (margin < worstStationMargin) {
            worstStationMargin = margin;
            stationLabel = label;
          }
        }
      }
    }
  }
}

check(
  'the eye stays on the authored city at every reachable pose',
  worstStationMargin >= 0,
  `worst margin ${worstStationMargin >= 0 ? '+' : ''}${worstStationMargin.toFixed(1)} units at ` +
    `${stationLabel} — negative means the station arithmetic no longer agrees with where ` +
    'applyPoseToCamera puts the eye, so the clamp is bounding the wrong rectangle',
);

// A rule that pins the focus is not a rule anyone can navigate under, and the
// collapse is SILENT: `collapseIfInverted` degrades an over-constrained rectangle
// to a point rather than inverting it, so the failure mode of too much distance or
// too little pitch is a city that simply stops panning. This is what makes that
// loud. The floor is deliberately generous — it asks whether navigation still
// exists, not whether it feels right, which is a judgement and not a check.
check(
  'the rule leaves a navigable area rather than pinning the focus',
  worstUsableWidth > 40 && worstUsableDepth > 40,
  `worst usable area ${worstUsableWidth.toFixed(0)} x ${worstUsableDepth.toFixed(0)} units of ` +
    `${(plate.maxX - plate.minX).toFixed(0)} x ${(plate.maxZ - plate.minZ).toFixed(0)} at ` +
    `${usableLabel} — the eye offset is distance * cos(pitch), so raising the distance or ` +
    'lowering the pitch spends this, and at zero the city stops panning',
);

// ---------------------------------------------------------------------------
section('5. The band the camera may be pushed into (DECISIONS §40)');

/*
 * §39 made the eye stay on the authored plate and enforced it with a hard clamp,
 * which reads as an invisible wall: the city pans at full speed and stops dead
 * under a finger that is still moving. §40 keeps the guarantee and moves the
 * rectangle it guards to the A2 ring that wraps the plate, resisting across the
 * gap so the edge is felt arriving.
 *
 * SECTION 4 IS STILL THE ONE THAT GUARDS USABILITY, and deliberately so: its
 * floor is measured on the FIRM rectangle alone. The band must never become
 * load-bearing for whether the city can be navigated — if a future pitch eats the
 * full-speed area, §4 must still fail even though the ring would hide it.
 *
 * What this section adds is §39's own invariant restated against the ring, plus
 * the containment the ramp depends on, plus the measurement nobody should have to
 * guess at: how far off the plate this actually puts the eye.
 */

check(
  'the eye stays inside the city ring at every reachable pose',
  worstRingMargin >= 0,
  `worst margin ${worstRingMargin >= 0 ? '+' : ''}${worstRingMargin.toFixed(1)} units at ` +
    `${ringLabel} — this is §39's assertion against §40's rectangle, and negative means a ` +
    'push can put the eye somewhere there is nothing built to stand on',
);

check(
  'the limit contains the full-speed area at every reachable pose',
  ringContainsStationEverywhere,
  ringContainsStationEverywhere
    ? 'so the ramp always has a band to resist across, and NavigableArea never has to give it up'
    : `no band at ${containmentLabel} — the resistance would resolve to a hard clamp there`,
);

check(
  'the ring is a band and not a second navigable area',
  furthestPastPlate > 0 && furthestPastPlate <= 50,
  `the eye reaches at most ${furthestPastPlate.toFixed(1)} units past the plate at ` +
    `${pastPlateLabel}, against ring margins of -X 24.9 +X 30.0 -Z 50.0 +Z 16.5 — above ` +
    'those the rectangle is no longer the ring that was measured out of the GLB',
);

check(
  'the band buys pan range rather than only softness',
  worstRingUsableWidth > worstUsableWidth && worstRingUsableDepth > worstUsableDepth,
  `usable area ${worstUsableWidth.toFixed(0)} x ${worstUsableDepth.toFixed(0)} at full speed, ` +
    `${worstRingUsableWidth.toFixed(0)} x ${worstRingUsableDepth.toFixed(0)} including the band ` +
    '— equal means extendedBounds has been set back to bounds, which is ?band=0 shipped by accident',
);

// ---------------------------------------------------------------------------
finish();
