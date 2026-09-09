// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EarthHint } from './EarthHint'

// Earth's hint is rendered ONCE and never re-rendered. Both sentences are in the
// markup and the stylesheet picks by `(pointer: coarse)`, the same arrangement
// the plate uses — so the guarantee that a thumb is never told to scroll is a
// guarantee that both sentences are THERE. The CSS can only choose between what
// was rendered.
//
// Nothing here asserts WHEN the hint shows. That is `HintLayer`, which paints
// `data-visible` from inside the frame loop, and `hintIdle.test.ts` proves the
// rule it paints from.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<EarthHint />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

const hint = () => container.querySelector<HTMLElement>('.earth-hint')!
const sentences = () => [
  ...hint().querySelectorAll<HTMLElement>('.earth-hint__sentence'),
]

describe('the Earth hint', () => {
  it('carries both gestures, so the stylesheet has something to pick from', () => {
    expect(sentences().map((el) => el.dataset.input)).toEqual(['fine', 'coarse'])
    expect(sentences().map((el) => el.textContent?.trim())).toEqual([
      'Scroll para viajar a Murcia',
      'Zoom para viajar a Murcia',
    ])
  })

  it('names Murcia, so the sentence and the accessible button agree', () => {
    // `.nav-control`'s aria-label is "Ir a Murcia". A hint that said "the other
    // scene" would be a second vocabulary for one destination.
    for (const el of sentences()) expect(el.textContent).toContain('Murcia')
  })

  it('draws the plate’s own chevrons, and only them', () => {
    const svg = hint().querySelector('.earth-hint__chevrons')!
    // The literals are deliberate. These paths are copied from
    // NavigationControl's travel glyph, and if either copy is redrawn this fails
    // and says so rather than letting the two quietly diverge.
    expect([...svg.querySelectorAll('path')].map((p) => p.getAttribute('d'))).toEqual([
      'M8 36l4 4 4-4',
      'M8 42l4 4 4-4',
    ])
    // The ink box plus the half-stroke spill on each side, so a round cap is
    // drawn round rather than sliced flat by the viewport (§43).
    expect(svg.getAttribute('viewBox')).toBe('7.4 35.4 9.2 11.2')
  })

  it('has no mouse body — the client asked for the chevrons alone', () => {
    const svg = hint().querySelector('.earth-hint__chevrons')!
    expect(svg.querySelectorAll('path')).toHaveLength(2)
    expect(svg.querySelector('rect')).toBeNull()
  })

  it('is sighted-only, because .nav-control is the real route to Murcia', () => {
    expect(hint().getAttribute('aria-hidden')).toBe('true')
  })

  it('is offered by the scene and not by being rendered', () => {
    // Mounting must not put it on screen: only HintLayer may, once the viewer
    // has been still and nothing else has their attention.
    expect(hint().dataset.visible).toBeUndefined()
  })
})
