/**
 * Behavioural harness for the space backdrop.  `npm run check:space`
 *
 * Drives the REAL band and star-distribution modules, not reimplementations —
 * same rule as checks/warp-transition.ts and src/intro-draw/playhead.test.ts: a
 * guard that tests a convenient stand-in guards nothing.
 *
 * Section 2 is the one that matters. The backdrop's non-occlusion guarantee is
 * geometric: every star sits on a shell that encloses the camera, so no star
 * can lie between the camera and the Earth. Clustering the field is exactly the
 * change most likely to break that by moving points in 3D instead of on the
 * sphere, and the failure is intermittent — a handful of stars drifting over
 * the planet at some orbit angles, which no screenshot is guaranteed to catch.
 */
import * as THREE from 'three';

import { GALAXY_BAND, bandAxis, bandDensity } from '../src/experiences/earth/scene/space/galaxyBand';
import { SPACE_CONFIG } from '../src/experiences/earth/scene/space/spaceConfig';
import { generateStarField } from '../src/experiences/earth/scene/space/starDistribution';
import type { StarFieldOptions } from '../src/experiences/earth/scene/space/starDistribution';
import { INTERACTION_CONFIG } from '../src/experiences/earth/interaction/interactionConfig';
import { fibonacciSpherePoints } from '../src/utils/fibonacciSphere';
// Imported rather than copied, so raising the slider default cannot leave this
// harness quietly asserting against a count the app stopped using. Safe in
// Node: the module's only value import is GALAXY_BAND, and its one window
// access lives inside defaultIntroConfig(), which nothing here calls.
import { DEFAULT_APP_CONFIG } from '../src/experiences/earth/config/introConfig';

const SHIPPED_STAR_COUNT = DEFAULT_APP_CONFIG.backdropStarCount;

// POLE_FADE_START_DEG in scripts/prepare-sky-panorama.mjs, mirrored because the
// script is a one-off asset tool outside the build and cannot be imported here.
// It is a property of the SHIPPED FILES rather than of the code, so it only
// changes when the textures are regenerated — and section 7 is what would catch
// that having happened without this being updated.
const SKY_ASSET_POLE_FADE_START_DEG = 55;

import { banner, check, finish, section } from './lib/assert';


banner('Space backdrop — galaxy band and star distribution');

// ---------------------------------------------------------------------------
section('1. The galactic band is a well-formed density field');

const TILTS = [0, 22, 45, 90, 180, -37];
check(
  'the band axis is unit length at every tilt',
  TILTS.every((t) => Math.abs(bandAxis(t).length() - 1) < 1e-9),
  TILTS.map((t) => bandAxis(t).length().toFixed(3)).join(' '),
);

const axis = bandAxis(GALAXY_BAND.defaultTilt);
const width = GALAXY_BAND.defaultWidth;

// Any direction perpendicular to the axis lies ON the galactic plane.
const onPlane = new THREE.Vector3().crossVectors(axis, new THREE.Vector3(0, 0, 1)).normalize();
check(
  'density is exactly 1 on the galactic plane',
  Math.abs(bandDensity(onPlane, axis, width) - 1) < 1e-12,
  `${bandDensity(onPlane, axis, width).toFixed(12)}`,
);

check(
  'density is near zero at the galactic pole',
  bandDensity(axis, axis, width) < 0.01,
  `${bandDensity(axis, axis, width).toExponential(2)} — the band must not wrap the whole sky`,
);

// Sweep from the plane to the pole; density must never rise.
let monotonic = true;
let prev = Infinity;
for (let i = 0; i <= 500; i++) {
  const angle = (i / 500) * (Math.PI / 2);
  const dir = onPlane.clone().multiplyScalar(Math.cos(angle)).addScaledVector(axis, Math.sin(angle));
  const d = bandDensity(dir, axis, width);
  if (d > prev + 1e-12) monotonic = false;
  prev = d;
}
check('density falls monotonically from plane to pole', monotonic, 'a bump would read as a second band');

