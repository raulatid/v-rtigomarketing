// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SiteHeader } from './SiteHeader'
import { MENU_MOTION_MS, MENU_REDUCED_MS } from '../corner-logo/headerMenuTiming'

// The phone menu's contract, as behaviour rather than pixels (the motion is
// CSS, and is reviewed by eye).
//
// It is TWO menus, and the split is the thing to keep straight while reading:
//
//   SCENE — the viewport hinges away and slides down, and the menu is the layer
//   it reveals behind itself. The header does not draw that layer: App owns it
//   and hands it over as `menuHost`, and the header PORTALS its menu box into
//   it on a phone. The close has a tail (the card travelling back), so it is a
//   phase with a clock, and the header reports itself open for all of it.
//
//   BLOG — the 2026-09-04 glass field, unchanged, because the blog has no scene
//   canvas to move. No phases: it toggles.
//
// What these pin down:
//  - the burger exists only once there are actions, and describes its state;
//  - it comes BEFORE the actions in the DOM, so Tab from it reaches the items;
//  - the box goes where it is told, and only on a phone over the scene;
//  - every way of leaving works, and leaving opens nothing by itself;
//  - a chosen door opens in the tick it was chosen, and the menu folds with it;
//  - a hard close (breakpoint, lost actions) skips the tail; a panel taking
//    over does not, so the card returns under the panel rather than snapping;
//  - the parent hears the state for the WHOLE close.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Listener = (e: { matches: boolean }) => void

let container: HTMLDivElement
let host: HTMLDivElement
let root: Root
let unmounted: boolean
let mediaListeners: Record<string, Listener[]>
let reducedMotion: boolean

