// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './SiteHeader'

// The phone menu's contract, as behaviour rather than pixels (the choreography
// is CSS and is reviewed by eye). What these pin down:
//  - the burger exists only once there are actions, and describes its state;
//  - it comes BEFORE the actions in the DOM, so Tab from it reaches the items;
//  - the glass field is decorative, and every way of leaving the menu works:
//    the field, choosing an action (a native capture on the portal host),
//    Escape, a tap outside, losing the phone breakpoint, losing the actions;
//  - the parent hears about the open state (App keeps Escape from skipping the
//    intro while the menu owns it).

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Listener = (e: { matches: boolean }) => void

let container: HTMLDivElement
let root: Root
let mediaListeners: Record<string, Listener[]>

beforeEach(() => {
  mediaListeners = {}
  // jsdom has no matchMedia; the header watches the phone breakpoint so a
  // rotation to a desktop width folds the menu. Record the listeners so a test
  // can play that change.
  window.matchMedia = ((query: string) => ({
    matches: query === '(max-width: 767px)',
    media: query,
    addEventListener: (_: string, fn: Listener) => {
      ;(mediaListeners[query] ??= []).push(fn)
    },
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

interface MountProps {
  hasActions?: boolean
  onActionsHost?: (el: HTMLElement | null) => void
  onMenuOpenChange?: (open: boolean) => void
}

function mount({ hasActions = true, onActionsHost = () => {}, onMenuOpenChange }: MountProps = {}) {
  act(() => {
    root.render(
      <SiteHeader
        layout="scene"
        tone="dark"
        hasActions={hasActions}
        onActionsHost={onActionsHost}
        onMenuOpenChange={onMenuOpenChange}
      />,
    )
  })
}

const header = () => container.querySelector<HTMLElement>('.site-header')!
const burger = () => container.querySelector<HTMLButtonElement>('.site-header__burger')
const field = () => container.querySelector<HTMLElement>('.site-header__field')
const isOpen = () => header().hasAttribute('data-menu-open')

function open() {
  act(() => burger()!.click())
  expect(isOpen()).toBe(true)
}

describe('the phone menu', () => {
  it('has no burger until there are actions to hold', () => {
    mount({ hasActions: false })
    expect(burger()).toBeNull()
    expect(isOpen()).toBe(false)
  })

  it('toggles on the burger, which describes what it will do', () => {
    mount()
    const b = burger()!
    const end = container.querySelector<HTMLElement>('.site-header__end')!
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(b.getAttribute('aria-label')).toBe('Menú')
    expect(b.getAttribute('aria-controls')).toBe(end.id)

    act(() => b.click())
    expect(isOpen()).toBe(true)
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(b.getAttribute('aria-label')).toBe('Cerrar el menú')

    act(() => b.click())
    expect(isOpen()).toBe(false)
    expect(b.getAttribute('aria-expanded')).toBe('false')
  })

  it('puts the burger before the actions in the DOM and draws it as three bars', () => {
    mount()
    const b = burger()!
    const end = container.querySelector<HTMLElement>('.site-header__end')!
    // Tab from the burger must land on the items, which needs DOM order (the
    // visual order is CSS `order`). FOLLOWING = the end comes after the burger.
    expect(b.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(b.querySelectorAll('.site-header__burger-bar')).toHaveLength(3)
    expect(b.querySelector('svg')).toBeNull()
  })

  it('folds when the glass field is tapped, and the field is decorative', () => {
    mount()
    const f = field()!
    expect(f.getAttribute('aria-hidden')).toBe('true')
    open()
    act(() => f.click())
    expect(isOpen()).toBe(false)
  })

  it('folds when an action inside the host is chosen', () => {
    let host: HTMLElement | null = null
    mount({ onActionsHost: (el) => (host = el) })
    // Stands in for a portaled trigger: appended natively, like a portal, so
    // its click never travels the React tree to the header.
    const trigger = document.createElement('button')
    host!.appendChild(trigger)
    open()
    act(() => trigger.click())
    expect(isOpen()).toBe(false)
  })

  it('folds on Escape', () => {
    mount()
    open()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(isOpen()).toBe(false)
  })

  it('folds on a press outside the header', () => {
    mount()
    open()
    act(() => {
      // jsdom has no PointerEvent; the handler only reads `target`.
      document.body.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
    })
    expect(isOpen()).toBe(false)
  })

  it('folds when the viewport leaves the phone breakpoint, and not otherwise', () => {
    mount()
    open()
    const fire = (matches: boolean) =>
      act(() => {
        for (const fn of mediaListeners['(max-width: 767px)'] ?? []) fn({ matches })
      })
    fire(true)
    expect(isOpen()).toBe(true)
    fire(false)
    expect(isOpen()).toBe(false)
  })

  it('folds when the actions go away', () => {
    mount()
    open()
    mount({ hasActions: false })
    expect(isOpen()).toBe(false)
  })

  it('tells the parent when it opens and closes', () => {
    const onMenuOpenChange = vi.fn()
    mount({ onMenuOpenChange })
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false)
    open()
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(true)
    act(() => burger()!.click())
    expect(onMenuOpenChange).toHaveBeenLastCalledWith(false)
  })
})
