import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { loadProgress } from '../loading/progress'
import { acquireDracoLoader, releaseDracoLoader } from '../graphics/decoders'

const MODEL_URL = '/models/vertigo-isotipo-3d.glb'
// The decoder paths used to be declared here, and again in createSatellite.ts,
// and again in Murcia's appConfig — three copies of the same two strings. They
// live in `graphics/decoders.ts` now, with the instances they configure.
//
// Worth keeping from the note that stood here: the Draco path is the
// glTF-specific decoder. It once pointed at /libs/draco/ — the GENERIC decoder
// plus an unused encoder and a duplicate gltf/ copy, 3.6MB of deploy for one
// 750KB decoder.
//
// There is ONE file now. `logoBake.ktx2` and the KTX2 transcoder went with plan
// 019 §3 (2026-09-05): the mark's geometry carries no UV set, so the bake was
// never sampled, and the white it stood in for is the material's own — see
// `brandMaterial.ts`. The satellite still transcodes KTX2; this module no
// longer takes a reference to that pool.

/**
 * The share of `logo:assets` the download is allowed to report.
 *
 * The last quarter is held back for the GPU compile the caller runs on arrival:
 * reporting 100% before the model can actually be shown would make the loading
 * drawing's fill lie about what it is waiting for.
 */
const DOWNLOAD_SHARE = 0.75

export interface LogoAssets {
  model: THREE.Group
}

export interface LogoAssetLoad {
  /** Resolves with the model, or rejects if it failed to load. */
  ready: Promise<LogoAssets>
  /**
   * Stops reporting progress, releases the decoder, and disposes anything that
   * lands afterwards.
   */
  dispose(): void
}

/**
 * The logo's model, loaded and handed over once.
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
export function loadLogoAssets(): LogoAssetLoad {
  // Owned here rather than passed in: it covers exactly this file, and keeping
  // it internal means the caller needs no loader import — which is what lets
  // the whole corner-logo module stay lazily loaded.
  const loadingManager = new THREE.LoadingManager()

  loadingManager.onProgress = (_url, loaded, total) =>
    loadProgress.setStep('logo:assets', total > 0 ? (loaded / total) * DOWNLOAD_SHARE : 0)

  // The Draco pool is shared with the satellites and the city — see
  // `graphics/decoders.ts`. All three of those loads happen during the intro,
  // so building a pool each meant up to twenty workers and ~1.6MB of duplicated
  // WASM alive simultaneously, at the peak.
  const dracoLoader = acquireDracoLoader()
  const gltfLoader = new GLTFLoader(loadingManager)
  gltfLoader.setDRACOLoader(dracoLoader)

  let disposed = false
  /** True once `ready` has resolved and the caller owns the model. */
  let handedOver = false

  /**
   * The decoder pool goes back as soon as the load has SETTLED, not when this
   * module is disposed.
   *
   * Disposal is the wrong moment and the measurement says so: the corner logo
   * lives for the whole visit, so releasing there meant the reference count
   * never reached zero and four Draco workers stayed resident from the intro
   * onwards — on a page that had finished decoding at second four. Sampled
   * every second against the production build: resident from t=4s to the end
   * of the session.
   *
   * Settled, not succeeded: an error path has no more use for a decoder than a
   * success path, and the error callback below is exactly where a leak would
   * otherwise hide.
   *
   * Idempotent, because `dispose()` may run before the load settles and must
   * not release a reference this function has already given back — the count is
   * shared, and an extra release would tear the pool out from under whoever
   * else is decoding.
   */
  let decoderReleased = false

  function releaseDecoder(): void {
    if (decoderReleased) return
    decoderReleased = true
    releaseDracoLoader()
  }

  let settle: (assets: LogoAssets) => void
  let fail: (reason: Error) => void
  const ready = new Promise<LogoAssets>((resolve, reject) => {
    settle = resolve
    fail = reject
  })

  gltfLoader.load(
    MODEL_URL,
    (gltf) => {
      releaseDecoder()
      if (disposed || handedOver) return
      handedOver = true
      settle({ model: gltf.scene })
    },
    undefined,
    (err) => {
      releaseDecoder()
      if (disposed) return
      // `logo:assets` is a REQUIRED manifest entry, and this branch used to mark
      // it neither done nor fatal — so readiness could reach neither state and
      // the loading screen waited forever on a 20KB file. Every visitor, for a
      // single 404.
      //
      // Done rather than fatal, because degrading is what the caller already
      // does: it holds the 2D isotype on screen instead of playing the
      // crossover. The site is entirely usable without the 3D mark, so it must
      // not be able to stop the site existing.
      loadProgress.markDone('logo:assets')
      fail(err instanceof Error ? err : new Error(String(err)))
    },
  )

  return {
    ready,
    dispose() {
      disposed = true
      // The manager outlives this call only if the load is still in flight; its
      // callback would report progress for a logo nobody is waiting for.
      loadingManager.onProgress = () => {}
      // Released, not disposed: this is a shared instance and another consumer
      // may still be decoding. The pool is torn down when the last reference
      // goes, which is the same moment it used to be torn down here.
      //
      // A no-op once the load has settled, which is the normal case — see
      // releaseDecoder above. This branch is for the logo disposed mid-flight.
      releaseDecoder()
    },
  }
}
