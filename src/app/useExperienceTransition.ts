import { useCallback, useEffect, useRef, useState } from 'react'
import { createTransitionClock } from '../utils/transitionClock'
// timeline refs here, in useMasterTimeline and in DebugOverlay are typed
// against. This type-only import registers the full ambient declarations once
// for the whole program and is erased at build time, so CSSPlugin — the reason
// for importing the core build rather than the convenience bundle — still never
// reaches the entry chunk.
import type { SequenceState } from '../experiences/earth/config/sequenceState'
import type { ExperienceId } from './experience'
import { WARP_LIMITS, WARP_TRANSITION, flash } from '../utils/warpTransition'


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
  /**
   * The cut has happened: the scene has been swapped and the world under the
   * viewer's zoom no longer exists.
   *
   * Fired from inside the timeline rather than derived from `onSwap`, because
   * the two have to be the same frame. Everything discontinuous in this
   * transition happens under one fully black frame, and returning the zoom to
   * rest is now one of those things — do it a frame early and the departing
   * camera snaps in plain view, a frame late and the arriving world pulls back
   * out to a pose the previous world had chosen.
   */
  onCut?: () => void
  /**
   * The warp has been accepted and is on its way to `to` — after the
   * re-entrancy guard, so a refused call never reaches it. The music's
   * crossfade starts here, a beat ahead of the picture's cut.
   */
  onStart?: (to: ExperienceId) => void
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
export function useExperienceTransition({ state, onSwap, onSettled, onCut, onStart }: Params) {
  const [transitioning, setTransitioning] = useState(false)
  const clockRef = useRef<ReturnType<typeof createTransitionClock> | null>(null)
  const onSwapRef = useRef(onSwap)
  onSwapRef.current = onSwap
  // Through a ref for the same reason `onSwap` is: `transitionTo` is memoised on
  // `state` alone, so a caller passing a fresh closure every render must not be
  // able to rebuild it mid-warp.
  const onSettledRef = useRef(onSettled)
  onSettledRef.current = onSettled
  const onCutRef = useRef(onCut)
  onCutRef.current = onCut
  const onStartRef = useRef(onStart)
  onStartRef.current = onStart

  useEffect(() => {
    return () => {
      // Cancel rather than complete: a run stopped by unmount must not fire
      // `onCut` into a tree that is going away.
      clockRef.current?.cancel()
      clockRef.current = null
      // Leaving either part-way up would black out the page for good, or strand
      // a camera mid-dolly.
      state.transitionOverlay = 0
      state.transitionProgress = 0
      state.transitionCommitted = false
    }
  }, [state])

  // ── THE visibilitychange GUARD IS GONE, and this is where it was ──
  //
  // It paused a GSAP timeline while the tab was hidden. The hazard was real and
  // specific: `tl.call(onSwap)` at the midpoint IS the substitution — the hard
  // cut where the active scene, the active camera and input ownership all change
  // on one frame under full cover (DECISIONS §6) — and GSAP fast-forwards on
  // return from a hidden tab, so backgrounding mid-warp could carry the timeline
  // PAST that frame and land the viewer in a state the cut was supposed to hide.
  // iOS made it ordinary rather than exotic: switching apps mid-gesture is normal
  // phone behaviour, and the window is only 1.6 s wide but it is the 1.6 s in
  // which everything discontinuous happens.
  //
  // The clock cannot reproduce it. It advances only when `step(dt)` is called,
  // `step` is called from a `useFrame`, `requestAnimationFrame` does not run in a
  // hidden tab, and `clampFrameDelta` bounds the delta on the frame it resumes.
  // A tab hidden across the whole cinematic comes back on the frame it left.
  //
  // Deleted rather than kept as insurance: a guard against something structurally
  // impossible reads as a guard against something possible, and the next person
  // to touch this would have to work out which.

  const transitionTo = useCallback(
    (to: ExperienceId) => {
      // Re-entrancy guard. Without it a double click starts a second timeline
      // whose reveal races the first one's cover, and the overlay can settle
      // anywhere between 0 and 1.
      if (clockRef.current) return

      setTransitioning(true)
      // The cinematic takes the camera from here. Set BEFORE the first step so
      // no frame can see non-zero progress that nobody has claimed.
      state.transitionCommitted = true

      // From zero, and the whole cinematic plays.
      //
      // It used to start part-way in, at wherever a scrubbed gesture had already
      // pushed the warp. `adr/014` took the gesture back out of the warp: what a
      // viewer drives now is their own zoom, which each world composes UNDER
      // this progress rather than sharing it. So there is nothing already spent,
      // and the transition is the same length however it was triggered — a
      // property the scrub never had.
      //
      // Continuity is not lost by starting at zero, it is bought differently.
      // Both worlds re-base the warp on the zoomed pose: Earth's dolly is
      // relative to `camera.position` and Murcia's departure lerps from the
      // zoom-resolved pose, so amount 0 IS the pose the viewer was looking at.
      const clock = createTransitionClock({
        duration: () => WARP_TRANSITION.duration,
        cut: () => WARP_TRANSITION.cut,
        onCut: () => {
          // The cut, at full cover and at the closest point of the dolly.
          // Everything discontinuous happens on this one frame: the active
          // scene, the active camera, which experience owns input, and the
          // viewer's zoom all change together and none of it is visible.
          //
          // The zoom goes back to rest BEFORE the swap, so the world arriving is
          // already composing its pull-out against a resting pose rather than
          // against the departed world's zoom for one frame.
          onCutRef.current?.()
          onSwapRef.current(to)
        },
        onComplete: () => {
          // Pinned rather than left wherever the last frame landed: a rounding
          // shortfall would leave a residual dolly and a faint overlay for the
          // rest of the session. Same guard the intro's warp uses.
          state.transitionProgress = 0
          state.transitionOverlay = 0
          state.transitionCommitted = false
          clockRef.current = null
          setTransitioning(false)
          // AFTER the pins and after the ref is cleared, so anything this wakes
          // sees a settled world: no residual dolly, no overlay, and a
          // `transitionTo` that would be accepted rather than silently refused.
          onSettledRef.current?.()
        },
      })

      if (!clock.start()) return
      clockRef.current = clock
      onStartRef.current?.(to)
    },
    [state],
  )

  /**
   * Advances the cinematic by one frame.
   *
   * Called from a `useFrame` inside the Canvas rather than from an rAF of its
   * own, and the difference is one frame of staleness: `RenderPipeline` reads
   * `state.transitionProgress` in its own `useFrame`, so a separate loop that
   * happened to tick after R3F's would render every warp frame one behind the
   * progress that produced it.
   *
   * A no-op when nothing is running, which is nearly every frame.
   */
  const stepTransition = useCallback((dt: number) => {
    clockRef.current?.step(dt)
    const clock = clockRef.current
    if (!clock) return
    state.transitionProgress = clock.progress
    state.transitionOverlay = flash(clock.progress, WARP_LIMITS)
  }, [state])

  return { transitionTo, transitioning, stepTransition }
}
