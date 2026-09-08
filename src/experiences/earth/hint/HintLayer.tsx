import { RefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { prefersReducedMotion } from '../../../app/warpTransition'
import { maxPointSize } from '../scene/space/warpStarShader'
import { hintAllowed } from '../config/sceneVisibility'
import { PROTO_HINT } from '../../../app/protoHint'
import type { SequenceState } from '../config/sequenceState'
import { buildHintFigure } from './buildHintFigure'
import { createHintParticles } from './createHintParticles'
import { createHintPresence } from './hintPresence'
import { createIdleWatch } from './hintIdle'
import { HINT_CONFIG } from './hintConfig'

// The Earth's way out, drawn in the scene instead of on a plate over it.
//
// Client direction: no HTML hint-tutorial on Earth. The figure — two chevrons
// over one Spanish sentence — gathers out of the star field, holds while the
// viewer looks at it, and scatters on the first scroll. Murcia keeps its glass
// chip; `styles.css` hides only the Earth one.
//
// ## It is offered on STILLNESS, not on arrival
//
// Client direction. The figure appears once the viewer has done nothing for a
// couple of seconds and steps aside as soon as they act — so it reads as
// something the scene offers while they are looking, rather than as a card
// pushed at them every time a world lands.
//
// That is a different rule from Murcia's glass chip, which is still offered a
// beat after each arrival and does not return until the next one. The two were
// wired together while they shared a rule and are deliberately not any more:
// `createNavigationInput` is untouched and owns the chip, and this owns the
// figure. What arrives from the app is only PERMISSION — `state.hintAllowed`,
// meaning the viewer is on Earth and nothing else has their attention.
//
// The stillness itself is counted here rather than in the app because it is a
// property of the viewer, not of the sequence, and because the frame loop is
// already the thing that knows how much time has passed.
//
// Stillness means the viewer has not ACTED — pressed, scrolled, typed, or come
// to rest on a satellite. Moving the mouse across the scene is not acting, and
// used to be; see the event list below.
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
export function HintLayer({
  state,
  active,
  satelliteHoverRef,
}: {
  state: SequenceState
  active: boolean
  /**
   * Written every frame by InteractionLayer, which owns the pick. Read rather
   * than computed, because the raycast that answers it already happens once a
   * frame and a second one here would be the same question asked twice.
   */
  satelliteHoverRef: RefObject<boolean>
}) {
  const { gl, size } = useThree()
  const reducedMotion = useMemo(prefersReducedMotion, [])

  const hint = useMemo(createHintParticles, [])
  const presence = useMemo(
    () => createHintPresence({ reducedMotion }),
    [reducedMotion],
  )
  const idle = useMemo(
    () => createIdleWatch({ idleSeconds: HINT_CONFIG.presence.idleSeconds }),
    [],
  )
  const scene = useThree((s) => s.scene)
  const figure = useRef({ width: 0, height: 0 })
  // The drift's own clock. A local accumulator rather than the GSAP timeline or
  // `state.clock`, which is the convention every ambient motion in this scene
  // follows — the intro's clock is seeked and scrubbed, and a shimmer that
  // jumped when someone dragged the debug playhead would be a bug nobody could
  // place.
  const elapsed = useRef(0)
  // Resolved once: it is both pushed to the shader and reserved in the bottom
  // gap, and the two must agree or the float eats its own footer clearance.
  const drift = reducedMotion ? 0 : HINT_CONFIG.render.driftPx
  // Measured on resize and cached, because the frame loop needs it and reading
  // it forces a layout — see `safeAreaBottom`.
  const safeBottom = useRef(0)

  useEffect(() => {
    scene.add(hint.object)
    hint.setMaxPointSize(maxPointSize(gl))
    // The idle shimmer is decoration in motion, and it is the one part of this
    // figure that loops. Same split the HTML hint's own media query makes —
    // kill the loops, keep the fades — and the sentence is fully legible
    // standing still, so nothing is lost but the breathing.
    hint.setDrift(drift)
    return () => {
      scene.remove(hint.object)
      hint.dispose()
    }
  }, [scene, gl, hint, reducedMotion])

  // What counts as the viewer doing something.
  //
  // A COMMITTED act, not attention. A press, a scroll, a key — someone doing any
  // of those has already decided where they are going, whether that is a drag
  // towards a satellite or a button, and the figure steps aside for it.
  //
  // A bare `pointermove` is deliberately NOT on this list, and was: it scattered
  // the figure on the smallest twitch of the mouse, which is the one thing a
  // viewer does while reading it. A hand resting on a mouse that moves is still
  // a viewer who has not chosen, so the offer stands until they act.
  //
  // Still wider than `createNavigationInput`'s idea of an interaction, which
  // only counts gestures that navigate: a key or a press anywhere on the page
  // dismisses this, including one that lands on a panel over the scene.
  //
  // On `window` and in the capture phase, so a panel that stops propagation
  // still counts; passive, because none of this ever prevents a default.
  useEffect(() => {
    const poke = () => idle.poke()
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const
    for (const type of events) {
      window.addEventListener(type, poke, { passive: true, capture: true })
    }
    return () => {
      for (const type of events) {
        window.removeEventListener(type, poke, { capture: true })
      }
    }
  }, [idle])

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
      const sampled = buildHintFigure(coarse.matches)
      if (cancelled || !sampled) return
      figure.current = { width: sampled.width, height: sampled.height }
      hint.setFigure(sampled)
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
  //
  // The safe-area inset is re-read here rather than once on mount: it changes on
  // an orientation flip, which arrives as a resize.
  useEffect(() => {
    safeBottom.current = safeAreaBottom()
    pushViewport(hint, gl, size, figure.current, safeBottom.current, drift)
  }, [hint, gl, size, drift])

  useFrame((_, delta) => {
    // Frozen, not reset, while Murcia is showing.
    if (!active) return

    // `?hint=1` holds it up so the figure can be judged; the gesture that would
    // let you look at it is otherwise the one that dismisses it. DEBUG only.
    const dt = clampFrameDelta(delta)
    elapsed.current += dt

    // A pointer resting on a satellite counts as acting, even though no event
    // fired. It is the one hover the scene answers back — the badge bumps, the
    // cursor turns — so the viewer has already found a target and the figure
    // pointing at one is in the way. Held down rather than poked once, so the
    // wait only restarts when the pointer leaves.
    //
    // The value is the previous frame's pick, which is why it is polled rather
    // than subscribed to: a frame of lag against a two-second rule is not a lag,
    // and reading a ref cannot go stale the way a callback that stops firing on
    // the way out of the scene can.
    if (satelliteHoverRef.current) idle.poke()

    // Idle is asked EVERY frame, including while the hint is up: the answer is a
    // state and not an edge, so the first move after it appears turns this false
    // and the figure scatters.
    const still = idle.tick(dt)

    // ?hint=1 holds it up so the figure can be judged; the stillness this waits
    // for is otherwise broken by the very act of looking. DEBUG only.
    presence.setVisible(PROTO_HINT.hold || (hintAllowed(state) && still))
    const frame = presence.tick(dt)

    hint.setVisible(frame.visible)
    if (!frame.visible) return

    // Recomputed here rather than only in the effect above because the figure
    // arrives asynchronously — the first sample can land after the last resize,
    // and until then its width and height are zero. Cheap: four numbers, and the
    // safe-area probe is NOT repeated per frame.
    pushViewport(hint, gl, size, figure.current, safeBottom.current, drift)
    hint.setPhase(frame.progress, frame.exit)
    hint.setTime(elapsed.current)
  })

  return null
}

/**
 * Viewport → the four numbers the shader places the figure with.
 *
 * The offset is what makes the position device-independent. It is derived from
 * the BOTTOM edge — viewport half-height, less the gap the config asks for, less
 * half the figure's own scaled height — so the sentence sits the same distance
 * above the bottom on every screen. Anchoring at a fixed drop from the centre
 * instead, which is what shipped first, makes that distance a function of
 * viewport height: 68px at 1440x900, 301px on a tall tablet, and -187px in phone
 * landscape, which is off the screen entirely.
 *
 * The float's amplitude is part of the gap, so `bottomPx` means the CLOSEST the
 * figure ever comes to the bottom rather than where it happens to rest. Without
 * that term the down half of the swing dips into `.site-footer`'s band — the
 * figure rests 24px up, the float takes it to 19px, and the footer owns 14..26px
 * — which is the collision the anchor exists to prevent, arriving through the
 * back door once the figure started moving. The amplitude is scaled by the fit
 * because the shader applies it inside the figure's own coordinates.
 */
function pushViewport(
  hint: ReturnType<typeof createHintParticles>,
  gl: { getPixelRatio: () => number },
  size: { width: number; height: number },
  figure: { width: number; height: number },
  safeBottom: number,
  driftPx: number,
): void {
  const fit = fitFor(size.width, figure.width)
  const gap = HINT_CONFIG.render.bottomPx + safeBottom + driftPx * fit
  const offsetPx = size.height / 2 - gap - (figure.height * fit) / 2
  hint.setViewport(size.height, gl.getPixelRatio(), fit, offsetPx)
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

/**
 * `env(safe-area-inset-bottom)`, in CSS px, measured rather than assumed.
 *
 * The glass chip this replaces sat at `max(28px, safe-area-inset-bottom + 20px)`
 * and got the inset from CSS. A figure inside the canvas cannot ask CSS, so it
 * asks a throwaway element that can — without this, the sentence sits under an
 * iPhone's home indicator. Returns 0 anywhere the value is unsupported, which is
 * the correct answer on a device that has no inset.
 */
function safeAreaBottom(): number {
  if (typeof document === 'undefined') return 0
  const probe = document.createElement('div')
  probe.style.cssText =
    'position:fixed;left:0;bottom:0;width:0;visibility:hidden;pointer-events:none;' +
    'height:env(safe-area-inset-bottom, 0px)'
  document.body.appendChild(probe)
  const px = probe.getBoundingClientRect().height
  probe.remove()
  return Number.isFinite(px) ? px : 0
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}
