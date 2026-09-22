import { describe, expect, it } from 'vitest'
import {
  horizontalBearing,
  labelSide,
  proximityPulse,
  rangeCloseness,
  ringSlot,
  screenBearing,
  spreadBearings,
  stackLabels,
} from './compass'

// A compass is all sign conventions, and every one of them is invisible until a
// marker slides the wrong way and nobody can say by how much. These are the
// sandbox's `probeCompass` assertions, which were the only evidence this maths
// had.

const DEG = Math.PI / 180

describe('horizontalBearing', () => {
  // Worked out in the module header rather than guessed: camera at the origin
  // looking down -Z, so forward is (0, -1) in (x, z).
  const FORWARD_X = 0
  const FORWARD_Z = -1

  it('is zero straight ahead', () => {
    expect(horizontalBearing(FORWARD_X, FORWARD_Z, 0, -1)).toBeCloseTo(0, 10)
  })

  it('is POSITIVE to the right', () => {
    // The whole sign convention, in one assertion. A target on screen-right is
    // at +X, and it must land on the right half of the bar.
    expect(horizontalBearing(FORWARD_X, FORWARD_Z, 1, 0)).toBeCloseTo(Math.PI / 2, 10)
  })

  it('is negative to the left', () => {
    expect(horizontalBearing(FORWARD_X, FORWARD_Z, -1, 0)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('reaches the far edge directly behind, from either side', () => {
    expect(Math.abs(horizontalBearing(FORWARD_X, FORWARD_Z, 0, 1))).toBeCloseTo(Math.PI, 10)
  })

  it('does not care about magnitude, only direction', () => {
    const near = horizontalBearing(FORWARD_X, FORWARD_Z, 3, -4)
    const far = horizontalBearing(FORWARD_X, FORWARD_Z, 300, -400)
    expect(near).toBeCloseTo(far, 12)
  })

  it('answers 0 for a degenerate vector rather than NaN', () => {
    // A target the camera is standing exactly on has no bearing, and 0 puts its
    // mark at the centre — the least surprising place for something you are
    // inside of. NaN would propagate into a transform and lose the mark.
    expect(horizontalBearing(0, 0, 1, 1)).toBe(0)
    expect(horizontalBearing(FORWARD_X, FORWARD_Z, 0, 0)).toBe(0)
  })
})


describe('rangeCloseness', () => {
  it('is 1 at or inside near, and 0 at or beyond far', () => {
    expect(rangeCloseness(90, 90, 260)).toBeCloseTo(1, 10)
    expect(rangeCloseness(10, 90, 260)).toBe(1)
    expect(rangeCloseness(260, 90, 260)).toBeCloseTo(0, 10)
    expect(rangeCloseness(1000, 90, 260)).toBe(0)
  })

  it('decreases with distance', () => {
    expect(rangeCloseness(120, 90, 260)).toBeGreaterThan(rangeCloseness(200, 90, 260))
  })

  it('lights nothing for an unset range rather than everything', () => {
    expect(rangeCloseness(50, 100, 100)).toBe(0)
    expect(rangeCloseness(50, 260, 90)).toBe(0)
  })
})

describe('ringSlot', () => {
  const R = 33

  it('puts a bearing of zero straight UP, so ahead is the top of the ring', () => {
    const slot = ringSlot(0, R)
    expect(slot.x).toBeCloseTo(0, 10)
    expect(slot.y).toBeCloseTo(-R, 10)
    expect(slot.angleDeg).toBeCloseTo(0, 10)
  })

  it('puts a positive bearing on the RIGHT, matching horizontalBearing', () => {
    const slot = ringSlot(Math.PI / 2, R)
    expect(slot.x).toBeCloseTo(R, 10)
    expect(slot.y).toBeCloseTo(0, 10)
    expect(slot.angleDeg).toBeCloseTo(90, 10)
  })

  it('puts a negative bearing on the left', () => {
    const slot = ringSlot(-Math.PI / 2, R)
    expect(slot.x).toBeCloseTo(-R, 10)
    expect(slot.angleDeg).toBeCloseTo(-90, 10)
  })

  it('puts a target directly behind at the bottom', () => {
    const slot = ringSlot(Math.PI, R)
    expect(slot.x).toBeCloseTo(0, 10)
    expect(slot.y).toBeCloseTo(R, 10)
  })
})

describe('labelSide', () => {
  it('reads to the right of a mark on the right half, and to the left of one on the left', () => {
    expect(labelSide(0.2)).toBe('right')
    expect(labelSide(-0.2)).toBe('left')
  })

  it('treats dead ahead as the right, so a label there has one home rather than two', () => {
    expect(labelSide(0)).toBe('right')
  })
})

describe('spreadBearings', () => {
  const MIN = 12 * DEG

  function circularDistance(a: number, b: number): number {
    const d = Math.abs(a - b) % (2 * Math.PI)
    return Math.min(d, 2 * Math.PI - d)
  }

  it('leaves bearings already apart exactly where they are', () => {
    expect(spreadBearings([0.5, -1.2], MIN)).toEqual([0.5, -1.2])
  })

  it('pushes a close pair apart symmetrically to the minimum, keeping their order', () => {
    const [a, b] = spreadBearings([0.02, 0.09], MIN)
    expect(b - a).toBeCloseTo(MIN, 10)
    expect((a + b) / 2).toBeCloseTo(0.055, 10)
    expect(a).toBeLessThan(b)
  })

  it('spreads a pair that straddles the seam at +/-PI without unwrapping either', () => {
    const [a, b] = spreadBearings([3.1, -3.1], MIN)
    expect(circularDistance(a, b)).toBeCloseTo(MIN, 10)
    expect(a).toBeLessThanOrEqual(Math.PI)
    expect(b).toBeGreaterThanOrEqual(-Math.PI)
    // Still one on each side of the seam, nearer it than before.
    expect(a).toBeGreaterThan(0)
    expect(b).toBeLessThan(0)
  })

  it('handles one bearing and none', () => {
    expect(spreadBearings([1], MIN)).toEqual([1])
    expect(spreadBearings([], MIN)).toEqual([])
  })
})

describe('stackLabels', () => {
  it('leaves labels on opposite sides alone however close their heights', () => {
    const offsets = stackLabels(
      [
        { side: 'left', y: -10 },
        { side: 'right', y: -9 },
      ],
      15,
    )
    expect(offsets).toEqual([0, 0])
  })

  it('pushes two labels on the same side apart to the gap, symmetrically', () => {
    const offsets = stackLabels(
      [
        { side: 'right', y: -10 },
        { side: 'right', y: -8 },
      ],
      15,
    )
    expect(offsets[0]).toBeCloseTo(-6.5, 10)
    expect(offsets[1]).toBeCloseTo(6.5, 10)
  })

  it('does not touch same-side labels that already clear the gap', () => {
    expect(
      stackLabels(
        [
          { side: 'left', y: 0 },
          { side: 'left', y: 40 },
        ],
        15,
      ),
    ).toEqual([0, 0])
  })
})

describe('proximityPulse', () => {
  it('peaks at 1 a quarter of the way through and bottoms at the floor three quarters through', () => {
    expect(proximityPulse(0.4, 1.6, 0.35)).toBeCloseTo(1, 10)
    expect(proximityPulse(1.2, 1.6, 0.35)).toBeCloseTo(0.35, 10)
  })

  it('never goes fully dark', () => {
    for (let t = 0; t < 5; t += 0.05) {
      const v = proximityPulse(t, 1.6, 0.35)
      expect(v).toBeGreaterThanOrEqual(0.35 - 1e-12)
      expect(v).toBeLessThanOrEqual(1 + 1e-12)
    }
  })
})

describe('screenBearing', () => {
  // The screen's y grows downward, and the ring draws bearing 0 straight up,
  // so a target ABOVE the ring on screen must read as 0 and one to the RIGHT
  // as +PI/2 — `ringSlot`'s own convention, so the two compose without a flip.
  it('is zero for a point straight up the screen', () => {
    expect(screenBearing(0, -100)).toBeCloseTo(0, 10)
  })

  it('is positive to the right, negative to the left', () => {
    expect(screenBearing(100, 0)).toBeCloseTo(Math.PI / 2, 10)
    expect(screenBearing(-100, 0)).toBeCloseTo(-Math.PI / 2, 10)
  })

  it('reaches the far edge for a point straight down', () => {
    expect(Math.abs(screenBearing(0, 100))).toBeCloseTo(Math.PI, 10)
  })

  it('composes with ringSlot: a point up-right lands up-right', () => {
    const slot = ringSlot(screenBearing(60, -80), 10)
    expect(slot.x).toBeGreaterThan(0)
    expect(slot.y).toBeLessThan(0)
  })
})
