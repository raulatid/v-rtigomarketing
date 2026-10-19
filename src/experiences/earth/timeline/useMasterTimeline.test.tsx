// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useMasterTimeline } from './useMasterTimeline'
import { DEFAULT_APP_CONFIG, type IntroConfig, type Phase } from '../config/introConfig'
import { createSequenceState, type SequenceState } from '../config/sequenceState'
import { orbitRevealDuration } from '../orbit/orbitConfig'
import type { IntroDrawHandle } from '../../../intro-draw/introDraw'
import type { CornerLogoHandle } from '../../../corner-logo/cornerLogoConfig'
import { createOpening, next, type Presentation } from '../../../intro-draw/openingMachine'
import type { OpeningTail } from './openingTail'

// WHICH WAY IN the intro takes, and that the two ways land identically.
//
// Driven by seeking the tail by hand rather than stepping it frame by frame:
// what matters here is ORDER — which phases happen, and what is true on the tick
// the mark changes hands — and a seek forward passes through every cue between
// two times exactly as a played one does, without a test that depends on frames.

const motion = vi.hoisted(() => ({ reduced: false }))
vi.mock('../../../platform/motionPreference', () => ({
  prefersReducedMotion: () => motion.reduced,
}))
;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const SATELLITES = 6
const config = { ...DEFAULT_APP_CONFIG, introSize: 32 } as IntroConfig

let container: HTMLDivElement
let root: Root
let state: SequenceState
let log: string[]
let scales: number[]
let timeline: { current: OpeningTail | null }
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

function Probe({ returning, replayKey }: { returning: boolean; replayKey: number }) {
  const result = useMasterTimeline({
    intro: drawRef,
    config,
    state,
    cornerLogo: logoRef,
    replayKey,
    drawComplete: true,
    satelliteCount: SATELLITES,
    returning,
  })
  timeline = result.timeline
  return null
}

function mount(returning: boolean, replayKey = 0) {
  act(() => {
    root.render(<Probe returning={returning} replayKey={replayKey} />)
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

// ADR 016, migration step 1: the opening machine, driven from the timeline's own
// phase changes, lands where the timeline does on every way in. The timeline
// still owns time; the machine is told only that the current phase is over.
describe('agrees with the opening machine', () => {
  // Fails to compile if the machine's states and the app's phases ever differ.
  const toPresentation = (phase: Phase): Presentation => phase
  const toPhase = (presentation: Presentation): Phase => presentation

  /**
   * Every write the timeline makes to `state.phase`, checked as it happens. A
   * change the machine is not already in is offered as `elapsed` once, and
   * must then match: the machine may not lag, skip or invent a phase.
   */
  function shadow(options: { returning: boolean; reducedMotion: boolean; replay?: boolean }) {
    let machine = createOpening(options)
    if (options.replay) machine = next(machine, { type: 'replay' })
    // What the timeline is built on: readiness, then the drawing's fill.
    machine = next(machine, { type: 'readiness', readiness: 'ready' })
    machine = next(machine, { type: 'fill' })

    const disagreements: string[] = []
    const visited: Presentation[] = []
    let phase = state.phase
    Object.defineProperty(state, 'phase', {
      configurable: true,
      get: () => phase,
      set: (value: Phase) => {
        if (value !== phase) {
          if (machine.presentation !== toPresentation(value)) machine = next(machine, { type: 'elapsed' })
          if (machine.presentation !== value) disagreements.push(`timeline ${value}, machine ${machine.presentation}`)
          visited.push(toPresentation(value))
        }
        phase = value
      },
    })
    return { disagreements, visited, current: () => toPhase(machine.presentation) }
  }

  it.each([
    ['a first visit', false, false, false],
    ['a returning visitor', true, false, false],
    ['a returning visitor’s replay', true, false, true],
    ['reduced motion', false, true, false],
  ])('%s', (_, returning, reducedMotion, replay) => {
    motion.reduced = reducedMotion
    const machine = shadow({ returning, reducedMotion, replay })
    const tl = mount(returning, replay ? 1 : 0)
    walk(tl, tl.duration, [])
    expect(machine.disagreements).toEqual([])
    expect(machine.visited.at(-1)).toBe('site')
    expect(machine.current()).toBe('site')
  })
})