// The band is a plane, so it must be symmetric about it.
let symmetric = true;
for (let i = 0; i <= 200; i++) {
  const angle = (i / 200) * (Math.PI / 2);
  const up = onPlane.clone().multiplyScalar(Math.cos(angle)).addScaledVector(axis, Math.sin(angle));
  const down = onPlane.clone().multiplyScalar(Math.cos(angle)).addScaledVector(axis, -Math.sin(angle));
  if (Math.abs(bandDensity(up, axis, width) - bandDensity(down, axis, width)) > 1e-12) {
    symmetric = false;
  }
}
check('density is symmetric about the galactic plane', symmetric);

check(
  'a zero-length direction returns 0 rather than NaN',
  bandDensity(new THREE.Vector3(0, 0, 0), axis, width) === 0,
  `${bandDensity(new THREE.Vector3(0, 0, 0), axis, width)} — NaN here would poison every star position`,
);

// ---------------------------------------------------------------------------
section('2. The shell guarantee survives clustering');

const BASE: StarFieldOptions = {
  count: 2600,
  radius: 180,
  jitter: 0.15,
  clusterStrength: 0.6,
  bandTiltDegrees: GALAXY_BAND.defaultTilt,
  bandWidth: GALAXY_BAND.defaultWidth,
};

function radii(field: { positions: Float32Array }): number[] {
  const out: number[] = [];
  for (let i = 0; i < field.positions.length; i += 3) {
    const x = field.positions[i];
    const y = field.positions[i + 1];
    const z = field.positions[i + 2];
    out.push(Math.sqrt(x * x + y * y + z * z));
  }
  return out;
}

// Clustering must be ANGULAR. If it is ever implemented as a 3D offset, the
// radius bound is the first thing that breaks, and it breaks for a handful of
// stars rather than visibly for all of them.
let worstLow = Infinity;
let worstHigh = -Infinity;
let anyNaN = false;
for (const clusterStrength of [0, 0.3, 0.6, 1]) {
  for (const bandTiltDegrees of [0, 22, 67]) {
    const field = generateStarField({ ...BASE, clusterStrength, bandTiltDegrees });
    for (const r of radii(field)) {
      if (!Number.isFinite(r)) anyNaN = true;
      if (r < worstLow) worstLow = r;
      if (r > worstHigh) worstHigh = r;
    }
    for (const buffer of [field.positions, field.colors, field.sizes, field.phases]) {
      for (const v of buffer) if (!Number.isFinite(v)) anyNaN = true;
    }
  }
}

const lowBound = BASE.radius * (1 - BASE.jitter);
const highBound = BASE.radius * (1 + BASE.jitter);

check(
  'no star falls inside the jitter floor, at any strength or tilt',
  worstLow >= lowBound - 1e-3,
  `min ${worstLow.toFixed(3)} (floor ${lowBound})`,
);
check(
  'no star escapes the jitter ceiling',
  worstHigh <= highBound + 1e-3,
  `max ${worstHigh.toFixed(3)} (ceiling ${highBound})`,
);
check(
  'the closest star clears the camera by a wide margin',
  worstLow > INTERACTION_CONFIG.camera.overviewRadius * 3,
  `${worstLow.toFixed(1)} vs the camera's fixed overviewRadius ` +
    `${INTERACTION_CONFIG.camera.overviewRadius} — below this the shell stops enclosing the ` +
    'camera and stars render over the Earth',
);
check('no NaN in any buffer', !anyNaN, 'one NaN position empties the whole draw call');

