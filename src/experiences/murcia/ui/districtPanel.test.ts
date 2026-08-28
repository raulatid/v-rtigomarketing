// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { DistrictPanel } from './districtPanel'
import type { ServicePanelView } from './districtPanel'

const seo: ServicePanelView = {
  eyebrow: 'Servicios · 1 / 5',
  title: 'SEO',
  body: 'Primer párrafo.\n\nSegundo párrafo.',
  prevTitle: 'Identidad de marca',
  nextTitle: 'Analítica web',
}
const analytics: ServicePanelView = {
  eyebrow: 'Servicios · 2 / 5',
  title: 'Analítica web',
  body: 'Solo uno.',
  prevTitle: 'SEO',
  nextTitle: 'Estrategia de contenidos',
}

describe('DistrictPanel (one service)', () => {
  let parent: HTMLElement
  let onClose: ReturnType<typeof vi.fn>
  let onStep: ReturnType<typeof vi.fn>
  let panel: DistrictPanel

  beforeEach(() => {
    parent = document.createElement('div')
    document.body.appendChild(parent)
    onClose = vi.fn()
    onStep = vi.fn()
    panel = new DistrictPanel(parent, 'servicios', { onClose, onStep })
  })

  afterEach(() => {
    panel.dispose()
    parent.remove()
  })

  it('renders eyebrow, title, one <p> per paragraph and neighbour names', () => {
    panel.show(seo, true)
    expect(parent.querySelector('.district-panel-eyebrow')?.textContent).toBe('Servicios · 1 / 5')
    expect(parent.querySelector('h2')?.textContent).toBe('SEO')
    const paragraphs = parent.querySelectorAll('.district-panel-copy p')
    expect(paragraphs.length).toBe(2)
    expect(paragraphs[1]?.textContent).toBe('Segundo párrafo.')
    expect(parent.querySelector('[data-step="-1"]')?.getAttribute('aria-label')).toBe(
      'Anterior: Identidad de marca',
    )
    expect(parent.querySelector('[data-step="1"]')?.getAttribute('aria-label')).toBe(
      'Siguiente: Analítica web',
    )
  })

  it('shows at peek, focused on the close button', () => {
    panel.show(seo, true)
    expect(panel.isOpen).toBe(true)
    expect(panel.currentStop).toBe('peek')
    expect(document.activeElement?.className).toBe('district-panel-close')
  })

  it('swap keeps the stop and the focused element, and replaces the text', () => {
    panel.show(seo, true)
    // The viewer raised the sheet and is holding the "next" button.
    parent.querySelector<HTMLButtonElement>('.district-panel-handle')!.click()
    expect(panel.currentStop).toBe('expanded')
    const next = parent.querySelector<HTMLButtonElement>('[data-step="1"]')!
    next.focus()

    panel.swap(analytics, true)

    expect(panel.isOpen).toBe(true)
    expect(panel.currentStop).toBe('expanded')
    expect(document.activeElement).toBe(next)
    expect(parent.querySelector('h2')?.textContent).toBe('Analítica web')
    expect(parent.querySelectorAll('.district-panel-copy p').length).toBe(1)
  })

  it('swap on a closed panel behaves as show', () => {
    panel.swap(analytics, true)
    expect(panel.isOpen).toBe(true)
    expect(panel.currentStop).toBe('peek')
  })

  it('step buttons and arrow keys report a direction without touching the stop', () => {
    panel.show(seo, true)
    parent.querySelector<HTMLButtonElement>('[data-step="-1"]')!.click()
    parent.querySelector<HTMLButtonElement>('[data-step="1"]')!.click()
    expect(onStep.mock.calls).toEqual([[-1], [1]])
    expect(panel.currentStop).toBe('peek')

    const section = parent.querySelector('.district-panel')!
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }))
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }))
    section.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true, shiftKey: true }))
    expect(onStep.mock.calls).toEqual([[-1], [1], [1], [-1]])
  })

  it('reveals everything at once under reduced motion, and in stages otherwise', () => {
    vi.useFakeTimers()
    try {
      panel.show(seo, false)
      const shown = () => parent.querySelectorAll('.reveal.shown').length
      expect(shown()).toBe(0)
      vi.advanceTimersByTime(700)
      expect(shown()).toBe(4)
      panel.hide()
      expect(shown()).toBe(0)
      panel.show(seo, true)
      expect(shown()).toBe(4)
    } finally {
      vi.useRealTimers()
    }
  })

  it('reports its offset box only while open', () => {
    expect(panel.getObstructionRect()).toBeNull()
    panel.show(seo, true)
    // jsdom has no layout, so offsets are 0 and the rect is null here too; the
    // contract under test is "closed → null", the measuring is a browser matter.
    panel.hide()
    expect(panel.getObstructionRect()).toBeNull()
  })

  it('Escape closes and restores focus', () => {
    const before = document.createElement('button')
    document.body.appendChild(before)
    before.focus()
    panel.show(seo, true)
    parent
      .querySelector('.district-panel')!
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    expect(onClose).toHaveBeenCalledTimes(1)
    panel.hide()
    expect(document.activeElement).toBe(before)
    before.remove()
  })
})
