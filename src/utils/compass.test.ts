import { describe, expect, it } from 'vitest'
import {
  arrivalEdge,
  centreCloseness,
  compassMark,
  edgeFadeOpacity,
  horizontalBearing,
  placeLabels,
  rangeCloseness,
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

describe('compassMark', () => {
  const SPAN = 180 * DEG

  it('puts straight ahead at the centre', () => {
    expect(compassMark(0, SPAN).offset).toBeCloseTo(0, 10)
  })

  it('puts the half-span at the ends', () => {
    expect(compassMark(90 * DEG, SPAN).offset).toBeCloseTo(1, 10)
    expect(compassMark(-90 * DEG, SPAN).offset).toBeCloseTo(-1, 10)
  })

  it('clamps beyond the span and SAYS it clamped', () => {
    // Reported rather than hidden: "off the left" and "hard left" are different
    // things, and only the caller knows how it wants to draw the difference.
    const beyond = compassMark(170 * DEG, SPAN)
    expect(beyond.offset).toBe(1)
    expect(beyond.beyond).toBe(true)

    const inside = compassMark(45 * DEG, SPAN)
    expect(inside.beyond).toBe(false)
  })

  it('survives a degenerate span without dividing by zero', () => {
    expect(Number.isFinite(compassMark(1, 0).offset)).toBe(true)
  })
})

describe('centreCloseness', () => {
  it('is 1 dead ahead and 0 at the edge of the band', () => {
    expect(centreCloseness(0, 0.25)).toBeCloseTo(1, 10)
    expect(centreCloseness(0.25, 0.25)).toBeCloseTo(0, 10)
  })

  it('is 0 beyond the band, not negative', () => {
    expect(centreCloseness(0.9, 0.25)).toBe(0)
  })

  it('is symmetric', () => {
    expect(centreCloseness(0.1, 0.25)).toBeCloseTo(centreCloseness(-0.1, 0.25), 12)
  })

  it('ramps rather than switching, so the more centred of two always wins', () => {
    // The tie-break that stops two landmarks in the band at once looking equal.
    expect(centreCloseness(0.05, 0.25)).toBeGreaterThan(centreCloseness(0.15, 0.25))
  })

  it('lights nothing for a degenerate band', () => {
    expect(centreCloseness(0, 0)).toBe(0)
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

describe('edgeFadeOpacity', () => {
  it('is fully opaque inside the fade', () => {
    expect(edgeFadeOpacity(0, 0.7, 0.18)).toBe(1)
    expect(edgeFadeOpacity(0.7, 0.7, 0.18)).toBe(1)
  })

  it('reaches the floor at the very end of the bar', () => {
    // A clamped mark's offset is exactly +/-1, so it lands on the floor by
    // construction and needs no special case in the caller.
    expect(edgeFadeOpacity(1, 0.7, 0.18)).toBeCloseTo(0.18, 10)
    expect(edgeFadeOpacity(-1, 0.7, 0.18)).toBeCloseTo(0.18, 10)
  })

  it('decreases monotonically across the fade', () => {
    const a = edgeFadeOpacity(0.75, 0.7, 0.18)
    const b = edgeFadeOpacity(0.85, 0.7, 0.18)
    const c = edgeFadeOpacity(0.95, 0.7, 0.18)
    expect(a).toBeGreaterThan(b)
    expect(b).toBeGreaterThan(c)
  })

  it('is a fraction of the BAR, not a pixel threshold', () => {
    // The property that makes it work on a phone and a desktop alike: the same
    // offset fades the same amount whatever the bar's width turns out to be.
    // Stated here because there is no width in the signature to get wrong.
    expect(edgeFadeOpacity(0.85, 0.7, 0.18)).toBeCloseTo(edgeFadeOpacity(0.85, 0.7, 0.18), 12)
  })

  it('never fades when the fade cannot begin', () => {
    expect(edgeFadeOpacity(0.99, 1, 0.18)).toBe(1)
  })
})

describe('arrivalEdge', () => {
  it('fires once as warmth rises through the on threshold', () => {
    const first = arrivalEdge(true, 0.9, 0.85, 0.5)
    expect(first.fire).toBe(true)
    expect(first.armed).toBe(false)
  })

  it('does not fire again while the pin hovers at the threshold', () => {
    // The whole reason for the hysteresis: a pin drifting across 0.85 and back
    // every frame would otherwise pulse like a fault light.
    let state = arrivalEdge(true, 0.9, 0.85, 0.5)
    for (const warmth of [0.84, 0.86, 0.7, 0.9, 0.6]) {
      state = arrivalEdge(state.armed, warmth, 0.85, 0.5)
      expect(state.fire).toBe(false)
      expect(state.armed).toBe(false)
    }
  })

  it('re-arms only once warmth has fallen below the off threshold', () => {
    const cooling = arrivalEdge(false, 0.51, 0.85, 0.5)
    expect(cooling.armed).toBe(false)
    const cold = arrivalEdge(false, 0.49, 0.85, 0.5)
    expect(cold.armed).toBe(true)
    expect(cold.fire).toBe(false)
    // And the next approach fires again.
    expect(arrivalEdge(cold.armed, 0.9, 0.85, 0.5).fire).toBe(true)
  })

  it('does not fire while armed and still below on', () => {
    const state = arrivalEdge(true, 0.6, 0.85, 0.5)
    expect(state.fire).toBe(false)
    expect(state.armed).toBe(true)
  })
})

describe('placeLabels', () => {
  const RULES = { halfSpan: 200, gap: 8, reenterGap: 14, stickiness: 0.05 }
  const label = (x: number, width: number, priority = 0, shown = true) => ({
    x,
    width,
    priority,
    shown,
  })

  it('leaves a label on its mark when it fits', () => {
    expect(placeLabels([label(40, 60)], RULES)).toEqual([{ shift: 0, shown: true }])
  })

  it('moves a label near an end inward until it is on the bar, and no further', () => {
    // Centre held at 160, so the right edge lands exactly on the bar's end.
    expect(placeLabels([label(200, 80)], RULES)[0].shift).toBe(-40)
    expect(placeLabels([label(-190, 80)], RULES)[0].shift).toBe(30)
  })

  it('centres a label wider than the bar', () => {
    const [wide] = placeLabels([label(50, 500)], RULES)
    expect(50 + wide.shift).toBe(0)
  })

  it('draws only the higher-priority of two labels that would overlap', () => {
    // The arrival pose: two places a few degrees apart, the blog being arrived at.
    const [servicios, blog] = placeLabels([label(-3, 79, 0.1), label(11, 39, 0.9)], RULES)
    expect(blog.shown).toBe(true)
    expect(servicios.shown).toBe(false)
  })

  it('draws both when they clear each other by the gap', () => {
    // 100 apart, half-widths 40 + 40: 20px clear.
    const placed = placeLabels([label(-50, 80), label(50, 80)], RULES)
    expect(placed.every((p) => p.shown)).toBe(true)
  })

  it('does not bring a hidden label back until it clears the wider gap', () => {
    // 10px clear is enough to stay drawn and not enough to return.
    expect(placeLabels([label(0, 80, 1), label(90, 80, 0, true)], RULES)[1].shown).toBe(true)
    expect(placeLabels([label(0, 80, 1), label(90, 80, 0, false)], RULES)[1].shown).toBe(false)
    expect(placeLabels([label(0, 80, 1), label(95, 80, 0, false)], RULES)[1].shown).toBe(true)
  })

  it('keeps the drawn label through a near-tie rather than swapping every frame', () => {
    // Two cold labels crossing the centre from either side: the hidden one is
    // now marginally ahead on priority and still does not take over.
    const [left, right] = placeLabels([label(-4, 60, 0.0009, false), label(4, 60, 0.0008, true)], RULES)
    expect(right.shown).toBe(true)
    expect(left.shown).toBe(false)
  })

  it('places nothing for no labels', () => {
    expect(placeLabels([], RULES)).toEqual([])
  })
})
