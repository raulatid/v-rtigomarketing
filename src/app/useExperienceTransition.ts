import { useCallback, useEffect, useRef, useState } from 'react'
import gsap from 'gsap'
import type { SequenceState } from '../sequenceState'
import type { ExperienceId } from './experience'

// Durations are asymmetric on purpose: the cover has to feel decisive and the
// reveal has to feel like an arrival. Matching them reads as a dissolve.
const COVER_SECONDS = 0.32
const REVEAL_SECONDS = 0.5

interface Params {
  state: SequenceState
  onSwap: (to: ExperienceId) => void
}

/**
 * Owns the Earth <-> Murcia transition.
 *
 * The swap itself is a HARD CUT at full cover, never a cross-fade. That is the
 * project's strongest visual rule (docs/earth/DECISIONS.md: "Nothing ever
 * cross-fades" — both intro substitutions are hard cuts timed to a concealment
 * beat), and it is also what makes the transition free: at the moment of the
 * cut, only one scene is ever being drawn, so there is no frame where both
 * worlds are rendered and no cost that scales with having two.
 *
 * Neither experience is created or destroyed here — both stay mounted and the
 * render pipeline simply changes which scene it draws (ADR 003). The flash
 * exists to conceal the discontinuity between two unrelated cameras, exactly as
 * the intro's warp flash conceals the starfield -> Earth cut.
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
      // Leaving the overlay part-way up would black out the page for good.
      state.transitionOverlay = 0
    }
  }, [state])

  const transitionTo = useCallback(
    (to: ExperienceId) => {
      // Re-entrancy guard. Without it a double click starts a second timeline
      // whose reveal races the first one's cover, and the overlay can settle
      // anywhere between 0 and 1.
      if (timelineRef.current) return

      setTransitioning(true)
      const cover = { value: 0 }

      const tl = gsap.timeline({
        onComplete: () => {
          timelineRef.current = null
          setTransitioning(false)
        },
      })

      tl.to(cover, {
        value: 1,
        duration: COVER_SECONDS,
        ease: 'power2.in',
        onUpdate: () => {
          state.transitionOverlay = cover.value
        },
      })

      // The cut, at full cover. Everything discontinuous happens on this one
      // frame: the active scene, the active camera, and which experience owns
      // input all change together and none of it is visible.
      tl.call(() => onSwapRef.current(to))

      tl.to(cover, {
        value: 0,
        duration: REVEAL_SECONDS,
        ease: 'power2.out',
        onUpdate: () => {
          state.transitionOverlay = cover.value
        },
      })

      timelineRef.current = tl
    },
    [state],
  )

  return { transitionTo, transitioning }
}
