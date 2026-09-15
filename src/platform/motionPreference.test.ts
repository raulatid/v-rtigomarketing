// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

afterEach(() => {
  vi.unstubAllGlobals()
  vi.resetModules()
})

describe('document motion policy', () => {
  it('inherits boot even when the system preference changes before app startup', async () => {
    const matchMedia = vi.fn(() => ({ matches: false }))
    vi.stubGlobal('window', { __vertigoIntro: { reducedMotion: true }, matchMedia })
    const { prefersReducedMotion } = await import('./motionPreference')
    expect(prefersReducedMotion()).toBe(true)
    expect(matchMedia).not.toHaveBeenCalled()
  })

  it.each([false, true])('keeps the cold document snapshot %s for late mounts and warm navigation', async (initial) => {
    let matches = initial
    const matchMedia = vi.fn(() => ({ matches }))
    vi.stubGlobal('window', { matchMedia })
    const early = await import('./motionPreference')
    expect(early.prefersReducedMotion()).toBe(initial)
    matches = !initial
    const late = await import('./motionPreference')
    expect(late.prefersReducedMotion()).toBe(initial)
    expect(matchMedia).toHaveBeenCalledTimes(1)

    // A new module registry represents a new document, not a route transition.
    vi.resetModules()
    const nextDocument = await import('./motionPreference')
    expect(nextDocument.prefersReducedMotion()).toBe(!initial)
  })

  it('does not cache a server-side fallback before a browser exists', async () => {
    vi.stubGlobal('window', undefined)
    const { prefersReducedMotion } = await import('./motionPreference')
    expect(prefersReducedMotion()).toBe(false)
    vi.stubGlobal('window', { matchMedia: () => ({ matches: true }) })
    expect(prefersReducedMotion()).toBe(true)
  })

  it('supports documents without matchMedia', async () => {
    vi.stubGlobal('window', {})
    const { prefersReducedMotion } = await import('./motionPreference')
    expect(prefersReducedMotion()).toBe(false)
  })
})
