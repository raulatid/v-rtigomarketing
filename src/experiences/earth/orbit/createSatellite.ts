import * as THREE from 'three'
import { GLTFLoader, type GLTF } from 'three/addons/loaders/GLTFLoader.js'
import { ORBIT_CONFIG } from './orbitConfig'
import { BrandAtlas } from './createBrandAtlas'
import { createHoloPanel, HoloPanel } from './createHoloPanel'
import { createHoverCue, HoverCue } from './createHoverCue'
import { invitationScale } from './invitation'
import { advanceExpansion, easeExpansion } from './panelExpansion'
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
    holoColor: string
  }
  // Carries the hover tutorial's particle cue. ONE satellite does — the
  // invited one — and it is built here, eagerly, so its shader is in the scene
  // for the warm-up rather than compiling on the frame the tutorial starts.
  cue?: boolean
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
export function createSatellite({ seed = 0, renderer, panel, cue = false }: Options = {}) {
  const group = new THREE.Group()

  // THREE nested scale nodes, one writer each, and the nesting is the whole
  // reason any of them works:
  //
  //   group     the entrance animation, rewritten EVERY FRAME by
  //             createOrbitSystem — and it keeps writing 1.0 forever once the
  //             intro clamps, so nothing else may touch it.
  //   assembly  how big a satellite is on this viewport. Written only when the
  //             viewport changes, which is why the device size is expressed as
  //             a scale and not as a second set of constants: everything it
  //             governs is baked into geometry at construction and the orbit
  //             system is never rebuilt on a resize.
  //   content   the hover bump and the invitation's breath, also every frame.
  //
  // A value written one level too high is silently overwritten on the next
  // frame by the writer that owns that node; that is the failure this shape
  // exists to make impossible.
  const assembly = new THREE.Group()
  group.add(assembly)

  const content = new THREE.Group()
  assembly.add(content)

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

  // The tutorial's cue hangs off `assembly`, NOT off `content`: it converges on
  // the satellite from a shell around it, and that shell must not breathe or
  // bump with the model. It DOES take the viewport size and the entrance scale,
  // which are the two above it — a cue converging on a smaller satellite has to
  // be a smaller shell, and its particles a matching size, which they are for
  // free: the shader reads the accumulated model scale off the matrix
  // (`length(modelViewMatrix[0].xyz)`) rather than assuming it.
  let hoverCue: HoverCue | null = null
  if (cue && panel) {
    hoverCue = createHoverCue({ holoColor: panel.holoColor })
    assembly.add(hoverCue.object)
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

  // The hover light on the model itself, the way DistrictHighlight lights the
  // services district's buildings: the bake ships no emissive, so the holo
  // colour is set as one for the strength to scale — with a black emissive,
  // intensity alone does nothing. Only materials with an emissive channel take
  // part; populated alongside fadeTargets when the load lands.
  const emissiveTargets: THREE.MeshStandardMaterial[] = []
  const emissiveColor = panel ? new THREE.Color(panel.holoColor) : null

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
          const standard = material as THREE.MeshStandardMaterial
          if (emissiveColor && standard.emissive) {
            standard.emissive.copy(emissiveColor)
            standard.emissiveIntensity = 0
            emissiveTargets.push(standard)
          }
          return material
        })
        mesh.material = Array.isArray(mesh.material) ? cloned : cloned[0]
      })
      spinner.add(model)
      // The load can land mid-entrance (or after it); sync to wherever the fade
      // and the hover are.
      setOpacity(currentFactor)
      applyHighlight()
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

  // Hover/selection affordance: the inner group grows under the cursor and the
  // panel's light comes up with it, on ONE eased strength.
  //
  // `setHighlight` only sets the target. The value advances in update(), on
  // delta, through the same value-based stepper the panel's unfold uses — so a
  // pointer leaving mid-rise reverses from where the bump is, and so the
  // hover TUTORIAL, which flips this same target, produces exactly the
  // pointer's response with no animation of its own. It used to write the scale
  // here directly, as a step; that write is gone because a second writer a
  // frame apart from update()'s would show a stale first frame on every rise.
  let highlight = 0
  let highlightTarget = 0
  // Where the bump lands. The tutorial's demonstration goes further than the
  // pointer's own answer (see orbitConfig.demoScale), and it is latched on the
  // RISE rather than read per frame: a pointer taking the target over mid-pulse
  // then walks the scale down to its own size along the ease already running,
  // instead of the two writers swapping heights on one frame.
  let bumpScale = ORBIT_CONFIG.satellite.highlightScale
  function setHighlight(on: boolean, demo = false) {
    if (on) {
      bumpScale = demo ? ORBIT_CONFIG.satellite.demoScale : ORBIT_CONFIG.satellite.highlightScale
    }
    highlightTarget = on ? 1 : 0
  }

  /** The eased strength becomes the scale, the panel's light and the model's — the one place. */
  function applyHighlight() {
    const strength = easeExpansion(highlight)
    content.scale.setScalar(invitationScale(holoPanel?.invitePulse() ?? 0, strength, bumpScale))
    holoPanel?.setHighlight(strength)
    const emissive = ORBIT_CONFIG.satellite.highlightEmissive * strength
    for (const material of emissiveTargets) material.emissiveIntensity = emissive
  }

  /**
   * Drops the bump with no animation. For scene resets, like `resetExpansion`:
   * a replay started mid-rise would otherwise show the bump easing off under
   * the re-entrance.
   */
  function resetHighlight() {
    highlight = 0
    highlightTarget = 0
    bumpScale = ORBIT_CONFIG.satellite.highlightScale
    applyHighlight()
  }

  /** The tutorial cue's progress, 0..1, or null to hide it. No-op on the five without one. */
  function setCue(progress: number | null) {
    hoverCue?.setProgress(progress)
  }

  /**
   * How large this satellite is on the current viewport, as a factor of the
   * authored size. 1 on a phone; `wideModelSize / modelSize` on anything wider.
   *
   * The one writer of `assembly.scale`, and it is called from the layer's
   * viewport effect rather than per frame — the value changes on a resize or a
   * rotation and at no other time. See orbit/satelliteScale.ts for what decides
   * it and orbitConfig's `wideModelSize` for why size is a scale here at all.
   */
  function setAssemblyScale(factor: number) {
    // A non-finite or zero factor would collapse every satellite to a point,
    // and R3F reports a 0x0 viewport for a frame or two before the container is
    // measured. Cheaper to refuse it than to explain the flicker later.
    if (!Number.isFinite(factor) || factor <= 0) return
    assembly.scale.setScalar(factor)
  }

  /** `pixelRatio × CSS height`, for the cue's point size. See createHoverCue. */
  function setViewportScale(px: number) {
    hoverCue?.setViewportScale(px)
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

  /**
   * Lights the invitation on the brand panel — its halo breathing brighter so
   * the overview says "clickable". Only one satellite carries it, and the
   * focus layer decides which and until when; see createSatelliteFocus.
   */
  function setInvited(on: boolean) {
    holoPanel?.setInvited(on)
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
    // The hover bump rises or falls on the same delta, then the invitation's
    // size breath — on the pulse the panel just computed for its light — and
    // the bump are folded into one scale. Inner group: the outer group's scale
    // belongs to the intro animation.
    if (highlight !== highlightTarget) {
      highlight = advanceExpansion(
        highlight,
        highlightTarget,
        delta,
        ORBIT_CONFIG.satellite.highlightDuration,
      )
    }
    applyHighlight()
  }

  setOpacity(0)

  function dispose() {
    disposed = true
    hitMesh.geometry.dispose()
    hitMaterial.dispose()
    holoPanel?.dispose()
    hoverCue?.dispose()
    // Geometries are shared with the cached template — never disposed here.
    for (const target of fadeTargets) target.material.dispose()
  }

  return {
    group,
    hitTarget: hitMesh,
    setOpacity,
    setHighlight,
    resetHighlight,
    setExpanded,
    setInvited,
    setCue,
    setViewportScale,
    setAssemblyScale,
    resetExpansion,
    update,
    dispose,
  }
}

export type Satellite = ReturnType<typeof createSatellite>
