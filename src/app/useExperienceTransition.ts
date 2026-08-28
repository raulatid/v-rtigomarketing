import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap/gsap-core'
// gsap-core's own declarations stop short of the `gsap.core` namespace that the
// timeline refs here, in useMasterTimeline and in DebugOverlay are typed
// against. This type-only import registers the full ambient declarations once
// for the whole program and is erased at build time, so CSSPlugin — the reason
// for importing the core build rather than the convenience bundle — still never
// reaches the entry chunk.
import type {} from 'gsap'
import type { SequenceState } from '../experiences/earth/config/sequenceState'
import type { ExperienceId } from './experience'
import { WARP_TRANSITION, flash, scrubProgress } from './warpTransition'

// Shaping lives entirely in warpTransition's curves, so the tween is linear.
// A GSAP ease here would compound with them and destroy the width relationship
// between position, speed and flash (DECISIONS.md 26.6).
const TWEEN_EASE = 'none'

interface Params {
  state: SequenceState
  onSwap: (to: ExperienceId) => void
  /**
   * The transition has genuinely finished — the timeline is complete, the progress
   * and overlay are pinned back to 0, and nothing is animating.
   *
   * Exists because `transitioning` below is React state and therefore lands a
   * render LATE. That is harmless for disabling a button and wrong for releasing an
   * input lock: gesture navigation holds a hard lock across the warp and starts its
   * cooldown from this edge, and a cooldown that starts a render late is a window in
   * which a trackpad momentum tail is accepted (`adr/009`).
   *
   * A callback rather than a returned promise, deliberately. The re-entrancy guard
   * below returns silently when it refuses, which a promise would turn into a path
   * that never resolves; and the unmount cleanup calls `tl.kill()`, which would
   * leave any outstanding promise dangling for the life of the page.
   */
  onSettled?: () => void
}

/**
 * Owns the Earth <-> Murcia warp.
 *
 * This publishes ONE number — `state.transitionProgress`, 0..1 — and fires the
 * scene swap at the midpoint. It drives no camera itself. Each experience reads
 * that progress and moves its OWN camera, which is what keeps Earth and Murcia
 * from needing to know anything about each other (ARCHITECTURE 13: camera
 * behaviour belongs to the experience that defines its interaction model).
 *
 * The shape is the intro's warp, reused rather than reinvented: the departing
 * world dollies in and accelerates, the cut lands under the closest and most
 * covered frame, and the arriving world pulls back out. See warpTransition.ts
 * for the curves.
 *
 * The swap itself is a HARD CUT at full cover, never a cross-fade. That is the
 * project's strongest visual rule (docs/DECISIONS.md 6: "Nothing ever
 * cross-fades" — both intro substitutions are hard cuts timed to a concealment
 * beat), and it is also what makes the transition free: at the moment of the
 * cut, only one scene is ever being drawn, so there is no frame where both
 * worlds are rendered and no cost that scales with having two.
 *
 * Neither experience is created or destroyed here — both stay mounted and the
 * render pipeline simply changes which scene it draws (ADR 003).
 */
