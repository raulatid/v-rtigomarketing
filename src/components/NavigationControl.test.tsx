// @vitest-environment jsdom
import { act } from 'react'
import { createRoot } from 'react-dom/client'
import { describe, expect, it } from 'vitest'
import { NavigationControl } from './NavigationControl'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

// Accessibility audit 2026-11-18, D3: «Ir a Murcia» took the focus during the
// intro and did nothing.
describe('the navigation control before site', () => {
  it('is inert when asked, and takes the focus again after', () => {
    const container = document.body.appendChild(document.createElement('div'))
    const root = createRoot(container)
    act(() => root.render(<NavigationControl inert />))
    expect(container.querySelector('.nav')!.hasAttribute('inert')).toBe(true)
    act(() => root.render(<NavigationControl inert={false} />))
    expect(container.querySelector('.nav')!.hasAttribute('inert')).toBe(false)
    act(() => root.unmount())
    container.remove()
  })
})
