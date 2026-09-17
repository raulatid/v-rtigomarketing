// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CasePanel } from './CasePanel'
import fixtures from '../../content/fixtures/caseStudy.json'
import type { SatelliteDef } from '../experiences/earth/orbit/orbitConfig'

// The case's next step: the panel ends with a doorway into the audit when it
// is given one, and renders no dead link when it is not.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.unstubAllGlobals()
})

describe('the mobile case sheet', () => {
  function setup(docked = false) {
    vi.stubGlobal('matchMedia', () => ({ matches: docked, addEventListener() {}, removeEventListener() {} }))
    const data = fixtures[0] as SatelliteDef
    const close = vi.fn()
    const getLogoBottom = vi.fn(() => window.innerHeight * 0.4)
    act(() => root.render(<CasePanel data={data} onClose={close} getLogoBottom={getLogoBottom} />))
    const panel = container.querySelector<HTMLElement>('.case-panel')!
    const grip = container.querySelector<HTMLButtonElement>('.case-panel__handle')!
    const header = container.querySelector<HTMLElement>('.case-panel__header')!
    panel.getBoundingClientRect = () => ({ height: parseFloat(panel.style.getPropertyValue(
      panel.dataset.stop === 'expanded' ? '--case-sheet-maximum' : '--case-sheet-compact',
    )) }) as DOMRect
    for (const surface of [grip, header]) {
      surface.setPointerCapture = vi.fn()
      surface.hasPointerCapture = () => false
    }
    const pointer = (target: Element, type: string, y: number) => {
      const event = new Event(type, { bubbles: true })
      Object.assign(event, { pointerId: 1, clientX: 100, clientY: y, isPrimary: true, button: 0 })
      act(() => target.dispatchEvent(event))
    }
    const drag = (target: Element, from: number, to: number) => {
      pointer(target, 'pointerdown', from)
      pointer(target, 'pointermove', to)
      pointer(target, 'pointerup', to)
    }
    return { panel, grip, header, pointer, drag, close, data, getLogoBottom }
  }

  it('drags down from the header, up from the grip, and ignores the following pointer click', () => {
    const r = setup()
    r.drag(r.header, 200, 350)
    expect(r.panel.dataset.stop).toBe('peek')
    expect(r.panel.style.height).toBe('')
    r.drag(r.grip, 400, 200)
    expect(r.panel.dataset.stop).toBe('expanded')
    act(() => r.grip.dispatchEvent(new MouseEvent('click', { detail: 1, bubbles: true })))
    expect(r.panel.dataset.stop).toBe('expanded')
    act(() => r.grip.click())
    expect(r.panel.dataset.stop).toBe('peek')
  })

  it('leaves scrolling and the close button outside the drag surfaces', () => {
    const r = setup()
    r.drag(container.querySelector('.case-panel__body')!, 200, 400)
    const close = container.querySelector<HTMLButtonElement>('.case-panel__close')!
    r.drag(close, 200, 400)
    expect(r.panel.dataset.stop).toBe('expanded')
    expect(r.header.setPointerCapture).not.toHaveBeenCalled()
    act(() => close.click())
    expect(r.close).toHaveBeenCalledOnce()
  })

  it('restores the current stop on cancellation and resize', () => {
    const r = setup()
    for (const end of ['pointercancel', 'lostpointercapture', 'resize']) {
      r.pointer(r.header, 'pointerdown', 200)
      r.pointer(r.header, 'pointermove', 300)
      expect(r.panel.hasAttribute('data-sheet-dragging')).toBe(true)
      if (end === 'resize') act(() => window.dispatchEvent(new Event('resize')))
      else r.pointer(r.header, end, 300)
      expect(r.panel.dataset.stop).toBe('expanded')
      expect(r.panel.style.height).toBe('')
      expect(r.panel.hasAttribute('data-sheet-dragging')).toBe(false)
    }
  })

  it('cancels an active drag when the case closes and opens the next case expanded', () => {
    const r = setup()
    r.pointer(r.grip, 'pointerdown', 200)
    r.pointer(r.grip, 'pointermove', 300)
    act(() => root.render(<CasePanel data={null} onClose={r.close} />))
    expect(r.panel.style.height).toBe('')
    expect(r.panel.hasAttribute('data-sheet-dragging')).toBe(false)
    act(() => root.render(<CasePanel data={{ ...r.data, id: 'another-case' }} onClose={r.close} getLogoBottom={r.getLogoBottom} />))
    expect(r.panel.dataset.stop).toBe('expanded')
  })

  it('does not drag or toggle the desktop dock', () => {
    const r = setup(true)
    r.drag(r.header, 200, 400)
    act(() => r.grip.click())
    expect(r.header.setPointerCapture).not.toHaveBeenCalled()
    expect(r.panel.dataset.stop).toBe('expanded')
  })

  it('caps opening, upward dragging and grip activation below the logo', () => {
    const r = setup()
    const maximum = Math.floor(window.innerHeight * 0.6 - 16)
    expect(r.panel.style.getPropertyValue('--case-sheet-maximum')).toBe(`${maximum}px`)
    r.pointer(r.grip, 'pointerdown', 400)
    r.pointer(r.grip, 'pointermove', -1000)
    expect(r.panel.style.height).toBe(`${maximum}px`)
    r.pointer(r.grip, 'pointerup', -1000)
    act(() => r.grip.click())
    act(() => r.grip.click())
    expect(r.panel.dataset.stop).toBe('expanded')
    expect(r.panel.style.getPropertyValue('--case-sheet-maximum')).toBe(`${maximum}px`)
  })

  it('updates the ceiling as the camera moves and cancels observation on close', () => {
    let frame: FrameRequestCallback | undefined
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => { frame = callback; return 1 })
    const cancel = vi.fn()
    vi.stubGlobal('cancelAnimationFrame', cancel)
    const r = setup()
    r.getLogoBottom.mockReturnValue(window.innerHeight * 0.7)
    act(() => frame!(0))
    expect(r.panel.style.getPropertyValue('--case-sheet-maximum')).toBe(`${Math.floor(window.innerHeight * 0.3 - 16)}px`)
    r.getLogoBottom.mockReturnValue(window.innerHeight)
    act(() => frame!(0))
    expect(r.panel.hasAttribute('data-sheet-waiting')).toBe(true)
    r.getLogoBottom.mockReturnValue(200)
    act(() => frame!(0))
    expect(r.panel.hasAttribute('data-sheet-waiting')).toBe(false)
    act(() => root.render(<CasePanel data={null} onClose={r.close} />))
    expect(cancel).toHaveBeenCalledWith(1)
  })

  it('recalculates against the visible viewport and cancels dragging when it resizes', () => {
    const viewport = Object.assign(new EventTarget(), { offsetTop: 20, height: 600 })
    vi.stubGlobal('visualViewport', viewport)
    const r = setup()
    r.pointer(r.grip, 'pointerdown', 400)
    r.pointer(r.grip, 'pointermove', 450)
    viewport.height = 450
    act(() => viewport.dispatchEvent(new Event('resize')))
    expect(r.panel.hasAttribute('data-sheet-dragging')).toBe(false)
    expect(r.panel.style.getPropertyValue('--case-sheet-maximum')).toBe(`${Math.floor(470 - r.getLogoBottom() - 16)}px`)
    expect(r.panel.style.getPropertyValue('--case-sheet-bottom')).toBe(`${window.innerHeight - 470}px`)
  })
})

describe('the case panel ends one step from the audit', () => {
  it('offers the audit and asks for it when pressed', () => {
    const onRequestAudit = vi.fn()
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} onRequestAudit={onRequestAudit} />)
    })
    const next = container.querySelector<HTMLButtonElement>('.case-panel__next')
    expect(next).not.toBeNull()
    expect(next!.textContent).toContain('Solicita la auditoría')
    act(() => next!.click())
    expect(onRequestAudit).toHaveBeenCalledTimes(1)
  })

  it('renders no doorway without an audit behind it', () => {
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} />)
    })
    expect(container.querySelector('.case-panel__next')).toBeNull()
  })

  it('keeps the doorway out of the tab order while no case is shown', () => {
    // The panel stays mounted while hidden; its controls must not be tabbable.
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} onRequestAudit={() => {}} />)
    })
    expect(container.querySelector('.case-panel__next')!.getAttribute('tabindex')).toBe('-1')
  })
})
