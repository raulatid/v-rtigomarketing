import { describe, expect, it } from 'vitest';
import { ShaderMaterial, Vector3 } from 'three';
import { createParticleField, type ParticleFieldConfig } from './particleField';
import { discLayout } from './layouts';

const config: ParticleFieldConfig = {
  count: 32, emergenceHeight: 2, emergenceSeconds: 0.9, convergenceSeconds: 1.1,
  size: 0.2, swellAmplitude: 0, swellLength: 12, swellSpeed: 0.5,
  rotationSpeed: Math.PI * 2 / 120, color: 0xffffff, accentShare: 0.5, opacity: 0.85,
};

function setup() {
  const center = new Vector3(100, 4, -200);
  const field = createParticleField({ center, radius: 10 }, config);
  field.rebuild(config, discLayout(center, 8));
  const uniforms = (field.points.material as ShaderMaterial).uniforms;
  return { field, center, angle: () => uniforms.uRotation!.value as number };
}

describe('continuous campus rotation', () => {
  it('advances at the same constant rate at 30, 60 and 120 fps', () => {
    for (const fps of [30, 60, 120]) {
      const { field, angle } = setup();
      for (let i = 0; i < fps * 30; i++) field.tick(1 / fps, true);
      expect(angle()).toBeCloseTo(Math.PI / 2, 10);
      field.dispose();
    }
  });

  it('keeps its phase through a shape change and pauses while hidden', () => {
    const { field, center, angle } = setup();
    field.tick(10, false);
    expect(angle()).toBe(0);
    field.tick(10, true);
    const before = angle();
    field.setLayout(discLayout(center, 5), 0.8);
    expect(angle()).toBe(before);
    field.tick(1, false);
    expect(angle()).toBeCloseTo(before + config.rotationSpeed);
    field.setElapsed(0);
    const hidden = angle();
    field.tick(10, false);
    expect(angle()).toBe(hidden);
    field.dispose();
  });

  it('removes the turn for reduced motion without changing the layout', () => {
    const { field, angle } = setup();
    field.tick(10, true);
    const targets = Array.from(field.points.geometry.getAttribute('aTarget').array);
    field.configure({ ...config, rotationSpeed: 0 });
    field.tick(10, true);
    expect(angle()).toBe(0);
    expect(Array.from(field.points.geometry.getAttribute('aTarget').array)).toEqual(targets);
    field.dispose();
  });
});
