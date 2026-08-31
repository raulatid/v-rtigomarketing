import { describe, it, expect } from 'vitest'
import {
  BACK_RECT,
  CONTROL_RECTS,
  DETAIL_RECT,
  DETAIL_VIEWPORT_RECT,
  DEFAULT_LOCALE,
  NEXT_RECT,
  PREVIOUS_RECT,
  controlAt,
  controlLabel,
  rectContains,
} from './displayConfig'
import type { DisplayRect } from './displayConfig'

// These rectangles are consumed twice — the fragment shader draws the controls
// from them and the raycast hit test reads them — so a mistake here is a control
// that is visible in one place and clickable in another. That is the failure the
// single ownership in this module exists to prevent, and these are the
// properties that keep it honest.

const centre = (rect: DisplayRect): [number, number] => [
  rect.x + rect.width / 2,
  rect.y + rect.height / 2,
]

const overlaps = (a: DisplayRect, b: DisplayRect): boolean =>
  a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height

const SUMMARY_RECTS: Array<[string, DisplayRect]> = [
  ['back', BACK_RECT],
  ['previous', PREVIOUS_RECT],
  ['detail', DETAIL_RECT],
  ['next', NEXT_RECT],
]

describe('display control geometry', () => {
  it('keeps every rect inside the readable core', () => {
    for (const [name, rect] of [...SUMMARY_RECTS, ['detail-viewport', DETAIL_VIEWPORT_RECT] as const]) {
      expect(rect.width, `${name} width`).toBeGreaterThan(0)
      expect(rect.height, `${name} height`).toBeGreaterThan(0)
      expect(rect.x, `${name} left`).toBeGreaterThanOrEqual(0)
      expect(rect.y, `${name} top`).toBeGreaterThanOrEqual(0)
      expect(rect.x + rect.width, `${name} right`).toBeLessThanOrEqual(1)
      expect(rect.y + rect.height, `${name} bottom`).toBeLessThanOrEqual(1)
    }
  })

  it('never overlaps two summary controls', () => {
    for (let i = 0; i < SUMMARY_RECTS.length; i += 1) {
      for (let j = i + 1; j < SUMMARY_RECTS.length; j += 1) {
        const [aName, a] = SUMMARY_RECTS[i]
        const [bName, b] = SUMMARY_RECTS[j]
        expect(overlaps(a, b), `${aName} overlaps ${bName}`).toBe(false)
      }
    }
  })

  // In detail mode BACK_RECT means "close". If the reading area reached it, the
  // scroll gesture and the close button would share pixels.
  it('keeps the detail reading area clear of the back control', () => {
    expect(overlaps(DETAIL_VIEWPORT_RECT, BACK_RECT)).toBe(false)
  })

  it('exposes the same rects through CONTROL_RECTS', () => {
    expect(CONTROL_RECTS.back).toBe(BACK_RECT)
    expect(CONTROL_RECTS.previous).toBe(PREVIOUS_RECT)
    expect(CONTROL_RECTS.next).toBe(NEXT_RECT)
    expect(CONTROL_RECTS.detail).toBe(DETAIL_RECT)
  })

  it('contains its own corners but not the point past them', () => {
    expect(rectContains(BACK_RECT, BACK_RECT.x, BACK_RECT.y)).toBe(true)
    expect(rectContains(BACK_RECT, BACK_RECT.x - 1e-6, BACK_RECT.y)).toBe(false)
  })
})

describe('controlAt', () => {
  it('resolves each summary control at its centre', () => {
    expect(controlAt(...centre(BACK_RECT), false)).toBe('back')
    expect(controlAt(...centre(PREVIOUS_RECT), false)).toBe('previous')
    expect(controlAt(...centre(NEXT_RECT), false)).toBe('next')
    expect(controlAt(...centre(DETAIL_RECT), false)).toBe('detail')
  })

  it('resolves nothing in the empty middle of the summary', () => {
    expect(controlAt(0.5, 0.5, false)).toBeNull()
  })

  // Plan 003 §11: pagination is not available while reading. If previous/next
  // still answered here, the reader could page away mid-paragraph.
  //
  // They do not resolve to null, though — the summary control bar sits inside
  // DETAIL_VIEWPORT_RECT, so while reading those pixels belong to the scroll.
  // That is the intended handover, and it is asserted rather than assumed
  // because the two rect sets were authored independently.
  it('withdraws pagination in detail mode', () => {
    expect(controlAt(...centre(PREVIOUS_RECT), true)).not.toBe('previous')
    expect(controlAt(...centre(NEXT_RECT), true)).not.toBe('next')
  })

  it('hands the summary control bar to the reading area while reading', () => {
    expect(controlAt(...centre(PREVIOUS_RECT), true)).toBe('detail-viewport')
    expect(controlAt(...centre(NEXT_RECT), true)).toBe('detail-viewport')
  })

  it('turns back into close in detail mode', () => {
    expect(controlAt(...centre(BACK_RECT), true)).toBe('close')
  })

  it('claims the reading area in detail mode only', () => {
    const point = centre(DETAIL_VIEWPORT_RECT)
    expect(controlAt(...point, true)).toBe('detail-viewport')
    expect(controlAt(...point, false)).toBeNull()
  })
})

describe('controlLabel', () => {
  it('localises the two labelled controls', () => {
    expect(controlLabel('es', 'detail')).toBe('saber más')
    expect(controlLabel('es', 'back')).toBe('volver')
    expect(controlLabel('en', 'detail')).toBe('learn more')
    expect(controlLabel('en', 'back')).toBe('back')
  })

  it('falls back to the default locale rather than rendering nothing', () => {
    expect(controlLabel('de', 'detail')).toBe(controlLabel(DEFAULT_LOCALE, 'detail'))
  })
})