// BASE.count is 2600 while the app ships DEFAULT_APP_CONFIG.backdropStarCount,
// and that divergence is deliberate: sections 3 and 4 are O(n^2) in the count
// (~6.8M dot products at 2600, ~12M at 3500, and they run four times), and what
// they test is the ALGORITHM, which does not care how many stars it is given.
//
// But nothing else then exercises the number actually shipped, so the shell
// guarantee — the one property here whose failure puts stars in front of the
// planet — would be asserted only at a count nobody runs. This covers it
// directly. It is cheap: one generation, one linear pass.
const shipped = generateStarField({ ...BASE, count: SHIPPED_STAR_COUNT });
const shippedRadii = radii(shipped);
check(
  'the shipped star count still satisfies the shell guarantee',
  shippedRadii.every((r) => r >= lowBound - 1e-3 && r <= highBound + 1e-3) &&
    !Array.from(shipped.positions).some(Number.isNaN),
  `${SHIPPED_STAR_COUNT} stars, radii ${Math.min(...shippedRadii).toFixed(1)}..${Math.max(...shippedRadii).toFixed(1)} (bounds ${lowBound}..${highBound})`,
);

const sized = generateStarField(BASE);
check(
  'every buffer is sized to the requested count',
  sized.positions.length === BASE.count * 3 &&
    sized.colors.length === BASE.count * 3 &&
    sized.sizes.length === BASE.count &&
    sized.phases.length === BASE.count,
  `${sized.positions.length} / ${sized.colors.length} / ${sized.sizes.length} / ${sized.phases.length}`,
);
check(
  'zero jitter produces an exact shell',
  radii(generateStarField({ ...BASE, jitter: 0 })).every(
    (r) => Math.abs(r - BASE.radius) < 1e-3,
  ),
  'the jitter-free path must stay exact, as the guarantee is stated against it',
);

// ---------------------------------------------------------------------------
section('3. Generation is deterministic');

const a = generateStarField(BASE);
const b = generateStarField(BASE);
check(
  'the same options produce identical positions',
  a.positions.every((v, i) => v === b.positions[i]),
  'the sky must be the same on every load, or the occlusion screenshots mean nothing',
);
check(
  'the same options produce identical sizes, colours and phases',
  a.sizes.every((v, i) => v === b.sizes[i]) &&
    a.colors.every((v, i) => v === b.colors[i]) &&
    a.phases.every((v, i) => v === b.phases[i]),
);
const c = generateStarField({ ...BASE, seed: 99 });
check(
  'a different seed produces a different sky',
  !a.positions.every((v, i) => v === c.positions[i]),
  'otherwise the seed is not wired through and the field is accidentally fixed',
);

// ---------------------------------------------------------------------------
section('4. The field is actually chaotic, not merely different');

// This is the assertion that encodes the original defect. A golden-angle
// spiral is a MAXIMALLY even distribution, so its nearest-neighbour distances
// are nearly all identical — which is exactly why the old sky read as combed.
// A real sky has knots and voids, so the spread of those distances is wide.
function nearestNeighbourSpread(positions: Float32Array): number {
  const n = positions.length / 3;
  const dirs: number[][] = [];
  for (let i = 0; i < n; i++) {
    const x = positions[i * 3];
    const y = positions[i * 3 + 1];
    const z = positions[i * 3 + 2];
    const l = Math.sqrt(x * x + y * y + z * z) || 1;
    dirs.push([x / l, y / l, z / l]);
  }
  const nearest: number[] = [];
  for (let i = 0; i < n; i++) {
    let best = -Infinity;
    for (let j = 0; j < n; j++) {
      if (i === j) continue;
      const d = dirs[i][0] * dirs[j][0] + dirs[i][1] * dirs[j][1] + dirs[i][2] * dirs[j][2];
      if (d > best) best = d;
    }
    nearest.push(Math.acos(Math.min(1, Math.max(-1, best))));
  }
  const mean = nearest.reduce((s, v) => s + v, 0) / nearest.length;
  const variance = nearest.reduce((s, v) => s + (v - mean) * (v - mean), 0) / nearest.length;
  return Math.sqrt(variance) / mean;
}

