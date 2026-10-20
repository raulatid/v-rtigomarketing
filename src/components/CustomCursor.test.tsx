// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CustomCursor } from './CustomCursor'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  // A fine pointer, so the custom cursor runs.
  window.matchMedia = ((query: string) => ({
    matches: query.includes('pointer: fine'),
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
  act(() => root.render(<CustomCursor />))
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

function moveOver(target: Element) {
  const event = new MouseEvent('pointermove', { bubbles: true, clientX: 10, clientY: 10 })
  act(() => {
    target.dispatchEvent(event)
  })
}

describe('CustomCursor over text fields', () => {
  it('steps aside for the system text cursor over a field, and comes back after', () => {
    const html = document.documentElement
    const layer = container.querySelector('.cursor-layer')!
    const field = document.createElement('input')
    field.type = 'email'
    const button = document.createElement('button')
    container.append(field, button)

    expect(html.classList.contains('has-custom-cursor')).toBe(true)

    moveOver(field)
    expect(html.classList.contains('has-custom-cursor')).toBe(false)
    expect(layer.classList.contains('is-native')).toBe(true)

    moveOver(button)
    expect(html.classList.contains('has-custom-cursor')).toBe(true)
    expect(layer.classList.contains('is-native')).toBe(false)
  })

  it('keeps the hand over a checkbox and a textarea gets the system cursor', () => {
    const html = document.documentElement
    const box = document.createElement('input')
    box.type = 'checkbox'
    const area = document.createElement('textarea')
    container.append(box, area)

    moveOver(box)
    expect(html.classList.contains('has-custom-cursor')).toBe(true)

    moveOver(area)
    expect(html.classList.contains('has-custom-cursor')).toBe(false)
  })
})
