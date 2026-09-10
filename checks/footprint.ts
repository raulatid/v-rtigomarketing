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
/** How many samples reach the clamp. Reported so a change in it is visible. */
let clampedSamples = 0;
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

          if (f.clampedRays) {
            clampedSamples += 1;
            if (!anyClamped) {
              anyClamped = true;
              clampedLabel = label;
            }
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
/**
 * How far past the authored plate there is real ground, on the thinnest side.
 *
 * The filler city plus the skirt's fade. Section 3 states the same quantity for
 * its own assertions; it is recomputed here rather than shared, so neither
 * section depends on the other having run first.
 */
const ground = murciaConfig.groundBounds;
const groundPastPlate = ground
  ? Math.min(
      plate.minX - ground.minX,
      ground.maxX - plate.maxX,
      plate.minZ - ground.minZ,
      ground.maxZ - plate.maxZ,
    )
  : 0;
const realGroundReach =
  groundPastPlate +
  murciaConfig.terrainTransition.width * murciaConfig.terrainTransition.fadeEndFraction;
const clampReachesRealGround = murciaConfig.navigation.maxGroundDistance < realGroundReach;

// THIS ASSERTION HAS BEEN `!anyClamped`, THEN `anyClamped`, AND IS NOW NEITHER,
// which is the whole history of Murcia's pitch and distance and is worth keeping
// rather than tidying.
//
// A frustum that reaches past the horizon has no finite ground footprint:
// `computeGroundFootprint` returns the `maxGroundDistance` clamp rather than a
// measurement. That used to matter because `NavigableArea` INSET the navigable
// rectangle by the footprint, and insetting by a clamp drags the focus off the
// plate corners for a reach nobody measured. At 19 and then 18 degrees the
// horizon was in frame by client direction, so the inset was switched off at
// load to stop it lying; the 2026-09-08 rise to 35 degrees put the horizon back
// out of frame and the inset came back on.
//
// The inset is gone. The camera-navigation port retired §39 and §40 along with
// `NavigableArea` itself: the viewer's target is clamped to one GROWN rectangle
// and nothing is derived from the footprint any more. So "is this pose's
// footprint a measurement or a clamp?" no longer decides anything, and asserting
// it would be asserting a property with no consumer — the exact shape of check
// that survives a refactor while quietly meaning nothing.
//
// What DOES still matter is the safety property underneath it, and it is
// asserted directly instead: wherever a pose does reach the clamp, the clamp has
// to land on real ground rather than past the edge of the model. Section 3 states
// that globally against `maxGroundDistance`; this states it for the poses that
// actually reach it, and reports how many do so a change in that number is
// visible rather than silent.
check(
  'where a pose out-reaches the horizon, the clamp still lands on real ground',
  !anyClamped || clampReachesRealGround,
  anyClamped
    ? `${clampedSamples} of ${samples} samples reach the clamp (first at ${clampedLabel}); ` +
      `the clamp is ${murciaConfig.navigation.maxGroundDistance} units against ` +
      `${realGroundReach.toFixed(1)} of real ground, so what those poses draw is ground`
    : `no ray reached the clamp across ${samples} samples — every pose has a real ground ` +
      'footprint',
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
// SECTIONS 4 AND 5 LIVED HERE, and they are gone with the decisions they held.
//
// §4 asserted DECISIONS §39 — that no reachable pose puts the camera's EYE
// outside the navigable rectangle — and §5 asserted §40, the resistance band the
// eye could be pushed into. Both were retired by the camera-navigation port:
// the viewer's TARGET is now clamped to one rectangle grown past the authored
// plate, the eye is not bounded at all, and `NavigableArea`,
// `computeStationLimitedBounds` and `resistToRect` were deleted with them.
//
// What replaced them is section 3, which was always the outer guarantee and is
// now the only one: the world has to surround the camera wherever it can get to.
// It passes with 1207 units of margin at the shipped pose, and section 2's clamp
// assertion says that even the 0.1% of ultrawide poses that out-reach the
// horizon are drawing real ground rather than the edge of the model.
//
// Anyone reinstating an eye-bounded rectangle should read §39 in
// docs/DECISIONS.md first — it is in the Superseded table, with the pan range it
// cost — rather than rebuilding it from this file's silence.


// ---------------------------------------------------------------------------
finish();
