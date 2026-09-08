import { useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { prefersReducedMotion } from '../../../app/warpTransition'
import { maxPointSize } from '../scene/space/warpStarShader'
import { hintVisible } from '../config/sceneVisibility'
import { PROTO_HINT } from '../../../app/protoHint'
import type { SequenceState } from '../config/sequenceState'
import { buildHintFigure } from './buildHintFigure'
import { createHintParticles } from './createHintParticles'
import { createHintPresence } from './hintPresence'
import { HINT_CONFIG } from './hintConfig'

// The Earth's way out, drawn in the scene instead of on a plate over it.
//
// Client direction: no HTML hint-tutorial on Earth. The figure — two chevrons
// over one Spanish sentence — gathers out of the star field, holds while the
// viewer looks at it, and scatters on the first scroll. Murcia keeps its glass
// chip; `styles.css` hides only the Earth one.
//
// ## What this layer owns, and what it does not
//
// It owns the frame loop and the viewport. It owns NOTHING about when the hint
// appears: that is `createNavigationInput` — a beat after an arrival, gone a
// linger after the first interaction, closed the moment navigation is refused —
// and it arrives here as one boolean on `SequenceState`. Restating any of those
// rules would give the app two answers to one question, and the existing set is
// already covered fourteen times over in that module's tests.
//
// ## Two constructions, deliberately split
//
// The `Points` is built SYNCHRONOUSLY on mount, at full capacity and invisible,
// so its shader is compiled by `EarthScene`'s scene-level warm-up rather than on
// the frame the hint first appears (the plan 003 stall). It draws nothing until
// a figure lands, because its draw range starts at zero.
//
// The FIGURE is sampled asynchronously, because it cannot be measured before the
// font stack has settled. That is raced against a timeout: a font that never
// resolves must not mean a hint that never appears.
export function HintLayer({ state, active }: { state: SequenceState; active: boolean }) {
  const { gl, size } = useThree()
  const reducedMotion = useMemo(prefersReducedMotion, [])

  const hint = useMemo(createHintParticles, [])
  const presence = useMemo(
    () => createHintPresence({ reducedMotion }),
    [reducedMotion],
  )
  const scene = useThree((s) => s.scene)
  const figureWidth = useRef(0)

  useEffect(() => {
    scene.add(hint.object)
    hint.setMaxPointSize(maxPointSize(gl))
    return () => {
      scene.remove(hint.object)
      hint.dispose()
    }
  }, [scene, gl, hint])

  // The sample. Once, not on resize — a canvas raster on a resize handler is the
  // wrong shape, and a narrow viewport is handled by scaling the figure instead.
  //
  // The pointer class DOES re-sample, and it is the only thing that does: the
  // sentence names the gesture, and on touch that gesture is a two-finger spread
  // rather than a scroll. A tablet gaining a keyboard is real, the sample costs
  // a few milliseconds, and the hint is almost always hidden when it happens.
  useEffect(() => {
    let cancelled = false
    const coarse = window.matchMedia('(pointer: coarse)')

    const build = () => {
      const figure = buildHintFigure(coarse.matches)
      if (cancelled || !figure) return
      figureWidth.current = figure.width
      hint.setFigure(figure)
    }

    const settled =
      typeof document.fonts?.ready?.then === 'function'
        ? Promise.race([document.fonts.ready, wait(500)])
        : Promise.resolve()
    void settled.then(build)

    coarse.addEventListener('change', build)
    return () => {
      cancelled = true
      coarse.removeEventListener('change', build)
    }
  }, [hint])

  // The viewport, in the terms the shader wants. Pushed on change rather than
  // per frame, and the pixel ratio is included because it can move under the app
  // — dragging a window between displays of different density does it.
  useEffect(() => {
    const fit = fitFor(size.width, figureWidth.current)
    hint.setViewport(size.height, gl.getPixelRatio(), fit)
  }, [hint, gl, size.width, size.height])

  useFrame((_, delta) => {
    // Frozen, not reset, while Murcia is showing.
    if (!active) return

    // `?hint=1` holds it up so the figure can be judged; the gesture that would
    // let you look at it is otherwise the one that dismisses it. DEBUG only.
    presence.setVisible(PROTO_HINT.hold || hintVisible(state))
    const frame = presence.tick(clampFrameDelta(delta))

    hint.setVisible(frame.visible)
    if (!frame.visible) return

    // The fit is recomputed here rather than only in the effect above because
    // the figure arrives asynchronously — the first sample can land after the
    // last resize, and without this the hint would draw at fit 1 until the next
    // one.
    hint.setViewport(size.height, gl.getPixelRatio(), fitFor(size.width, figureWidth.current))
    hint.setPhase(frame.progress, frame.exit)
  })

  return null
}

/**
 * How far the figure has to shrink to clear the side margins.
 *
 * One uniform rather than a re-layout: proportions are preserved, no canvas work
 * happens on a resize, and it is the same thing the HTML hint's media queries
 * did by hand. Never grows past 1 — the design size is the intended size.
 */
function fitFor(cssWidth: number, figurePx: number): number {
  if (figurePx <= 0) return 1
  const available = cssWidth - HINT_CONFIG.render.marginPx * 2
  return Math.min(1, Math.max(0.1, available / figurePx))
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