const evenSpread = nearestNeighbourSpread(fibonacciSpherePoints(BASE.count, BASE.radius, 0));
const clumpedSpread = nearestNeighbourSpread(generateStarField(BASE).positions);
const uniformSpread = nearestNeighbourSpread(
  generateStarField({ ...BASE, clusterStrength: 0 }).positions,
);

check(
  'the new field is far less evenly spaced than the spiral',
  clumpedSpread > evenSpread * 3,
  `spiral ${evenSpread.toFixed(3)} vs clustered ${clumpedSpread.toFixed(3)} (coefficient of variation of nearest-neighbour angle)`,
);
check(
  'clustering measurably increases clumping over plain randomness',
  clumpedSpread > uniformSpread * 1.15,
  `uniform ${uniformSpread.toFixed(3)} vs clustered ${clumpedSpread.toFixed(3)}`,
);
check(
  'even at zero cluster strength the field beats the spiral',
  uniformSpread > evenSpread * 2,
  `spiral ${evenSpread.toFixed(3)} vs uniform ${uniformSpread.toFixed(3)} — random alone is already clumpier than a golden-angle walk`,
);

// ---------------------------------------------------------------------------
section('5. Stars concentrate toward the galactic band');

function bandShare(positions: Float32Array, tilt: number, bandWidth: number): number {
  const bandAxisVec = bandAxis(tilt);
  const v = new THREE.Vector3();
  let inBand = 0;
  for (let i = 0; i < positions.length; i += 3) {
    v.set(positions[i], positions[i + 1], positions[i + 2]).normalize();
    if (Math.abs(v.dot(bandAxisVec)) < bandWidth) inBand++;
  }
  return inBand / (positions.length / 3);
}

const clumpedShare = bandShare(
  generateStarField(BASE).positions,
  BASE.bandTiltDegrees,
  BASE.bandWidth,
);
const uniformShare = bandShare(
  generateStarField({ ...BASE, clusterStrength: 0 }).positions,
  BASE.bandTiltDegrees,
  BASE.bandWidth,
);

check(
  'the band holds noticeably more stars than an even sky would',
  clumpedShare > uniformShare * 1.25,
  `${(clumpedShare * 100).toFixed(1)}% in band vs ${(uniformShare * 100).toFixed(1)}% uniform`,
);
check(
  'cluster strength 0 really is a uniform sky',
  Math.abs(uniformShare - BASE.bandWidth) < 0.06,
  `${(uniformShare * 100).toFixed(1)}% vs the ${(BASE.bandWidth * 100).toFixed(1)}% a uniform sphere gives — the band must be opt-in, so the slider spans a real range`,
);

// ---------------------------------------------------------------------------
section('6. Magnitude and colour are continuous and restrained');

const field = generateStarField(BASE);
const sizes = Array.from(field.sizes).sort((x, y) => x - y);
const cfg = SPACE_CONFIG.star;

check(
  'every size sits inside the configured range',
  sizes[0] >= cfg.minSize - 1e-5 && sizes[sizes.length - 1] <= cfg.maxSize + 1e-5,
  `${sizes[0].toFixed(2)} .. ${sizes[sizes.length - 1].toFixed(2)} (range ${cfg.minSize}..${cfg.maxSize})`,
);

const distinct = new Set(sizes.map((s) => s.toFixed(6))).size;
check(
  'magnitude is continuous, not tiered',
  distinct > BASE.count * 0.9,
  `${distinct} distinct sizes across ${BASE.count} stars — the three-tier field this replaces had 3`,
);

const median = sizes[Math.floor(sizes.length / 2)];
check(
  'the distribution is bottom-weighted, as a real one is',
  median < cfg.minSize + (cfg.maxSize - cfg.minSize) * 0.33,
  `median ${median.toFixed(2)} against a midpoint of ${((cfg.minSize + cfg.maxSize) / 2).toFixed(2)}`,
);

