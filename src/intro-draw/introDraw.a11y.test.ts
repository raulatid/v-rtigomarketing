// @vitest-environment jsdom
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import { createIntroDraw, type IntroDrawHandle } from './introDraw'

// What a screen reader can reach during the intro. aria-hidden on an ancestor
// cannot be undone below it, so the caption must have none above it.

let handle: IntroDrawHandle

beforeAll(() => {
  // jsdom implements no SVG path geometry; the drawing only needs numbers back.
  Object.assign(window.SVGElement.prototype, {
    getTotalLength: () => 100,
    getPointAtLength: (d: number) => ({ x: d, y: d }),
  })
})

beforeEach(() => {
  vi.stubGlobal('requestAnimationFrame', () => 0)
  vi.stubGlobal('cancelAnimationFrame', () => {})
  handle = createIntroDraw({
    getProgress: () => 0,
    getReadiness: () => 'loading',
    onComplete: () => {},
  })
})

afterEach(() => {
  handle.destroy()
  vi.unstubAllGlobals()
})

describe('the intro, to a screen reader', () => {
  it('exposes the loading caption as a status, under no aria-hidden', () => {
    const caption = handle.root.querySelector('.intro-caption')!
    expect(caption.getAttribute('role')).toBe('status')
    expect(caption.closest('[aria-hidden="true"]')).toBeNull()
  })

  it('hides the drawn mark, which says nothing', () => {
    const mark = handle.root.querySelector('.intro-mark')!
    expect(mark.getAttribute('aria-hidden')).toBe('true')
  })
})
