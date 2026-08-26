// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import gsap from 'gsap'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExperienceTransition } from './useExperienceTransition'
import { SCRUB_CEILING, WARP_TRANSITION, scrubProgress } from './warpTransition'
import { createSequenceState, type SequenceState } from '../experiences/earth/config/sequenceState'
import type { ExperienceId } from './experience'

// The hand-off between a driven gesture and the committed cinematic.
//
// These are the assertions that cannot be made against the pure curves, and
// they are exactly the ones a browser cannot make either: a screenshot taken
// around the commit races the frame it is trying to observe (measured — the
// screenshot itself takes long enough for the gesture to start decaying). What
// matters here is ORDERING, so it is asserted where ordering is deterministic.
//
// The failure they exist to catch is a single frame at rest between the scrub
// and the warp: the viewer pulls the world 30% of the way in, commits, and the
// camera snaps back before the cinematic picks it up.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

interface Harness {
  scrub: (g: number) => void
  transitionTo: (to: ExperienceId) => void
}

let container: HTMLDivElement
let root: Root
let state: SequenceState
let api: Harness
let swaps: ExperienceId[]
let settled: number

function Probe({ onReady }: { onReady: (h: Harness) => void }) {
  const { transitionTo, scrub } = useExperienceTransition({
    state,
    onSwap: (to) => swaps.push(to),
    onSettled: () => {
      settled += 1
    },
  })
  onReady({ transitionTo, scrub })
  return null
}

/** The live timeline, straight off GSAP's global — the hook never returns it. */
function liveTimeline(): gsap.core.Timeline | undefined {
  return gsap.globalTimeline
    .getChildren(false, false, true)
    .find((child): child is gsap.core.Timeline => child instanceof gsap.core.Timeline)
}

beforeEach(() => {
  state = createSequenceState()
  swaps = []
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

describe('scrub', () => {
  it('drives the warp through the scrub band and never lights the flash', () => {
    for (const g of [0, 0.25, 0.5, 0.75, 1]) {
      act(() => api.scrub(g))
      expect(state.transitionProgress).toBe(scrubProgress(g))
      expect(state.transitionOverlay).toBe(0)
    }
    expect(state.transitionProgress).toBe(SCRUB_CEILING)
  })

  it('returns the world to rest when the gesture is abandoned', () => {
    act(() => api.scrub(0.8))
    expect(state.transitionProgress).toBeGreaterThan(0)
    act(() => api.scrub(0))
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
  })
})

describe('the commit hand-off', () => {
  it('does not pass through rest between the gesture and the cinematic', () => {
    // The whole point. A full gesture, then the commit — and the very next
    // reading of the value the cameras use must still be where the gesture left
    // it, not 0.
    act(() => api.scrub(1))
    const handedOver = state.transitionProgress
    expect(handedOver).toBe(SCRUB_CEILING)

    act(() => api.transitionTo('murcia'))
    expect(state.transitionProgress).toBe(handedOver)
    expect(state.transitionOverlay).toBe(0)
  })

  it('shortens the departure by exactly the distance already travelled', () => {
    // The rate must not change — the ease is linear and all the shaping lives in
    // warpTransition's curves, so the remaining warp has to play the REMAINDER
    // of the same motion, not a compressed copy of the whole thing.
    act(() => api.scrub(1))
    act(() => api.transitionTo('murcia'))

    const { duration, cut } = WARP_TRANSITION
    const expected = duration * (cut - SCRUB_CEILING) + duration * (1 - cut)
    expect(liveTimeline()?.duration()).toBeCloseTo(expected, 6)
    // And it is genuinely shorter than an uncommitted warp would have been.
    expect(expected).toBeLessThan(duration)
  })

  it('runs the full length when nothing was scrubbed', () => {
    act(() => api.transitionTo('murcia'))
    expect(liveTimeline()?.duration()).toBeCloseTo(WARP_TRANSITION.duration, 6)
  })

  it('ignores the gesture once the cinematic owns the warp', () => {
    // The input layer keeps reporting after a commit — its accumulator is reset,
    // so it reports 0. Honouring that would blank the camera under the warp.
    act(() => api.scrub(1))
    act(() => api.transitionTo('murcia'))
    const owned = state.transitionProgress

    act(() => api.scrub(0))
    expect(state.transitionProgress).toBe(owned)
    act(() => api.scrub(0.5))
    expect(state.transitionProgress).toBe(owned)
  })

  it('refuses a second transition while one is running', () => {
    act(() => api.transitionTo('murcia'))
    const first = liveTimeline()
    act(() => api.transitionTo('earth'))
    expect(liveTimeline()).toBe(first)
  })
})

describe('transitionCommitted', () => {
  // Camera OWNERSHIP, which is a different question from "is the warp at rest".
  // They were the same field until a scrubbed gesture started moving progress
  // too — at which point Earth's orbit rig stood down for the whole decay tail
  // of every abandoned gesture, and the globe went dead for ~1.6s after a notch.
  it('stays false while a gesture scrubs, however far it goes', () => {
    for (const g of [0.1, 0.5, 1]) {
      act(() => api.scrub(g))
      expect(state.transitionProgress).toBeGreaterThan(0)
      expect(state.transitionCommitted).toBe(false)
    }
  })

  it('is claimed before the cinematic writes its first frame', () => {
    // Set inside transitionTo rather than on the timeline's first update, so no
    // frame can observe non-zero progress that nobody has claimed.
    act(() => api.scrub(1))
    act(() => api.transitionTo('murcia'))
    expect(state.transitionCommitted).toBe(true)
  })

  it('is released on unmount, alongside the pins it sits with', () => {
    act(() => api.transitionTo('murcia'))
    expect(state.transitionCommitted).toBe(true)
    act(() => root.unmount())
    expect(state.transitionCommitted).toBe(false)
    root = createRoot(document.createElement('div'))
  })
})

describe('teardown', () => {
  it('leaves no residual dolly or overlay behind on unmount', () => {
    act(() => api.scrub(1))
    expect(state.transitionProgress).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    // Re-rendered by afterEach's unmount otherwise; make it idempotent.
    root = createRoot(document.createElement('div'))
  })
})