const bright = sizes.filter((s) => s >= cfg.twinkleSizeMin).length / sizes.length;
check(
  'only a minority of stars are large enough to twinkle',
  bright > 0.02 && bright < 0.25,
  `${(bright * 100).toFixed(1)}% at or above ${cfg.twinkleSizeMin}px — too many and the sky boils`,
);

let colourInRange = true;
let maxComponent = 0;
let sumMaxComponent = 0;
for (let i = 0; i < field.colors.length; i += 3) {
  const r = field.colors[i];
  const g = field.colors[i + 1];
  const bl = field.colors[i + 2];
  if (r < 0 || r > 1 || g < 0 || g > 1 || bl < 0 || bl > 1) colourInRange = false;
  const hi = Math.max(r, g, bl);
  sumMaxComponent += hi;
  if (hi > maxComponent) maxComponent = hi;
}
check('every colour component is inside [0, 1]', colourInRange);

// Saturation is asserted on the RAMP rather than on the buffer, and in sRGB
// rather than linear. THREE.Color converts hex literals to the linear working
// space on assignment, where the same colour measures far more saturated than
// it looks — so a bound on the buffer would either be meaningless or would
// forbid real stellar colours. The ramp is also the thing a future editor
// actually changes.
let worstRampSaturation = 0;
for (const stop of cfg.colorRamp) {
  const r = ((stop.color >> 16) & 0xff) / 255;
  const g = ((stop.color >> 8) & 0xff) / 255;
  const bl = (stop.color & 0xff) / 255;
  const hi = Math.max(r, g, bl);
  const lo = Math.min(r, g, bl);
  worstRampSaturation = Math.max(worstRampSaturation, hi > 0 ? (hi - lo) / hi : 0);
}
check(
  'the stellar colour ramp stays restrained',
  worstRampSaturation < 0.4,
  `peak sRGB saturation ${worstRampSaturation.toFixed(3)} — above this the sky reads as confetti rather than as stars`,
);

const meanMax = sumMaxComponent / (field.colors.length / 3);
check(
  'brightness rides magnitude rather than every star being full',
  meanMax < maxComponent * 0.75,
  `mean peak component ${meanMax.toFixed(3)} against a brightest of ${maxComponent.toFixed(3)}`,
);

check(
  'twinkle phases span [0, 1)',
  Array.from(field.phases).every((p) => p >= 0 && p < 1),
  'a phase outside the range just biases the sine, but it means the RNG is not what it claims',
);

// ---------------------------------------------------------------------------
section('7. The polar cap blend cannot reach the resting frame');

/**
 * The sky half of SPACE_CONFIG had NO coverage here at all until 2026-08-25,
 * despite this file importing it — the 2026-08-20 audit named that gap. This
 * closes it for the one part that is checkable in Node.
 *
 * What it guards: `shell.frag.glsl` repairs the panorama's polar caps by
 * borrowing structure from a rotated second sample. That repair is only correct
 * BECAUSE it stays in the caps, and "it stays in the caps" is asserted by the
 * committed e2e backdrop baselines passing unchanged. That evidence is only
 * worth anything while the blend genuinely cannot reach the resting frame, and
 * nothing in the shader enforces it — skyCapStart is a slider.
 *
 * So the margin is recomputed here from the real modules rather than trusted.
 */

// At rest the camera's phi is fixed at 90 degrees (createFocusCameraRig), so
// the view axis lies in the y = 0 plane whatever theta does. The nearest sky
// pole is therefore always exactly 90 - tilt degrees off the view axis.
const capTilt = DEFAULT_APP_CONFIG.skyBandTilt;
const poleFromAxisDeg = 90 - Math.abs(capTilt);

