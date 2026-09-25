// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { NotFoundPage } from './NotFoundPage'
import { attachHeaderLogo } from '../blog/headerLogoRuntime'
import { COPYRIGHT } from '../content/site'

// The 3D runtime owns a WebGL context, which jsdom has none of. What this page
// promises about it is WHO attaches and WHERE, not what is drawn.
vi.mock('../blog/headerLogoRuntime', () => ({ attachHeaderLogo: vi.fn() }))
vi.mock('../platform/motionPreference', () => ({ prefersReducedMotion: () => false }))

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

type Attachment = Parameters<typeof attachHeaderLogo>[1]

let container: HTMLDivElement
let root: Root
let detach: ReturnType<typeof vi.fn>
let attachments: Attachment[]

beforeEach(() => {
  attachments = []
  detach = vi.fn()
  vi.mocked(attachHeaderLogo).mockImplementation((_container, attachment) => {
    attachments.push(attachment)
    return detach
  })
  // jsdom has no matchMedia; the header reads the phone breakpoint from it.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
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
  vi.mocked(attachHeaderLogo).mockReset()
})

async function mount(goHome: () => void = () => {}) {
  await act(async () => {
    root.render(<NotFoundPage goHome={goHome} />)
  })
  // The hero's dynamic import resolves a microtask later than the render.
  await act(async () => {})
}

describe('NotFoundPage', () => {
  it('says what happened, and offers the way home', async () => {
    await mount()
    expect(container.querySelector('.not-found__code')?.textContent).toBe('404')
    expect(container.querySelector('h1')?.textContent).toBe('Vaya, algo ha pasado')
    expect(container.querySelector('a.not-found__link')?.getAttribute('href')).toBe('/')
    expect(container.querySelector('.blog-footer')?.textContent).toBe(COPYRIGHT)
  })

  it('leaves through the header the way the host says', async () => {
    const goHome = vi.fn()
    await mount(goHome)
    act(() => {
      container.querySelector<HTMLButtonElement>('.blog-back')!.click()
    })
    expect(goHome).toHaveBeenCalledTimes(1)
  })

  it('gives the one 3D instance to the hero, and leaves the header its SVG', async () => {
    await mount()
    expect(attachHeaderLogo).toHaveBeenCalledTimes(1)
    const [stage, attachment] = vi.mocked(attachHeaderLogo).mock.calls[0]
    expect(stage).toBe(container.querySelector('.not-found__stage'))
    expect(attachment.sizeFrom).toBe(container.querySelector('.not-found__glyph'))
    expect(container.querySelector('.blog-topbar__stage')?.hasAttribute('data-gl')).toBe(false)
  })

  it('crossfades on ready and falls back to the SVG on failure', async () => {
    await mount()
    const stage = container.querySelector('.not-found__stage')!
    expect(stage.hasAttribute('data-gl')).toBe(false)
    act(() => attachments[0].onReady())
    expect(stage.getAttribute('data-gl')).toBe('ready')
    act(() => attachments[0].onFailed())
    expect(stage.hasAttribute('data-gl')).toBe(false)
  })

  it('detaches the mark when it leaves', async () => {
    await mount()
    act(() => root.unmount())
    expect(detach).toHaveBeenCalled()
    // afterEach unmounts again; a second unmount of an unmounted root is a no-op.
  })
})
