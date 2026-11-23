// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SceneShortcuts, type SceneShortcutsProps } from './SceneShortcuts'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const roots: Root[] = []
afterEach(() => {
  for (const root of roots.splice(0)) act(() => root.unmount())
  document.body.innerHTML = ''
})

function mount(props: Partial<SceneShortcutsProps> = {}) {
  const host = document.createElement('div')
  const container = document.createElement('div')
  document.body.append(host, container)
  const onBlog = vi.fn()
  const onServices = vi.fn()
  const root = createRoot(container)
  roots.push(root)
  act(() =>
    root.render(
      <SceneShortcuts ready triggerHost={host} disabled={false} onBlog={onBlog} onServices={onServices} {...props} />,
    ),
  )
  const button = (which: 'blog' | 'services') =>
    host.querySelector<HTMLElement>(`.scene-shortcut[data-shortcut='${which}']`)
  return { host, container, button, onBlog, onServices }
}

describe('SceneShortcuts', () => {
  it('puts Blog then Servicios into the header cell, not where it is mounted', () => {
    const t = mount()
    const labels = [...t.host.querySelectorAll('.scene-shortcut')].map((b) => b.textContent)
    expect(labels).toEqual(['Blog', 'Servicios'])
    expect(t.container.children).toHaveLength(0)
  })

  it('renders nothing before the site phase', () => {
    const t = mount({ ready: false })
    expect(t.host.children).toHaveLength(0)
  })

  it('calls the matching handler on a press', () => {
    const t = mount()
    act(() => t.button('blog')!.click())
    act(() => t.button('services')!.click())
    expect(t.onBlog).toHaveBeenCalledTimes(1)
    expect(t.onServices).toHaveBeenCalledTimes(1)
  })

  it('offers neither while disabled', () => {
    const t = mount({ disabled: true })
    expect(t.button('blog')!.getAttribute('aria-disabled')).toBe('true')
    act(() => t.button('blog')!.click())
    expect(t.onBlog).not.toHaveBeenCalled()
    expect((t.button('services') as HTMLButtonElement).disabled).toBe(true)
  })

  // Accessibility audit 2026-11-18, G1: a crawlable link that still flies.
  it('makes Blog a real link to /blog whose plain click is the journey, not a page load', () => {
    const t = mount()
    const blog = t.button('blog')!
    expect(blog.tagName).toBe('A')
    expect(blog.getAttribute('href')).toBe('/blog')
    const plain = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })
    act(() => {
      blog.dispatchEvent(plain)
    })
    expect(plain.defaultPrevented).toBe(true)
    expect(t.onBlog).toHaveBeenCalledTimes(1)
  })

  it('leaves a modified click to the browser, which opens the blog elsewhere', () => {
    const t = mount()
    const withCtrl = new MouseEvent('click', { bubbles: true, cancelable: true, button: 0, ctrlKey: true })
    act(() => {
      t.button('blog')!.dispatchEvent(withCtrl)
    })
    expect(withCtrl.defaultPrevented).toBe(false)
    expect(t.onBlog).not.toHaveBeenCalled()
  })
})
