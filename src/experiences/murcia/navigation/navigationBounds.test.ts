import { describe, it, expect } from 'vitest'
import {
  clampToRect,
  collapseIfInverted,
  containsPoint,
  expandRect,
  intersectRect,
  isInverted,
  resistToRect,
} from './navigationBounds'
import type { BoundsRect } from '../config/environmentConfig'

const RECT: BoundsRect = { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }

describe('collapseIfInverted', () => {
  // An inverted rectangle makes every clamp comparison meaningless, which
  // effectively removes the limits — the one outcome the bounds exist to
  // prevent. Collapsing pins the focus instead: restrictive, never unsafe.
  it('leaves a valid rectangle untouched', () => {
    expect(collapseIfInverted(RECT)).toEqual(RECT)
  })

  it('collapses the x axis to its midpoint when only x inverts', () => {
    const collapsed = collapseIfInverted({ minX: 10, maxX: -10, minZ: -20, maxZ: 20 })
    expect(collapsed.minX).toBe(0)
    expect(collapsed.maxX).toBe(0)
    expect(collapsed.minZ).toBe(-20)
    expect(collapsed.maxZ).toBe(20)
    expect(isInverted(collapsed)).toBe(false)
  })

  it('collapses the z axis alone the same way', () => {
    const collapsed = collapseIfInverted({ minX: -10, maxX: 10, minZ: 30, maxZ: 10 })
    expect(collapsed.minZ).toBe(20)
    expect(collapsed.maxZ).toBe(20)
    expect(collapsed.minX).toBe(-10)
    expect(isInverted(collapsed)).toBe(false)
  })

  it('collapses both axes when both invert', () => {
    const collapsed = collapseIfInverted({ minX: 6, maxX: 2, minZ: 10, maxZ: 0 })
    expect(collapsed).toEqual({ minX: 4, maxX: 4, minZ: 5, maxZ: 5 })
    expect(isInverted(collapsed)).toBe(false)
  })

  it('does not mutate its input', () => {
    const input: BoundsRect = { minX: 10, maxX: -10, minZ: 0, maxZ: 1 }
    const snapshot = { ...input }
    collapseIfInverted(input)
    expect(input).toEqual(snapshot)
  })
})

describe('clampToRect', () => {
  it('leaves an interior point alone and reports it unclamped', () => {
    const result = clampToRect(3, -4, RECT)
    expect(result).toEqual({ x: 3, z: -4, clamped: false })
  })

  it('reports clamping when either axis is corrected', () => {
    expect(clampToRect(50, 0, RECT)).toEqual({ x: 10, z: 0, clamped: true })
    expect(clampToRect(0, -50, RECT)).toEqual({ x: 0, z: -20, clamped: true })
  })

  it('treats the edges as inside', () => {
    // The focus is driven right up to the boundary in normal use, so an edge
    // reported as clamped would zero the drag velocity every time the viewer
    // reached the far side of the plate.
    expect(clampToRect(10, 20, RECT).clamped).toBe(false)
    expect(clampToRect(-10, -20, RECT).clamped).toBe(false)
  })

  it('pins to the single point of a collapsed rect', () => {
    const collapsed = collapseIfInverted({ minX: 6, maxX: 2, minZ: 10, maxZ: 0 })
    const result = clampToRect(100, -100, collapsed)
    expect(result.x).toBe(4)
    expect(result.z).toBe(5)
    expect(result.clamped).toBe(true)
  })
})

describe('expandRect', () => {
  it('grows outward on all four sides', () => {
    expect(expandRect(RECT, 5)).toEqual({ minX: -15, maxX: 15, minZ: -25, maxZ: 25 })
  })

  it('shrinks with a negative amount, which is how boundsInset is applied', () => {
    // murciaConfig ships boundsInset 0 and the harness passes -boundsInset, so
    // the inset path is exercised here rather than only at its no-op value.
    expect(expandRect(RECT, -2)).toEqual({ minX: -8, maxX: 8, minZ: -18, maxZ: 18 })
  })

  it('can over-shrink into an inverted rect, which is exactly why collapse exists', () => {
    const over = expandRect(RECT, -50)
    expect(isInverted(over)).toBe(true)
    expect(isInverted(collapseIfInverted(over))).toBe(false)
  })
})

describe('intersectRect', () => {
  it('keeps the overlap of two rects', () => {
    const other: BoundsRect = { minX: 0, maxX: 30, minZ: -5, maxZ: 5 }
    expect(intersectRect(RECT, other)).toEqual({ minX: 0, maxX: 10, minZ: -5, maxZ: 5 })
  })

  it('produces an inverted rect when they do not overlap', () => {
    const disjoint: BoundsRect = { minX: 100, maxX: 200, minZ: 100, maxZ: 200 }
    expect(isInverted(intersectRect(RECT, disjoint))).toBe(true)
  })
})

describe('containsPoint', () => {
  it('includes the boundary', () => {
    expect(containsPoint(10, 20, RECT)).toBe(true)
    expect(containsPoint(-10, -20, RECT)).toBe(true)
  })

  it('excludes anything outside', () => {
    expect(containsPoint(10.001, 0, RECT)).toBe(false)
    expect(containsPoint(0, -20.001, RECT)).toBe(false)
  })
})

