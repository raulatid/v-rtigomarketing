// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { NavigationControl } from './NavigationControl'

// The hint frame is rendered ONCE and never re-rendered: every variant of every
// cell is in the markup, and the stylesheet picks by `(pointer: coarse)` and the
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
const cells = () => [...frame().querySelectorAll<HTMLElement>('.nav-hint__cell')]
const wordsIn = (cell: HTMLElement) =>
  [...cell.querySelectorAll<HTMLElement>('.nav-hint__label')].map((el) => el.textContent ?? '')

describe('the hint frame', () => {
  it('is sighted-only: the button beside it is what assistive technology reads', () => {
    expect(frame().getAttribute('aria-hidden')).toBe('true')
    expect(container.querySelector('.nav-control')).not.toBeNull()
  })

  it('is four cells: the city, then the way out of it', () => {
    expect(cells().map((el) => el.dataset.gesture)).toEqual([
      'drag',
      'rotate',
      'select',
      'travel',
    ])
  })

  // The plate speaks in single words now: the sentences it used to carry
  // ("Haz scroll para bajar a Murcia" and its three siblings) are gone, and the
  // glyph's motion says what they said. So the contract is that no cell holds
  // more than the one word its input needs.
  it('gives every cell one word, and the way out one per input', () => {
    const byGesture = new Map(cells().map((el) => [el.dataset.gesture, el]))
    expect(wordsIn(byGesture.get('drag')!)).toEqual(['Mover'])
    expect(wordsIn(byGesture.get('rotate')!)).toEqual(['Girar'])
    expect(wordsIn(byGesture.get('select')!)).toEqual(['Abrir'])

    const travel = [...byGesture.get('travel')!.querySelectorAll<HTMLElement>('.nav-hint__label')]
    expect(travel.map((el) => `${el.dataset.input}:${el.textContent}`)).toEqual([
      'fine:Scroll',
      'coarse:Zoom',
    ])
  })

  // Direction is drawn, not written: the word is the same climbing out as it is
  // falling in, so the chevrons are the only thing that says which way. Both
  // groups have to be rendered for the stylesheet to have a choice to make.
  it('draws a chevron group for each direction of travel', () => {
    const groups = [...frame().querySelectorAll<SVGGElement>('.nav-hint__chevrons')]
    expect(groups.map((el) => el.dataset.direction)).toEqual(['up', 'down'])
    for (const group of groups) {
      expect(group.querySelectorAll('.nav-hint__part--chase')).toHaveLength(2)
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