beforeEach(() => {
  vi.useFakeTimers()
  mediaListeners = {}
  reducedMotion = false
  // jsdom has no matchMedia. The header watches TWO queries: the phone
  // breakpoint, which decides where the box lives and folds the menu on a
  // rotation, and reduced motion, which it samples when the menu closes (a
  // media query cannot reach a setTimeout).
  window.matchMedia = ((query: string) => ({
    get matches() {
      if (query === '(prefers-reduced-motion: reduce)') return reducedMotion
      return query === '(max-width: 767px)'
    },
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
  // The layer App would own: a sibling of the header, never inside it.
  host = document.createElement('div')
  host.className = 'app__menu'
  document.body.appendChild(host)
  root = createRoot(container)
  unmounted = false
})

afterEach(() => {
  if (!unmounted) act(() => root.unmount())
  container.remove()
  host.remove()
  vi.useRealTimers()
})

interface MountProps {
  layout?: 'scene' | 'blog'
  hasActions?: boolean
  panelOpen?: boolean
  menuHost?: HTMLElement | null
  onActionsHost?: (el: HTMLElement | null) => void
  onMenuStateChange?: (state: 'closed' | 'open' | 'closing') => void
}

function mount({
  layout = 'scene',
  hasActions = true,
  panelOpen,
  menuHost = host,
  onActionsHost = () => {},
  onMenuStateChange,
}: MountProps = {}) {
  act(() => {
    root.render(
      <SiteHeader
        layout={layout}
        tone="dark"
        hasActions={hasActions}
        panelOpen={panelOpen}
        menuHost={menuHost}
        onActionsHost={onActionsHost}
        onMenuStateChange={onMenuStateChange}
      />,
    )
  })
}

const header = () => container.querySelector<HTMLElement>('.site-header')!
const burger = () => container.querySelector<HTMLButtonElement>('.site-header__burger')
const field = () => container.querySelector<HTMLElement>('.site-header__field')
const box = () => document.querySelector<HTMLElement>('.site-header__menu')!
const isOpen = () => header().hasAttribute('data-menu-open')
const state = () => header().getAttribute('data-menu-state')

/** Advance the clock inside act(), the way a real frame budget would. */
function tick(ms: number) {
  act(() => {
    vi.advanceTimersByTime(ms)
  })
}

function open() {
  act(() => burger()!.click())
  expect(isOpen()).toBe(true)
}

/** The scene's whole close: the card's way back to fullscreen. */
function settle() {
  tick(MENU_MOTION_MS)
}

/** A stand-in for a portaled trigger: appended natively, as a portal's node is,
 *  so its click never travels the React tree to the header. */
function addDoor(target: HTMLElement) {
  const door = document.createElement('button')
  const opened = vi.fn()
  door.addEventListener('click', opened)
  target.appendChild(door)
  return { door, opened }
}

function press(target: EventTarget) {
  act(() => {
    // jsdom has no PointerEvent; the handler only reads `target`.
    target.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true }))
  })
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
    const end = document.querySelector<HTMLElement>('.site-header__end')!
    expect(b.getAttribute('aria-expanded')).toBe('false')
    expect(b.getAttribute('aria-label')).toBe('Menú')
    expect(b.getAttribute('aria-controls')).toBe(end.id)

    open()
    expect(b.getAttribute('aria-expanded')).toBe('true')
    expect(b.getAttribute('aria-label')).toBe('Cerrar el menú')

    act(() => b.click())
    settle()
    expect(isOpen()).toBe(false)
    expect(b.getAttribute('aria-expanded')).toBe('false')
  })

  it('puts the burger before the actions in the DOM and draws it as three bars', () => {
    mount({ menuHost: null })
    const b = burger()!
    const end = container.querySelector<HTMLElement>('.site-header__end')!
    // Tab from the burger must land on the items, which needs DOM order (the
    // visual order is CSS `order`). FOLLOWING = the end comes after the burger.
    expect(b.compareDocumentPosition(end) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
    expect(b.querySelectorAll('.site-header__burger-bar')).toHaveLength(3)
    expect(b.querySelector('svg')).toBeNull()
  })

  describe('where the box lives', () => {
    it('is portaled into the host on a phone over the scene', () => {
      mount()
      expect(host.contains(box())).toBe(true)
      expect(header().contains(box())).toBe(false)
      expect(box().querySelector('.site-header__end')).not.toBeNull()
    })

    it('stays on the line when there is no host', () => {
      mount({ menuHost: null })
      expect(header().contains(box())).toBe(true)
    })

    it('stays in the header on the blog, host or no host', () => {
      mount({ layout: 'blog' })
      expect(header().contains(box())).toBe(true)
      expect(host.contains(box())).toBe(false)
    })

    it('hands the parent the actions cell wherever it went', () => {
      // The triggers portal into whatever this reports, so it has to be the
      // cell inside the layer and not a stale one inside the header.
      const onActionsHost = vi.fn()
      mount({ onActionsHost })
      const last = onActionsHost.mock.lastCall?.[0] as HTMLElement
      expect(last).not.toBeNull()
      expect(host.contains(last)).toBe(true)
    })

    it('keeps the box, and the cell inside it, across a close', () => {
      // Losing the portal host makes ContactSection render its trigger inline
      // into the page.
      mount()
      const menu = box()
      open()
      act(() => burger()!.click())
      settle()
      expect(box()).toBe(menu)
      expect(menu.querySelector('.site-header__end')).not.toBeNull()
    })
  })

  describe('the way out', () => {
    it('closes on Escape, and opens nothing', () => {
      mount()
      open()
      act(() => {
        window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
      })
      expect(state()).toBe('closing')
      settle()
      expect(isOpen()).toBe(false)
    })

    it('closes on a press on the card, which lands on the layer behind it', () => {
      // The viewport is pointer-events: none while the menu is up, so a tap on
      // the tilted scene falls through to the layer's own ground.
      mount()
      open()
      press(host)
      expect(state()).toBe('closing')
      settle()
      expect(isOpen()).toBe(false)
    })

    it('does not close on a press inside the box', () => {
      mount()
      open()
      press(box())
      expect(state()).toBe('open')
    })

    it('closes on the burger, and reopens on it mid-close without replaying', () => {
      mount()
      open()
      act(() => burger()!.click())
      expect(state()).toBe('closing')
      tick(MENU_MOTION_MS / 2)
      act(() => burger()!.click())
      expect(state()).toBe('open')
      // The old close's timer must not fire into the reopened menu.
      tick(MENU_MOTION_MS)
      expect(state()).toBe('open')
    })
  })

  describe('choosing a door', () => {
    it('folds the menu and lets the door open in the same tick (scene)', () => {
      let cell: HTMLElement | null = null
      mount({ onActionsHost: (el) => (cell = el) })
      const { door, opened } = addDoor(cell!)
      open()
      act(() => door.click())
      expect(opened).toHaveBeenCalledTimes(1)
      expect(state()).toBe('closing')
      settle()
      expect(state()).toBe('closed')
    })

    it('folds and opens the door in the same tick on the blog, as it always has', () => {
      let cell: HTMLElement | null = null
      mount({ layout: 'blog', onActionsHost: (el) => (cell = el) })
      const { door, opened } = addDoor(cell!)
      act(() => burger()!.click())
      act(() => door.click())
      expect(isOpen()).toBe(false)
      expect(opened).toHaveBeenCalledTimes(1)
    })
  })

  describe('the blog keeps the field', () => {
    it('folds when the glass field is tapped, and the field is decorative', () => {
      mount({ layout: 'blog' })
      const f = field()!
      expect(f.getAttribute('aria-hidden')).toBe('true')
      act(() => burger()!.click())
      expect(isOpen()).toBe(true)
      act(() => f.click())
      expect(isOpen()).toBe(false)
    })

    it('has no field over the scene — the layer behind the card is the ground', () => {
      mount()
      expect(field()).toBeNull()
    })
  })

  describe('the phases', () => {
    it('opens at once and closes on the shared constant', () => {
      mount()
      expect(state()).toBe('closed')
      act(() => burger()!.click())
      expect(state()).toBe('open')

      act(() => burger()!.click())
      expect(state()).toBe('closing')
      tick(MENU_MOTION_MS - 1)
      expect(state()).toBe('closing')
      tick(1)
      expect(state()).toBe('closed')
    })

    it('closes on the reduced-motion clock when the viewer asked for less motion', () => {
      reducedMotion = true
      mount()
      act(() => burger()!.click())
      expect(state()).toBe('open')
      act(() => burger()!.click())
      tick(MENU_REDUCED_MS)
      expect(state()).toBe('closed')
    })

    it('has no phases on the blog', () => {
      mount({ layout: 'blog' })
      act(() => burger()!.click())
      expect(state()).toBe('open')
      act(() => burger()!.click())
      expect(state()).toBe('closed')
    })

    it('leaves no timer behind when it is unmounted mid-close', () => {
      mount()
      open()
      act(() => burger()!.click())
      expect(state()).toBe('closing')
      act(() => root.unmount())
      unmounted = true
      expect(vi.getTimerCount()).toBe(0)
    })
  })

  describe('standing down', () => {
    it('hard-closes when the viewport leaves the phone breakpoint, and not otherwise', () => {
      mount()
      open()
      const fire = (matches: boolean) =>
        act(() => {
          for (const fn of mediaListeners['(max-width: 767px)'] ?? []) fn({ matches })
        })
      fire(true)
      expect(isOpen()).toBe(true)
      fire(false)
      // No tail: the layout the card was drawn for is gone.
      expect(state()).toBe('closed')
      // And the box is back on the line, where a desktop layout lays it out.
      expect(header().contains(box())).toBe(true)
    })

    it('hard-closes when the actions go away', () => {
      mount()
      open()
      mount({ hasActions: false })
      expect(state()).toBe('closed')
    })

    it('says so, and folds, when a panel it opens takes over', () => {
      // Soft, not hard: the card returns to fullscreen under the arriving
      // panel instead of snapping there.
      mount()
      open()
      mount({ panelOpen: true })
      expect(header().getAttribute('data-panel-open')).toBe('true')
      expect(state()).toBe('closing')
      settle()
      expect(state()).toBe('closed')
    })
  })

  it('tells the parent the state for the WHOLE close', () => {
    // App's attention window and the chrome stand-down are computed from this.
    // If it dropped when the card started back, a pinch could commit a warp
    // while the scene was still tilted.
    const onMenuStateChange = vi.fn()
    mount({ onMenuStateChange })
    expect(onMenuStateChange).toHaveBeenLastCalledWith('closed')
    open()
    expect(onMenuStateChange).toHaveBeenLastCalledWith('open')
    act(() => burger()!.click())
    expect(onMenuStateChange).toHaveBeenLastCalledWith('closing')
    tick(MENU_MOTION_MS - 1)
    expect(onMenuStateChange).toHaveBeenLastCalledWith('closing')
    tick(1)
    expect(onMenuStateChange).toHaveBeenLastCalledWith('closed')
  })
})
