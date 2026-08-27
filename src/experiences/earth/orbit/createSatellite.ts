import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'
import { createHoloPanel, HoloPanel } from './createHoloPanel'
import { loadProgress } from '../../../loading/progress'
import {
  acquireDracoLoader,
  acquireKtx2Loader,
  releaseDracoLoader,
  releaseKtx2Loader,
} from '../../../graphics/decoders'

const TEXTURE_URL = '/textures/satellite_Baked.ktx2'
// The transcoder and decoder paths live in `graphics/decoders.ts` now, with the
// single pool of each that the whole application shares — this module, the
// corner logo and the city were building their own, and all three load during
// the intro.

interface Options {
  // Deterministic per-satellite variation (initial orientation, spin speed).
  seed?: number
  // Needed by KTX2Loader.detectSupport to pick the GPU's compressed format.
  // Without it the model still loads, just untextured.
  renderer?: THREE.WebGLRenderer
  // Brand plates for the holographic panel — the isotype it rests on and the
  // logo it unfolds into. Omitted, the satellite renders without a panel.
  panel?: {
    isotypeAtlas: BrandAtlas
    logoAtlas: BrandAtlas
    index: number
    brandColor: string
  }
}

// The GLB is loaded ONCE and cloned per satellite — six separate loads of the
// same 260 KB file would be pure waste. The template is normalised here
// (centered, max dimension = 1) so ORBIT_CONFIG.satellite.modelSize is the one
// knob for its world size. Clones share the template's geometries; only
// materials are cloned, because each satellite fades in independently.
let templatePromise: Promise<THREE.Group> | null = null

// The baked KTX2 texture is likewise loaded once and shared by every clone —
// like the template's geometries, it lives for the app's lifetime and is never
// disposed per-satellite.
function loadBakedTexture(renderer?: THREE.WebGLRenderer): Promise<THREE.Texture | null> {
  if (!renderer) return Promise.resolve(null)
  const ktx2Loader = acquireKtx2Loader(renderer)
  return ktx2Loader
    .loadAsync(TEXTURE_URL)
    .then((texture) => {
      texture.colorSpace = THREE.SRGBColorSpace
      // glTF UV convention — same as the corner logo's bake.
      texture.flipY = false
      // Upload now (mipmaps included), not on the satellites' first rendered
      // frame mid-entrance.
      renderer.initTexture(texture)
      return texture
    })
    .catch((error) => {
      // Degrade gracefully: untextured satellites rather than none.
      console.warn('[createSatellite] satellite_Baked.ktx2 failed, using untextured model:', error)
      return null
    })
    // Released rather than disposed: the instance is shared, so the pool goes
    // when the last consumer lets go of it.
    .finally(releaseKtx2Loader)
}

function loadTemplate(renderer?: THREE.WebGLRenderer): Promise<THREE.Group> {
  if (!templatePromise) {
    // The GLB lists KHR_draco_mesh_compression in extensionsRequired, so a bare
    // GLTFLoader rejects.
    const dracoLoader = acquireDracoLoader()
    const loader = new GLTFLoader()
    loader.setDRACOLoader(dracoLoader)
    // The GLB is 270KB against the bake's 151KB, so byte progress across the
    // pair is worth having here rather than counting two files.
    templatePromise = Promise.all([
      new Promise<GLTF>((resolve, reject) =>
        loader.load(
          '/models/satellite.glb',
          resolve,
          (event) =>
            event.total > 0 &&
            loadProgress.setStep('satellite:assets', (event.loaded / event.total) * 0.6),
          reject,
        ),
      ),
      loadBakedTexture(renderer),
    ]).then(([gltf, texture]) => {
      releaseDracoLoader()
      const model = gltf.scene
      if (texture) {
        // Applied to the TEMPLATE's materials so every clone inherits the map —
        // Material.clone copies the .map reference, sharing one GPU texture.
        model.traverse((node) => {
          const mesh = node as THREE.Mesh
          if (!mesh.isMesh) return
          const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
          for (const material of materials) {
            const m = material as THREE.MeshStandardMaterial
            m.map = texture
            // The bake already contains all shading; neutralise the PBR response
            // so the lights don't double-light it (same as the corner logo).
            if ('metalness' in m) m.metalness = 0
            if ('roughness' in m) m.roughness = 1
            m.needsUpdate = true
          }
        })
      }
      const box = new THREE.Box3().setFromObject(model)
      const size = box.getSize(new THREE.Vector3())
      const center = box.getCenter(new THREE.Vector3())
      model.position.sub(center)
      const wrapper = new THREE.Group()
      wrapper.add(model)
      wrapper.scale.setScalar(1 / (Math.max(size.x, size.y, size.z) || 1))
      loadProgress.markDone('satellite:assets')
      return wrapper
    })
    // A REJECTED promise is still a cached promise. Left in place, one transient
    // failure — a 404 during a deploy, a dropped connection — would be replayed
    // to every satellite for the rest of the session, and would survive a full
    // orbit-system rebuild with no way back. Clearing the cache lets the next
    // attempt actually retry; the rejection still propagates to this caller.
    templatePromise.catch(() => {
      templatePromise = null
      // The success path releases inside the `then` above, which means a
      // rejection used to leak the pool — harmless while each consumer built
      // its own and disposed it, load-bearing now that the count decides when
      // the shared one is torn down. Exactly one of the two paths runs.
      releaseDracoLoader()
    })
  }
  return templatePromise
}

