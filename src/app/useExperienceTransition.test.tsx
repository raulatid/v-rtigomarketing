// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useExperienceTransition } from './useExperienceTransition'
import { WARP_TRANSITION } from '../utils/warpTransition'
import { createNavigationState } from './navigation/continuousState'
import type { NavigationSignals } from '../interaction/navigationSignals'
import type { ExperienceId } from './experience'

// Hoisted so a test can flip it BEFORE the hook samples it on mount; the real
// module caches its first answer for the session, which is right for the app and
// would make the reduced-motion path unreachable here.
const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../platform/motionPreference', () => ({
  prefersReducedMotion: () => motion.reduced,
}))

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
  stepTransition: (dt: number) => void
}

let container: HTMLDivElement
let root: Root
let state: NavigationSignals
let api: Harness
/** Swaps and cuts in one list, because their ORDER is the thing under test. */
let events: string[]
let settled: number

function Probe({ onReady }: { onReady: (h: Harness) => void }) {
  const { transitionTo, stepTransition } = useExperienceTransition({
    state,
    onSwap: (to) => events.push(`swap:${to}`),
    onCut: () => events.push('cut'),
    onSettled: () => {
      settled += 1
    },
  })
  onReady({ transitionTo, stepTransition })
  return null
}

/**
 * Advances the cinematic to `seconds`, one 60 Hz frame at a time.
 *
 * The clock is a `dt` integrator, so this drives it exactly as the frame loop
 * does — no seeking, no library, and no global to reach into. That makes these
 * assertions deterministic in a way the timeline's could not be: a seek jumped
 * straight to a time, while this passes through every intermediate frame, which
 * is where a cut that fires twice or a pin that lands a frame late would show.
 *
 * Absolute rather than relative, so a test can say "the cut" and mean it.
 *
 * Steps in WHOLE frames and lands at or just past `seconds` rather than exactly
 * on it. That is not laziness: a real frame loop cannot land exactly on a
 * duration either, and an earlier version of this helper that clamped its last
 * step to hit the mark exactly made every completion assertion fail — the
 * clock's own float sum came out a few ulps short of the duration, so progress
 * peaked at 0.9999999999 and `onComplete` never ran. A clock that only settles
 * on an exact float sum is a clock that never settles in production.
 */
const FRAME = 1 / 60
let elapsed = 0

function seekTo(seconds: number) {
  act(() => {
    while (elapsed < seconds) {
      elapsed += FRAME
      api.stepTransition(FRAME)
    }
  })
}

beforeEach(() => {
  state = createNavigationState()
  events = []
  settled = 0
  elapsed = 0
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
  vi.restoreAllMocks()
})

// Everything below the next two blocks drives the cinematic toward EARTH, and
// that is deliberate: it is the direction with nothing in front of the cinematic,
// so "the commit" and "the cut" keep meaning the cinematic's own first frame and
// midpoint. Toward Murcia the same cinematic follows Earth's swing.
describe('the swing above the destination', () => {
  const AIM = WARP_TRANSITION.earthDepartureAimSeconds

  it('runs first toward Murcia, and the cinematic has not claimed the camera yet', () => {
    // Earth's own rig turns the camera during the swing, so ownership must NOT
    // change hands: a rig that stood down here would freeze mid-orbit.
    act(() => api.transitionTo('murcia'))
    expect(state.departureAim).toBe(0)
    expect(state.transitionCommitted).toBe(false)
    seekTo(AIM * 0.5)
    expect(state.departureAim).toBeGreaterThan(0.4)
    expect(state.departureAim).toBeLessThan(0.6)
    expect(state.transitionCommitted).toBe(false)
    expect(state.transitionProgress).toBe(0)
  })

  it('rests at exactly 1 for a frame before handing over', () => {
    // The rig places the orbit from this number. If the last value it saw were
    // one frame short of 1, the dolly would capture "almost above Spain".
    act(() => api.transitionTo('murcia'))
    const seen: Array<number | null> = []
    act(() => {
      for (let i = 0; i < Math.ceil(AIM / FRAME) + 4; i++) {
        api.stepTransition(FRAME)
        seen.push(state.departureAim)
      }
    })
    const landed = seen.indexOf(1)
    expect(landed).toBeGreaterThan(-1)
    expect(seen[landed + 1]).toBeNull()
    expect(state.transitionCommitted).toBe(true)
  })

  it('is followed by the whole cinematic, unshortened', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(AIM + WARP_TRANSITION.duration - FRAME * 2)
    expect(state.transitionCommitted).toBe(true)
    seekTo(AIM + WARP_TRANSITION.duration + FRAME * 2)
    expect(state.transitionCommitted).toBe(false)
    expect(events).toEqual(['cut', 'swap:murcia'])
    expect(settled).toBe(1)
  })

  it('counts as a transition in flight, so a second one is refused during it', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(AIM * 0.5)
    act(() => api.transitionTo('earth'))
    seekTo(AIM + WARP_TRANSITION.duration + FRAME * 2)
    expect(events).toEqual(['cut', 'swap:murcia'])
  })

  it('does not happen toward Earth', () => {
    act(() => api.transitionTo('earth'))
    expect(state.departureAim).toBeNull()
    expect(state.transitionCommitted).toBe(true)
  })

  it('is cleared on unmount', () => {
    act(() => api.transitionTo('murcia'))
    seekTo(AIM * 0.5)
    act(() => root.unmount())
    expect(state.departureAim).toBeNull()
    root = createRoot(document.createElement('div'))
  })
})

