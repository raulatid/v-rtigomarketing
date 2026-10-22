// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { useMasterTimeline } from './useMasterTimeline'
import { DEFAULT_APP_CONFIG, type IntroConfig, type Phase } from '../config/introConfig'
import { createSequenceState, type SequenceState } from '../config/sequenceState'
import { orbitRevealDuration } from '../orbit/orbitConfig'
import type { IntroDrawHandle } from '../../../intro-draw/introDraw'
import type { CornerLogoHandle } from '../../../corner-logo/cornerLogoConfig'
import { createOpeningStore, type OpeningStore } from '../../../intro-draw/openingStore'
import type { Presentation } from '../../../intro-draw/openingMachine'
import type { OpeningTail } from './openingTail'

// WHICH WAY IN the intro takes, and that the two ways land identically.
//
// Driven by seeking the tail by hand rather than stepping it frame by frame:
// what matters here is ORDER — which phases happen, and what is true on the tick
// the mark changes hands — and a seek forward passes through every cue between
// two times exactly as a played one does, without a test that depends on frames.

/** The document's motion snapshot, as the boot entry hands it to the opening. */
const motion = { reduced: false }
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SATELLITES = 6
const config = { ...DEFAULT_APP_CONFIG, introSize: 32 } as IntroConfig

let container: HTMLDivElement
let root: Root
let state: SequenceState
let log: string[]
let scales: number[]
let timeline: { current: OpeningTail | null }
let opening: OpeningStore
/** The phase React last rendered. */
let reactPhase: Phase
/** Whether the 2D mark is on screen when the timeline is built. */
let markVisible: boolean

// Stable across renders, as the app's refs are: the hook rebuilds its timeline
// when one changes identity, and every phase change re-renders.
const drawRef = {
  current: {
    setScale: (scale: number) => scales.push(scale),
    setWarp: () => {},
    setVisible: (visible: boolean) => {
      markVisible = visible
      log.push(visible ? 'draw:shown' : 'draw:hidden')
    },
    isVisible: () => markVisible,
  } as unknown as IntroDrawHandle,
}
const logoRef: { current: CornerLogoHandle } = {
  current: {
    startSequence: () => log.push('logo:start'),
    isReady: () => true,
  },
}

function Probe({ opening, replayKey }: { opening: OpeningStore; replayKey: number }) {
  const result = useMasterTimeline({
    intro: drawRef,
    config,
    state,
    cornerLogo: logoRef,
    replayKey,
    drawComplete: true,
    satelliteCount: SATELLITES,
    opening,
  })
  timeline = result.timeline
  reactPhase = result.phase
  return null
}

/** The page's opening as the app adopts it: ready, filled, `replays` times replayed. */
function bootOpening(returning: boolean, replays: number): OpeningStore {
  const store = createOpeningStore({ returning, reducedMotion: motion.reduced })
  store.send({ type: 'readiness', readiness: 'ready' })
  store.send({ type: 'fill' })
  for (let i = 0; i < replays; i++) {
    store.send({ type: 'replay' })
    store.send({ type: 'fill' })
  }
  return store
}

function mount(returning: boolean, replayKey = 0) {
  opening = bootOpening(returning, replayKey)
  act(() => {
    root.render(<Probe opening={opening} replayKey={replayKey} />)
  })
  const tl = timeline.current!
  tl.pause()
  return tl
}

/** Walks the playhead to `seconds`, firing everything on the way, and records each phase once. */
function walk(tl: OpeningTail, seconds: number, phases: Phase[]) {
  const from = tl.time
  const steps = Math.max(1, Math.ceil((seconds - from) * 120))
  for (let i = 1; i <= steps; i++) {
    act(() => {
      tl.seek(from + ((seconds - from) * i) / steps)
    })
    if (phases[phases.length - 1] !== state.phase) phases.push(state.phase)
  }
}

