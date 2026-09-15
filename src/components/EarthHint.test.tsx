// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { EarthHint } from './EarthHint'

// Earth's hint is rendered ONCE and never re-rendered. Both glyphs and both
// sentences are in the markup and the stylesheet picks by `(pointer: coarse)`,
// so the guarantee that a thumb is never
// told to scroll, or shown a mouse, is a guarantee that both sets are THERE.
// The CSS can only choose between what was rendered.
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
const glyph = (name: string) => hint().querySelector<SVGSVGElement>(`svg.earth-hint__glyph--${name}`)!

describe('the Earth hint', () => {
  it('carries both gestures, so the stylesheet has something to pick from', () => {
    expect(sentences().map((el) => el.dataset.input)).toEqual(['fine', 'coarse'])
    expect(sentences().map((el) => el.textContent?.trim())).toEqual([
      'Zoom para viajar a Murcia',
      'Zoom para viajar a Murcia',
    ])
    expect(glyph('mouse')).not.toBeNull()
    expect(glyph('pinch')).not.toBeNull()
  })

  it('names Murcia, so the sentence and the accessible button agree', () => {
    // `.nav-control`'s aria-label is "Ir a Murcia". A hint that said "the other
    // scene" would be a second vocabulary for one destination.
    for (const el of sentences()) expect(el.textContent).toContain('Murcia')
  })

  it('draws an upright mouse with forward chevrons above it', () => {
    // The mouse stays upright; the lower upward chevron leads the upper one.
    const svg = glyph('mouse')
    const body = svg.querySelector('rect')!
    expect(['x', 'y', 'width', 'height', 'rx'].map((a) => body.getAttribute(a))).toEqual([
      '7',
      '14',
      '10',
      '20',
      '5',
    ])
    expect(svg.querySelector('.earth-hint__part--wheel')?.getAttribute('d')).toBe('M12 18v4')
    // Two chevrons, not one, and inside one group: the chase is a delay on the
    // group's second child, so a single chevron could only blink.
    const chase = [...svg.querySelectorAll('.earth-hint__chevrons .earth-hint__part--chase')]
    expect(chase.map((p) => p.getAttribute('d'))).toEqual(['M8 12l4-4 4 4', 'M8 6l4-4 4 4'])
    // Include the chevrons above the body and room for their round caps.
    expect(svg.getAttribute('viewBox')).toBe('6 1 12 34')
  })

  it('draws a phone with two fingers on it for touch', () => {
    const svg = glyph('pinch')
    expect(svg.querySelector('rect')).not.toBeNull()
    // Each finger is ONE path, rotated about its base by the stylesheet, so the
    // spread is a transform and never a path morph. Fat and round-capped: the
    // cap IS the fingertip, and a hairline hand read as a needle.
    for (const finger of ['a', 'b']) {
      const path = svg.querySelector<SVGPathElement>(`path.earth-hint__part--finger-${finger}`)!
      expect(path, finger).not.toBeNull()
      expect(Number(path.getAttribute('stroke-width')), finger).toBeGreaterThan(3)
    }
  })

  it('leaves every loop to the stylesheet', () => {
    // The animations are gated on `[data-visible]` and killed under reduced
    // motion in CSS; an inline style here would sit above both.
    for (const part of hint().querySelectorAll<SVGElement>('.earth-hint__part')) {
      expect(part.getAttribute('style')).toBeNull()
    }
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
