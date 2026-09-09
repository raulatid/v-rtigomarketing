// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createHandoffImage } from './handoffImage'

// THE HAZARD THIS FILE EXISTS FOR.
//
// The cover goes up at the moment the blog's route changes, and that is the moment
// `<LazyScene suspended>` sets `frameloop="never"`. From then until the visitor
// comes back, `MurciaExperience.update()` is not called at all — so a dismissal
// driven from the frame loop would be unreachable in precisely the situation it was
// written for, and what is left on screen is a full-screen opaque image over a site
// nobody can use.
//
// So no test below advances a frame. They only advance the clock, which is the
// point: the failsafe belongs to the DOM.

const cover = (): HTMLImageElement | null =>
  document.body.querySelector<HTMLImageElement>('img[data-blog-overlay="handoff"]')

const PIXEL = 'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7'

describe('the handoff cover', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.spyOn(console, 'warn').mockImplementation(() => {})
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
    document.body.innerHTML = ''
  })

  it('mounts hidden, above the scene and below the blog', () => {
    const handoff = createHandoffImage(PIXEL)
    const element = cover()
    expect(element).not.toBeNull()
    expect(element?.style.opacity).toBe('0')
    expect(element?.style.visibility).toBe('hidden')
    expect(element?.style.pointerEvents).toBe('none')
    // 75: over the header at 70, under `.blog-root` at 90. The second half is what
    // makes a forgotten dismissal harmless rather than fatal — the blog paints over
    // this on its own.
    expect(Number(element?.style.zIndex)).toBeGreaterThan(70)
    expect(Number(element?.style.zIndex)).toBeLessThan(90)
    handoff.dispose()
  })

  it('removes itself if nothing dismisses it, with no frame ever running', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.cover()
    expect(cover()).not.toBeNull()

    vi.advanceTimersByTime(6000)

    expect(cover()).toBeNull()
    handoff.dispose()
  })

  it('holds the cover for as long as a blog chunk plausibly takes', () => {
    // The failsafe is a last resort against a broken state, not a timeout on the
    // network. Cutting a slow chunk short would replace a still image with a blank
    // one, which is worse.
    const handoff = createHandoffImage(PIXEL)
    handoff.cover()
    vi.advanceTimersByTime(3000)
    expect(cover()).not.toBeNull()
    handoff.dispose()
  })

  it('is disarmed by a normal dismissal', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.cover()
    handoff.set(0)

    vi.advanceTimersByTime(60_000)

    // Still mounted: the return raises it again, so it is lowered rather than
    // destroyed.
    expect(cover()).not.toBeNull()
    expect(cover()?.style.visibility).toBe('hidden')
    handoff.dispose()
  })

  it('re-arms on a second cover, so a return is protected as well as an approach', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.cover()
    handoff.set(0)
    handoff.cover()

    vi.advanceTimersByTime(6000)

    expect(cover()).toBeNull()
    handoff.dispose()
  })

  it('does not arm on a partial fade', () => {
    // The approach writes an opacity every frame on the way up. Only full cover is
    // a state that can strand anyone.
    const handoff = createHandoffImage(PIXEL)
    handoff.set(0.4)
    handoff.set(0.99)

    vi.advanceTimersByTime(60_000)

    expect(cover()).not.toBeNull()
    handoff.dispose()
  })

  it('dispose removes it and cancels the timer', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.cover()
    handoff.dispose()
    expect(cover()).toBeNull()

    // The timer must not fire into a disposed module and warn about a cover that
    // was taken away deliberately.
    vi.advanceTimersByTime(60_000)
    expect(console.warn).not.toHaveBeenCalled()
  })

  it('writes are inert after dispose', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.dispose()
    handoff.cover()
    handoff.set(1)
    expect(cover()).toBeNull()
  })

  it('clamps whatever a curve hands it', () => {
    const handoff = createHandoffImage(PIXEL)
    handoff.set(4)
    expect(cover()?.style.opacity).toBe('1')
    handoff.set(-2)
    expect(cover()?.style.opacity).toBe('0')
    handoff.set(Number.NaN)
    expect(cover()?.style.opacity).toBe('0')
    handoff.dispose()
  })
})
