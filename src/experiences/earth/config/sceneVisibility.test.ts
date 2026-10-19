// @vitest-environment jsdom
//
// Not because sceneVisibility touches the DOM — it is pure. `defaultIntroConfig()`
// reads `window.__vertigoIntro` to pick up the values the boot chunk already
// resolved, so the config source needs a window even though the predicates do
// not. Opting in here rather than globally is the point of the per-file switch:
// it keeps that dependency visible instead of granting every test a window and
// letting one appear in the boot chunk unnoticed.
import { describe, it, expect } from 'vitest'
import { atOrAfter, hintAllowed, backdropVisible, earthVisible, orbitsVisible, starsVisible } from './sceneVisibility'
import { defaultIntroConfig, PHASE_ORDER, type Phase } from './introConfig'
import { createSequenceState, type SequenceState } from './sequenceState'

const config = defaultIntroConfig()

function stateAt(overrides: Partial<SequenceState> = {}): SequenceState {
  return { ...createSequenceState(), ...overrides }
}

// 201 samples across the warp, so the crossing is straddled rather than probed
// at the two values that happen to be interesting.
const SAMPLES = Array.from({ length: 201 }, (_, i) => i / 200)

describe('atOrAfter', () => {
  // The comment on atOrAfter records the regression it exists for: earthVisible
  // once listed its phases, and inserting 'orbits' silently broke the set. So
  // the property is derived FROM PHASE_ORDER rather than restated against a
  // hardcoded list — a test that listed phases would rot the same way the code
  // did, and would still pass while doing it.
  it.each(PHASE_ORDER)('is true from %s onward and false before it', (mark) => {
    const markIndex = PHASE_ORDER.indexOf(mark)
    for (const [index, phase] of PHASE_ORDER.entries()) {
      expect(atOrAfter(phase, mark)).toBe(index >= markIndex)
    }
  })

  it('holds when a phase is inserted', () => {
    // The regression in miniature: whatever sits immediately before 'swap' must
    // not be at-or-after it, whichever phase that turns out to be.
    const before = PHASE_ORDER[PHASE_ORDER.indexOf('swap') - 1]
    expect(atOrAfter(before, 'swap')).toBe(false)
    expect(atOrAfter('swap', 'swap')).toBe(true)
  })
})

describe('the Earth and the stars swap without a gap', () => {
  // The invariant worth protecting: across the cut there is never a frame with
  // both worlds drawn and never a frame with neither. Both would be visible on
  // screen — one as a double exposure, one as a black flash that is not the
  // deliberate one.
  it.each(SAMPLES)('shows exactly one of them at warpProgress %f', (warpProgress) => {
    const state = stateAt({ phase: 'warp', warpProgress })
    const earth = earthVisible(state, config)
    const stars = starsVisible(state, config)
    expect(earth).not.toBe(stars)
  })

  it('hands over exactly at sceneSwapProgress', () => {
    const swap = config.sceneSwapProgress
    expect(earthVisible(stateAt({ phase: 'warp', warpProgress: swap }), config)).toBe(true)
    expect(starsVisible(stateAt({ phase: 'warp', warpProgress: swap }), config)).toBe(false)
  })

  it('keeps the stars up for the whole shrink phase', () => {
    for (const warpProgress of SAMPLES) {
      expect(starsVisible(stateAt({ phase: 'shrink', warpProgress }), config)).toBe(true)
    }
  })
})

describe('backdropVisible', () => {
  // It must track earthVisible by DELEGATION. A copied condition would pass a
  // spot check and then drift the first time either predicate is retuned, so
  // this asserts agreement across every phase and both sides of the cut rather
  // than at one sampled state.
  it.each(PHASE_ORDER)('agrees with earthVisible during %s', (phase: Phase) => {
    for (const warpProgress of SAMPLES) {
      const state = stateAt({ phase, warpProgress })
      expect(backdropVisible(state, config)).toBe(earthVisible(state, config))
    }
  })
})

describe('orbitsVisible', () => {
  it('needs the timeline flag as well as the phase', () => {
    expect(orbitsVisible(stateAt({ phase: 'orbits', orbitsStarted: false }))).toBe(false)
    expect(orbitsVisible(stateAt({ phase: 'orbits', orbitsStarted: true }))).toBe(true)
  })

  it('needs the phase as well as the flag', () => {
    const before = PHASE_ORDER[PHASE_ORDER.indexOf('orbits') - 1]
    expect(orbitsVisible(stateAt({ phase: before, orbitsStarted: true }))).toBe(false)
  })

  it('stays up after the orbits phase', () => {
    expect(orbitsVisible(stateAt({ phase: 'site', orbitsStarted: true }))).toBe(true)
  })
})

describe('hint permission from application orchestration', () => {
  it('requires both a completed intro and current permission', () => {
    const state = stateAt({ phase: 'orbits' })
    expect(hintAllowed(state, true)).toBe(false)
    state.phase = 'site'
    expect(hintAllowed(state, true)).toBe(true)
    expect(hintAllowed(state, false)).toBe(false)
  })
})
