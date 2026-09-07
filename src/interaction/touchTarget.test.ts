import { describe, expect, it } from 'vitest'
import {
  MIN_TOUCH_TARGET_CSS_PX,
  boxContains,
  expandToMinimum,
  resolveTouchTarget,
} from './touchTarget'
import type { ScreenBox, TouchCandidate } from './touchTarget'

const box = (left: number, top: number, width: number, height: number): ScreenBox => ({
  left,
  top,
  right: left + width,
  bottom: top + height,
})

const candidate = <T>(id: T, visible: ScreenBox): TouchCandidate<T> => ({
  id,
  visible,
  hit: expandToMinimum(visible),
})

describe('expandToMinimum', () => {
  it('grows a small box symmetrically to the floor', () => {
    const grown = expandToMinimum(box(100, 100, 20, 16))
    expect(grown.right - grown.left).toBe(MIN_TOUCH_TARGET_CSS_PX)
    expect(grown.bottom - grown.top).toBe(MIN_TOUCH_TARGET_CSS_PX)
    // Same centre as the drawn box.
    expect((grown.left + grown.right) / 2).toBe(110)
    expect((grown.top + grown.bottom) / 2).toBe(108)
  })

  it('leaves a box already at or above the floor alone', () => {
    const big = box(0, 0, 60, 50)
    expect(expandToMinimum(big)).toEqual(big)
  })

  it('grows each axis independently', () => {
    const grown = expandToMinimum(box(0, 0, 80, 10))
    expect(grown.right - grown.left).toBe(80)
    expect(grown.bottom - grown.top).toBe(MIN_TOUCH_TARGET_CSS_PX)
  })

  it('writes into the box it is given', () => {
    const out = box(0, 0, 0, 0)
    expect(expandToMinimum(box(10, 10, 4, 4), 44, out)).toBe(out)
  })
})

describe('resolveTouchTarget', () => {
  // Two 20px glyphs, centres 30px apart: their grown boxes overlap by 14px.
  const left = candidate('left', box(100, 100, 20, 20))
  const right = candidate('right', box(130, 100, 20, 20))
  const pair = [left, right]

  it('returns null outside every grown box', () => {
    expect(resolveTouchTarget(50, 50, pair)).toBeNull()
  })

  it('returns the control whose grown box contains the point when only one does', () => {
    // 10px left of the left glyph: inside its grown box, outside the right's.
    expect(resolveTouchTarget(92, 110, pair)).toBe('left')
  })

  it('gives the drawn glyph precedence over a neighbour that has grown over it', () => {
    // On the right glyph's drawn pixels, which the left's grown box also covers.
    expect(boxContains(left.hit, 131, 110)).toBe(true)
    expect(resolveTouchTarget(131, 110, pair)).toBe('right')
  })

  it('resolves an overlap to the nearest drawn centre', () => {
    // Between the two, 12px from the left centre and 18px from the right.
    expect(resolveTouchTarget(122, 110, pair)).toBe('left')
    expect(resolveTouchTarget(128, 110, pair)).toBe('right')
  })

  it('breaks an exact tie by array order', () => {
    // Centres at 110 and 140: 125 is equidistant.
    expect(resolveTouchTarget(125, 110, pair)).toBe('left')
    expect(resolveTouchTarget(125, 110, [right, left])).toBe('right')
  })
})
