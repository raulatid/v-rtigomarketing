import { RefObject, useEffect, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { AfterimagePass } from 'three/addons/postprocessing/AfterimagePass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
// This file imports nothing from either experience and nothing from the
// application layer. §17 allows `graphics -> shared` only, and that is now all
// there is: three.js, its addons, and two local modules.
import type {
  FrameSettings,
  OverlayPass,
  RenderableExperience,
} from './renderableExperience'
import { clampFrameDelta } from './frameDelta'
import { observeContextLoss } from './contextLoss'

interface Props {
  /**
   * The frame's settings, read once per frame.
   *
   * A callback rather than props because every value in it changes per frame
   * during a warp, and a per-frame prop is a per-frame React render.
   */
  readSettings: () => FrameSettings
  /**
   * The experience that renders straight to the canvas, when the route says so.
   * Null until it has loaded, which is why the route alone does not decide.
   */
  directRef: RefObject<RenderableExperience | null>
  /** Composited last, on a cleared depth buffer. Null until it has loaded. */
  overlayRef: RefObject<OverlayPass | null>
  /**
   * The WebGL context was lost, so nothing this module draws will reach the
   * screen again. Forwarded rather than acted on: this file knows the browser
   * event, and what to tell the visitor is the application's decision — the
   * same split `readSettings` makes for everything else here.
   */
  onContextLost?: (reason: string) => void
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
//   1. The active experience, by whichever route orchestration selected. The
//      composer route gets the warp blur and the bloom; the direct route goes
//      straight to the canvas — see the composer note below.
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
// WHY A DIRECT ROUTE EXISTS AT ALL — and why it still borrows the composer
// during a warp (ADR 005).
//
// EffectComposer builds its render targets as
// `new WebGLRenderTarget(w, h, { type: HalfFloatType })` — with no `samples`,
// so they carry no MSAA. That is a fair trade for a scene of spheres, points
// and additive glow, and a bad one for a scene of hard edges: routing the
// latter through the composer permanently would silently throw away the
// `antialias: true` the canvas was created with. (Concretely: Earth takes the
// composer route, the city takes the direct one.)
//
// A warp is the one case where the trade inverts: the whole frame is smeared
// and moving fast, so aliasing is invisible, and the blur is most of what makes
// the motion read. So the direct experience borrows the composer for those
// ~1.6 seconds and goes straight back to the canvas afterwards.
//
// Tone mapping lands exactly once on either path: three applies it in-shader
// only when the render target is null, which is why the composer path needs
// OutputPass and the direct path does not.
export function RenderPipeline({ readSettings, directRef, overlayRef, onContextLost }: Props) {
  const { gl, scene, camera, size } = useThree()

  // Attached here because this is the module whose entire job stops working
  // when the context goes. Ref-free on purpose: `onContextLost` is a stable
  // callback from the application, and re-attaching a DOM listener is cheap
  // enough that chasing identity would cost more than it saves.
  useEffect(() => {
    const canvas = gl.domElement
    return observeContextLoss(canvas, {
      onLost: (reason) => onContextLost?.(reason),
      onRestored: () => {
        // Deliberately not a recovery path. Every texture upload and shader
        // compile in this application happens once, inside an effect keyed on
        // load, so a restored context comes back empty while the scene believes
        // it is warm. Saying so is more useful than pretending — see
        // `contextLoss.ts` for why restoration is its own project.
        console.warn(
          '[graphics] WebGL context restored, but the scene cannot rebuild itself — a reload is required',
        )
      },
    })
  }, [gl, onContextLost])

  const { composer, renderPass, bloomPass, afterimagePass, outputPass } = useMemo(() => {
    const c = new EffectComposer(gl)
    const rPass = new RenderPass(scene, camera)
    c.addPass(rPass)

    // BEFORE the afterimage, deliberately, and the order is a real choice
    // rather than an arbitrary one. Bloom thresholds against absolute
    // luminance, so it has to see the true HDR frame — behind the afterimage it
    // would be thresholding an image already faded toward the previous frame,
    // and the glow would pump as the blur ramped. Warping then smears an
    // already-bloomed frame, which is also the better of the two looks.
    //
    // The resolution is a starting size only; the composer calls setSize on
    // every pass, so the effect below keeps it correct.
    const bPass = new UnrealBloomPass(new THREE.Vector2(size.width, size.height), 0, 0, 0)
    c.addPass(bPass)

    const aPass = new AfterimagePass(0)
    c.addPass(aPass)
    // Retained rather than constructed inline: EffectComposer.dispose() does not
    // walk its passes, so an unreferenced pass is unreachable for disposal.
    const oPass = new OutputPass()
    c.addPass(oPass)
    return {
      composer: c,
      renderPass: rPass,
      bloomPass: bPass,
      afterimagePass: aPass,
      outputPass: oPass,
    }
    // `size` is deliberately NOT a dependency: rebuilding the composer on every
    // resize would throw away and recompile every pass. The effect below
    // resizes it instead; this only wants the initial dimensions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
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
      // quads; OutputPass owns a material and a quad; UnrealBloomPass is the
      // worst of them, owning five mip render targets plus a separation
      // material, a composite material and five blur materials. Left to the
      // composer they leak on every unmount and on any gl/scene/camera
      // identity change.
      bloomPass.dispose()
      afterimagePass.dispose()
      outputPass.dispose()
      renderPass.dispose()
      composer.dispose()
    }
  }, [composer, bloomPass, afterimagePass, outputPass, renderPass])

  useFrame((_, delta) => {
    const direct = directRef.current
    const settings = readSettings()

    // Soft reset: an accumulation buffer left at a nonzero damp holds a ghost
    // of the last frame indefinitely after the warp ends.
    const amount = settings.motionBlur <= 0.001 ? 0 : settings.motionBlur
    const damp = amount === 0 ? 0 : settings.afterimageDampMax * amount
    const uniform = afterimagePass.uniforms?.['damp']
    if (uniform) uniform.value = damp

    // Disabled at zero, for exactly the reason the bloom line below gives — and
    // it took until 2026-08-14 to apply that reasoning to the pass it was
    // written next to. Motion blur is non-zero only during a ~1.6s warp, so for
    // the whole rest of the session this pass was running a full-resolution
    // comp AND a full-resolution copy to produce an image identical to its
    // input. Two fullscreen passes and 21MB of HalfFloat targets, every frame,
    // for a no-op (`audits/ios-safari-2026-08-14.md`, I3).
    //
    // Safe against the ghosting the soft reset above exists for: `damp` is
    // already 0 by the time this disables the pass, so the accumulation buffer
    // it would have read is not merely stale but unused, and re-enabling starts
    // from the live frame rather than from whatever was last accumulated.
    afterimagePass.enabled = damp > 0

    // Disabled rather than zeroed at 0: EffectComposer skips a disabled pass
    // entirely, so this is what actually reclaims the ~10 fullscreen passes.
    // OutputPass is always enabled, so toggling this can never change which
    // pass renders to screen — the property EffectComposer resolves per render.
    bloomPass.enabled = settings.bloomStrength > 0
    bloomPass.strength = settings.bloomStrength
    bloomPass.radius = settings.bloomRadius
    bloomPass.threshold = settings.bloomThreshold

    // A direct route needs BOTH the route and a loaded experience: the route
    // flips at the cut, but the experience may still be loading. Falling back to
    // the composer keeps the frame drawn — an early return here is a blank
    // canvas, not a dropped effect.
    const wantsDirect = settings.route !== 'composer'
    if (wantsDirect && direct) {
      if (settings.route === 'direct-composited') {
        // Borrow the composer so the direct experience gets the same smear the
        // composer one does — motion blur is most of what makes a warp read as
        // one, and hard edges are exactly the geometry it acts on. The
        // RenderPass's scene and camera are plain fields, so pointing it away
        // and back is free.
        renderPass.scene = direct.scene
        renderPass.camera = direct.viewCamera
        composer.render()
        renderPass.scene = scene
        renderPass.camera = camera
      } else {
        gl.render(direct.scene, direct.viewCamera)
      }
    } else {
      composer.render()
    }

    // ─── Overlay pass ───
    const overlay = overlayRef.current
    if (overlay && overlay.isDrawable()) {
      // The overlay's clock only advances while drawable, matching the early
      // return the corner logo's old dedicated rAF did — otherwise its reveal
      // would start mid-spin. Delta is clamped as that loop clamped its own.
      overlay.update(clampFrameDelta(delta))

      const previousAutoClear = gl.autoClear
      gl.autoClear = false
      // Composites over the frame just resolved, but on a fresh depth buffer so
      // the overlay is never occluded by scene geometry — the isolation the
      // separate context used to provide for free.
      gl.clearDepth()
      gl.render(overlay.scene, overlay.camera)
      gl.autoClear = previousAutoClear
    }
  }, 1)

  return null
}
