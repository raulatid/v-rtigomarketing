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
import { motionBlur as warpMotionBlur } from '../app/warpTransition'

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
// WHY MURCIA BYPASSES THE COMPOSER — except during a warp (ADR 005).
//
// EffectComposer builds its render targets as
// `new WebGLRenderTarget(w, h, { type: HalfFloatType })` — with no `samples`,
// so they carry no MSAA. Earth already renders through it and that is its
// shipped look (spheres, points, additive glow), but the city is nothing but
// hard building edges, and routing it through the composer permanently would
// silently throw away the `antialias: true` it has always had.
//
// A warp is the one case where the trade inverts: the whole frame is smeared
// and moving fast, so aliasing is invisible, and the blur is most of what makes
// the motion read. So the city borrows the composer for those ~1.6 seconds and
// goes straight back to the canvas afterwards.
//
// Tone mapping lands exactly once on either path: three applies it in-shader
// only when the render target is null, which is why the composer path needs
// OutputPass and the direct path does not.
export function RenderPipeline({
  config,
  state,
  logoRef,
  murciaRef,
  activeExperience,
}: Props) {
  const { gl, scene, camera, size } = useThree()

  const { composer, renderPass, afterimagePass, outputPass } = useMemo(() => {
    const c = new EffectComposer(gl)
    const rPass = new RenderPass(scene, camera)
    c.addPass(rPass)
    const aPass = new AfterimagePass(0)
    c.addPass(aPass)
    // Retained rather than constructed inline: EffectComposer.dispose() does not
    // walk its passes, so an unreferenced pass is unreachable for disposal.
    const oPass = new OutputPass()
    c.addPass(oPass)
    return { composer: c, renderPass: rPass, afterimagePass: aPass, outputPass: oPass }
  }, [gl, scene, camera])

  useEffect(() => {
    composer.setSize(size.width, size.height)
    composer.setPixelRatio(gl.getPixelRatio())
  }, [composer, size.width, size.height, gl])

  useEffect(() => {
    return () => {
      // EffectComposer.dispose() releases only its own two render targets and
      // copyPass — it does NOT iterate this.passes. AfterimagePass owns two more
      // full-screen render targets, two ShaderMaterials and two fullscreen
      // quads; OutputPass owns a material and a quad. Left to the composer they
      // leak on every unmount and on any gl/scene/camera identity change.
      afterimagePass.dispose()
      outputPass.dispose()
      renderPass.dispose()
      composer.dispose()
    }
  }, [composer, afterimagePass, outputPass, renderPass])

  useFrame((_, delta) => {
    const murcia = murciaRef.current

    // The intro's warp and the Earth<->Murcia warp both feed the same pass; the
    // transition wins because only one can be playing at a time and it is the
    // one whose progress is non-zero outside the intro.
    const warping = state.transitionProgress > 0
    const blurAmount = warping ? warpMotionBlur(state.transitionProgress) : state.motionBlur

    // Soft reset: an accumulation buffer left at a nonzero damp holds a ghost
    // of the last frame indefinitely after the warp ends.
    const amount = blurAmount <= 0.001 ? 0 : blurAmount
    const damp = amount === 0 ? 0 : config.afterimageDampMax * amount
    const uniform = afterimagePass.uniforms?.['damp']
    if (uniform) uniform.value = damp

    // Falls back to Earth until Murcia has finished loading, so the frame is
    // never skipped — an early return here is a blank canvas, not a dropped
    // effect.
    if (activeExperience === 'murcia' && murcia) {
      if (warping) {
        // Borrow the composer for the duration of the warp so the city gets the
        // same smear Earth does — motion blur is most of what makes a warp read
        // as one, and a city of hard edges is exactly the geometry it acts on.
        // The RenderPass's scene and camera are plain fields, so pointing it at
        // Murcia and back is free.
        renderPass.scene = murcia.scene
        renderPass.camera = murcia.viewCamera
        composer.render()
        renderPass.scene = scene
        renderPass.camera = camera
      } else {
        gl.render(murcia.scene, murcia.viewCamera)
      }
    } else {
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
