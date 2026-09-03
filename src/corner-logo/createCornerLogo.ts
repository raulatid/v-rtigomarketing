import * as THREE from 'three'
import { loadProgress } from '../loading/progress'
import { disposeObject3D } from '../graphics/disposal'
import { loadLogoAssets, type LogoAssets } from './loadLogoAssets'
import { createLogoMotion, type CornerMetrics, type LogoMotion } from './logoMotion'
import type { CornerLogoConfig } from './cornerLogoConfig'

export type { CornerLogoConfig } from './cornerLogoConfig'
export type { CornerMetrics } from './logoMotion'

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
//
// This file is now the ASSEMBLY: it builds the scene, waits for the two files,
// binds them together, frames the camera and warms the GPU. The downloading is
// loadLogoAssets.ts and the reveal is logoMotion.ts — the two halves that could
// be lifted out whole, one because it owns a cancellation problem and the other
// because it has no I/O in it at all.

const FOV_DEGREES = 45
/** Near/far as fractions of the framed distance — the model is all there is. */
const NEAR_RATIO = 1 / 100
const FAR_RATIO = 10

interface Options {
  config: CornerLogoConfig
  // The application's single renderer. Injected rather than created: this pass
  // composites onto the same framebuffer as the main scene, so it must share
  // the context (ADR 002). Needed for KTX2 support detection and the warm-up.
  renderer: THREE.WebGLRenderer
  onReady: () => void
  onFailed: () => void
}

/**
 * Declared rather than inferred through `ReturnType<>`, which is what this was.
 * The handle is what RenderPipeline and App both hold, so an accidental change
 * to its shape should be a type error at this file rather than a surprise at
 * the call sites.
 *
 * `scene`, `camera`, `isDrawable` and `update` are also the `OverlayPass`
 * contract in graphics/ — satisfied structurally, which is why neither module
 * imports the other.
 */
export interface CornerLogo {
  readonly scene: THREE.Scene
  readonly camera: THREE.PerspectiveCamera
  update(delta: number): void
  setSize(width: number, height: number): void
  /** Where the header's line is, measured off the DOM by CornerLogoLayer. */
  setCornerMetrics(metrics: CornerMetrics): void
  isDrawable(): boolean
  startSequence(): void
  snapToCorner(): void
  reset(): void
  dispose(): void
  isReady(): boolean
}

export function createCornerLogo({
  config,
  renderer,
  onReady,
  onFailed,
}: Options): CornerLogo {
  const scene = new THREE.Scene()
  const camera = new THREE.PerspectiveCamera(
    FOV_DEGREES,
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
  scene.add(modelGroup)

  // Hides the group as part of entering its HIDDEN state — this file no longer
  // has to remember to.
  const motion: LogoMotion = createLogoMotion(config, modelGroup, camera)

  let modelReady = false
  let disposed = false

  const load = loadLogoAssets(renderer)

  /**
   * Bind the texture, centre the model, frame the camera, compile.
   *
   * Everything here has to happen before the logo is first drawn, and the
   * compile is the reason: this scene's MeshStandardMaterial programs derive
   * from ITS lights and defines, which no amount of Earth warm-up covers
   * (plan 003 §3). Without it they compile on the logo's first rendered frame —
   * the swap crossover, the one moment that depends on precise timing to stay
   * invisible (measured 56.8ms stall).
   */
  function assemble({ model, texture }: LogoAssets): void {
    if (texture) {
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        for (const material of materials) {
          const m = material as THREE.MeshStandardMaterial
          m.map = texture
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
    // the motion module's pixel→world mapping a stable linear one
    // (extraction 001 §5). Nothing moves the camera after this, which is why
    // logoMotion can read the framing distance back off camera.position.z.
    const size = box.getSize(new THREE.Vector3())
    // The motion module anchors the box's EDGE to the header's inset and sizes
    // it to the header's line, so it needs the box, not just the fit distance.
    motion.setModelSize(size)
    const maxDim = Math.max(size.x, size.y, size.z)
    const fovRad = THREE.MathUtils.degToRad(camera.fov)
    const framedDistance = (maxDim / 2 / Math.tan(fovRad / 2)) * config.cornerFramePadding
    camera.position.set(0, 0, framedDistance)
    camera.near = framedDistance * NEAR_RATIO
    camera.far = framedDistance * FAR_RATIO
    camera.updateProjectionMatrix()

    // compile() gathers materials with scene.traverse, so the still-hidden
    // modelGroup is included; the lights are scene-level and visible.
    if (texture) renderer.initTexture(texture)
    const finish = () => {
      // compileAsync resolves a frame or more later, by which time teardown may
      // have happened even though assemble was still live on entry.
      if (disposed) return
      modelReady = true
      // Only now, not on decode: the compile is the part that would otherwise
      // stall the crossover, so it belongs inside the wait the drawing covers.
      loadProgress.markDone('logo:assets')
      onReady()
    }
    renderer.compileAsync(scene, camera).then(finish, finish)
  }

  load.ready.then(
    (assets) => {
      // Disposal can land in the gap between the loader settling and this
      // microtask running. The loader has already handed ownership over by
      // then, so it will not release these, and assemble() is what would have
      // put them somewhere disposeObject3D could find them. Release them here
      // instead — the one window where neither side owns them.
      if (disposed) {
        assets.texture?.dispose()
        disposeObject3D(assets.model)
        return
      }
      assemble(assets)
    },
    (err: unknown) => {
      if (disposed) return
      console.error('[corner-logo] GLB failed to load:', err)
      // Degrading is the caller's job: it holds the 2D isotype on screen
      // instead of playing the crossover. The step was already marked done by
      // the loader, so the loading screen is not left waiting on a 404.
      onFailed()
    },
  )

  return {
    scene,
    camera,

    update: (delta) => motion.update(delta),

    // Driven by RenderPipeline from R3F's size, not a window listener: the
    // renderer's own resize is R3F's business now, and only the projection is
    // ours. The corner target is recomputed per frame while idling, so a resize
    // re-anchors the logo automatically.
    setSize(width, height) {
      camera.aspect = width / height
      camera.updateProjectionMatrix()
    },

    setCornerMetrics: (metrics) => motion.setCornerMetrics(metrics),

    // Nothing to draw while hidden — the pipeline skips both the update and the
    // pass, which is what the old dedicated rAF's early return did. Advancing
    // the state clock while hidden would make the reveal start mid-spin.
    isDrawable: () => motion.isVisible(),

    startSequence() {
      if (!modelReady) {
        console.warn('[corner-logo] startSequence called before model ready')
        return
      }
      motion.start()
    },

    snapToCorner() {
      if (!modelReady) return
      motion.snapToCorner()
    },

    // No renderer.clear() — the framebuffer is shared now, and clearing it here
    // would wipe the frame the main pass just drew.
    reset: () => motion.reset(),

    dispose() {
      disposed = true
      load.dispose()
      disposeObject3D(scene)
      // The renderer and canvas belong to the application, not to this module.
    },

    isReady: () => modelReady,
  }
}
