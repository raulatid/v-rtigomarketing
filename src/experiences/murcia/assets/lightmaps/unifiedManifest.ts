import type { LightmapResolution } from './lightmapManifest';

export interface UnifiedAtlas {
  threeLightMapIntensity: number;
  variants: Record<LightmapResolution, { file: string; bytes: number; mipLevels: number }>;
}
export interface UnifiedManifest {
  profiles?: Partial<Record<'mobile' | 'desktop', { atlasResolutions?: Record<string, LightmapResolution> }>>;
  uvChannel: 1;
  requiredNames: string[];
  atlases: Record<string, UnifiedAtlas>;
}

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
      if (!v || typeof v.file !== 'string' || !/^[a-zA-Z0-9_-]+\.ktx2$/.test(v.file) ||
          !Number.isInteger(v.bytes) || v.bytes <= 0 ||
          !Number.isInteger(v.mipLevels) || v.mipLevels < 1 || v.mipLevels > (resolution === 1024 ? 1 : 2)) {
        throw new Error(`[lightmaps] invalid ${resolution} variant: ${key}`);
      }
      totals[resolution] += v.bytes;
    }
  }
  if ((!m.profiles?.mobile?.atlasResolutions && totals[1024] > 4_000_000) || (!m.profiles?.desktop?.atlasResolutions && totals[2048] > 6_000_000)) {
    throw new Error('[lightmaps] profile exceeds the total download budget');
  }
  for (const [profile, limit] of [['mobile', 4_000_000], ['desktop', 6_000_000]] as const) {
    const sizes = m.profiles?.[profile]?.atlasResolutions;
    if (sizes === undefined) continue;
    if (!sizes || typeof sizes !== 'object' || Object.keys(sizes).length !== Object.keys(m.atlases).length ||
        Object.keys(sizes).some(key => !(key in m.atlases)) ||
        Object.keys(m.atlases).some(key => sizes[key] !== 1024 && sizes[key] !== 2048)) {
      throw new Error(`[lightmaps] invalid ${profile} atlas resolutions`);
    }
    const total = Object.entries(sizes).reduce((sum, [key, size]) => sum + m.atlases[key].variants[size].bytes, 0);
    if (total > limit) throw new Error(`[lightmaps] ${profile} exceeds the total download budget`);
  }
  return m;
}

/**
 * The manifest may allocate mixed resolutions per profile. Explicit reductions take precedence.
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
  return new Map(keys.map((key) => [key, small.has(key) ? 1024 : profile?.[key] ?? base]));
}
