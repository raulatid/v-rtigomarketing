// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NavigationControl } from './NavigationControl'

// The hint frame is rendered ONCE and never re-rendered: every variant of every
// row is in the markup, and the stylesheet picks by `(pointer: coarse)` and the
// direction the input layer paints. So the guarantee that a mouse is never
// taught a pinch, and a thumb never a right button, is a guarantee that both
// sets are THERE — the CSS can only choose between what was rendered.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<NavigationControl />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const frame = () => container.querySelector<HTMLElement>('.nav-hint')!

describe('the hint frame', () => {
  it('is sighted-only: the button beside it is what assistive technology reads', () => {
    expect(frame().getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.nav-control')).not.toBeNull()
  })

  it('carries the return gesture for both inputs and both directions', () => {
    const sentences = [...frame().querySelectorAll<HTMLElement>('.nav-hint__text')]
    const keys = sentences.map((el) => `${el.dataset.input}/${el.dataset.direction}`)
    expect(keys.sort()).toEqual(['coarse/down', 'coarse/up', 'fine/down', 'fine/up'])
  })

  it('carries the city controls for both inputs', () => {
    const cells = [...frame().querySelectorAll<HTMLElement>('.nav-hint__cell')]
    expect(cells.map((el) => el.dataset.gesture)).toEqual(['drag', 'rotate', 'select'])
    const text = frame().querySelector('.nav-hint__controls')!.textContent ?? ''
    for (const word of ['Arrastra', 'Botón derecho', 'Dos dedos', 'Clic', 'Toca']) {
      expect(text).toContain(word)
    }
  })

  it('draws a glyph for every gesture it names', () => {
    for (const glyph of [
      'mouse',
      'spread',
      'close',
      'drag',
      'rotate-mouse',
      'rotate-touch',
      'click',
      'tap',
    ]) {
      expect(frame().querySelector(`svg.nav-hint__icon--${glyph}`), glyph).not.toBeNull()
    }
  })
})