// The e2e viewport and the resting FOV, which is what decides how far from the
// view axis a frame CORNER reaches. Vertical FOV, so the diagonal is derived.
const E2E_WIDTH = 1600;
const E2E_HEIGHT = 900;
const halfV = THREE.MathUtils.degToRad(DEFAULT_APP_CONFIG.normalFov) / 2;
const halfDiagonalDeg = THREE.MathUtils.radToDeg(
  Math.atan(Math.hypot(Math.tan(halfV) * (E2E_WIDTH / E2E_HEIGHT), Math.tan(halfV))),
);

// How close to the pole the nearest frame CORNER gets, and then the same thing
// as a latitude — which is the unit skyCapStart is in.
//
// Getting this conversion wrong is not hypothetical: the first cut of this
// check compared skyCapStart against the ANGLE FROM THE POLE (27.8) instead of
// the latitude (62.2). It passed, and it would have gone on passing with the
// cap start dragged anywhere above 28 degrees — a check that guards nothing
// while reading as though it does.
const cornerAngleFromPoleDeg = poleFromAxisDeg - halfDiagonalDeg;
const cornerLatitudeDeg = 90 - cornerAngleFromPoleDeg;

check(
  'the resting frame does not already contain the pole',
  cornerAngleFromPoleDeg > 0,
  `pole is ${poleFromAxisDeg.toFixed(1)} deg off axis against a half-diagonal of ${halfDiagonalDeg.toFixed(
    1,
  )} deg — if this fails there is no cap start that keeps the blend out of the resting frame, and the baselines cannot be the evidence any more`,
);

check(
  'the cap blend starts above the resting frame corner',
  DEFAULT_APP_CONFIG.skyCapStart > cornerLatitudeDeg,
  `cap starts at ${DEFAULT_APP_CONFIG.skyCapStart} deg, frame corner reaches ${cornerLatitudeDeg.toFixed(
    1,
  )} deg — below that the blend is in the resting view and e2e/backdrop.spec.ts baselines move, which stops them being evidence that the repair is confined to the caps`,
);

check(
  'the cap band is ordered and non-degenerate',
  DEFAULT_APP_CONFIG.skyCapFull > DEFAULT_APP_CONFIG.skyCapStart,
  'smoothstep with edge0 >= edge1 is undefined, so an inverted band is driver-dependent garbage rather than a visible mistake',
);

check(
  'the cap band stays below the pole',
  DEFAULT_APP_CONFIG.skyCapFull < 90 && DEFAULT_APP_CONFIG.skyCapStart < 90,
  'a band that reaches full strength only AT the pole never fires — the repair would be off while looking configured',
);

check(
  'the borrowed patch is never itself a pole',
  // The cap rotation is 90 degrees, so a direction at latitude L maps to one at
  // latitude 90 - L. The cap samples latitudes >= skyCapStart, so the borrowed
  // latitudes are <= 90 - skyCapStart. That must stay clear of the asset's own
  // polar fade, or the repair borrows the very flatness it exists to replace.
  90 - DEFAULT_APP_CONFIG.skyCapStart < SKY_ASSET_POLE_FADE_START_DEG,
  `borrowed latitudes reach ${(90 - DEFAULT_APP_CONFIG.skyCapStart).toFixed(
    1,
  )} deg against the asset's fade start of ${SKY_ASSET_POLE_FADE_START_DEG} deg (POLE_FADE_START_DEG in scripts/prepare-sky-panorama.mjs)`,
);

check(
  'each pole has its own cap level, and both are positive',
  SPACE_CONFIG.sky.capLevel.north > 0 && SPACE_CONFIG.sky.capLevel.south > 0,
  'the level is a divisor, and the two poles borrow antipodal patches whose levels differ by 3.2x — one shared value would darken one cap and blow out the other',
);

check(
  'the cap clamp brackets 1',
  SPACE_CONFIG.sky.capClamp.min < 1 && SPACE_CONFIG.sky.capClamp.max > 1,
  'the multiplier is a mean-1 ratio, so a clamp that excludes 1 would bias the whole cap',
);

// ---------------------------------------------------------------------------
finish();
