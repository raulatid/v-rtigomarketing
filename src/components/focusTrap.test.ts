// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { tabbableIn, trapTab } from './focusTrap'

// The modals' shared Tab trap (accessibility audit 2026-11-18, F1, F2).

afterEach(() => {
  document.body.replaceChildren()
})

/** jsdom lays nothing out: every element gets a box unless marked. */
function surface(html: string) {
  const outside = document.body.appendChild(document.createElement('button'))
  const panel = document.body.appendChild(document.createElement('section'))
  panel.innerHTML = html
  for (const el of panel.querySelectorAll<HTMLElement>('*')) {
    el.getClientRects = () => (el.dataset.unrendered === undefined ? [{}] : []) as unknown as DOMRectList
  }
  return { outside, panel }
}

const tab = (shiftKey = false) => new KeyboardEvent('keydown', { key: 'Tab', shiftKey, cancelable: true })

describe('the Tab trap', () => {
  const html = `
    <button id="close">✕</button>
    <h2 id="title" tabindex="-1">Título</h2>
    <input id="name" />
    <button id="disabled" disabled>no</button>
    <button id="hidden" data-unrendered>no</button>
    <details><summary id="summary">Más</summary><a id="inner" href="#">dentro</a></details>
    <button id="send">Enviar</button>`

  it('lists only what can take the focus now', () => {
    const { panel } = surface(html)
    expect(tabbableIn(panel).map((el) => el.id)).toEqual(['close', 'name', 'summary', 'send'])
  })

  it('wraps from the last control to the first, and back', () => {
    const { panel } = surface(html)
    panel.querySelector<HTMLElement>('#send')!.focus()
    const forward = tab()
    expect(trapTab(forward, panel)).toBe(true)
    expect(forward.defaultPrevented).toBe(true)
    expect(document.activeElement?.id).toBe('close')
    expect(trapTab(tab(true), panel)).toBe(true)
    expect(document.activeElement?.id).toBe('send')
  })

  it('leaves the browser to move between controls in the middle', () => {
    const { panel } = surface(html)
    panel.querySelector<HTMLElement>('#name')!.focus()
    const event = tab()
    expect(trapTab(event, panel)).toBe(false)
    expect(event.defaultPrevented).toBe(false)
  })

  it('places the focused title by document order', () => {
    const { panel } = surface(html)
    panel.querySelector<HTMLElement>('#title')!.focus()
    // Something (✕) is before it, so Shift+Tab is the browser's.
    expect(trapTab(tab(true), panel)).toBe(false)
    const { panel: titled } = surface('<h2 id="t" tabindex="-1">T</h2><button id="only">x</button>')
    titled.querySelector<HTMLElement>('#t')!.focus()
    expect(trapTab(tab(true), titled)).toBe(true)
    expect(document.activeElement?.id).toBe('only')
  })

  it('brings a focus that got out back in', () => {
    const { outside, panel } = surface(html)
    outside.focus()
    expect(trapTab(tab(), panel)).toBe(true)
    expect(document.activeElement?.id).toBe('close')
  })

  it('stands aside for another modal opened over it', () => {
    const { panel } = surface(html)
    const legal = document.body.appendChild(document.createElement('section'))
    legal.setAttribute('aria-modal', 'true')
    const inLegal = legal.appendChild(document.createElement('button'))
    inLegal.focus()
    expect(trapTab(tab(), panel)).toBe(false)
    expect(document.activeElement).toBe(inLegal)
  })

  it('ignores other keys', () => {
    const { panel } = surface(html)
    expect(trapTab(new KeyboardEvent('keydown', { key: 'Enter' }), panel)).toBe(false)
  })
})
