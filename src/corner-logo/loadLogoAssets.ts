import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadProgress } from '../loading/progress'
import {
  acquireDracoLoader,
  acquireKtx2Loader,
  releaseDracoLoader,
  releaseKtx2Loader,
} from '../graphics/decoders'

const MODEL_URL = '/models/model.glb'
const TEXTURE_URL = '/textures/logoBake.ktx2'
// The decoder paths used to be declared here, and again in createSatellite.ts,
// and again in Murcia's appConfig — three copies of the same two strings. They
// live in `graphics/decoders.ts` now, with the instances they configure.
//
// Worth keeping from the note that stood here: the Draco path is the
// glTF-specific decoder. It once pointed at /libs/draco/ — the GENERIC decoder
// plus an unused encoder and a duplicate gltf/ copy, 3.6MB of deploy for one
// 750KB decoder.

/**
 * The share of `logo:assets` the two downloads are allowed to report.
 *
 * The last quarter is held back for the GPU compile the caller runs on arrival:
 * reporting 100% before the model can actually be shown would make the loading
 * drawing's fill lie about what it is waiting for.
 */
const DOWNLOAD_SHARE = 0.75

export interface LogoAssets {
  model: THREE.Group
  /** Null when the KTX2 failed. The model is shown untextured — see below. */
  texture: THREE.Texture | null
}

export interface LogoAssetLoad {
  /**
   * Resolves once both files have settled and the model arrived.
   *
   * Rejects ONLY if the model failed. A missing texture is a degradation, not a
   * failure, and the two are deliberately not symmetric: an untextured mark is
   * still the mark, and no mark at all is not.
   */
  ready: Promise<LogoAssets>
  /**
   * Stops reporting progress, releases the decoders, and disposes anything that
   * lands afterwards.
   */
  dispose(): void
}

/**
 * The logo's two files, loaded in parallel and joined when both settle.
 *
 * Split out of createCornerLogo because it is the half of that module with a
 * cancellation problem, and the cancellation was the part that leaked into
 * everything else: a `disposed` flag declared beside the scene was read by
 * seven callbacks scattered across 250 lines, because three.js loads are not
 * cancellable and a GLB landing after teardown would otherwise attach
 * geometries to a disposed scene and report readiness for a logo that no longer
 * exists. React 19 StrictMode makes that the normal path in dev, not an edge
 * case.
 *
 * Owning the flag here reduces those seven to two: this module's own guards,
 * and one in the caller around assembly.
 */
export function loadLogoAssets(renderer: THREE.WebGLRenderer): LogoAssetLoad {
  // Owned here rather than passed in: it covers exactly these two files, and
  // keeping it internal means the caller needs no loader import — which is what
  // lets the whole corner-logo module stay lazily loaded.
  const loadingManager = new THREE.LoadingManager()

  loadingManager.onProgress = (_url, loaded, total) =>
    loadProgress.setStep('logo:assets', total > 0 ? (loaded / total) * DOWNLOAD_SHARE : 0)

  // Both decoders are shared with the satellites and the city — see
  // `graphics/decoders.ts`. All three of those loads happen during the intro,
  // so building a pool each meant up to twenty workers and ~1.6MB of duplicated
  // WASM alive simultaneously, at the peak.
  //
  // The KTX2 loader therefore no longer takes this module's LoadingManager, so
  // the texture's bytes no longer feed `onProgress`. That is a real change and
  // it is the right one: the manager counted two files, and the share it
  // reports was always dominated by the 20KB model against the 23KB bake — the
  // step is still driven to completion by `joinIfReady` either way.
  const ktx2Loader = acquireKtx2Loader(renderer)
  const dracoLoader = acquireDracoLoader()
  const gltfLoader = new GLTFLoader(loadingManager)
  gltfLoader.setDRACOLoader(dracoLoader)

  let disposed = false
  /** True once `ready` has resolved and the caller owns the texture. */
  let handedOver = false

  let model: THREE.Group | null = null
  let texture: THREE.Texture | null = null
  let texturePending = true

  let settle: (assets: LogoAssets) => void
  let fail: (reason: Error) => void
  const ready = new Promise<LogoAssets>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  function joinIfReady() {
    if (disposed || handedOver) return
    if (!model || texturePending) return
    handedOver = true
    settle({ model, texture })
  }

  gltfLoader.load(
    MODEL_URL,
    (gltf) => {
      if (disposed) return
      model = gltf.scene
      joinIfReady()
    },
    undefined,
    (err) => {
      if (disposed) return
      // `logo:assets` is a REQUIRED manifest entry, and this branch used to mark
      // it neither done nor fatal — so readiness could reach neither state and
      // the loading screen waited forever on a 20KB file. Every visitor, for a
      // single 404.
      //
      // Done rather than fatal, because degrading is what the caller already
      // does: it holds the 2D isotype on screen instead of playing the
      // crossover. The site is entirely usable without the 3D mark, so it must
      // not be able to stop the site existing. The KTX2 branch below has always
      // degraded this way; this only makes the two agree.
      loadProgress.markDone('logo:assets')
      fail(err instanceof Error ? err : new Error(String(err)))
    },
  )

  ktx2Loader.load(
    TEXTURE_URL,
    (loaded) => {
      // Disposed mid-flight: this texture has no owner left, so release it here
      // rather than leaking a decoded KTX2 on the GPU.
      if (disposed) {
        loaded.dispose()
        return
      }
      loaded.colorSpace = THREE.SRGBColorSpace
      loaded.flipY = false
      texture = loaded
      texturePending = false
      joinIfReady()
    },
    undefined,
    (err) => {
      if (disposed) return
      // Degrade gracefully: show the model untextured rather than hanging.
      console.warn('[corner-logo] KTX2 failed, using untextured model:', err)
      texturePending = false
      joinIfReady()
    },
  )

  return {
    ready,
    dispose() {
      disposed = true
      // The manager outlives this call only if a load is still in flight; its
      // callback would report progress for a logo nobody is waiting for.
      loadingManager.onProgress = () => {}
      // Released, not disposed: these are shared instances and another consumer
      // may still be decoding. The pool is torn down when the last reference
      // goes, which is the same moment it used to be torn down here.
      releaseKtx2Loader()
      releaseDracoLoader()
      // Only if the caller never took it. After handover the texture is bound
      // to the model's materials and is disposed with the scene.
      if (!handedOver) texture?.dispose()
    },
  }
}
