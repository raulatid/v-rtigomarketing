/**
 * Behavioural harness for the Earth <-> Murcia warp.  `npm run check:warp`
 *
 * Drives the REAL curve module, not a reimplementation — the same rule as
 * checks/navigation-feel.ts and scripts/simulate-intro.mjs. A guard that tests
 * a convenient stand-in guards nothing.
 *
 * The assertion that matters is section 1. Murcia's terrain skirt is sized for
 * a camera at distance 165, and the measured worst-case margin is +50 units at
 * 5120x1440. A dolly that pulls back past 165 puts the plate edge on screen for
 * ultrawide viewers only, silently, with nothing visible on the machine the
 * change was made on. PROJECT_MEMORY 10.6 records that exact regression
 * happening once already. Nothing else in the codebase guards it.
 */
import {
  WARP_TRANSITION,
  dollyAmount,
  earthFov,
  earthRadiusScale,
  flash,
  motionBlur,
  murciaDollyDistance,
  speed,
  transitionLeg,
} from '../src/app/warpTransition';
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

console.log('='.repeat(70));
console.log('Warp transition — Earth <-> Murcia');
console.log('='.repeat(70));

// ---------------------------------------------------------------------------
section('1. Murcia distance stays inside the safe envelope');

let maxDistance = -Infinity;
let minDistance = Infinity;
let maxAt = 0;
let minAt = 0;
for (const p of samples) {
  const { amount } = dollyAmount(p);
  const d = murciaDollyDistance(amount);
  if (d > maxDistance) { maxDistance = d; maxAt = p; }
  if (d < minDistance) { minDistance = d; minAt = p; }
}

check(
  'never pulls back past the resting distance',
  maxDistance <= WARP_TRANSITION.murciaMaxDistance + 1e-9,
  `max ${maxDistance.toFixed(3)} at p=${maxAt.toFixed(3)} (ceiling ${WARP_TRANSITION.murciaMaxDistance})`,
);
check(
  'never dives below the footprint floor',
  minDistance >= WARP_TRANSITION.murciaMinDistance - 1e-9,
  `min ${minDistance.toFixed(3)} at p=${minAt.toFixed(3)} (floor ${WARP_TRANSITION.murciaMinDistance})`,
);
check(
  'the configured close distance is itself inside the envelope',
  WARP_TRANSITION.murciaCloseDistance >= WARP_TRANSITION.murciaMinDistance &&
    WARP_TRANSITION.murciaCloseDistance <= WARP_TRANSITION.murciaMaxDistance,
  `${WARP_TRANSITION.murciaCloseDistance} in [${WARP_TRANSITION.murciaMinDistance}, ${WARP_TRANSITION.murciaMaxDistance}]`,
);

// The whole envelope is meaningless if it is measured against the wrong pose.
check(
  'rest distance matches the environment config it was measured for',
  WARP_TRANSITION.murciaRestDistance === murciaConfig.camera.distance,
  `warp ${WARP_TRANSITION.murciaRestDistance} vs murciaConfig ${murciaConfig.camera.distance}`,
);
check(
  'close distance matches the environment config',
  WARP_TRANSITION.murciaCloseDistance === murciaConfig.warpCloseDistance,
  `warp ${WARP_TRANSITION.murciaCloseDistance} vs murciaConfig ${murciaConfig.warpCloseDistance}`,
);
check(
  'the ceiling is the rest distance, not merely near it',
  WARP_TRANSITION.murciaMaxDistance === murciaConfig.camera.distance,
  'a ceiling above rest would spend skirt margin that was never measured',
);

// ---------------------------------------------------------------------------
section('2. Both worlds return exactly to rest');

const restStart = murciaDollyDistance(dollyAmount(0).amount);
const restEnd = murciaDollyDistance(dollyAmount(1).amount);
check(
  'Murcia is at rest at p=0',
  Math.abs(restStart - WARP_TRANSITION.murciaRestDistance) < 1e-9,
  `${restStart.toFixed(6)}`,
);
check(
  'Murcia is at rest at p=1',
  Math.abs(restEnd - WARP_TRANSITION.murciaRestDistance) < 1e-9,
  `${restEnd.toFixed(6)} — a residual offset would persist for the session`,
);

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
section('5. The two legs partition the transition');

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
check('the dolly goes in without reversing', monotonicIn, 'a reversal reads as a stumble');
check('and comes out without reversing', monotonicOut);

const peak = dollyAmount(WARP_TRANSITION.cut).amount;
check(
  'the dolly is at its closest at the cut',
  peak > 0.99,
  `amount ${peak.toFixed(4)} — the cut must land under the closest, most covered frame`,
);

// ---------------------------------------------------------------------------
console.log(`\n${'='.repeat(70)}`);
const total = 23;
if (failures === 0) {
  console.log(`${total}/${total} checks passed`);
} else {
  console.log(`${failures} check(s) FAILED`);
  process.exitCode = 1;
}
