import * as THREE from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js'
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js'
import { loadProgress } from '../loading/progress'
import { disposeObject3D } from '../graphics/disposal'
import { clamp01, easeInOutCubic } from '../utils/easing'

// 3D brand logo revealed at screen centre by the P3 crossover, which then spins
// 360°, flies to the top-left corner and idles there.
//
// Owns its own scene and camera, but NOT a renderer, a canvas or a frame loop:
// it is drawn as an overlay pass by graphics/RenderPipeline after the main
// render, on the application's single WebGLRenderer (ADR 001, ADR 002).
//
// The depth isolation the old dedicated renderer provided is preserved by the
// pipeline's clearDepth() before this pass, and the two cameras still cannot
// affect each other because this one is never exposed outside this module.

const MODEL_URL = '/models/model.glb'
const TEXTURE_URL = '/textures/logoBake.ktx2'
const BASIS_PATH = '/libs/basis/'
// The glTF-specific decoder, shared with createSatellite.ts. This used to point
// at /libs/draco/ (the GENERIC decoder plus an unused encoder and a duplicate
// gltf/ copy — 3.6MB of deploy for one 750KB decoder). public/draco/* is
// byte-identical to what was public/libs/draco/gltf/*, and is already the
// decoder proven by satellite.glb, so both loaders now share it.
const DRACO_PATH = '/draco/'

const STATES = {
  HIDDEN: 'hidden',
  SPINNING: 'spinning',
  TO_CORNER: 'toCorner',
  IDLE: 'idle',
} as const

type State = (typeof STATES)[keyof typeof STATES]

const IDLE_ROTATION_SPEED = 0.15 // rad/s
const IDLE_FLOAT_AMPLITUDE = 0.035
const IDLE_FLOAT_FREQUENCY = 0.8 // Hz

/**
 * The eight numbers this module needs, declared here rather than imported.
 *
 * They are tuned alongside the intro and live in Earth's `introConfig`, which
 * this file used to import wholesale — an experience dependency inside a module
 * that ADR 002 established as application chrome precisely because it outlives
 * both experiences. `IntroConfig` satisfies this structurally, so the caller
 * passes the same object it always did and nothing changed but the arrow.
 */
export interface CornerLogoConfig {
  /** Fit distance multiplier. Large values flatten the frustum toward ortho. */
  cornerFramePadding: number
  cornerMarginX: number
  cornerMarginY: number
  spinDuration: number
  spinPauseBefore: number
  swapCrossover: number
  swapDuration: number
  toCornerDuration: number
}

interface Options {
  config: CornerLogoConfig
  // The application's single renderer. Injected rather than created: this pass
  // composites onto the same framebuffer as the main scene, so it must share
  // the context (ADR 002). Needed here for KTX2 support detection and for the
  // GPU warm-up below.
  renderer: THREE.WebGLRenderer
  onReady: () => void
  onFailed: () => void
}

