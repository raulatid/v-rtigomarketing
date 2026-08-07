import { RefObject, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { IntroConfig } from '../introConfig'
import { SequenceState } from '../sequenceState'
import type { CornerLogo } from '../corner-logo/createCornerLogo'
import type { MurciaExperience } from '../experiences/murcia/MurciaExperience'
import type { ExperienceId } from '../app/experience'

interface Props {
  config: IntroConfig
  state: SequenceState
  logoRef: RefObject<CornerLogo | null>
  murciaRef: RefObject<MurciaExperience | null>
  activeExperience: ExperienceId
}

// The application's SINGLE render authority (ADR 001, ADR 002).
//
// NOTE the useFrame priority of 1: that hands rendering over to this callback,
// and R3F stops calling gl.render() itself. This callback must therefore render
// on EVERY frame unconditionally — an early return here means a blank canvas,
// not just a missing effect (extraction 002 §5).
//
// Two passes, in this order:
//
//   1. The active experience. Earth goes through the composer for its warp
//      blur. Murcia (added in P4) renders directly — see the composer note
//      below.
//   2. The corner logo, composited on top with a cleared depth buffer. It used
//      to own a second WebGLRenderer and a second canvas; it now shares this
//      one, which is why the depth clear is explicit rather than implied by a
//      separate context.
//
// Why the logo is NOT a third pass inside the composer: the composer's render
// targets are HalfFloat and un-multisampled, and the logo's own ACES/sRGB
// conversion happens in-shader when drawing to the default framebuffer. Drawing
// it after the composer has resolved to screen reproduces the old two-canvas
// compositing exactly, including tone mapping being applied once per scene.
//
// WHY MURCIA BYPASSES THE COMPOSER. EffectComposer builds its render targets
// as `new WebGLRenderTarget(w, h, { type: HalfFloatType })` — with no `samples`,
// so they carry no MSAA. Earth already renders through it and that is its
// shipped look (spheres, points, additive glow), but the city is nothing but
// hard building edges, and routing it through the composer would silently
// throw away the `antialias: true` it has always had. It also has no use for
// the AfterimagePass, which exists only for the warp. So Murcia draws straight
// to the canvas. Tone mapping still lands exactly once either way: three
// applies it in-shader only when the render target is null, which is why the
// composer path needs OutputPass and the direct path does not.
export function RenderPipeline({
  config,
  state,
  logoRef,
  murciaRef,
  activeExperience,
}: Props) {
  const { gl, scene, camera, size } = useThree()

  const { composer, afterimagePass } = useMemo(() => {
    const c = new EffectComposer(gl)
    c.addPass(new RenderPass(scene, camera))
    const aPass = new AfterimagePass(0)
    c.addPass(aPass)
    c.addPass(new OutputPass())
    return { composer: c, afterimagePass: aPass }
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setSize(size.width, size.height)
    composer.setPixelRatio(gl.getPixelRatio())
  }, [composer, size.width, size.height, gl])

  useEffect(() => {
    return () => {
      composer.dispose()
    }
  }, [composer])

  useFrame((_, delta) => {
    const murcia = murciaRef.current

    // Falls back to Earth until Murcia has finished loading, so the frame is
    // never skipped — an early return here is a blank canvas, not a dropped
    // effect.
    if (activeExperience === 'murcia' && murcia) {
      gl.render(murcia.scene, murcia.viewCamera)
    } else {
      // Soft reset: an accumulation buffer left at a nonzero damp holds a ghost
      // of the last frame indefinitely after the warp ends.
      const amount = state.motionBlur <= 0.001 ? 0 : state.motionBlur
      const damp = amount === 0 ? 0 : config.afterimageDampMax * amount

      const uniform = afterimagePass.uniforms?.['damp']
      if (uniform) uniform.value = damp

      composer.render()
    }

    // ─── Overlay pass: corner logo ───
    const logo = logoRef.current
    if (logo && logo.isDrawable()) {
      // The state clock only advances while drawable, matching the early
      // return the logo's old dedicated rAF did — otherwise the reveal would
      // start mid-spin. Delta is clamped as that loop clamped its own.
      logo.update(Math.min(delta, 0.1))

      const previousAutoClear = gl.autoClear
      gl.autoClear = false
      // Composites over the frame the composer just resolved, but on a fresh
      // depth buffer so the logo is never occluded by scene geometry — the
      // isolation the separate context used to provide for free.
      gl.clearDepth()
      gl.render(logo.scene, logo.camera)
      gl.autoClear = previousAutoClear
    }
  }, 1)

  return null
}
