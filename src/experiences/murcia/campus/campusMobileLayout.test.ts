import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { campusMobileFraming, CAMPUS_COMPACT_FRACTION } from './campusMobileLayout';
import { createCampusCamera } from './section/campusCamera';

describe('mobile campus visible space', () => {
  it.each([[390, 844], [375, 667], [320, 568], [844, 390]])(
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
      for (const x of [-8.5, 8.5]) for (const y of [-8.5, 8.5]) {
        const p = new THREE.Vector3(x, y, 0).applyQuaternion(camera.quaternion).project(camera);
        const px = (p.x + 1) * width / 2;
        const py = (1 - p.y) * height / 2;
        expect(px).toBeGreaterThan(16);
        expect(px).toBeLessThan(width - 16);
        expect(py).toBeGreaterThan(Math.min(88, height * 0.18));
        expect(py).toBeLessThan(height * (1 - CAMPUS_COMPACT_FRACTION) - 24);
      }
      control.dispose();
    });
});