describe('the swing under reduced motion', () => {
  it('is skipped: there is no dolly to aim, and a swinging globe is the motion refused', () => {
    motion.reduced = true
    act(() => root.unmount())
    root = createRoot(container)
    act(() => {
      root.render(<Probe onReady={(h) => (api = h)} />)
    })
    act(() => api.transitionTo('murcia'))
    expect(state.departureAim).toBeNull()
    expect(state.transitionCommitted).toBe(true)
    motion.reduced = false
  })
})

describe('the commit', () => {
  it('plays the whole cinematic, however the viewer triggered it', () => {
    // The scrub made this length variable — it started wherever the gesture had
    // pushed the warp to. A commit is now always the same transition, whether it
    // came from a wheel held against the zoom limit or from the keyboard.
    //
    // Asserted by RUNNING it rather than by reading a duration off a timeline
    // object: one frame short of the duration it is still going, and at the
    // duration it has settled.
    act(() => api.transitionTo('earth'))
    seekTo(WARP_TRANSITION.duration - FRAME * 2)
    expect(state.transitionCommitted).toBe(true)
    seekTo(WARP_TRANSITION.duration)
    expect(state.transitionCommitted).toBe(false)
  })

  it('starts at rest, with nothing already spent', () => {
    act(() => api.transitionTo('earth'))
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
  })

  it('refuses a second transition while one is running', () => {
    // The re-entrancy guard. Without it a double click starts a second run whose
    // reveal races the first one's cover, and the overlay settles anywhere.
    act(() => api.transitionTo('earth'))
    act(() => api.transitionTo('murcia'))
    seekTo(WARP_TRANSITION.duration)
    // One journey, and it went where the first caller asked.
    expect(events).toEqual(['cut', 'swap:earth'])
    expect(settled).toBe(1)
  })
})

describe('the cut', () => {
  const cutAt = WARP_TRANSITION.duration * WARP_TRANSITION.cut

  it('returns the zoom to rest BEFORE the scene swaps', () => {
    // THE ordering assertion. Both happen under the same fully black frame, but
    // not in the same instant: the arriving world reads the zoom on its first
    // active frame, so a reset that landed after the swap would leave it
    // composing its pull-out against the departed world's zoom.
    act(() => api.transitionTo('earth'))
    seekTo(cutAt)
    expect(events).toEqual(['cut', 'swap:earth'])
  })

  it('happens once, not on every frame around it', () => {
    act(() => api.transitionTo('earth'))
    seekTo(cutAt)
    seekTo(cutAt + 0.1)
    seekTo(WARP_TRANSITION.duration)
    expect(events.filter((e) => e === 'cut')).toHaveLength(1)
  })

  it('lands under full cover', () => {
    // The reset is only invisible because the screen is black. If the flash bell
    // ever drifted off the swap this would be a snap in plain view.
    act(() => api.transitionTo('earth'))
    seekTo(cutAt)
    expect(state.transitionOverlay).toBeGreaterThan(0.99)
  })

  it('does not fire when the transition never gets that far', () => {
    act(() => api.transitionTo('earth'))
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
    act(() => api.transitionTo('earth'))
    expect(state.transitionCommitted).toBe(true)
  })

  it('is false until something commits', () => {
    expect(state.transitionCommitted).toBe(false)
  })

  it('is released on unmount, alongside the pins it sits with', () => {
    act(() => api.transitionTo('earth'))
    expect(state.transitionCommitted).toBe(true)
    act(() => root.unmount())
    expect(state.transitionCommitted).toBe(false)
    root = createRoot(document.createElement('div'))
  })
})

describe('settling', () => {
  it('reports once, after the pins', () => {
    act(() => api.transitionTo('earth'))
    seekTo(WARP_TRANSITION.duration)
    expect(settled).toBe(1)
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    expect(state.transitionCommitted).toBe(false)
  })
})

describe('teardown', () => {
  it('leaves no residual dolly or overlay behind on unmount', () => {
    act(() => api.transitionTo('earth'))
    seekTo(WARP_TRANSITION.duration * 0.25)
    expect(state.transitionProgress).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(state.transitionProgress).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    // Re-rendered by afterEach's unmount otherwise; make it idempotent.
    root = createRoot(document.createElement('div'))
  })
})

describe('navigation ownership', () => {
  it('keeps the injected channel live and preserves zoom on an interrupted transition', () => {
    const observed = state
    state.zoomDepth = 0.6
    state.approach = 0.4
    act(() => api.transitionTo('earth'))
    seekTo(WARP_TRANSITION.duration * 0.25)
    expect(observed.transitionProgress).toBeGreaterThan(0)
    act(() => root.unmount())
    expect(observed.transitionProgress).toBe(0)
    expect(observed.transitionOverlay).toBe(0)
    expect(observed.transitionCommitted).toBe(false)
    expect(observed.zoomDepth).toBe(0.6)
    expect(observed.approach).toBe(0.4)
    root = createRoot(document.createElement('div'))
  })
})
