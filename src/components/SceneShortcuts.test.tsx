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
    host.querySelector<HTMLButtonElement>(`.scene-shortcut[data-shortcut='${which}']`)
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
    expect(t.button('blog')!.disabled).toBe(true)
    expect(t.button('services')!.disabled).toBe(true)
  })
})
