import { describe, it, expect } from 'vitest'
import {
  clampToRect,
  collapseIfInverted,
  containsPoint,
  expandRect,
  intersectRect,
  isInverted,
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
