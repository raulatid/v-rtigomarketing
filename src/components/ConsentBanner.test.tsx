// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The banner reads the consent module, which caches the record at module level
// (the cursorSignal shape) — so every test starts from a fresh module registry,
// and React, the root and the component all come out of that SAME registry:
// a component from one copy of React rendered by another is the "invalid hook
// call" failure, not a test of anything.
async function load() {
  vi.resetModules()
  const [{ act }, { createRoot }, banner, consent] = await Promise.all([
    import('react'),
    import('react-dom/client'),
    import('./ConsentBanner'),
    import('../app/consent'),
  ])
  return { act, createRoot, ConsentBanner: banner.ConsentBanner, ...consent }
}

let reducedMotion = false
let container: HTMLDivElement
let unmount: (() => void) | undefined

beforeEach(() => {
  ;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
  reducedMotion = false
  localStorage.clear()
  vi.useFakeTimers()
  window.matchMedia = ((query: string) => ({
    matches: query === '(prefers-reduced-motion: reduce)' && reducedMotion,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  unmount?.()
  unmount = undefined
  container.remove()
  vi.useRealTimers()
})

async function mount(props: { onOpenLegal?: (doc: string) => void; idPrefix?: string } = {}) {
  const loaded = await load()
  const root = loaded.createRoot(container)
  const onOpenLegal = props.onOpenLegal ?? (() => {})
  loaded.act(() => {
    root.render(<loaded.ConsentBanner onOpenLegal={onOpenLegal} idPrefix={props.idPrefix} />)
  })
  unmount = () => loaded.act(() => root.unmount())
  return loaded
}

const banner = () => container.querySelector<HTMLElement>('.consent-banner')
const info = () => container.querySelector<HTMLButtonElement>('.consent-info')
const button = (name: string) =>
  Array.from(container.querySelectorAll('button')).find((b) => b.textContent === name)

describe('the consent banner', () => {
  it('renders only the policy icon when a choice is already stored', async () => {
    localStorage.setItem(
      'vertigo:consent',
      JSON.stringify({ v: 4, preferences: false, analytics: false, at: '2026-01-01T00:00:00.000Z' }),
    )
    await mount()
    expect(banner()).toBeNull()
    expect(info()?.getAttribute('aria-label')).toBe('Cookies y preferencias')
  })

  it('keeps the policy in reach through the icon', async () => {
    localStorage.setItem(
      'vertigo:consent',
      JSON.stringify({ v: 4, preferences: true, analytics: true, at: '2026-01-01T00:00:00.000Z' }),
    )
    const onOpenLegal = vi.fn()
    const { act } = await mount({ onOpenLegal })
    act(() => info()?.click())
    expect(onOpenLegal).toHaveBeenCalledWith('cookies')
  })

  it('shows no icon while it is still asking', async () => {
    await mount()
    expect(info()).toBeNull()
  })

  it('renders a labelled region with the two choices and the policy link', async () => {
    await mount()
    const region = banner()
    expect(region).not.toBeNull()
    expect(region?.getAttribute('role')).toBe('region')
    expect(region?.dataset.state).toBe('open')
    const title = container.querySelector('#consent-title')
    expect(title).not.toBeNull()
    expect(region?.getAttribute('aria-labelledby')).toBe('consent-title')
    expect(button('Aceptar todas')).toBeDefined()
    expect(button('Rechazar todas')).toBeDefined()
    expect(button('Configurar cookies')).toBeDefined()
  })

  it('does not take focus when it appears', async () => {
    await mount()
    expect(document.activeElement).toBe(document.body)
  })

  it('takes the id prefix the blog hands it', async () => {
    await mount({ idPrefix: 'blog-consent' })
    expect(container.querySelector('#blog-consent-title')).not.toBeNull()
    expect(banner()?.getAttribute('aria-labelledby')).toBe('blog-consent-title')
  })

  it('opens the cookies policy through the caller', async () => {
    const onOpenLegal = vi.fn()
    const { act } = await mount({ onOpenLegal })
    act(() => button('Configurar cookies')?.click())
    expect(onOpenLegal).toHaveBeenCalledWith('cookies')
    expect(banner()).not.toBeNull()
  })

  it('records acceptance, plays the exit, then leaves the icon in its place', async () => {
    const { act, readConsent } = await mount()
    act(() => button('Aceptar todas')?.click())
    expect(readConsent()?.analytics).toBe(true)
    expect(banner()?.dataset.state).toBe('leaving')
    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(banner()).not.toBeNull()
    expect(info()).toBeNull()
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(banner()).toBeNull()
    expect(info()).not.toBeNull()
  })

  it('records a refusal the same way', async () => {
    const { act, readConsent } = await mount()
    act(() => button('Rechazar todas')?.click())
    expect(readConsent()?.analytics).toBe(false)
    expect(banner()?.dataset.state).toBe('leaving')
  })

  it('leaves at once under reduced motion', async () => {
    reducedMotion = true
    const { act } = await mount()
    act(() => button('Aceptar todas')?.click())
    act(() => {
      vi.advanceTimersByTime(60)
    })
    expect(banner()).toBeNull()
  })

  it('goes away when the other copy of it records a choice', async () => {
    const { act, writeConsent } = await mount()
    expect(banner()).not.toBeNull()
    act(() => {
      writeConsent({ analytics: true, preferences: false })
    })
    expect(banner()).toBeNull()
  })
})
