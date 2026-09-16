// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import * as THREE from 'three';
import { createBlogOrbitRing } from './blogOrbitRing';

afterEach(() => vi.unstubAllGlobals());

function texturedRing(reducedMotion = false) {
  const context = { fillRect: vi.fn(), fillText: vi.fn() };
  vi.stubGlobal('document', { createElement: () => ({ getContext: () => context }) });
  return createBlogOrbitRing(40, reducedMotion);
}

describe('the orbital blog invitation', () => {
  it('uses physical geometry below the display and releases replaced geometry', () => {
    const ring = createBlogOrbitRing(40, false);
    const oldGeometry = ring.target.geometry;
    const dispose = vi.spyOn(oldGeometry, 'dispose');
    ring.resize(60);
    expect(dispose).toHaveBeenCalledOnce();
    const bounds = new THREE.Box3().setFromObject(ring.object);
    expect(bounds.max.y).toBeLessThan(-9);
    expect(bounds.getSize(new THREE.Vector3()).z).toBeGreaterThan(10);
    ring.dispose();
  });

  it('scrolls without rotating the structure and pauses while hidden', () => {
    const ring = texturedRing();
    const texture = ring.target.material.map!;
    const rotation = ring.object.quaternion.clone();
    ring.setPresence(1);
    ring.update(1);
    expect(texture.offset.x).toBeLessThan(0);
    expect(ring.object.quaternion.equals(rotation)).toBe(true);
    const offset = texture.offset.x;
    ring.setPresence(0);
    ring.update(1);
    expect(texture.offset.x).toBe(offset);
    expect(ring.object.visible).toBe(false);
    ring.dispose();
  });

  it('keeps the invitation static when reduced motion is requested', () => {
    const ring = texturedRing(true);
    ring.setPresence(1);
    ring.update(10);
    expect(ring.target.material.map!.offset.x).toBe(0);
    expect(ring.object.visible).toBe(true);
    ring.dispose();
  });

  it('releases its canvas texture when disposed', () => {
    const ring = texturedRing();
    const dispose = vi.spyOn(ring.target.material.map!, 'dispose');
    ring.dispose();
    expect(dispose).toHaveBeenCalledOnce();
  });
});
