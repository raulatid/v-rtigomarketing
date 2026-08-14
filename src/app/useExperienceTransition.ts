import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import type { SequenceState } from '../experiences/earth/config/sequenceState'
import type { ExperienceId } from './experience'
import { WARP_TRANSITION, flash } from './warpTransition'

// Shaping lives entirely in warpTransition's curves, so the tween is linear.
// A GSAP ease here would compound with them and destroy the width relationship
// between position, speed and flash (DECISIONS.md:127-129).
const TWEEN_EASE = 'none'

interface Params {
  state: SequenceState
  onSwap: (to: ExperienceId) => void
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
 * project's strongest visual rule (docs/earth/DECISIONS.md: "Nothing ever
 * cross-fades" — both intro substitutions are hard cuts timed to a concealment
 * beat), and it is also what makes the transition free: at the moment of the
 * cut, only one scene is ever being drawn, so there is no frame where both
 * worlds are rendered and no cost that scales with having two.
 *
 * Neither experience is created or destroyed here — both stay mounted and the
 * render pipeline simply changes which scene it draws (ADR 003).
 */
export function useExperienceTransition({ state, onSwap }: Params) {
  const [transitioning, setTransitioning] = useState(false)
  const timelineRef = useRef<gsap.core.Timeline | null>(null)
  const onSwapRef = useRef(onSwap)
  onSwapRef.current = onSwap

  useEffect(() => {
    return () => {
      timelineRef.current?.kill()
      timelineRef.current = null
      // Leaving either part-way up would black out the page for good, or strand
      // a camera mid-dolly.
      state.transitionOverlay = 0
      state.transitionProgress = 0
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

  const transitionTo = useCallback(
    (to: ExperienceId) => {
      // Re-entrancy guard. Without it a double click starts a second timeline
      // whose reveal races the first one's cover, and the overlay can settle
      // anywhere between 0 and 1.
      if (timelineRef.current) return

      setTransitioning(true)
      const proxy = { progress: 0 }

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
          timelineRef.current = null
          setTransitioning(false)
        },
      })

      // Half one, to the cut.
      tl.to(proxy, {
        progress: WARP_TRANSITION.cut,
        duration: WARP_TRANSITION.duration * WARP_TRANSITION.cut,
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

  return { transitionTo, transitioning }
}
