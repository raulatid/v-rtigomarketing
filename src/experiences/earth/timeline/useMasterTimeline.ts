import { RefObject, useEffect, useLayoutEffect, useRef, useState } from 'react'
import gsap from 'gsap/gsap-core'
// gsap-core's own declarations stop short of the `gsap.core` namespace that this
// file and `components/DebugOverlay` both name in type positions. A type-only
// side-effect import of the full package supplies it without pulling any of the
// package's code into the bundle.
//
// It used to live in `app/useExperienceTransition`, which was the other GSAP
// caller. That module now counts with `utils/transitionClock` instead, so the
// augmentation moved to the timeline that still genuinely owns a GSAP object —
// the intro's (DECISIONS 26.3).
import type {} from 'gsap'
import { IntroConfig, Phase } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { cinematicSpeed } from '../../../utils/easing'
import { orbitRevealDuration } from '../orbit/orbitConfig'
import { IntroDrawHandle } from '../../../intro-draw/introDraw'

import type { CornerLogoHandle } from '../../../corner-logo/cornerLogoConfig'

interface Params {
  intro: RefObject<IntroDrawHandle | null>
  config: IntroConfig
  state: SequenceState
  cornerLogo: RefObject<CornerLogoHandle | null>
  replayKey: number
  /** True once the progress-driven draw has finished its fill. */
  drawComplete: boolean
  /**
   * How many orbits the scene will actually reveal, so the hold below matches
   * the animation that plays. A number rather than the content itself — see
   * `orbitRevealDuration`, which this module used to make an entry-chunk
   * dependency of every case study.
   */
  satelliteCount: number
}