describe('resistToRect', () => {
  // The firm rect is where panning is 1:1; the band between it and the limit is
  // where the gain falls to zero. DECISIONS §40.
  const FIRM: BoundsRect = { minX: -10, maxX: 10, minZ: -20, maxZ: 20 }
  const LIMIT: BoundsRect = { minX: -14, maxX: 18, minZ: -25, maxZ: 32 }

  const pushX = (from: number, travel: number): number =>
    resistToRect(from, 0, from + travel, 0, FIRM, LIMIT).x

  it('is 1:1 while the proposal stays inside the firm rect', () => {
    expect(pushX(0, 5)).toBeCloseTo(5, 12)
    expect(pushX(-8, 3)).toBeCloseTo(-5, 12)
    // Landing exactly on the firm edge still costs nothing.
    expect(pushX(0, 10)).toBeCloseTo(10, 12)
  })

  it('approaches the limit without reaching it, for any gesture a hand can make', () => {
    // The guarantee is a property of the arithmetic rather than of an epsilon.
    // 20 band widths is ~2800px of unbroken drag at translationGain 0.4.
    const band = LIMIT.maxX - FIRM.maxX
    for (const travel of [band, band * 5, band * 20]) {
      const x = pushX(FIRM.maxX, travel)
      expect(x).toBeLessThan(LIMIT.maxX)
      expect(x).toBeGreaterThan(FIRM.maxX)
    }
  })

  it('rests exactly on the limit rather than past it once the ramp underflows', () => {
    // Past ~35 band widths of accumulated travel the exponential is zero in
    // float64 and the focus settles on the limit itself. That is the safe bound
    // — it already carries edgeSafetyMargin — and the gain has been nil for a
    // long time by then. What must never happen is a result beyond it.
    for (const travel of [1e6, Number.MAX_SAFE_INTEGER, Infinity]) {
      const x = pushX(0, travel)
      expect(x).toBeLessThanOrEqual(LIMIT.maxX)
      expect(Number.isNaN(x)).toBe(false)
    }
  })

  it('reaches the same place whether the travel arrives in one event or many', () => {
    // pointermove delivery rate must not change where the city ends up, which a
    // naive per-event `delta * gain(overshoot)` would not give.
    const once = pushX(0, 30)

    let stepped = 0
    for (let i = 0; i < 300; i += 1) stepped = pushX(stepped, 0.1)

    expect(stepped).toBeCloseTo(once, 9)
  })

  it('has unit gain at the firm edge, so the band does not announce itself with a step', () => {
    const justInside = pushX(9.999, 0.0005) - 9.999
    const justOutside = pushX(10.001, 0.0005) - 10.001
    expect(justInside).toBeCloseTo(0.0005, 9)
    expect(justOutside / justInside).toBeGreaterThan(0.999)
  })

  it('splits travel that crosses the firm edge, spending only the remainder on the band', () => {
    // 8 units to the edge at 1:1, then 30 through the ramp — identical to
    // starting at the edge with 30.
    expect(pushX(2, 38)).toBeCloseTo(pushX(10, 30), 9)
  })

  it('leaves a band at 1:1, because there is no snap-back to make the trip home cheap', () => {
    const deep = pushX(0, 40)
    expect(deep).toBeGreaterThan(FIRM.maxX)
    expect(pushX(deep, -(deep - 3))).toBeCloseTo(3, 9)
  })

  it('resists each of the four edges by its own band width', () => {
    // Sized against the narrowest band (minX, 4 units) so every edge is pushed
    // well into its ramp but none of them into the float64 underflow.
    const far = 30
    expect(resistToRect(0, 0, far, 0, FIRM, LIMIT).x).toBeLessThan(LIMIT.maxX)
    expect(resistToRect(0, 0, -far, 0, FIRM, LIMIT).x).toBeGreaterThan(LIMIT.minX)
    expect(resistToRect(0, 0, 0, far, FIRM, LIMIT).z).toBeLessThan(LIMIT.maxZ)
    expect(resistToRect(0, 0, 0, -far, FIRM, LIMIT).z).toBeGreaterThan(LIMIT.minZ)
  })

  it('resists both axes at once on a diagonal push into a corner', () => {
    const r = resistToRect(0, 0, 60, 60, FIRM, LIMIT)
    expect(r.x).toBeGreaterThan(FIRM.maxX)
    expect(r.x).toBeLessThan(LIMIT.maxX)
    expect(r.z).toBeGreaterThan(FIRM.maxZ)
    expect(r.z).toBeLessThan(LIMIT.maxZ)
  })

  it('falls back to a hard clamp on an edge with no band', () => {
    // The footprint term can bind both rects to the same value; that edge is a
    // wall again, which is correct and must not divide by zero.
    const noBand: BoundsRect = { ...LIMIT, maxX: FIRM.maxX }
    expect(resistToRect(0, 0, 1e4, 0, FIRM, noBand).x).toBe(FIRM.maxX)
    expect(Number.isFinite(resistToRect(0, 0, 1e4, 0, FIRM, noBand).x)).toBe(true)
  })

  it('reports whether the proposal was resisted, the way clampToRect reports clamping', () => {
    expect(resistToRect(0, 0, 5, 5, FIRM, LIMIT).clamped).toBe(false)
    expect(resistToRect(0, 0, 50, 0, FIRM, LIMIT).clamped).toBe(true)
  })

  it('pins to a collapsed rect without producing NaN', () => {
    const collapsed = collapseIfInverted({ minX: 6, maxX: 2, minZ: 10, maxZ: 0 })
    const r = resistToRect(4, 5, 100, -100, collapsed, collapsed)
    expect(r.x).toBe(4)
    expect(r.z).toBe(5)
  })

  it('treats a limit inside the firm rect as no band rather than as negative resistance', () => {
    const inverted: BoundsRect = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 }
    const r = resistToRect(0, 0, 1e4, 1e4, FIRM, inverted)
    expect(r.x).toBe(inverted.maxX)
    expect(r.z).toBe(inverted.maxZ)
  })
})
