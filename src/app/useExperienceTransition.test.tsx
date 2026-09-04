// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import gsap from 'gsap/gsap-core'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExperienceTransition } from './useExperienceTransition'
import { WARP_TRANSITION } from './warpTransition'
import { createSequenceState, type SequenceState } from '../experiences/earth/config/sequenceState'
import type { ExperienceId } from './experience'

// What happens on the one frame nobody can see.
//
// These are the assertions that cannot be made against the pure curves, and
// they are exactly the ones a browser cannot make either: a screenshot taken
// around the commit races the frame it is trying to observe. What matters here
// is ORDERING, so it is asserted where ordering is deterministic.
//
// The file used to be about the scrub hand-off — whether the cinematic picked
// the camera up exactly where an abandoned-or-committed gesture had left it.
// `adr/014` removed the scrub: a viewer drives their own zoom now, and the
// cinematic always plays from 0. What replaced that concern is the CUT, where
// the zoom is returned to rest under full cover, and the failure this file
// exists to catch moved with it: a zoom reset that lands a frame off the swap
// is a visible snap in one world or the other.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Harness {
  transitionTo: (to: ExperienceId) => void
}

let container: HTMLDivElement
let root: Root
let state: SequenceState
let api: Harness
/** Swaps and cuts in one list, because their ORDER is the thing under test. */
let events: string[]
let settled: number

function Probe({ onReady }: { onReady: (h: Harness) => void }) {
  const { transitionTo } = useExperienceTransition({
    state,
    onSwap: (to) => events.push(`swap:${to}`),
    onCut: () => events.push('cut'),
    onSettled: () => {
      settled += 1
    },
  })
  onReady({ transitionTo })
  return null
}

/** The live timeline, straight off GSAP's global — the hook never returns it. */
function liveTimeline(): gsap.core.Timeline | undefined {
  return gsap.globalTimeline
    .getChildren(false, false, true)
    .find((child): child is gsap.core.Timeline => child instanceof gsap.core.Timeline)
}

/** Runs the timeline forward WITHOUT suppressing its callbacks. */
function seekTo(seconds: number) {
  act(() => {
    liveTimeline()?.seek(seconds, false)
  })
}

beforeEach(() => {
  state = createSequenceState()
  events = []
  settled = 0
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => {
    root.render(<Probe onReady={(h) => (api = h)} />)
  })
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  gsap.globalTimeline.getChildren(false, false, true).forEach((child) => child.kill())
  vi.restoreAllMocks()
})

describe('the commit', () => {
  it('plays the whole cinematic, however the viewer triggered it', () => {
    // The scrub made this length variable — it started wherever the gesture had
    // pushed the warp to. A commit is now always the same transition, whether it
    // came from a wheel held against the zoom limit or from the keyboard.
    act(() => api.transitionTo('murcia'))
    expect(liveTimeline()?.duration()).toBeCloseTo(WARP_TRANSITION.duration, 6)
  })

  it('starts at rest, with nothing already spent', () => {
    act(() => api.transitionTo('murcia'))
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
  })

  it('refuses a second transition while one is running', () => {
    act(() => api.transitionTo('murcia'))
    const first = liveTimeline()
    act(() => api.transitionTo('earth'))
    expect(liveTimeline()).toBe(first)
  })
})

describe('the cut', () => {
  const cutAt = WARP_TRANSITION.duration * WARP_TRANSITION.cut

  it('returns the zoom to rest BEFORE the scene swaps', () => {
    // THE ordering assertion. Both happen under the same fully black frame, but
    // not in the same instant: the arriving world reads the zoom on its first
    // active frame, so a reset that landed after the swap would leave it
    // composing its pull-out against the departed world's zoom.
    act(() => api.transitionTo('murcia'))
    seekTo(cutAt)
    expect(events).toEqual(['cut', 'swap:murcia'])
  })

  it('happens once, not on every frame around it', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(cutAt)
    seekTo(cutAt + 0.1)
    seekTo(WARP_TRANSITION.duration)
    expect(events.filter((e) => e === 'cut')).toHaveLength(1)
  })

  it('lands under full cover', () => {
    // The reset is only invisible because the screen is black. If the flash bell
    // ever drifted off the swap this would be a snap in plain view.
    act(() => api.transitionTo('murcia'))
    seekTo(cutAt)
    expect(state.transitionOverlay).toBeGreaterThan(0.99)
  })

  it('does not fire when the transition never gets that far', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(cutAt * 0.5)
    expect(events).toEqual([])
  })
})

describe('transitionCommitted', () => {
  // Camera OWNERSHIP, which is a different question from "is the warp at rest".
  // While it is true the experiences stand their own rigs down and let the
  // cinematic drive; while it is false the viewer's zoom and orbit own the
  // camera. There is no longer any state in between, which is what the scrub
  // was and what made this field ambiguous.
  it('is claimed before the cinematic writes its first frame', () => {
    // Set inside transitionTo rather than on the timeline's first update, so no
    // frame can observe non-zero progress that nobody has claimed.
    act(() => api.transitionTo('murcia'))
    expect(state.transitionCommitted).toBe(true)
  })

  it('is false until something commits', () => {
    expect(state.transitionCommitted).toBe(false)
  })

  it('is released on unmount, alongside the pins it sits with', () => {
    act(() => api.transitionTo('murcia'))
    expect(state.transitionCommitted).toBe(true)
    act(() => root.unmount())
    expect(state.transitionCommitted).toBe(false)
    root = createRoot(document.createElement('div'))
  })
})

describe('settling', () => {
  it('reports once, after the pins', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(WARP_TRANSITION.duration)
    expect(settled).toBe(1)
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    expect(state.transitionCommitted).toBe(false)
  })
})

describe('teardown', () => {
  it('leaves no residual dolly or overlay behind on unmount', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(WARP_TRANSITION.duration * 0.25)
    expect(state.transitionProgress).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    // Re-rendered by afterEach's unmount otherwise; make it idempotent.
    root = createRoot(document.createElement('div'))
  })
})
