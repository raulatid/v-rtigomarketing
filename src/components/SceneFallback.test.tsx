// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { SceneFallback } from './SceneFallback'

// The page without its scene (accessibility audit 2026-11-18, D1): what is
// still possible, as real controls, with the focus on it.

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
})

/** Two frames: the fallback looks after the dialog has given its focus back. */
const frames = () => act(() => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))))

const render = (props: Partial<Parameters<typeof SceneFallback>[0]> = {}) => {
  const handlers = { onContact: vi.fn(), onAudit: vi.fn() }
  act(() => root.render(<SceneFallback {...handlers} dialogOpen={false} {...props} />))
  return handlers
}

describe('the page without its scene', () => {
  it('is a region named by its title, and takes the focus there', () => {
    render()
    const region = container.querySelector('section')!
    const title = document.getElementById(region.getAttribute('aria-labelledby')!)!
    expect(title.tagName).toBe('H2')
    expect(document.activeElement).toBe(title)
  })

  it('does not take the focus from a dialog already open over it', () => {
    const field = document.body.appendChild(document.createElement('input'))
    field.focus()
    render({ dialogOpen: true })
    expect(document.activeElement).toBe(field)
    field.remove()
  })

  it('offers the audit, contact and a real link to the blog', () => {
    const handlers = render()
    const [audit, contact] = Array.from(container.querySelectorAll('button'))
    act(() => audit.click())
    act(() => contact.click())
    expect(handlers.onAudit).toHaveBeenCalledTimes(1)
    expect(handlers.onContact).toHaveBeenCalledTimes(1)
    expect(container.querySelector('a')!.getAttribute('href')).toBe('/blog')
  })

  it('takes the focus back to the button that opened a dialog when the dialog drops it', async () => {
    const handlers = render()
    const contact = container.querySelectorAll('button')[1]
    act(() => contact.click())
    render({ ...handlers, dialogOpen: true })
    act(() => (document.activeElement as HTMLElement).blur())
    render({ ...handlers, dialogOpen: false })
    await frames()
    expect(document.activeElement).toBe(contact)
  })

  it('leaves the focus where the dialog put it', async () => {
    const handlers = render()
    const trigger = document.body.appendChild(document.createElement('button'))
    act(() => container.querySelector('button')!.click())
    render({ ...handlers, dialogOpen: true })
    trigger.focus()
    render({ ...handlers, dialogOpen: false })
    await frames()
    expect(document.activeElement).toBe(trigger)
    trigger.remove()
  })
})