export function createCornerLogo({ config, renderer, onReady, onFailed }: Options) {
  // Owned here rather than passed in: it covers this module's two files and
  // nothing else, and keeping it internal means the caller needs no three.js
  // import — which is what lets the layer load this whole module lazily.
  const loadingManager = new THREE.LoadingManager()

  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    45,
    window.innerWidth / window.innerHeight,
    0.01,
    1000,
  )

  scene.add(new THREE.AmbientLight(0xffffff, 0.8))
  const keyLight = new THREE.DirectionalLight(0xffffff, 2.0)
  keyLight.position.set(3, 5, 4)
  scene.add(keyLight)
  const fillLight = new THREE.DirectionalLight(0xffffff, 0.5)
  fillLight.position.set(-3, 1, -2)
  scene.add(fillLight)

  const modelGroup = new THREE.Group()
  modelGroup.visible = false
  scene.add(modelGroup)

  // ─── Loading (parallel GLB + KTX2, joined when both arrive) ───
  let framedDistance = 0
  let modelReady = false
  let logoTexture: THREE.Texture | null = null
  let pendingModel: THREE.Group | null = null
  let texturePending = true

  // Two files on one manager, so item progress is halves. The final quarter is
  // held back for the GPU compile in `finish()` below — reporting 100% before
  // the model can actually be shown would make the drawing's fill lie.
  loadingManager.onProgress = (_url, loaded, total) =>
    loadProgress.setStep('logo:assets', total > 0 ? (loaded / total) * 0.75 : 0)

  const ktx2Loader = new KTX2Loader(loadingManager)
    .setTranscoderPath(BASIS_PATH)
    .detectSupport(renderer)
  const dracoLoader = new DRACOLoader()
  dracoLoader.setDecoderPath(DRACO_PATH)
  const gltfLoader = new GLTFLoader(loadingManager)
  gltfLoader.setDRACOLoader(dracoLoader)

  // Set by dispose(). Every load callback below checks it: the loads are not
  // cancellable, so a GLB or texture that lands after teardown would otherwise
  // attach geometries to a disposed scene, call compileAsync on a dead object,
  // and report readiness for a logo that no longer exists. React 19 StrictMode
  // makes this the normal path in dev, not an edge case. Same guard as
  // createSatellite.ts and createBrandAtlas.ts.
  let disposed = false

  function assembleIfReady() {
    if (disposed) return
    if (!pendingModel || texturePending) return
    const model = pendingModel

    if (logoTexture) {
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) {
          const m = material as THREE.MeshStandardMaterial
          m.map = logoTexture
          if ('metalness' in m) m.metalness = 0
          if ('roughness' in m) m.roughness = 1
          m.needsUpdate = true
        }
      })
    }

    // Recenter on the bounding-box centre so all motion math is origin-based.
    const box = new THREE.Box3().setFromObject(model)
    const center = box.getCenter(new THREE.Vector3())
    model.position.sub(center)
    modelGroup.add(model)

    // Frame the camera: fit distance × padding. A large padding keeps the logo
    // small AND flattens the frustum toward orthographic, which is what makes
    // computeCornerTarget's pixel→world mapping a stable linear one
    // (extraction 001 §5).
    const size = box.getSize(new THREE.Vector3())
    const maxDim = Math.max(size.x, size.y, size.z)
    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    framedDistance = (maxDim / 2 / Math.tan(fovRad / 2)) * config.cornerFramePadding
    camera.position.set(0, 0, framedDistance)
    camera.near = framedDistance / 100
    camera.far = framedDistance * 10
    camera.updateProjectionMatrix()

    // GPU warm-up (plan 003 §3). Still required after the move to a shared
    // context: this scene's MeshStandardMaterial programs are compiled from
    // ITS lights and material defines, which no amount of Earth warm-up
    // covers. Without it they compile on the logo's first rendered frame —
    // the swap crossover, the one moment that depends on precise timing to
    // stay invisible (measured 56.8ms stall).
    // compile() gathers materials with scene.traverse, so the still-hidden
    // modelGroup is included; the lights are scene-level and visible.
    if (logoTexture) renderer.initTexture(logoTexture)
    const finish = () => {
      // compileAsync resolves a frame or more later, by which time teardown may
      // have happened even though assembleIfReady was still live on entry.
      if (disposed) return
      modelReady = true
      // Only now, not on decode: the compile is the part that would otherwise
      // stall the crossover, so it belongs inside the wait the drawing covers.
      loadProgress.markDone('logo:assets')
      onReady()
    }
    renderer.compileAsync(scene, camera).then(finish, finish)
  }

  gltfLoader.load(
    MODEL_URL,
    (gltf) => {
      if (disposed) return
      pendingModel = gltf.scene
      assembleIfReady()
    },
    undefined,
    (err) => {
      if (disposed) return
      console.error('[corner-logo] GLB failed to load:', err)
      // `logo:assets` is a REQUIRED manifest entry, and this branch used to mark
      // it neither done nor fatal — so readiness could reach neither state and
      // the loading screen waited forever on a 20KB file. Every visitor, for a
      // single 404.
      //
      // Done rather than fatal, because degrading is what the caller already
      // does: `onFailed` holds the 2D isotype on screen instead of playing the
      // crossover. The site is entirely usable without the 3D mark, so it must
      // not be able to stop the site existing. The KTX2 loader below has always
      // degraded this way; this only makes the two agree.
      loadProgress.markDone('logo:assets')
      onFailed()
    },
  )

  ktx2Loader.load(
    TEXTURE_URL,
    (texture) => {
      // Disposed mid-flight: this texture has no owner left, so release it here
      // rather than leaking a decoded KTX2 on the GPU.
      if (disposed) {
        texture.dispose()
        return
      }
      texture.colorSpace = THREE.SRGBColorSpace
      texture.flipY = false
      logoTexture = texture
      texturePending = false
      assembleIfReady()
    },
    undefined,
    (err) => {
      if (disposed) return
      // Degrade gracefully: show the model untextured rather than hanging.
      console.warn('[corner-logo] KTX2 failed, using untextured model:', err)
      texturePending = false
      assembleIfReady()
    },
  )

  // ─── Screen-position math (world units at the model plane, z = 0) ───
  function getFramingHalfExtents() {
    const halfH =
      Math.tan(THREE.MathUtils.degToRad(camera.fov / 2)) *
      (framedDistance || camera.position.z)
    return { halfW: halfH * camera.aspect, halfH }
  }

  function computeCornerTarget(target: THREE.Vector3) {
    const { halfW, halfH } = getFramingHalfExtents()
    return target.set(
      halfW * (-1 + (2 * config.cornerMarginX) / window.innerWidth),
      halfH * (1 - (2 * config.cornerMarginY) / window.innerHeight),
      0,
    )
  }

  // ─── State machine ───
  let state: State = STATES.HIDDEN
  let stateT = 0
  const idle = { rotY: 0, elapsed: 0 }
  const cornerTarget = new THREE.Vector3()
  const spinTotalRad = Math.PI * 2

  function startSequence() {
    if (state !== STATES.HIDDEN) return
    if (!modelReady) {
      console.warn('[corner-logo] startSequence called before model ready')
      return
    }
    modelGroup.visible = true
    modelGroup.scale.setScalar(0)
    state = STATES.SPINNING
    stateT = 0
  }

  // Places the logo straight into its idle corner pose, skipping spin + flight.
  function snapToCorner() {
    if (!modelReady) return
    modelGroup.visible = true
    modelGroup.scale.setScalar(1)
    modelGroup.rotation.y = spinTotalRad
    idle.rotY = spinTotalRad
    idle.elapsed = 0
    computeCornerTarget(cornerTarget)
    modelGroup.position.copy(cornerTarget)
    state = STATES.IDLE
  }

  function update(delta: number) {
    stateT += delta

    if (state === STATES.SPINNING) {
      // Bloom up from zero as the 2D mark collapses to zero — the crossover
      // that replaces the particle burst (plan 002 §6.1). power2.out.
      const bloomT = clamp01(stateT / (config.swapDuration * (1 - config.swapCrossover)))
      modelGroup.scale.setScalar(1 - (1 - bloomT) * (1 - bloomT))

      const t = clamp01(Math.max(stateT - config.spinPauseBefore, 0) / config.spinDuration)
      modelGroup.rotation.y = easeInOutCubic(t) * spinTotalRad
      if (t >= 1) {
        modelGroup.rotation.y = spinTotalRad
        modelGroup.scale.setScalar(1)
        state = STATES.TO_CORNER
        stateT = 0
      }
    } else if (state === STATES.TO_CORNER) {
      const eased = easeInOutCubic(clamp01(stateT / config.toCornerDuration))
      computeCornerTarget(cornerTarget)
      modelGroup.position.set(cornerTarget.x * eased, cornerTarget.y * eased, 0)
      if (stateT >= config.toCornerDuration) {
        modelGroup.position.copy(cornerTarget)
        idle.rotY = spinTotalRad
        idle.elapsed = 0
        state = STATES.IDLE
      }
    } else if (state === STATES.IDLE) {
      idle.elapsed += delta
      idle.rotY += delta * IDLE_ROTATION_SPEED
      modelGroup.rotation.y = idle.rotY
      const float =
        Math.sin(2 * Math.PI * IDLE_FLOAT_FREQUENCY * idle.elapsed) * IDLE_FLOAT_AMPLITUDE
      // Recomputed each frame so a resize re-anchors the corner automatically.
      computeCornerTarget(cornerTarget)
      modelGroup.position.set(cornerTarget.x, cornerTarget.y + float, 0)
    }
  }

  // Nothing to draw while hidden — the pipeline skips both the update and the
  // pass, which is what the old dedicated rAF's early return did. Advancing
  // the state clock while hidden would make the reveal start mid-spin.
  function isDrawable() {
    return state !== STATES.HIDDEN
  }

  // Driven by RenderPipeline from R3F's size, not a window listener: the
  // renderer's own resize is R3F's business now, and only the projection is
  // ours. The corner target is recomputed per frame in IDLE, so a resize
  // re-anchors the logo automatically.
  function setSize(width: number, height: number) {
    camera.aspect = width / height
    camera.updateProjectionMatrix()
  }

  function reset() {
    state = STATES.HIDDEN
    stateT = 0
    modelGroup.visible = false
    modelGroup.position.set(0, 0, 0)
    modelGroup.rotation.set(0, 0, 0)
    modelGroup.scale.setScalar(0)
    // No renderer.clear() — the framebuffer is shared now, and clearing it
    // here would wipe the frame the main pass just drew.
  }

  function dispose() {
    disposed = true
    // The manager outlives this call only if a load is still in flight; the
    // callback would report progress for a logo nobody is waiting for.
    loadingManager.onProgress = () => {}
    ktx2Loader.dispose()
    dracoLoader.dispose()
    // Explicitly, and not only through the traversal below: if disposal lands
    // between the texture resolving and `assembleIfReady` binding it to a
    // material, it is reachable from nothing and the traversal cannot find it.
    // In the assembled case it is disposed twice, which three treats as a
    // no-op — the second call finds nothing left to delete.
    logoTexture?.dispose()
    disposeObject3D(scene)
    // The renderer and canvas belong to the application, not to this module.
  }

  return {
    scene,
    camera,
    update,
    setSize,
    isDrawable,
    startSequence,
    snapToCorner,
    reset,
    dispose,
    isReady: () => modelReady,
  }
}

export type CornerLogo = ReturnType<typeof createCornerLogo>
