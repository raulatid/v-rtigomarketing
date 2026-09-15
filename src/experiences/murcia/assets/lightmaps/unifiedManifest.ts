import type { LightmapResolution } from './lightmapManifest';

export interface UnifiedAtlas {
  threeLightMapIntensity: number;
  variants: Record<LightmapResolution, { file: string; bytes: number; mipLevels: number }>;
}
export interface UnifiedManifest {
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
  if (totals[1024] > 2_000_000 || totals[2048] > 4_000_000) {
    throw new Error('[lightmaps] profile exceeds the total download budget');
  }
  return m;
}
