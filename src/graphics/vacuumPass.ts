import * as THREE from 'three'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { VACUUM_VIGNETTE_COLOR, WARP_LIMITS } from '../utils/warpTransition'
import vacuumFragment from './shaders/vacuum.frag'
import vacuumVertex from './shaders/vacuum.vert'

/**
 * The vacuum: a screen-space pass for being pulled up out of the city.
 *
 * Radial UV magnification, a radial streak blur and a grey vignette, all hanging
 * off one radial term and scrubbed by one intensity — see the fragment shader
 * for why they are one pass rather than three.
 *
 * ## Why this is not a FOV widening
 *
 * A wider FOV would produce a similar sensation for less code, and it is the
 * wrong tool here: FOV grows the camera's ground footprint at no distance cost,
 * which is precisely what `checks/warp-transition.ts` and `checks/footprint.ts`
 * exist to bound. The edge of the world would arrive for ultrawide viewers with
 * every distance limit still satisfied. A screen-space pass cannot move the
 * camera and so cannot show anything the camera was not already seeing.
 *
 * ## Shape constants live in `utils/warpTransition`
 *
 * Not here, and not duplicated. `src/graphics/` may not import `src/app/`
 * (`checks/architecture.ts` section 1), which is what moved that module to
 * `utils/` — it is read by the app's clock, by both experiences' pose mappings
 * and by this pass, and `utils/` is the only floor all of them may reach.
 */
export interface VacuumPass {
  readonly pass: ShaderPass
  /** 0 disables the pass outright, which is what reclaims its cost. */
  setIntensity(intensity: number): void
  dispose(): void
}

export function createVacuumPass(): VacuumPass {
  const pass = new ShaderPass({
    name: 'VacuumShader',
    uniforms: {
      tDiffuse: { value: null },
      uIntensity: { value: 0 },
      uDistortAmount: { value: WARP_LIMITS.vacuumDistortAmount },
      uDistortPower: { value: WARP_LIMITS.vacuumDistortPower },
      uBlurAmount: { value: WARP_LIMITS.vacuumBlurAmount },
      uVignetteAmount: { value: WARP_LIMITS.vacuumVignetteAmount },
      uVignetteStart: { value: WARP_LIMITS.vacuumVignetteStart },
      uVignetteColor: { value: new THREE.Color(VACUUM_VIGNETTE_COLOR) },
    },
    vertexShader: vacuumVertex,
    fragmentShader: vacuumFragment,
  })

  // Off until something asks for it. `EffectComposer` skips a disabled pass
  // entirely, so this costs nothing for the whole of an ordinary session.
  pass.enabled = false

  return {
    pass,
    setIntensity(intensity) {
      const value = Number.isFinite(intensity) ? Math.min(1, Math.max(0, intensity)) : 0
      pass.uniforms.uIntensity.value = value
      // Disabled rather than zeroed: at intensity 0 the shader is an exact copy
      // of its input, so running it is a full-screen draw that provably changes
      // nothing. The same reasoning the bloom and afterimage passes use.
      pass.enabled = value > 0
    },
    dispose() {
      // `EffectComposer.dispose()` does not walk its passes, so a pass that is
      // not disposed by name leaks its material and its fullscreen quad.
      pass.dispose()
    },
  }
}