beforeEach(() => {
  motion.reduced = false
  // A returning visitor's load normally ends with the mark never shown.
  markVisible = false
  state = createSequenceState()
  log = []
  scales = []
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const landing =
  config.spinPauseBefore +
  config.spinDuration +
  Math.max(config.toCornerDuration, orbitRevealDuration(SATELLITES))

describe('a first visit', () => {
  it('plays the whole tail, warp included', () => {
    markVisible = true
    const tl = mount(false)
    expect(log).toContain('draw:shown')
    const phases: Phase[] = []
    walk(tl, tl.duration, phases)
    expect(phases).toEqual(['shrink', 'warp', 'swap', 'corner', 'orbits', 'site'])
    expect(tl.duration).toBeCloseTo(
      config.shrinkDuration + config.warpDuration + config.swapDuration + landing,
      6,
    )
  })
})

describe('the clock', () => {
  it('advances only when stepped, and not while paused', () => {
    markVisible = true
    const tl = mount(false)
    act(() => tl.step(0.5))
    expect(tl.time).toBe(0)
    tl.play()
    act(() => tl.step(0.5))
    expect(tl.time).toBeCloseTo(0.5, 6)
    expect(state.phase).toBe('shrink')
  })

  it('reaches `site` frame by frame, and stops there', () => {
    markVisible = true
    const tl = mount(false)
    tl.play()
    for (let frame = 0; frame < 60 * 60 && state.phase !== 'site'; frame++) act(() => tl.step(1 / 60))
    expect(state.phase).toBe('site')
    expect(tl.time).toBe(tl.duration)
    act(() => tl.step(1))
    expect(tl.time).toBe(tl.duration)
  })

  it('starts again from the beginning on a seek back, with continuous state reset', () => {
    markVisible = true
    const tl = mount(false)
    walk(tl, tl.labels.orbits! + 0.1, [])
    expect(state.orbitsStarted).toBe(true)
    expect(state.warpProgress).toBe(1)
    scales.length = 0
    act(() => tl.seek('warp'))
    expect(state.phase).toBe('warp')
    expect(state.orbitsStarted).toBe(false)
    expect(state.warpProgress).toBe(0)
    expect(markVisible).toBe(true)
    // Reset to full size, then walked forward through the whole shrink.
    expect(scales[0]).toBe(1)
    expect(scales.at(-1)).toBeCloseTo(config.shrinkTargetSize / config.introSize, 6)
  })
})

describe('a returning visitor', () => {
  it('enters at the crossover: never a warp, and the same landing', () => {
    const tl = mount(true)
    const phases: Phase[] = []
    walk(tl, tl.duration, phases)
    // `shrink` is passed through on the same tick as `swap` when there is no 2D
    // mark to collapse, so no frame ever rests in it.
    expect(phases).toEqual(['swap', 'corner', 'orbits', 'site'])
    expect(state.warpProgress).toBe(0)
    expect(state.orbitsStarted).toBe(true)
  })

  it('opens on the 3D mark: no 2D mark was shown, so nothing collapses and nothing is shown', () => {
    const tl = mount(true)
    expect(log).not.toContain('draw:shown')
    expect(tl.labels.swap).toBe(tl.labels.shrink)
    const phases: Phase[] = []
    walk(tl, tl.labels.swap! + 1e-4, phases)
    expect(log).toContain('logo:start')
    expect(state.swapOverlay).toBeGreaterThan(0.99)
  })

  it('keeps the logo’s time, not the fade’s: the landing starts when the bloom ends', () => {
    // The logo spins and flies on its own clock from `startSequence()`. A
    // `corner` that waited for the longer fade would put `orbits` — and the
    // satellites — late against a logo already leaving centre.
    const tl = mount(true)
    const bloom = config.swapDuration * (1 - config.swapCrossover)
    expect(tl.labels.corner! - tl.labels.swap!).toBeCloseTo(bloom, 6)
    expect(tl.labels.site! - tl.labels.corner!).toBeCloseTo(landing, 6)
    expect(tl.duration).toBeCloseTo(bloom + landing, 6)
  })

  it('collapses the 2D mark through zero first, when a slow load had to show it', () => {
    markVisible = true
    const tl = mount(true)
    expect(tl.labels.swap! - tl.labels.shrink!).toBeCloseTo(config.returnCollapseDuration, 6)
    scales.length = 0
    walk(tl, tl.labels.swap! - 1e-4, [])
    expect(state.phase).toBe('shrink')
    expect(log).not.toContain('logo:start')
    expect(scales[0]).toBeGreaterThan(0.99)
    expect(scales[scales.length - 1]).toBeLessThan(0.01)
    for (let i = 1; i < scales.length; i++) expect(scales[i]).toBeLessThanOrEqual(scales[i - 1])
  })

  it('changes hands on one tick, under full cover', () => {
    const tl = mount(true)
    walk(tl, tl.labels.swap! - 1e-4, [])
    log.length = 0
    act(() => {
      tl.seek(tl.labels.swap! + 1e-4)
    })
    expect(log).toEqual(['draw:hidden', 'logo:start'])
    expect(state.phase).toBe('swap')
    // The planet appears on this frame, so this is the frame that must be black.
    expect(state.swapOverlay).toBeGreaterThan(0.99)
  })

  it('fades the planet up and ends fully clear', () => {
    const tl = mount(true)
    walk(tl, tl.labels.swap! + config.returnRevealDuration / 2, [])
    expect(state.swapOverlay).toBeGreaterThan(0)
    expect(state.swapOverlay).toBeLessThan(0.5)
    walk(tl, tl.labels.swap! + config.returnRevealDuration + 0.05, [])
    expect(state.swapOverlay).toBe(0)
  })

  it('clears the cover when the visitor skips out of the middle of the fade', () => {
    // Escape and a press seek to `site`. The cover is black at z-index 40: left
    // at whatever the fade had reached, it would dim the landed site for good.
    const tl = mount(true)
    walk(tl, tl.labels.swap! + 0.05, [])
    expect(state.swapOverlay).toBeGreaterThan(0.5)
    act(() => {
      tl.seek('site')
    })
    expect(state.phase).toBe('site')
    expect(state.swapOverlay).toBe(0)
  })

  it('is shorter than the tail it replaces by the shrink and the warp', () => {
    const returning = mount(true).duration
    act(() => root.unmount())
    root = createRoot(container)
    const first = mount(false).duration
    expect(first - returning).toBeGreaterThan(config.warpDuration)
  })

  it('still gets the whole tail on a replay, so every phase stays reachable from /debug', () => {
    const tl = mount(true, 1)
    expect(tl.labels.warp).toBeDefined()
  })

  it('gives way to reduced motion, which has no tail at all — and never flashes the mark', () => {
    motion.reduced = true
    const tl = mount(true)
    expect(log).not.toContain('draw:shown')
    const phases: Phase[] = []
    walk(tl, tl.duration, phases)
    expect(phases).toEqual(['site'])
    expect(tl.labels.swap).toBeUndefined()
  })
})

// ADR 016: the phase has one source, the page's opening. The tail walks it,
// never a copy of its own, and `state.phase` and React's phase only follow it.
describe('the page’s one opening', () => {
  // Fails to compile if the machine's states and the app's phases ever differ.
  const toPresentation = (phase: Phase): Presentation => phase

  /** Every write to `state.phase`, checked against the opening as it happens. */
  function watch() {
    const disagreements: string[] = []
    const visited: Presentation[] = []
    let phase = state.phase
    Object.defineProperty(state, 'phase', {
      configurable: true,
      get: () => phase,
      set: (value: Phase) => {
        if (value !== phase) {
          const presentation = opening.current().presentation
          if (presentation !== value) disagreements.push(`state ${value}, opening ${presentation}`)
          visited.push(toPresentation(value))
        }
        phase = value
      },
    })
    return { disagreements, visited }
  }

  it.each([
    ['a first visit', false, false, false],
    ['a returning visitor', true, false, false],
    ['a returning visitor’s replay', true, false, true],
    ['reduced motion', false, true, false],
  ])('is walked to rest on %s, with both phases following it', (_, returning, reducedMotion, replay) => {
    motion.reduced = reducedMotion
    const watched = watch()
    const tl = mount(returning, replay ? 1 : 0)
    walk(tl, tl.duration, [])
    expect(watched.disagreements).toEqual([])
    expect(watched.visited.at(-1)).toBe('site')
    expect(opening.current().presentation).toBe('site')
    expect(reactPhase).toBe('site')
  })

  it('is rewound by a seek back, and walked forward again', () => {
    markVisible = true
    const tl = mount(false)
    walk(tl, tl.labels.orbits! + 0.1, [])
    expect(opening.current().presentation).toBe('orbits')
    act(() => tl.seek('warp'))
    expect(opening.current().presentation).toBe('warp')
    expect(state.phase).toBe('warp')
    expect(reactPhase).toBe('warp')
  })

  it('takes both phases back to draw on a replay, and builds no tail until the fill', () => {
    const tl = mount(false)
    walk(tl, tl.duration, [])
    act(() => opening.send({ type: 'replay' }))
    act(() => {
      root.render(<Probe opening={opening} replayKey={1} />)
    })
    expect(state.phase).toBe('draw')
    expect(reactPhase).toBe('draw')
    expect(timeline.current).toBeNull()

    act(() => opening.send({ type: 'fill' }))
    expect(state.phase).toBe('shrink')
    expect(reactPhase).toBe('shrink')
  })
})
