import { describe, expect, it } from 'vitest';
import { parseUnifiedManifest } from './unifiedManifest';

const manifest = () => ({ uvChannel: 1, requiredNames: ['logo-V'], atlases: {
  ground: { threeLightMapIntensity: Math.PI * 4, variants: {
    1024: { file: 'ground-1024.ktx2', bytes: 100, mipLevels: 1 },
    2048: { file: 'ground-2048.ktx2', bytes: 200, mipLevels: 2 },
  } },
} });
describe('the selected unified bake contract', () => {
  it('retains per-atlas safe mip limits and radiance scales', () => {
    const parsed = parseUnifiedManifest(manifest());
    expect(parsed.atlases.ground.variants[2048].mipLevels).toBe(2);
    expect(parsed.atlases.ground.threeLightMapIntensity).toBe(Math.PI * 4);
  });
  it('rejects unsafe paths, malformed contracts and mip chains beyond the gutters', () => {
    const m = manifest();
    m.atlases.ground.variants[1024].file = '../other.ktx2';
    expect(() => parseUnifiedManifest(m)).toThrow('variant');
    expect(() => parseUnifiedManifest({ ...manifest(), uvChannel: 0 })).toThrow('contract');
    const mips = manifest();
    mips.atlases.ground.variants[1024].mipLevels = 2;
    expect(() => parseUnifiedManifest(mips)).toThrow('variant');
  });
  it('enforces the total budget across atlases, not a budget per file', () => {
    const m = manifest();
    m.atlases.ground.variants[1024].bytes = 1_100_000;
    expect(() => parseUnifiedManifest({ ...m, atlases: { a: m.atlases.ground, b: m.atlases.ground } })).toThrow('total download');
  });
});
