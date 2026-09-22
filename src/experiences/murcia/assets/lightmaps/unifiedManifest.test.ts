import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { murciaConfig } from '../../config/murciaConfig';
import { parseUnifiedManifest } from './unifiedManifest';

const manifest = () => ({ uvChannel: 1, requiredNames: ['logo-V'], atlases: {
  ground: { threeLightMapIntensity: Math.PI * 4, variants: {
    1024: { file: 'ground-1024.ktx2', bytes: 100, mipLevels: 1 },
    2048: { file: 'ground-2048.ktx2', bytes: 200, mipLevels: 2 },
  } },
} });
describe('the selected unified bake contract', () => {
  it('ships the active v5.1 revision 3 profile with exact sizes, dimensions and total budgets', () => {
    const config = murciaConfig.lightmaps!;
    if (!('manifest' in config)) throw new Error('Expected the unified manifest');
    const directory = 'public' + config.baseUrl;
    const shipped = parseUnifiedManifest(JSON.parse(fs.readFileSync(directory + config.manifest, 'utf8')));
    expect(Object.keys(shipped.atlases)).toHaveLength(15);
    expect(shipped.requiredNames).toContain('estadio-techo');
    for (const resolution of [1024, 2048] as const) {
      let total = 0;
      for (const atlas of Object.values(shipped.atlases)) {
        const variant = atlas.variants[resolution];
        const data = fs.readFileSync(directory + variant.file);
        expect(data.length).toBe(variant.bytes);
        expect(data.subarray(0, 12).toString('hex')).toBe('ab4b5458203230bb0d0a1a0a');
        expect(data.readUInt32LE(20)).toBe(resolution);
        expect(data.readUInt32LE(24)).toBe(resolution);
        expect(data.readUInt32LE(40)).toBe(variant.mipLevels);
        total += data.length;
      }
      expect(total).toBe(resolution === 1024 ? 1993861 : 3995942);
    }
  });
  it('preserves the eight unaffected atlases and their runtime metadata exactly', () => {
    const config = murciaConfig.lightmaps!;
    if (!('manifest' in config)) throw new Error('Expected the unified manifest');
    const directory = 'public' + config.baseUrl;
    const baseline = 'public/textures/murcia/lightmaps-v5.1-r2/';
    const shipped = parseUnifiedManifest(JSON.parse(fs.readFileSync(directory + config.manifest, 'utf8')));
    const previous = parseUnifiedManifest(JSON.parse(fs.readFileSync(baseline + 'lightmaps.json', 'utf8')));
    for (const key of ['ground-NE', 'ground-SE', 'ground-SW', 'instances-2',
      'landmark-campus', 'landmark-vertigo-blog', 'static-SE', 'static-SW']) {
      expect(shipped.atlases[key]).toEqual(previous.atlases[key]);
      for (const resolution of [1024, 2048] as const) {
        const file = shipped.atlases[key].variants[resolution].file;
        expect(fs.readFileSync(directory + file).equals(fs.readFileSync(baseline + file))).toBe(true);
      }
    }
  });
  it('retains the legacy stadium repair with accurate texture metadata', () => {
    const directory = 'public/textures/murcia/lightmaps-v2/';
    const shipped = parseUnifiedManifest(JSON.parse(fs.readFileSync(directory + 'lightmaps.json', 'utf8')));
    expect(shipped.requiredNames).toContain('estadio-techo');
    expect(shipped.atlases['stadium-roof']).toBeDefined();
    for (const atlas of Object.values(shipped.atlases)) {
      for (const resolution of [1024, 2048] as const) {
        const variant = atlas.variants[resolution];
        const bytes = fs.readFileSync(directory + variant.file);
        expect(bytes.length).toBe(variant.bytes);
        expect(bytes.subarray(0, 12).toString('hex')).toBe('ab4b5458203230bb0d0a1a0a');
        expect(bytes.readUInt32LE(20)).toBe(resolution);
        expect(bytes.readUInt32LE(24)).toBe(resolution);
        expect(bytes.readUInt32LE(40)).toBe(variant.mipLevels);
      }
    }
  });
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
