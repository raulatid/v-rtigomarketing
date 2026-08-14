import type * as THREE from 'three'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'

/**
 * The application's Draco and Basis decoders, one of each.
 *
 * WHAT THIS REPLACED. Three modules each built their own `DRACOLoader` and two
 * of them each built a `KTX2Loader` — the city, the corner logo and the
 * satellites — all pointing at the same byte-identical decoder paths. Each
 * loader runs a worker pool (three's default limit is 4), and each worker
 * instantiates its own WASM module: 192 KB of Draco per pool and 527 KB of
 * Basis per pool. Five pools is up to twenty workers and roughly 1.6 MB of
 * duplicated WASM heap — and because all three of those assets load during the
 * intro, they existed AT THE SAME TIME, alongside 209 MB of texture uploads.
 * That is the loading peak, on the platform that terminates tabs for it
 * (`audits/ios-safari-2026-08-14.md`, I6).
 *
 * `createAssetLoader` already made this argument for Murcia — "creating and
 * disposing it per load would spin a pool up and tear it down again for every
 * environment" — and then did not generalise it. This is that argument applied
 * once, which is PRINCIPLES §6: the decision about decoder paths and pool
 * lifetimes belongs in one place rather than in every caller.
 *
 * WHY REFERENCE COUNTING RATHER THAN A PLAIN SINGLETON. A singleton would fix
 * the peak and then hold two worker pools for the rest of the session, trading
 * a loading spike for permanent residency — a bad trade on a device where the
 * steady state is already the problem. Counting keeps both properties: at most
 * one pool of each kind exists at a time, and the last consumer to finish
 * releases it. Every call site already had a dispose path, so each maps onto a
 * `release` with no change to when things are freed.
 *
 * WORKER LIMITS ARE LEFT AT THREE'S DEFAULT, deliberately. Lowering them would
 * cut the WASM heap further and slow decoding of the city's 257 meshes by an
 * amount nothing here can measure. That is a device-profile question, not an
 * audit one (PRINCIPLES §28).
 *
 * OWNERSHIP. This module owns the instances; callers own their references.
 * Acquire and release in pairs, like any other resource here (§9, §31).
 */

// The glTF-specific Draco decoder. `public/draco/` is byte-identical to
// three's `examples/jsm/libs/draco/gltf` — keep them in step when upgrading
// three. It is NOT the generic decoder, which is larger and includes an encoder
// nothing here uses.
//
// Root-absolute, not 'draco/'. A document-relative path resolves against the
// current route, so it would 404 on anything but the root URL — and this app
// has a /debug route.
const DRACO_PATH = '/draco/'
// Copied from three's `examples/jsm/libs/basis`; keep in step when upgrading.
const BASIS_PATH = '/libs/basis/'

let draco: DRACOLoader | null = null
let dracoRefs = 0

let ktx2: KTX2Loader | null = null
let ktx2Refs = 0

/**
 * The shared Draco decoder. Pair with {@link releaseDracoLoader}.
 *
 * Callers still own their own `GLTFLoader` — that is per-load state (a
 * `LoadingManager`, progress wiring) and is cheap. Only the worker pool is
 * worth sharing.
 */
export function acquireDracoLoader(): DRACOLoader {
  if (!draco) {
    draco = new DRACOLoader()
    draco.setDecoderPath(DRACO_PATH)
  }
  dracoRefs += 1
  return draco
}

export function releaseDracoLoader(): void {
  if (dracoRefs === 0) return
  dracoRefs -= 1
  if (dracoRefs > 0) return
  draco?.dispose()
  draco = null
}

/**
 * The shared KTX2/Basis transcoder. Pair with {@link releaseKtx2Loader}.
 *
 * `detectSupport` asks the renderer which compressed formats the GPU actually
 * has, and gets it right for one renderer — which is all there ever is here
 * (ADR 001). Calling it again on an existing instance is harmless and keeps the
 * answer correct if the renderer identity ever changes, which is why it is not
 * inside the construction branch.
 */
export function acquireKtx2Loader(renderer: THREE.WebGLRenderer): KTX2Loader {
  if (!ktx2) {
    ktx2 = new KTX2Loader().setTranscoderPath(BASIS_PATH)
  }
  ktx2.detectSupport(renderer)
  ktx2Refs += 1
  return ktx2
}

export function releaseKtx2Loader(): void {
  if (ktx2Refs === 0) return
  ktx2Refs -= 1
  if (ktx2Refs > 0) return
  ktx2?.dispose()
  ktx2 = null
}
