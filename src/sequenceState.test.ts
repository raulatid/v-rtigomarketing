import { describe, it, expect } from 'vitest'
import { createSequenceState } from './sequenceState'

describe('createSequenceState', () => {
  it('starts at the first phase with everything at rest', () => {
    // This object is mutated in place at 60fps and never triggers a React
    // render, so a non-zero start would be invisible until it showed on screen.
    const state = createSequenceState()
    expect(state.phase).toBe('draw')
    expect(state.warpProgress).toBe(0)
    expect(state.warpOverlay).toBe(0)
    expect(state.swapOverlay).toBe(0)
    expect(state.transitionOverlay).toBe(0)
    expect(state.transitionProgress).toBe(0)
    expect(state.motionBlur).toBe(0)
    expect(state.orbitsStarted).toBe(false)
  })

  it('returns a fresh object each time', () => {
    // A shared object would carry a finished intro's state into the next one —
    // and in StrictMode the second mount would start mid-warp.
    const first = createSequenceState()
    const second = createSequenceState()
    expect(first).not.toBe(second)

    first.warpProgress = 0.5
    first.orbitsStarted = true
    expect(second.warpProgress).toBe(0)
    expect(second.orbitsStarted).toBe(false)
  })

  it('rests with no overlay contribution from any of the three sources', () => {
    // The applied overlay is max() of the three, so all three resting at 0 is
    // what makes the screen clear at the start.
    const state = createSequenceState()
    expect(Math.max(state.warpOverlay, state.swapOverlay, state.transitionOverlay)).toBe(0)
  })
})
