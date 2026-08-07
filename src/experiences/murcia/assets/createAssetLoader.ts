import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import type { AppConfig } from '../config/appConfig';

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
 */
export function createAssetLoader(cfg: AppConfig): AssetLoader {
  const draco = new DRACOLoader();
  draco.setDecoderPath(cfg.dracoDecoderPath);

  const gltf = new GLTFLoader();
  gltf.setDRACOLoader(draco);

  return {
    gltf,
    dispose: () => draco.dispose(),
  };
}
