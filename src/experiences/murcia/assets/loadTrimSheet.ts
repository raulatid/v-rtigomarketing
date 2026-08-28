import * as THREE from 'three';
import type { TrimSheetConfig } from '../config/environmentConfig';
import { acquireKtx2Loader, releaseKtx2Loader } from '../../../graphics/decoders';

/**
 * The city's trim sheet, fetched as ordinary files rather than out of the GLB.
 *
 * ## Why these are not exported into the GLB
 *
 * `docs/plans/001` and the export contract originally assumed Blender would
 * reference the atlas and the exporter would embed it, on the reasoning that
 * Blender owns the material. That reasoning is still right about UVs and wrong
 * about bytes: it makes every colour change a re-export of a 1.29 MB Draco GLB,
 * and the sheet is going to be iterated dozens of times before anyone is happy
 * with it. Served separately, a change is a file drop and a reload
 * (docs/plans/009 Phase 4).
 *
 * It also costs nothing to do it this way. The GLB ships zero materials, so the
 * runtime has to build the city's material regardless of where the image came
 * from — see `applyTrimSheet`. Assigning the map at the same moment is one line.
 *
 * The repository already does exactly this twice, for the same reason: the
 * satellite (`createSatellite.ts`) and the corner logo (`createCornerLogo.ts`)
 * both load a standalone KTX2 and assign it onto the material their GLB
 * arrived with.
 *
 * ## What that costs, and it is worth stating
 *
 * Colour space. When a texture arrives through `GLTFLoader` it comes with the
 * glTF material model attached, which is why `loadCity`'s report can assert
 * that nothing downstream should touch `colorSpace`. A file loaded on its own
 * carries no such context, so this module has to decide — and a base colour
 * sampled as linear data is the classic silent mis-export: it does not fail, it
 * just renders washed out and slightly wrong forever.
 */

export type TrimMapKind = keyof TrimSheetConfig;

export interface TrimSheet {
  /** Only the maps that were configured AND loaded. Missing is normal. */
  textures: Partial<Record<TrimMapKind, THREE.Texture>>;
}

/**
 * Which three loader can read this file, decided by extension.
 *
 * Extension rather than a config flag, so promoting the test PNG to the
 * production KTX2 set is an edit to a path string and nothing else. Exported
 * for its own test: the switch is the whole migration path and deserves an
 * assertion that does not need a network.
 */
export function isCompressedTexturePath(url: string): boolean {
  return url.split('?')[0].toLowerCase().endsWith('.ktx2');
}

/**
 * Colour space per map kind.
 *
 * Set explicitly for both, never left to a default: `TextureLoader` and
 * `KTX2Loader` do not agree about what an unmarked texture is, and the failure
 * is invisible — a normal map read as sRGB bends light in a way that reads as a
 * lighting bug, and a base colour read as linear reads as a grade.
 */
function colorSpaceFor(kind: TrimMapKind): string {
  return kind === 'baseColor' ? THREE.SRGBColorSpace : THREE.NoColorSpace;
}

/**
 * Loads whichever maps the environment declares.
 *
 * Never rejects. A trim sheet that will not load must leave the city standing —
 * it is a texture, not the model, and Murcia is already a non-required boot
 * resource. The map is dropped, the warning names the URL, and the material is
 * built without that slot.
 */
export async function loadTrimSheet(options: {
  paths: TrimSheetConfig;
  renderer: THREE.WebGLRenderer;
}): Promise<TrimSheet> {
  const entries = (Object.keys(options.paths) as TrimMapKind[])
    .map((kind) => ({ kind, url: options.paths[kind] }))
    .filter((entry): entry is { kind: TrimMapKind; url: string } => entry.url !== null);

  // Acquired only if something actually needs it. The transcoder is a worker
  // pool and a 527 KB wasm module; taking a reference for a set of PNGs would
  // hold it alive for nothing.
  const needsKtx2 = entries.some((entry) => isCompressedTexturePath(entry.url));
  const ktx2 = needsKtx2 ? acquireKtx2Loader(options.renderer) : null;
  const plain = entries.some((entry) => !isCompressedTexturePath(entry.url))
    ? new THREE.TextureLoader()
    : null;

  const textures: Partial<Record<TrimMapKind, THREE.Texture>> = {};

  try {
    await Promise.all(
      entries.map(async ({ kind, url }) => {
        const loader = isCompressedTexturePath(url) ? ktx2 : plain;
        if (!loader) return;
        try {
          const texture = await loader.loadAsync(url);
          texture.name = `city_trim_${kind}`;
          texture.colorSpace = colorSpaceFor(kind) as THREE.ColorSpace;
          // The glTF convention, and the same value both existing KTX2 loads in
          // this repository set. glTF puts the UV origin at the top-left; three
          // samples from the bottom-left unless told otherwise, so a sheet
          // loaded with the default flip has its bands in the wrong order in V.
          // That failure does not look like a failure — a facade quietly
          // samples the roof band — which is exactly what a calibration chart
          // of distinctly coloured bands is for.
          //
          // `CompressedTexture` is already false and `TextureLoader`'s is true,
          // so this is set for both rather than trusted: the two paths must not
          // disagree about which way up the sheet is.
          texture.flipY = false;
          // Wrapping and anisotropy are deliberately NOT set here.
          // `configureTrimTextures` in `loadCity` owns them, runs after these
          // are attached, and already enumerates every slot — a second
          // implementation here is the one that would drift.
          textures[kind] = texture;
        } catch (error) {
          console.warn(`[murcia] trim sheet "${kind}" failed to load from ${url}`, error);
        }
      }),
    );
  } finally {
    // Balanced with the acquire above, once, whatever happened. The transcoder
    // is only needed to decode: holding the reference past that keeps a worker
    // pool and its wasm alive for a texture that is already on the GPU. The
    // per-entry catch means this cannot be skipped by a rejection.
    if (ktx2) releaseKtx2Loader();
  }

  return { textures };
}
