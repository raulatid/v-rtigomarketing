import type { LightmapResolution } from './lightmapManifest';

export interface UnifiedVariant { file: string; bytes: number; mipLevels: number }
export interface UnifiedAtlas {
  threeLightMapIntensity: number;
  /** 1024 is required; 2048 is optional, and an atlas without it loads at 1024 everywhere. */
  variants: { 1024: UnifiedVariant; 2048?: UnifiedVariant };
}
export interface UnifiedManifest {
  profiles?: Partial<Record<'mobile' | 'desktop', { atlasResolutions?: Record<string, LightmapResolution> }>>;
  uvChannel: 1;
  requiredNames: string[];
  atlases: Record<string, UnifiedAtlas>;
}

/**
 * The lightmap download budget per profile, in bytes, over the whole set rather
 * than per file. A manifest past it is refused before anything is fetched. Mobile
 * is the 1024 set, desktop the 2048 one, unless the manifest assigns resolutions
 * per atlas, in which case the assigned mix is what is measured.
 */
export const LIGHTMAP_BUDGET_BYTES = { mobile: 4_500_000, desktop: 6_500_000 } as const;

/** Validate before allocating GPU resources; filenames stay within the versioned folder. */
export function parseUnifiedManifest(value: unknown): UnifiedManifest {
  if (!value || typeof value !== 'object') throw new Error('[lightmaps] invalid manifest');
  const m = value as UnifiedManifest;
  if (m.uvChannel !== 1 || !Array.isArray(m.requiredNames) ||
      !m.requiredNames.every(n => typeof n === 'string' && n.length > 0) ||
      new Set(m.requiredNames).size !== m.requiredNames.length ||
      !m.atlases || typeof m.atlases !== 'object' || !Object.keys(m.atlases).length) {
    throw new Error('[lightmaps] invalid receiver contract');
  }
  const totals = { 1024: 0, 2048: 0 };
  for (const [key, entry] of Object.entries(m.atlases)) {
    if (!entry || !Number.isFinite(entry.threeLightMapIntensity) || entry.threeLightMapIntensity <= 0) {
      throw new Error(`[lightmaps] invalid intensity: ${key}`);
    }
    for (const resolution of [1024, 2048] as const) {
      const v = entry.variants?.[resolution];
      if (resolution === 2048 && v === undefined) {
        totals[2048] += entry.variants[1024].bytes;
        continue;
      }
      if (!v || typeof v.file !== 'string' || !/^[a-zA-Z0-9_-]+\.ktx2$/.test(v.file) ||
          !Number.isInteger(v.bytes) || v.bytes <= 0 ||
          !Number.isInteger(v.mipLevels) || v.mipLevels < 1 || v.mipLevels > (resolution === 1024 ? 1 : 2)) {
        throw new Error(`[lightmaps] invalid ${resolution} variant: ${key}`);
      }
      totals[resolution] += v.bytes;
    }
  }
  if ((!m.profiles?.mobile?.atlasResolutions && totals[1024] > LIGHTMAP_BUDGET_BYTES.mobile) ||
      (!m.profiles?.desktop?.atlasResolutions && totals[2048] > LIGHTMAP_BUDGET_BYTES.desktop)) {
    throw new Error('[lightmaps] profile exceeds the total download budget');
  }
  for (const profile of ['mobile', 'desktop'] as const) {
    const limit = LIGHTMAP_BUDGET_BYTES[profile];
    const sizes = m.profiles?.[profile]?.atlasResolutions;
    if (sizes === undefined) continue;
    if (!sizes || typeof sizes !== 'object' || Object.keys(sizes).length !== Object.keys(m.atlases).length ||
        Object.keys(sizes).some(key => !(key in m.atlases)) ||
        Object.keys(m.atlases).some(key => sizes[key] !== 1024 && sizes[key] !== 2048) ||
        Object.keys(m.atlases).some(key => !m.atlases[key].variants[sizes[key]])) {
      throw new Error(`[lightmaps] invalid ${profile} atlas resolutions`);
    }
    const total = Object.entries(sizes).reduce((sum, [key, size]) => sum + m.atlases[key].variants[size]!.bytes, 0);
    if (total > limit) throw new Error(`[lightmaps] ${profile} exceeds the total download budget`);
  }
  return m;
}

/**
 * The manifest may allocate mixed resolutions per profile. Explicit reductions take precedence.
 * An atlas that ships no 2048 variant loads at 1024 whatever the device.
 *
 * A reduced key the manifest does not have throws rather than being skipped. The
 * list names one bake's atlases, and after a re-bake a stale name would otherwise
 * put the atlas it meant back at full size without a word.
 */
export function atlasResolutions(
  manifest: UnifiedManifest,
  base: LightmapResolution,
  reduced: readonly string[] | 'all' = [],
): Map<string, LightmapResolution> {
  const keys = Object.keys(manifest.atlases);
  if (reduced !== 'all') {
    for (const key of reduced) {
      if (!(key in manifest.atlases)) throw new Error(`[lightmaps] no atlas to reduce: ${key}`);
    }
  }
  const small = new Set(reduced === 'all' ? keys : reduced);
  const profile = manifest.profiles?.[base === 1024 ? 'mobile' : 'desktop']?.atlasResolutions;
  const own = (key: string): LightmapResolution => (manifest.atlases[key].variants[base] ? base : 1024);
  return new Map(keys.map((key) => [key, small.has(key) ? 1024 : profile?.[key] ?? own(key)]));
}

/** The variant `atlasResolutions` chose; it always exists in a parsed manifest. */
export function selectedVariant(manifest: UnifiedManifest, key: string, size: LightmapResolution): UnifiedVariant {
  return manifest.atlases[key].variants[size]!;
}
