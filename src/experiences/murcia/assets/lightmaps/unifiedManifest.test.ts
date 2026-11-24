import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import { murciaConfig } from '../../config/murciaConfig';
import { atlasResolutions, parseUnifiedManifest, selectedVariant } from './unifiedManifest';

const manifest = () => ({ uvChannel: 1, requiredNames: ['logo-V'], atlases: {
  ground: { threeLightMapIntensity: Math.PI * 4, variants: {
    1024: { file: 'ground-1024.ktx2', bytes: 100, mipLevels: 1 },
    2048: { file: 'ground-2048.ktx2', bytes: 200, mipLevels: 2 },
  } },
} });
describe('the selected unified bake contract', () => {
  it('ships the active murcia-v9 profile with exact sizes, dimensions and total budgets', () => {
    const config = murciaConfig.lightmaps!;
    if (!('manifest' in config)) throw new Error('Expected the unified manifest');
    const directory = 'public' + config.baseUrl;
    const shipped = parseUnifiedManifest(JSON.parse(fs.readFileSync(directory + config.manifest, 'utf8')));
    expect(Object.keys(shipped.atlases)).toHaveLength(15);
    expect(shipped.requiredNames).toContain('estadio-techo');
    expect(shipped.requiredNames).toContain('Teatro_Romea');
    for (const resolution of [512, 1024, 2048] as const) {
      for (const atlas of Object.values(shipped.atlases)) {
        const variant = atlas.variants[resolution];
        if (!variant) continue;
        const data = fs.readFileSync(directory + variant.file);
        expect(data.length).toBe(variant.bytes);
        expect(data.subarray(0, 12).toString('hex')).toBe('ab4b5458203230bb0d0a1a0a');
        expect(data.readUInt32LE(20)).toBe(resolution);
        expect(data.readUInt32LE(24)).toBe(resolution);
        expect(data.readUInt32LE(40)).toBe(variant.mipLevels);
      }
    }
    // Phones load every atlas at 512 since 2026-11-24; the desktop keeps 1024, as since r4.
    for (const [base, size, bytes, limit] of [[1024, 512, 526_216, 4_500_000], [2048, 1024, 1_458_128, 6_500_000]] as const) {
      const selected = atlasResolutions(shipped, base);
      const loadedBytes = [...selected].reduce((sum, [key, s]) => sum + selectedVariant(shipped, key, s).bytes, 0);
      expect(new Set(selected.values())).toEqual(new Set([size]));
      expect(loadedBytes).toBe(bytes);
      expect(loadedBytes).toBeLessThanOrEqual(limit);
    }
  });
  it('retains per-atlas safe mip limits and radiance scales', () => {
    const parsed = parseUnifiedManifest(manifest());
    expect(parsed.atlases.ground.variants[2048]?.mipLevels).toBe(2);
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
    m.atlases.ground.variants[1024].bytes = 2_300_000;
    expect(() => parseUnifiedManifest({ ...m, atlases: { a: m.atlases.ground, b: m.atlases.ground } })).toThrow('total download');
  });
});

describe('the size each atlas loads at', () => {
  const two = () => {
    const m = manifest();
    return parseUnifiedManifest({ ...m, atlases: { ...m.atlases, tower: m.atlases.ground } });
  };

  it('takes the device size except where the profile halves an atlas', () => {
    expect([...atlasResolutions(two(), 2048, ['tower'])]).toEqual([['ground', 2048], ['tower', 1024]]);
    expect([...atlasResolutions(two(), 2048, 'all').values()]).toEqual([1024, 1024]);
    expect([...atlasResolutions(two(), 1024, []).values()]).toEqual([1024, 1024]);
  });

  it('refuses a key the bake does not have, rather than loading it at full size', () => {
    expect(() => atlasResolutions(two(), 2048, ['roof'])).toThrow('no atlas to reduce: roof');
  });

  it('names only atlases the shipped bake has', () => {
    const config = murciaConfig.lightmaps!;
    if (!('manifest' in config)) throw new Error('Expected the unified manifest');
    const directory = 'public' + config.baseUrl;
    const shipped = parseUnifiedManifest(JSON.parse(fs.readFileSync(directory + config.manifest, 'utf8')));
    expect(() => atlasResolutions(shipped, 2048, config.desktop1024)).not.toThrow();
  });
});

