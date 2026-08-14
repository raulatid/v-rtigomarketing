import type * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import {
  acquireDracoLoader,
  acquireKtx2Loader,
  releaseDracoLoader,
  releaseKtx2Loader,
} from '../../../graphics/decoders';

export interface AssetLoader {
  gltf: GLTFLoader;
  dispose: () => void;
}

/**
 * Shared loader stack, created once for the whole application.
 *
 * The Draco decoder runs a worker pool. Creating and disposing it per load —
 * as the previous single-environment code did — would spin a pool up and tear
 * it down again for every environment (docs/plans/002 Amendment A7).
 *
 * That argument is now made once, in `graphics/decoders.ts`, and holds across
 * the whole application rather than only inside Murcia: the corner logo and the
 * satellites were each building their own pool against the same decoder, and
 * all three loads happen during the intro. `cfg.dracoDecoderPath` went with it
 * — the path is a property of the decoder, not of an environment, and all three
 * call sites had the same string.
 *
 * ## Why the KTX2 transcoder is attached before any texture exists
 *
 * The city GLB ships zero textures today, so this line buys nothing at the
 * moment it is written. It is here anyway, for two reasons.
 *
 * A GLTFLoader without a KTX2 loader does not degrade when it meets a
 * `KHR_texture_basisu` image — it rejects the whole load with *"no DDS/KTX2
 * loader"*, which surfaces as `MurciaExperience`'s fatal-load overlay: the city
 * simply does not exist. That failure would arrive with the asset, from the
 * person least able to read it, and it is one line to make impossible.
 *
 * And it decides the shape of the trim-sheet migration. A production
 * BaseColor + Normal + ORM set at 2048 is 67 MB of RGBA8 against a GPU budget
 * measured at ~70 MB after the 2026-08-14 remediation
 * (`docs/audits/ios-safari-2026-08-14.md` §3) — so the production atlas has to
 * be compressed, and this makes swapping it in a file change rather than a code
 * change.
 *
 * The renderer is a parameter because `detectSupport` asks the GPU which
 * compressed formats it actually has; there is exactly one renderer (ADR 001),
 * and `decoders.ts` ref-counts the transcoder across the three consumers that
 * share it.
 */
export function createAssetLoader(renderer: THREE.WebGLRenderer): AssetLoader {
  const draco = acquireDracoLoader();
  const ktx2 = acquireKtx2Loader(renderer);

  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);
  gltf.setKTX2Loader(ktx2);

  return {
    gltf,
    // Both, and in one function: a caller that released only the Draco pool
    // would leave the Basis workers resident for the session, which is the
    // permanent-residency trade `decoders.ts` exists to refuse.
    dispose: () => {
      releaseDracoLoader();
      releaseKtx2Loader();
    },
  };
}