export function useExperienceTransition({ state, onSwap, onSettled }: Params) {
  const [transitioning, setTransitioning] = useState(false)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  /**
   * Where the gesture has pushed the warp, 0..SCRUB_CEILING.
   *
   * A ref rather than state for the same reason `transitionProgress` is not a
   * prop: a wheel produces well over a hundred events a second and every one of
   * them would otherwise be a render of two canvases and all the overlay chrome.
   *
   * It is also what the commit reads. The spring lags the accumulator, so at the
   * moment a gesture commits the camera is somewhere BELOW the ceiling — starting
   * the timeline at a fixed number would jump it backwards.
   */
  const scrubbedRef = useRef(0)
  const onSwapRef = useRef(onSwap)
  onSwapRef.current = onSwap
  // Through a ref for the same reason `onSwap` is: `transitionTo` is memoised on
  // `state` alone, so a caller passing a fresh closure every render must not be
  // able to rebuild it mid-warp.
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled

  useEffect(() => {
    return () => {
      timelineRef.current?.kill()
      timelineRef.current = null
      // Leaving either part-way up would black out the page for good, or strand
      // a camera mid-dolly.
      state.transitionOverlay = 0
      state.transitionProgress = 0
      state.transitionCommitted = false
      scrubbedRef.current = 0
    }
  }, [state])

  // Pause while the tab is hidden, for the same reason `useMasterTimeline` does
  // — and this timeline had been missing the guard its comment describes.
  //
  // The hazard is identical in shape: `tl.call(onSwap)` at the midpoint is a
  // substitution callback, and it is THE substitution — the hard cut where the
  // active scene, the active camera and input ownership all change on one
  // frame under full cover (DECISIONS §6). GSAP fast-forwards on return from a
  // hidden tab, so backgrounding mid-warp could carry the timeline past that
  // frame and land the viewer in a state the cut was supposed to hide.
  //
  // iOS makes this ordinary rather than exotic: switching apps mid-gesture is
  // normal phone behaviour, and the window is only 1.6s wide but it is the 1.6s
  // in which everything discontinuous happens.
  useEffect(() => {
    const onVisibility = () => {
      const tl = timelineRef.current
      if (!tl) return
      if (document.hidden) tl.pause()
      else if (tl.progress() < 1) tl.play()
    }
    document.addEventListener('visibilitychange', onVisibility)
    return () => document.removeEventListener('visibilitychange', onVisibility)
  }, [])

  /**
   * The gesture moved. Drives the warp reversibly, short of the cut.
   *
   * This is the whole of the scene-driven feedback: no second animation system,
   * no blend, no hand-over logic. The gesture writes the same number the
   * cinematic writes, through the same curves, so the two join by construction
   * rather than by tuning.
   *
   * `adr/009` ruled this out — "gesture progress never enters `SequenceState` at
   * all" — on the grounds that `transitionLeg`/`dollyAmount` assume a single
   * pass. `scrubProgress` is what answers it: the band stops at
   * `cut - flashWidth`, entirely inside the departing leg, so the leg flag is
   * constant however far the gesture goes back and forth, and the flash is
   * provably zero throughout. checks/warp-transition.ts section 7 asserts both.
   *
   * Refused while a timeline is running, and that is load-bearing rather than
   * defensive: the input layer keeps reporting progress after a commit (the
   * accumulator is reset, so it reports 0), and honouring that would snap the
   * camera back to rest on the first frame of the warp it just started.
   */
  const scrub = useCallback(
    (gestureProgress: number) => {
      if (timelineRef.current) return
      const p = scrubProgress(gestureProgress)
      if (p === scrubbedRef.current) return
      scrubbedRef.current = p
      state.transitionProgress = p
      // Zero across the whole band by construction. Written anyway, so that
      // "whoever moves the progress moves the overlay" has no exception to
      // remember — and so a future change to the band's ceiling cannot leave a
      // stale flash behind.
      state.transitionOverlay = flash(p)
    },
    [state],
  )

  const transitionTo = useCallback(
    (to: ExperienceId) => {
      // Re-entrancy guard. Without it a double click starts a second timeline
      // whose reveal races the first one's cover, and the overlay can settle
      // anywhere between 0 and 1.
      if (timelineRef.current) return

      setTransitioning(true)
      // The cinematic takes the camera from here. Set BEFORE the first tween so
      // no frame can see non-zero progress that nobody has claimed.
      state.transitionCommitted = true
      // Continues from where the gesture left the camera rather than from zero.
      // Clamped below the cut because everything after it belongs to the
      // cinematic; the band cannot reach it, and a corrupted value must not
      // produce a negative duration.
      const from = Math.min(Math.max(scrubbedRef.current, 0), WARP_TRANSITION.cut)
      const proxy = { progress: from }

      const apply = () => {
        state.transitionProgress = proxy.progress
        state.transitionOverlay = flash(proxy.progress)
      }

      const tl = gsap.timeline({
        onComplete: () => {
          // Pinned rather than left wherever the last frame landed: a rounding
          // shortfall would leave a residual dolly and a faint overlay for the
          // rest of the session. Same guard the intro's warp uses.
          state.transitionProgress = 0
          state.transitionOverlay = 0
          state.transitionCommitted = false
          scrubbedRef.current = 0
          timelineRef.current = null
          setTransitioning(false)
          // AFTER the pins and after the ref is cleared, so anything this wakes
          // sees a settled world: no residual dolly, no overlay, and a
          // `transitionTo` that would be accepted rather than silently refused.
          onSettledRef.current?.()
        },
      })

      // Half one, to the cut — minus whatever the gesture already travelled.
      // The duration shrinks with the distance, which is what keeps the RATE
      // identical: the ease is linear and all the shaping lives in the curves,
      // so a shorter first half plays the remainder of the same motion at the
      // same speed rather than a compressed version of the whole thing.
      tl.to(proxy, {
        progress: WARP_TRANSITION.cut,
        duration: WARP_TRANSITION.duration * (WARP_TRANSITION.cut - from),
        ease: TWEEN_EASE,
        onUpdate: apply,
      })

      // The cut, at full cover and at the closest point of the dolly.
      // Everything discontinuous happens on this one frame: the active scene,
      // the active camera, and which experience owns input all change together
      // and none of it is visible.
      tl.call(() => onSwapRef.current(to))

      // Half two, out.
      tl.to(proxy, {
        progress: 1,
        duration: WARP_TRANSITION.duration * (1 - WARP_TRANSITION.cut),
        ease: TWEEN_EASE,
        onUpdate: apply,
      })

      timelineRef.current = tl
    },
    [state],
  )

  return { transitionTo, transitioning, scrub }
}
