// @vitest-environment node
import { describe, expect, it } from 'vitest';
import * as THREE from 'three';
import { whileRevealed } from './whileRevealed';

describe('whileRevealed', () => {
  it('shows hidden targets for the call only, and leaves visible ones alone', () => {
    const hidden = new THREE.Object3D();
    hidden.visible = false;
    const shown = new THREE.Object3D();

    const seen = whileRevealed([hidden, shown], () => [hidden.visible, shown.visible]);

    expect(seen).toEqual([true, true]);
    expect(hidden.visible).toBe(false);
    expect(shown.visible).toBe(true);
  });

  it('hides them again when the call throws', () => {
    const hidden = new THREE.Object3D();
    hidden.visible = false;

    expect(() =>
      whileRevealed([hidden], () => {
        throw new Error('compile failed');
      }),
    ).toThrow('compile failed');
    expect(hidden.visible).toBe(false);
  });

  it('makes a hidden object reachable by a visible-only traversal', () => {
    // The property warm() depends on: three's compile walks traverseVisible.
    const scene = new THREE.Scene();
    const ring = new THREE.Mesh(new THREE.BufferGeometry(), new THREE.MeshBasicMaterial());
    ring.visible = false;
    scene.add(ring);
    const reached = (): THREE.Object3D[] => {
      const found: THREE.Object3D[] = [];
      scene.traverseVisible((object) => found.push(object));
      return found;
    };

    expect(reached()).not.toContain(ring);
    expect(whileRevealed([ring], reached)).toContain(ring);
  });
});