describe('a bake that ships only 1024', () => {
  const only1024 = () => {
    const m = manifest();
    return { ...m, atlases: { ground: { ...m.atlases.ground, variants: { 1024: m.atlases.ground.variants[1024] } } } };
  };

  it('parses, and loads every atlas at 1024 whatever the device', () => {
    const m = parseUnifiedManifest(only1024());
    expect(m.atlases.ground.variants[2048]).toBeUndefined();
    expect([...atlasResolutions(m, 2048).values()]).toEqual([1024]);
    expect(selectedVariant(m, 'ground', 1024).file).toBe('ground-1024.ktx2');
  });

  it('counts the 1024 bytes against the desktop budget', () => {
    const m = only1024();
    m.atlases.ground.variants[1024].bytes = 4_500_000;
    expect(() => parseUnifiedManifest({ ...m, atlases: { a: m.atlases.ground, b: m.atlases.ground } })).toThrow('total download');
  });

  it('rejects a profile that names the 2048 variant it does not ship', () => {
    expect(() => parseUnifiedManifest({ ...only1024(), profiles: { desktop: { atlasResolutions: { ground: 2048 } } } }))
      .toThrow('atlas resolutions');
  });
});

describe('mixed-resolution profile allocation', () => {
  it('loads central mobile maps at 2K and honors explicit reductions', () => {
    const m = parseUnifiedManifest({ ...manifest(), profiles: { mobile: { atlasResolutions: { ground: 2048 } } } });
    expect(atlasResolutions(m, 1024).get('ground')).toBe(2048);
    expect(atlasResolutions(m, 1024, ['ground']).get('ground')).toBe(1024);
  });
  it('rejects incomplete, unknown and unsupported resolution allocations', () => {
    for (const atlasResolutions of [{}, { other: 2048 }, { ground: 4096 }]) {
      expect(() => parseUnifiedManifest({ ...manifest(), profiles: { mobile: { atlasResolutions } } })).toThrow('atlas resolutions');
    }
  });
  it('enforces the bytes actually selected by the mobile profile', () => {
    const m = manifest(); m.atlases.ground.variants[2048].bytes = 4_500_001;
    expect(() => parseUnifiedManifest({ ...m, profiles: { mobile: { atlasResolutions: { ground: 2048 } } } })).toThrow('mobile exceeds');
  });
});

describe('a 512 variant', () => {
  const with512 = () => {
    const m = manifest();
    return { ...m, atlases: { ground: { ...m.atlases.ground, variants: {
      ...m.atlases.ground.variants, 512: { file: 'ground-512.ktx2', bytes: 40, mipLevels: 1 },
    } } } };
  };

  it('loads only where a profile names it', () => {
    const m = parseUnifiedManifest({ ...with512(), profiles: { mobile: { atlasResolutions: { ground: 512 } } } });
    expect(atlasResolutions(m, 1024).get('ground')).toBe(512);
    expect(atlasResolutions(m, 2048).get('ground')).toBe(2048);
    expect(atlasResolutions(parseUnifiedManifest(with512()), 1024).get('ground')).toBe(1024);
    expect(selectedVariant(m, 'ground', 512).file).toBe('ground-512.ktx2');
  });

  it('is not raised to 1024 by an explicit reduction', () => {
    const m = parseUnifiedManifest({ ...with512(), profiles: { mobile: { atlasResolutions: { ground: 512 } } } });
    expect(atlasResolutions(m, 1024, ['ground']).get('ground')).toBe(512);
    expect(atlasResolutions(m, 1024, 'all').get('ground')).toBe(512);
  });

  it('is validated like the 1024 one: path, bytes and a single mip', () => {
    for (const change of [{ file: '../x.ktx2' }, { bytes: 0 }, { mipLevels: 2 }]) {
      const m = with512();
      Object.assign(m.atlases.ground.variants[512], change);
      expect(() => parseUnifiedManifest(m)).toThrow('invalid 512 variant');
    }
  });

  it('cannot be named by a profile when the bake does not ship it', () => {
    expect(() => parseUnifiedManifest({ ...manifest(), profiles: { mobile: { atlasResolutions: { ground: 512 } } } }))
      .toThrow('atlas resolutions');
  });

  it('counts its own bytes against the profile that names it', () => {
    const m = with512(); m.atlases.ground.variants[512].bytes = 4_500_001;
    expect(() => parseUnifiedManifest({ ...m, profiles: { mobile: { atlasResolutions: { ground: 512 } } } })).toThrow('mobile exceeds');
  });
});

describe('exact profile budget boundaries', () => {
  for (const [profile, resolution, limit] of [['mobile', 1024, 4_500_000], ['desktop', 2048, 6_500_000]] as const) {
    for (const explicit of [false, true]) {
      it(`${profile} ${explicit ? 'allocated' : 'fallback'} accepts the ceiling and rejects one byte more`, () => {
        const m = manifest();
        m.atlases.ground.variants[resolution].bytes = limit;
        const candidate = explicit ? { ...m, profiles: { [profile]: { atlasResolutions: { ground: resolution } } } } : m;
        expect(() => parseUnifiedManifest(candidate)).not.toThrow();
        m.atlases.ground.variants[resolution].bytes++;
        expect(() => parseUnifiedManifest(candidate)).toThrow('total download budget');
      });
    }
  }
});
