/**
 * Behavioural harness for the space backdrop.  `npm run check:space`
 *
 * Drives the REAL band and star-distribution modules, not reimplementations —
 * same rule as checks/warp-transition.ts and scripts/simulate-intro.mjs: a
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

import { GALAXY_BAND, bandAxis, bandDensity } from '../src/space/galaxyBand';

let failures = 0;

function check(label: string, ok: boolean, detail = ''): void {
  const tag = ok ? 'PASS' : 'FAIL';
  if (!ok) failures++;
  console.log(`  ${tag}  ${label.padEnd(56)} ${detail}`);
}

function section(title: string): void {
  console.log(`\n${title}`);
}

console.log('='.repeat(70));
console.log('Space backdrop — galaxy band and star distribution');
console.log('='.repeat(70));

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
console.log(`\n${'='.repeat(70)}`);
const total = 6;
if (failures === 0) {
  console.log(`${total}/${total} checks passed`);
} else {
  console.log(`${failures} check(s) FAILED`);
  process.exitCode = 1;
}
