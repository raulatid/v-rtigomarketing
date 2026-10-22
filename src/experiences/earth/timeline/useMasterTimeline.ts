import { RefObject, useCallback, useLayoutEffect, useRef, useState } from 'react'
import { IntroConfig, Phase } from '../config/introConfig'
import { SequenceState } from '../config/sequenceState'
import { IntroDrawHandle } from '../../../intro-draw/introDraw'
import type { OpeningStore } from '../../../intro-draw/openingStore'
import { createOpeningTail, type OpeningTail } from './openingTail'

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
   * The page's one opening (`loading/opening`). Its way in says which tail to build: a returning
   * visitor (DECISIONS §51) enters at the crossover instead of playing shrink
   * and warp, until a replay, which takes the whole tail so `/debug` can still
   * reach every phase.
   */
  opening: OpeningStore | null
}

// The clock for P1-P5. P0 is NOT on it: the drawing runs on load progress in
// intro-draw, and hands over here when its fill completes (plan 006 §4.1). The
// invariant is "the single clock owns everything from `shrink` onward" — now
// `openingTail`, stepped from the frame loop, where it used to be a GSAP
// timeline with a ticker of its own (ADR 016, migration step 4).
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
  opening,
}: Params) {
  const [phase, setPhase] = useState<Phase>('draw')
  const tailRef = useRef<OpeningTail | null>(null)

  // The phase has one source, the opening. `state.phase` is its mirror for the
  // frame loop, written on the same change as React's copy, so a replay that
  // takes the opening back to `draw` takes both with it.
  useLayoutEffect(() => {
    if (!opening) return
    const follow = () => {
      const presentation: Phase = opening.current().presentation
      state.phase = presentation
      setPhase(presentation)
    }
    follow()
    return opening.subscribe(follow)
  }, [opening, state])

  useLayoutEffect(() => {
    const draw = intro.current
    if (!draw || !opening || !drawComplete) return
    // A replay has put the opening back in `draw` while `drawComplete` is still
    // the last drawing's. The fill moves it on, and this runs again then.
    if (opening.current().presentation === 'draw') return

    // Built playing, and from `shrink` — P0 already played, in intro-draw.
    tailRef.current = createOpeningTail({
      config,
      state,
      draw,
      cornerLogo,
      satelliteCount,
      opening,
    })

    return () => {
      tailRef.current = null
    }
  }, [intro, config, state, cornerLogo, replayKey, drawComplete, satelliteCount, opening])

  /**
   * Advances the tail by one frame. Called from a `useFrame` inside the Canvas,
   * for the reason `stepTransition` is: the camera and the render pipeline read
   * `warpProgress` and `swapOverlay` in their own `useFrame`, and a separate loop
   * that ticked after R3F's would render every frame one behind.
   */
  const step = useCallback((dt: number) => tailRef.current?.step(dt), [])

  return { phase, timeline: tailRef, step }
}
