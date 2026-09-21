import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import {
  CAMPUS_COMPACT_MAX_FRACTION,
  CAMPUS_COMPACT_MIN_FRACTION,
  campusCompactFraction,
  campusMobileFraming,
} from './campusMobileLayout';
import { createCampusCamera } from './section/campusCamera';

const PHONES: ReadonlyArray<readonly [number, number]> = [
  [390, 844],
  [375, 667],
  [320, 568],
  [844, 390],
];

describe('mobile campus visible space', () => {
  it.each(PHONES)(
    'fits the field above the sheet at %i × %i', (width, height) => {
      const camera = new THREE.PerspectiveCamera(35, width / height, 0.1, 1000);
      camera.position.set(0, 40, 100);
      const control = createCampusCamera({ camera, lookTarget: new THREE.Vector3(),
        focus: new THREE.Vector3(), stops: 6, onControl: () => {},
        tuning: { distance: 45, elevationDeg: 24, direction: 1 },
        framing: () => campusMobileFraming(width, height),
      });
      control.enter(0.01);
      control.update(0.02);
      camera.updateMatrixWorld(true);
      // A camera-facing envelope contains the disc and each service symbol.
      // Measured against the sheet this viewport ACTUALLY gets, which is the
      // whole point of the fraction being derived: a bound read from a constant
      // would pass while the sheet sat somewhere else.
      const sheetTop = height * (1 - campusCompactFraction(width, height)) - 24;
      for (const x of [-8.5, 8.5]) for (const y of [-8.5, 8.5]) {
        const p = new THREE.Vector3(x, y, 0).applyQuaternion(camera.quaternion).project(camera);
        const px = (p.x + 1) * width / 2;
        const py = (1 - p.y) * height / 2;
        expect(px).toBeGreaterThan(16);
        expect(px).toBeLessThan(width - 16);
        expect(py).toBeGreaterThan(Math.min(88, height * 0.18));
        expect(py).toBeLessThan(sheetTop);
      }
      control.dispose();
    });
});

/**
 * The sheet takes the space the field cannot use, and NOT ONE PIXEL MORE.
 *
 * The fraction was a flat 0.35, chosen to be safe on the smallest phone, so
 * every larger one left slack above the sheet that nothing was spending — the
 * camera sat at its own nearest distance rather than being held back by the
 * band. Deriving the fraction spends exactly that slack.
 *
 * Which makes ONE property load-bearing, and it is not "the sheet is taller":
 * it is that raising it costs the particles nothing. Stated as a comparison
 * against the fraction that shipped, because that is the thing a reader would
 * otherwise have to take on trust.
 */
describe('the compact stop the viewport can afford', () => {
  const framingAtFraction = (width: number, height: number, fraction: number) => {
    const top = Math.min(88, height * 0.18);
    const bottom = height * (1 - fraction) - 24;
    const available = Math.max(48, bottom - top);
    return Math.max(
      1.6,
      (0.6 * height) / Math.max(48, width - 48),
      (0.6 * height) / Math.max(48, available - 32),
    );
  };

  it('never pulls the camera further back than the fraction that shipped', () => {
    // Swept rather than sampled: the fraction inverts the framing's own
    // arithmetic, and an inversion that is subtly wrong is wrong on a BAND of
    // sizes rather than at a listed one. Everything on this layout — the dock
    // is excluded by the same query `createServicesCampus` uses.
    let worst = 0;
    let at: [number, number] | null = null;
    for (let width = 280; width <= 1100; width += 10) {
      for (let height = 380; height <= 1200; height += 10) {
        if (width >= 1024 && width / height >= 4 / 3) continue;
        const derived = campusMobileFraming(width, height).distanceScale;
        const shipped = framingAtFraction(width, height, CAMPUS_COMPACT_MIN_FRACTION);
        if (derived - shipped > worst) {
          worst = derived - shipped;
          at = [width, height];
        }
      }
    }
    expect(worst, `worst at ${at?.join('×')}`).toBeLessThan(1e-9);
  });

  it('stays inside its bounds, and never lowers a sheet to buy particles', () => {
    for (let width = 280; width <= 1100; width += 10) {
      for (let height = 380; height <= 1200; height += 10) {
        if (width >= 1024 && width / height >= 4 / 3) continue;
        const fraction = campusCompactFraction(width, height);
        expect(fraction, `${width}×${height}`).toBeGreaterThanOrEqual(CAMPUS_COMPACT_MIN_FRACTION);
        expect(fraction, `${width}×${height}`).toBeLessThanOrEqual(CAMPUS_COMPACT_MAX_FRACTION);
      }
    }
  });

  it('gives a phone with slack a taller stop, and one without it the minimum', () => {
    // The four reference viewports, as the measurements in the module's header.
    // A phone in landscape has no slack — its band's height already binds — and
    // gets exactly what it has today rather than a lowered sheet.
    expect(campusCompactFraction(390, 844)).toBeCloseTo(0.45, 3);
    expect(campusCompactFraction(375, 667)).toBeCloseTo(0.409, 3);
    expect(campusCompactFraction(320, 568)).toBeCloseTo(0.371, 3);
    expect(campusCompactFraction(844, 390)).toBe(CAMPUS_COMPACT_MIN_FRACTION);
  });

  it('answers the minimum for a viewport it cannot measure', () => {
    // R3F reports 0×0 for a frame or two before the container is measured, and
    // a fraction derived from it would put the sheet somewhere arbitrary.
    expect(campusCompactFraction(0, 0)).toBe(CAMPUS_COMPACT_MIN_FRACTION);
    expect(campusCompactFraction(-1, 800)).toBe(CAMPUS_COMPACT_MIN_FRACTION);
  });
});