// The clock for P1-P5. P0 is NOT on it: the drawing runs on load progress in
// intro-draw, and hands over here when its fill completes (plan 006 §4.1). The
// invariant is now "the single clock owns everything from `shrink` onward".
//
// The old `assetGate` label is gone with it — waiting for assets is what the
// drawing itself does now, so there is nothing left to gate.
export function useMasterTimeline({
  intro,
  config,
  state,
  cornerLogo,
  replayKey,
  drawComplete,
  satelliteCount,
}: Params) {
  const [phase, setPhaseReact] = useState<Phase>('draw')
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  useLayoutEffect(() => {
    const draw = intro.current
    if (!draw || !drawComplete) return

    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

    // Discrete phase changes are the only thing allowed to hit React state.
    const setPhase = (next: Phase) => {
      state.phase = next
      setPhaseReact(next)
    }

    // P0's own size is 1.0 by definition; every later phase scales relative to
    // it, so the shrink target is a ratio rather than a vmin count.
    const shrinkScale = config.shrinkTargetSize / config.introSize

    const ctx = gsap.context(() => {
      const master = gsap.timeline({ paused: true })
      tlRef.current = master

      // Reset continuous state so a replay starts clean.
      state.warpProgress = 0
      state.warpOverlay = 0
      state.swapOverlay = 0
      state.motionBlur = 0
      state.orbitsStarted = false
      draw.setScale(1)
      draw.setWarp(0, 0)
      draw.setVisible(true)

      // ── P0 DRAW ── already played, by intro-draw. The label is kept so the
      // debug overlay can still seek to it; the seek handler rewinds the draw.
      master.addLabel('draw').call(() => setPhase('draw'))

      if (reducedMotion) {
        // No shrink, no warp, no crossover flight. Hand straight to the end
        // state: Earth at rest, logo already parked in the corner.
        master
          .addLabel('site')
          .call(() => {
            draw.setVisible(false)
            // Satellites orbit at a calm ambient speed, so they stay — only the
            // reveal's staggered draw-in is skipped, by starting already-shown.
            state.orbitsStarted = true
            setPhase('site')
            cornerLogo.current?.startSequence()
          })
          .to({}, { duration: 0.01 })
        master.play()
        return
      }

      // ── P1 SHRINK ──
      const sizeProxy = { value: 1 }
      master
        .addLabel('shrink')
        .call(() => setPhase('shrink'))
        .to(sizeProxy, {
          value: shrinkScale,
          duration: config.shrinkDuration,
          ease: 'power2.inOut',
          onUpdate: () => draw.setScale(sizeProxy.value),
        })

      // ── P2 WARP ──
      // ease:'none' is deliberate — the shaping lives in cinematicTravel /
      // cinematicSpeed / narrowPeak. A GSAP ease here would compound with them
      // and break the width relationship between the three curves.
      const warpProxy = { progress: 0 }
      master
        .addLabel('warp')
        .call(() => setPhase('warp'))
        .to(warpProxy, {
          progress: 1,
          duration: config.warpDuration,
          ease: 'none',
          onUpdate: () => {
            state.warpProgress = warpProxy.progress

            // AfterimagePass only touches the WebGL framebuffer, so the DOM SVG
            // would otherwise sit pin-sharp through the most violent part of
            // the warp. Fake the same motion with a CSS filter driven by the
            // very same speed factor (plan 002 §4.2). cinematicSpeed is a bell,
            // so both return to zero on their own by progress 1.
            const speed = cinematicSpeed(
              warpProxy.progress,
              config.sceneSwapProgress,
              config.speedPeakWidth,
            )
            draw.setWarp(speed * config.svgWarpBlur, speed * config.svgWarpStretch)
          },
        })
        .call(() => {
          state.warpProgress = 1
          draw.setWarp(0, 0)
        })

      // ── P3 SWAP (scale-through-zero crossover) ──
      const swapProxy = { progress: 0 }
      let substituted = false

      master
        .addLabel('swap')
        .call(() => {
          setPhase('swap')
          substituted = false
        })
        .to(swapProxy, {
          progress: 1,
          duration: config.swapDuration,
          ease: 'none',
          onUpdate: () => {
            const p = swapProxy.progress
            const x = config.swapCrossover

            // Without a model there is nothing to substitute INTO, and a
            // zero-crossing conceals nothing — so hold the 2D mark at full size
            // rather than collapsing it into an empty frame.
            const canSubstitute = cornerLogo.current?.isReady() ?? false

            if (!canSubstitute) {
              draw.setScale(shrinkScale)
              return
            }

            if (p < x) {
              // Collapse: power2.in so it is near-vertical at the crossing.
              const t = p / x
              draw.setScale(shrinkScale * (1 - t * t))
            } else if (!substituted) {
              // Same tick, never a cross-fade (extraction 001 §1).
              substituted = true
              draw.setVisible(false)
              cornerLogo.current?.startSequence()
            }

            // Narrow flash centred on the crossing — the beat that replaces the
            // dropped particle burst (plan 002 §6.1).
            const d = Math.abs(p - x) / config.swapFlashWidth
            const bell = d >= 1 ? 0 : 1 - d * d * (3 - 2 * d)
            state.swapOverlay = bell * config.swapFlashStrength
          },
        })
        .call(() => {
          state.swapOverlay = 0
        })

      // ── P4 CORNER ──
      // The logo's spin + flight are driven by its own loop; the master just
      // holds the sequence open for their combined duration.
      master
        .addLabel('corner')
        .call(() => setPhase('corner'))
        // Hold through the pause + spin. The logo is alone at centre here and
        // the eye is on it.
        .to({}, { duration: config.spinPauseBefore + config.spinDuration })

      // ── P5 ORBITS ──
      // Deliberately NOT simultaneous with the corner flight. Both are ~3.4s and
      // both are focal; run together, the eye tracks the large spinning logo and
      // the staggered orbit draw-in is missed entirely. Starting here — as the
      // logo departs centre — hands attention off instead of splitting it.
      master
        .addLabel('orbits')
        .call(() => {
          setPhase('orbits')
          state.orbitsStarted = true
        })
        .to({}, { duration: Math.max(config.orbitsStartOffset, 0) })
        // Hold for whichever finishes last: the logo's flight or the reveal.
        .to(
          {},
          {
            duration: Math.max(config.toCornerDuration, orbitRevealDuration(satelliteCount)),
          },
        )

      // ── END STATE ── Earth at rest, isotype idling in the corner.
      master.addLabel('site').call(() => setPhase('site'))

      // Starts at `shrink`, not at zero — P0 already played, in intro-draw.
      master.play('shrink')
    })

    return () => {
      tlRef.current = null
      ctx.revert()
    }
  }, [intro, config, state, cornerLogo, replayKey, drawComplete, satelliteCount])

  // Pause the timeline while the tab is hidden — GSAP would otherwise fast
  // forward on return and skip the crossover's substitution callback.
  useEffect(() => {
    const onVisibility = () => {
      const tl = tlRef.current
      if (!tl) return
      if (document.hidden) tl.pause()
      else if (tl.progress() < 1) tl.play()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  return { phase, timeline: tlRef }
}
