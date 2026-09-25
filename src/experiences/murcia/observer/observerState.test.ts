import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import type { ObserverConfig } from './observerConfig';
import { createDwell, MAX_DWELL_STEP_SECONDS } from './observerState';
import { createObserver } from './createObserver';

const CONFIG: ObserverConfig = {
  dwellSeconds: 1.8,
  stillLinearSpeed: 1,
  stillAngularSpeedDegrees: 1,
  minReportIntervalSeconds: 4,
  maxReportsPerSession: 10,
};

describe('createDwell', () => {
  it('does not complete on a momentary entry', () => {
    const dwell = createDwell(1.8);
    expect(dwell.step(true, 1 / 60)).toBe('holding');
    expect(dwell.step(false, 1 / 60)).toBe('idle');
  });

  it('completes once held past the threshold, and stays complete while held', () => {
    // Steps exact in binary, so the threshold is crossed on a known frame.
    const dwell = createDwell(1.5);
    for (let i = 0; i < 23; i++) expect(dwell.step(true, 1 / 16)).toBe('holding');
    expect(dwell.step(true, 1 / 16)).toBe('complete');
    expect(dwell.step(true, 1 / 16)).toBe('complete');
  });

  it('re-arms when the condition breaks after completing', () => {
    const dwell = createDwell(0.5);
    for (let i = 0; i < 8; i++) dwell.step(true, 1 / 16);
    expect(dwell.phase).toBe('complete');
    expect(dwell.step(false, 1 / 16)).toBe('idle');
    expect(dwell.step(true, 1 / 16)).toBe('holding');
  });

  it('restarts the clock when the zone is left before the threshold', () => {
    const dwell = createDwell(1.8);
    for (let i = 0; i < 100; i++) dwell.step(true, 1 / 60);
    dwell.step(false, 1 / 60);
    expect(dwell.seconds).toBe(0);
    for (let i = 0; i < 100; i++) expect(dwell.step(true, 1 / 60)).toBe('holding');
  });

  it('caps what one long frame can contribute', () => {
    const dwell = createDwell(1.8);
    expect(dwell.step(true, 30)).toBe('holding');
    expect(dwell.seconds).toBe(MAX_DWELL_STEP_SECONDS);
  });
});

describe('createObserver', () => {
  function camera(): THREE.PerspectiveCamera {
    const c = new THREE.PerspectiveCamera(35, 16 / 9, 1, 5000);
    c.position.set(100, 50, 0);
    c.lookAt(0, 0, 0);
    c.updateMatrixWorld(true);
    return c;
  }

  function run(frames: number, step: (i: number, c: THREE.PerspectiveCamera) => boolean | void) {
    const c = camera();
    let rests = 0;
    const observer = createObserver({ config: CONFIG, onRest: () => rests++ });
    for (let i = 0; i < frames; i++) {
      const navigating = step(i, c) ?? true;
      c.updateMatrixWorld(true);
      observer.update(1 / 60, c, navigating);
    }
    return { observer, rests: () => rests };
  }

  it('reports one rest for one still hold, however long it lasts', () => {
    const { observer, rests } = run(600, () => {});
    expect(observer.phase).toBe('complete');
    expect(rests()).toBe(1);
  });

  it('does not report a momentary pause', () => {
    const { rests } = run(300, (i, c) => {
      // Still for half a second, then moving, repeatedly.
      if (Math.floor(i / 30) % 2 === 1) c.position.x += 0.5;
    });
    expect(rests()).toBe(0);
  });

  it('reports again after the camera moves and settles', () => {
    const { rests } = run(400, (i, c) => {
      if (i >= 150 && i < 170) c.position.x += 0.5;
    });
    expect(rests()).toBe(2);
  });

  it('never counts the first frame, whose stillness is unknown', () => {
    const { observer } = run(1, () => {});
    expect(observer.still).toBe(false);
  });

  it('does not progress while someone else owns the camera', () => {
    const { observer, rests } = run(300, () => false);
    expect(observer.phase).toBe('idle');
    expect(rests()).toBe(0);
  });

  it('resets the hold when navigation is interrupted', () => {
    const { observer, rests } = run(150, (i) => i !== 100);
    expect(observer.phase).toBe('holding');
    expect(rests()).toBe(0);
  });
});
