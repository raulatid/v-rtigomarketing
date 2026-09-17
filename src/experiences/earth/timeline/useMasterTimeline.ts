import { prefersReducedMotion } from '../../../platform/motionPreference'
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
import { cinematicSpeed, narrowPeak } from '../../../utils/easing'
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
  /**
   * This browser has landed here before, with consent to remember it
   * (DECISIONS §51). The first build of the timeline then enters at the
   * crossover instead of playing shrink and warp. A replay builds the whole
   * tail whatever this says, so `/debug` can still reach every phase.
   */
  returning: boolean
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
  returning,
}: Params) {
  const [phase, setPhaseReact] = useState<Phase>('draw')
  const tlRef = useRef<gsap.core.Timeline | null>(null)

  useLayoutEffect(() => {
    const draw = intro.current
    if (!draw || !drawComplete) return

    const reducedMotion = prefersReducedMotion()

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
      // A returning visitor's load may have ended with the mark never shown, and
      // that is the state their way in starts from — it is not this reset's to undo.
      // Under reduced motion too: that branch hides the mark itself a tick later,
      // and showing it here first would flash the whole mark for a frame.
      const enteringAtCrossover = returning && replayKey === 0
      if (!enteringAtCrossover) draw.setVisible(true)

      // ── P0 DRAW ── already played, by intro-draw. The label is kept so the
      // debug overlay can still seek to it; the seek handler rewinds the draw.
      master.addLabel('draw').call(() => setPhase('draw'))

      // ── P4 CORNER, P5 ORBITS, END STATE ── shared by both ways in.
      //
      // Placed at explicit times rather than appended. The returning visitor's
      // fade outlasts the bloom it runs over, and an append would start the corner
      // phase when the FADE ends — but the logo's spin and flight run on the logo's
      // own clock from startSequence(), so the phases have to keep the logo's time,
      // not the fade's.
      const addLanding = (at: number) => {
        // The logo's spin + flight are driven by its own loop; the master just
        // holds the sequence open for their combined duration. The logo is alone
        // at centre through the pause + spin, and the eye is on it.
        const orbitsAt = at + config.spinPauseBefore + config.spinDuration
        // Hold for whichever finishes last: the logo's flight or the reveal.
        const siteAt =
          orbitsAt +
          Math.max(config.orbitsStartOffset, 0) +
          Math.max(config.toCornerDuration, orbitRevealDuration(satelliteCount))

        master.addLabel('corner', at).call(() => setPhase('corner'), [], at)

        // Deliberately NOT simultaneous with the corner flight. Both are ~3.4s and
        // both are focal; run together, the eye tracks the large spinning logo and
        // the staggered orbit draw-in is missed entirely. Starting here — as the
        // logo departs centre — hands attention off instead of splitting it.
        master.addLabel('orbits', orbitsAt).call(
          () => {
            setPhase('orbits')
            state.orbitsStarted = true
          },
          [],
          orbitsAt,
        )

        // Earth at rest, isotype idling in the corner. The empty tween is what
        // holds the timeline open up to it: a label alone has no duration.
        master
          .to({}, { duration: siteAt - at }, at)
          .addLabel('site', siteAt)
          .call(() => setPhase('site'), [], siteAt)
      }

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

      // ── THE RETURNING VISITOR'S WAY IN ──
      //
      // It used to be a seek to `site` on the first tail frame, and that was a
      // cut with nothing over it: the mark vanished, the logo was parked, the
      // camera jumped from the star field to the planet and every control
      // mounted, all in one commit. What a second visit has no use for is the
      // drawing, the shrink and the warp — not the landing, which is the part
      // that says where they are. So their load waits unseen (`quiet`, in
      // intro-draw), they enter at the crossover, and the landing plays.
      //
      // A timeline of its own rather than a seek to `swap`, because a seek would
      // leave a cut showing that the warp's flash covers on a first visit: stars
      // becoming a planet between two frames.
      //
      // The phases keep their names, so everything keyed on them holds: `shrink`
      // still means "the 2D mark, over the stars, planet hidden", `swap` still
      // means "the planet is up and the mark is changing hands". `warp` never
      // happens, so `warpProgress` stays 0 and CameraController's rest branch
      // places the camera at the planet from `swap`, as it does for any seek.
      if (enteringAtCrossover) {
        master.addLabel('shrink').call(() => setPhase('shrink'))

        // Normally there is no 2D mark: the load waited unseen (`quiet`, in
        // intro-draw) and the 3D mark is the first thing this visitor sees. The
        // collapse is for the load that outlasted its grace and showed the
        // drawing after all — that mark cannot simply vanish, so it goes out
        // through zero, power2.in like the real crossover.
        if (draw.isVisible()) {
          const collapse = { t: 0 }
          master.to(collapse, {
            t: 1,
            duration: config.returnCollapseDuration,
            ease: 'none',
            onUpdate: () => draw.setScale(1 - collapse.t * collapse.t),
          })
        }

        const reveal = { cover: 1 }
        master
          .addLabel('swap')
          .call(() => {
            // Same tick, never a cross-fade — and under full cover, which is what
            // the planet appearing behind it needs.
            state.swapOverlay = 1
            setPhase('swap')
            draw.setVisible(false)
            cornerLogo.current?.startSequence()
          })
          // Anchored AT the label rather than appended, so the fade runs over the
          // bloom and into the spin without holding the sequence open for it.
          .to(
            reveal,
            {
              cover: 0,
              duration: config.returnRevealDuration,
              ease: 'power2.out',
              onUpdate: () => {
                state.swapOverlay = reveal.cover
              },
            },
            'swap',
          )

        addLanding(master.labels.swap + config.swapDuration * (1 - config.swapCrossover))
        master.play('shrink')
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

            // The same smooth envelope as the planet reveal: zero velocity and
            // acceleration at the edges and peak, with no delay at the crossing.
            state.swapOverlay =
              narrowPeak(p, x, config.swapFlashWidth) * config.swapFlashStrength
          },
        })
        .call(() => {
          state.swapOverlay = 0
        })

      addLanding(master.duration())

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
