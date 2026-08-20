import { describe, it, expect } from 'vitest'
import {
  normalizeWheelDelta,
  MAX_WHEEL_DELTA_PX,
  WHEEL_LINE_HEIGHT_PX,
  WHEEL_PAGE_HEIGHT_PX,
} from './wheelDelta'

// These two properties were found by `checks/navigation-feel.ts` §11, "Wheel zoom
// plumbing", which retired with the zoom band it drove (`adr/009`). Neither was
// ever about zoom — both are about wheel events being incomparable across
// browsers and devices — so they moved here rather than dying with their section.
//
// Constants are read from the module, never restated. A mirrored literal is how
// a test starts passing against a number the product no longer uses.

describe('normalizeWheelDelta', () => {
  it('passes pixel-mode deltas straight through', () => {
    expect(normalizeWheelDelta({ deltaY: 40, deltaMode: 0 })).toBe(40)
    expect(normalizeWheelDelta({ deltaY: -40, deltaMode: 0 })).toBe(-40)
  })

  it('counts a line as about 16 pixels, not as 1', () => {
    // Chrome reports pixels and Firefox reports lines. Without this the feature
    // is 16x faster in one browser than the other, and nobody testing in a
    // single browser can see it.
    const lines = normalizeWheelDelta({ deltaY: 5, deltaMode: 1 })
    const pixels = normalizeWheelDelta({ deltaY: 5, deltaMode: 0 })
    expect(lines).toBe(5 * WHEEL_LINE_HEIGHT_PX)
    expect(lines).toBeGreaterThan(pixels * 10)
  })

  it('counts a page as a much larger unit again', () => {
    expect(normalizeWheelDelta({ deltaY: 1, deltaMode: 2 })).toBe(WHEEL_PAGE_HEIGHT_PX)
  })

  it('caps one absurd event rather than letting a flick carry it', () => {
    // The head of a macOS momentum flick can carry hundreds of pixels in a single
    // event. Uncapped, one flick is a whole gesture and deliberateness is gone.
    expect(normalizeWheelDelta({ deltaY: 100000, deltaMode: 0 })).toBe(MAX_WHEEL_DELTA_PX)
    expect(normalizeWheelDelta({ deltaY: -100000, deltaMode: 0 })).toBe(-MAX_WHEEL_DELTA_PX)
  })

  it('caps line and page modes too, after scaling and not before', () => {
    // 20 lines is 320px pre-clamp. Clamping the raw deltaY first would let a
    // line-mode device through at 20x the intended ceiling.
    expect(normalizeWheelDelta({ deltaY: 20, deltaMode: 1 })).toBe(MAX_WHEEL_DELTA_PX)
    expect(normalizeWheelDelta({ deltaY: 3, deltaMode: 2 })).toBe(MAX_WHEEL_DELTA_PX)
  })

  it('preserves sign, because direction is the caller’s whole input', () => {
    expect(Math.sign(normalizeWheelDelta({ deltaY: 7, deltaMode: 1 }))).toBe(1)
    expect(Math.sign(normalizeWheelDelta({ deltaY: -7, deltaMode: 1 }))).toBe(-1)
  })

  it('treats a non-finite delta as no movement', () => {
    // A NaN reaching the accumulator poisons the travel total permanently — every
    // later comparison is false and the gesture can never commit or decay.
    expect(normalizeWheelDelta({ deltaY: NaN, deltaMode: 0 })).toBe(0)
    // Infinity is rejected rather than clamped, deliberately. A clamp would treat
    // a broken event as the largest legitimate gesture, which is the one reading
    // that could navigate off a fault.
    expect(normalizeWheelDelta({ deltaY: Infinity, deltaMode: 0 })).toBe(0)
    expect(normalizeWheelDelta({ deltaY: -Infinity, deltaMode: 0 })).toBe(0)
  })

  it('treats an unknown deltaMode as pixels rather than guessing', () => {
    expect(normalizeWheelDelta({ deltaY: 30, deltaMode: 99 })).toBe(30)
  })
})