// One orbiting satellite: the shared GLB model with a slow continuous
// self-rotation, plus an invisible raycast sphere for comfortable hover.
export function createSatellite({ seed = 0, renderer, panel }: Options = {}) {
  const group = new THREE.Group()

  // Everything visible hangs off an inner group. The OUTER group's scale is
  // rewritten every frame by the entrance animation in createOrbitSystem, so the
  // hover bump has to live one level down or it is silently overwritten on the
  // next frame. The outer group also stays the raycast target, so this is
  // invisible to every consumer.
  const content = new THREE.Group()
  group.add(content)

  // Invisible raycast target. The model is thin and spiky, so hovering its
  // actual meshes would flicker; a sphere the size of the old badge keeps the
  // hover area stable. colorWrite:false keeps it out of the framebuffer while
  // Mesh.raycast still sees it.
  const hitMaterial = new THREE.MeshBasicMaterial({ colorWrite: false, depthWrite: false })
  const hitMesh = new THREE.Mesh(
    new THREE.SphereGeometry(ORBIT_CONFIG.satellite.baseSize * 1.2, 12, 12),
    hitMaterial,
  )
  content.add(hitMesh)

  // The brand panel hangs off `content`, NOT off the spinner — it has to stay
  // upright and camera-facing while the model turns underneath it. Created
  // synchronously (unlike the GLB) so it is present for the scene-level
  // compileAsync warm-up in EarthScene; a shader compiling on the frame the
  // satellites reveal is exactly the stall plan 003 removed.
  let holoPanel: HoloPanel | null = null
  if (panel) {
    holoPanel = createHoloPanel(panel)
    content.add(holoPanel.group)
  }

  // The spinner carries the model's continuous self-rotation. It advances only
  // by per-frame delta — never from camera pose or selection state — so opening
  // or closing the case panel cannot reorient it: the model just keeps turning
  // through the freeze and resumes its orbit path untouched.
  const spinner = new THREE.Group()
  spinner.rotation.set(
    Math.sin(seed * 12.9898) * 0.35,
    seed * 1.7,
    Math.sin(seed * 78.233) * 0.3,
  )
  content.add(spinner)

  const spinSpeed =
    ORBIT_CONFIG.satellite.modelSpinSpeed * (0.85 + 0.3 * Math.abs(Math.sin(seed * 4.7)))

  // The entrance fade has to touch every material in the model, each scaled
  // from its own authored opacity. Populated when the async load lands.
  const fadeTargets: {
    material: THREE.Material
    base: number
    baseTransparent: boolean
  }[] = []

  let currentFactor = 0
  let disposed = false

  loadTemplate(renderer)
    .catch((error) => {
      // The original load failure was silent, which cost a debugging round —
      // a satellite that never appears must say why.
      console.error('[createSatellite] satellite.glb failed to load:', error)
      return null
    })
    .then((template) => {
      if (!template || disposed) return
      const model = template.clone(true)
      model.scale.multiplyScalar(ORBIT_CONFIG.satellite.modelSize)
      model.traverse((node) => {
        const mesh = node as THREE.Mesh
        if (!mesh.isMesh) return
        const materials = Array.isArray(mesh.material) ? mesh.material : [mesh.material]
        const cloned = materials.map((source) => {
          const material = source.clone()
          fadeTargets.push({
            material,
            base: source.opacity,
            baseTransparent: source.transparent,
          })
          return material
        })
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
      })
      spinner.add(model)
      // The load can land mid-entrance (or after it); sync to wherever the fade is.
      setOpacity(currentFactor)
    })

  group.visible = false

  function setOpacity(factor: number) {
    currentFactor = factor
    holoPanel?.setOpacity(factor)
    for (const target of fadeTargets) {
      target.material.opacity = target.base * factor
      // Transparent only while actually fading — leaving it on permanently would
      // push the whole model into the transparent sort pass for no reason.
      target.material.transparent = target.baseTransparent || target.material.opacity < 1
    }
  }

  // Hover/selection affordance: bump the inner group so the model grows
  // slightly under the cursor.
  function setHighlight(on: boolean) {
    content.scale.setScalar(on ? ORBIT_CONFIG.satellite.highlightScale : 1)
  }

  /**
   * Unfolds the brand panel from isotype to full logo, or folds it back.
   *
   * Deliberately NOT part of `setHighlight`, which is unioned over hover and
   * selection. Six satellites drift past the cursor during the overview; if
   * hover unfolded them the panels would flap open and shut continuously. Only
   * selection — the click that opens the case panel — earns the lockup.
   */
  function setExpanded(on: boolean) {
    holoPanel?.setExpanded(on)
  }

  /** Collapses the panel with no animation. For scene resets; see the panel. */
  function resetExpansion() {
    holoPanel?.resetExpansion()
  }

  // Continuous self-rotation; called every visible frame, frozen or not.
  function update(delta: number) {
    spinner.rotation.y += spinSpeed * delta
    // Advances on delta alone, like the spin — the panel's shimmer must not
    // stall while the case panel freezes the satellite's orbital motion.
    holoPanel?.update(delta)
  }

  setOpacity(0)

  function dispose() {
    disposed = true
    hitMesh.geometry.dispose()
    hitMaterial.dispose()
    holoPanel?.dispose()
    // Geometries are shared with the cached template — never disposed here.
    for (const target of fadeTargets) target.material.dispose()
  }

  return { group, setOpacity, setHighlight, setExpanded, resetExpansion, update, dispose }
}

export type Satellite = ReturnType<typeof createSatellite>
