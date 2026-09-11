/**
 * The shape of the two manifests the bake pipeline writes beside its KTX2 files
 * (`assets-lightmaps.json`, `ground-lightmaps.json`), and the pure decisions
 * made from them. No three, no DOM: this is the part under test.
 */

export type LightmapResolution = 1024 | 2048;
export type LightmapChunk = 'NW' | 'NE' | 'SW' | 'SE';
export type AssetLightmapKind = 'static' | 'instances';

export const LIGHTMAP_CHUNKS: readonly LightmapChunk[] = ['NW', 'NE', 'SW', 'SE'];

/** One map: its file per resolution and the intensity three needs. */
export interface LightmapEntry {
  /**
   * `lightMapIntensity` for `MeshBasicMaterial`, already multiplied out by the
   * pipeline: three folds `RECIPROCAL_PI` into the lightmap term, and the KTX2
   * stores radiance divided by `linearScale`, so this is `linearScale * PI`.
   */
  threeLightMapIntensity: number;
  variants: Record<string, { ktx2: string }>;
}

export interface AssetLightmapManifest {
  uvChannel: number;
  chunks: Record<LightmapChunk, Record<AssetLightmapKind, LightmapEntry>>;
}

export interface GroundLightmapManifest {
  uvChannel: number;
  chunks: Record<LightmapChunk, LightmapEntry>;
}

function entry(raw: unknown, where: string): LightmapEntry {
  const record = raw as Partial<LightmapEntry> | undefined;
  if (typeof record?.threeLightMapIntensity !== 'number' || typeof record.variants !== 'object') {
    throw new Error(`[lightmaps] ${where} malformed`);
  }
  return { threeLightMapIntensity: record.threeLightMapIntensity, variants: record.variants };
}

/**
 * Read tolerantly of extra fields (the pipeline records bake settings, HDR
 * sources and timings that nothing here reads) and strictly of the four
 * chunks: a manifest missing one would leave a quarter of the city lit by
 * nothing, silently.
 */
export function parseAssetLightmapManifest(raw: unknown): AssetLightmapManifest {
  const json = raw as { uvChannel?: unknown; chunks?: Record<string, Record<string, unknown>> };
  if (!json?.chunks) throw new Error('[lightmaps] no chunks');
  const chunks = {} as AssetLightmapManifest['chunks'];
  for (const q of LIGHTMAP_CHUNKS) {
    const chunk = json.chunks[q];
    if (!chunk) throw new Error(`[lightmaps] missing chunk ${q}`);
    chunks[q] = {
      static: entry(chunk.static, `assets ${q} static`),
      instances: entry(chunk.instances, `assets ${q} instances`),
    };
  }
  return { uvChannel: typeof json.uvChannel === 'number' ? json.uvChannel : 1, chunks };
}

export function parseGroundLightmapManifest(raw: unknown): GroundLightmapManifest {
  const json = raw as { uvChannel?: unknown; chunks?: Record<string, unknown> };
  if (!json?.chunks) throw new Error('[lightmaps] no chunks');
  const chunks = {} as GroundLightmapManifest['chunks'];
  for (const q of LIGHTMAP_CHUNKS) {
    if (!json.chunks[q]) throw new Error(`[lightmaps] missing chunk ${q}`);
    chunks[q] = entry(json.chunks[q], `ground ${q}`);
  }
  return { uvChannel: typeof json.uvChannel === 'number' ? json.uvChannel : 1, chunks };
}

/** The file for a resolution, or a thrown error naming what is missing. */
export function variantFile(map: LightmapEntry, resolution: LightmapResolution, where: string): string {
  const variant = map.variants[String(resolution)];
  if (!variant?.ktx2) throw new Error(`[lightmaps] ${where} has no ${resolution}`);
  return variant.ktx2;
}

/**
 * Which atlas size a device gets.
 *
 * Twelve maps at 2048 transcode to roughly 34 MB of GPU memory against the
 * ~70 MB this project measured as the whole iOS budget
 * (`docs/audits/ios-safari-2026-08-14.md` §3); at 1024 they are about a
 * quarter of that. The split follows the sky panorama's: a phone-width or
 * touch-first viewport takes the smaller set. Both inputs are booleans so the
 * rule is testable without a window.
 */
export function chooseLightmapResolution(device: { narrow: boolean; coarse: boolean }): LightmapResolution {
  return device.narrow || device.coarse ? 1024 : 2048;
}

/**
 * How far down the mip chain a sample may reach, in levels above the base.
 *
 * The atlases pack many UV islands with narrow gutters, so a distant sample
 * averaging across a coarse mip would blend one building's light into its
 * neighbour's. The bake pipeline sized the gutters for these limits: ground to
 * level 2 at 2048, static buildings to level 1, and the 32 px instance cells to
 * the base level only. Halving the atlas halves every gutter, so 1024 drops one
 * level everywhere. Expressed as a footprint multiplier (2^levels) because that
 * is what the shader clamps.
 */
export function maxMipLevel(
  kind: 'ground' | AssetLightmapKind,
  resolution: LightmapResolution,
): number {
  if (kind === 'instances') return 0;
  if (kind === 'ground') return resolution === 2048 ? 2 : 1;
  return resolution === 2048 ? 1 : 0;
}
