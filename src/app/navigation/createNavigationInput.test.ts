// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'
import { NAVIGATION_COOLDOWN, NAVIGATION_ZOOM } from './navigationConfig'

// The control's painted state must derive from the navigation context, never
// from the input loop happening to run. The bug these tests pin down: the loop
// only runs while a gesture is in flight, so opening a panel (audit, case,
// district) never repainted it — it sat at 'idle' while navigation was refused.
// The application notifies `contextChanged()` on the semantic edges, and wiring
// itself derives the initial state.

function setup(initial: Partial<NavigationContext> = {}) {
  // The real markup, because the module finds the control by selector. A bare
  // element still works — deliberately, so the accumulator can be driven without
  // any of this — but then there is no button to assert on.
  const root = document.createElement('div')
  root.innerHTML =
    '<button class="nav-control" data-label-earth="Ir a Murcia" ' +
    'data-label-murcia="Volver a la Tierra"></button>'
  document.body.appendChild(root)
  const context: NavigationContext = { current: 'earth', canNavigate: true, ...initial }
  const commits: string[] = []
  let depth = 0
  const looks: number[] = []
  const input = createNavigationInput({
    root,
    getContext: () => ({ ...context }),
    onCommit: (intent) => commits.push(intent),
    onZoom: (value) => {
      depth = value
    },
    onLook: (dx) => looks.push(dx),
  })
  return {
    root,
    context,
    input,
    commits,
    looks,
    depth: () => depth,
    control: root.querySelector<HTMLElement>('.nav-control')!,
  }
}

/** One wheel event, in CSS pixels. `deltaMode: 0` is what a browser sends. */
function wheel(deltaY: number, deltaX = 0, deltaMode = 0) {
  window.dispatchEvent(
    new WheelEvent('wheel', { deltaY, deltaX, deltaMode, bubbles: true, cancelable: true }),
  )
}

const after = (ms: number) => new Promise((r) => setTimeout(r, ms))
const twoFrames = async () => {
  await new Promise((r) => requestAnimationFrame(r))
  await new Promise((r) => requestAnimationFrame(r))
}

describe('explicit destination navigation', () => {
  it('returns from Murcia once and preserves the zoom until the covered cut', () => {
    const { input, commits, depth, root } = setup({ current: 'murcia' })
    wheel(40)
    const departureDepth = depth()
    input.navigateTo('earth')
    input.navigateTo('earth')
    wheel(120)
    expect(commits).toEqual(['exit-murcia'])
    expect(root.dataset.state).toBe('locked')
    expect(depth()).toBe(departureDepth)
    input.resetZoom()
    expect(depth()).toBe(0)
    input.dispose()
  })

  it('does not toggle back to Murcia when already on Earth', () => {
    const { input, commits } = setup()
    expect(input.navigateTo('earth')).toBe(false)
    expect(commits).toEqual([])
    input.dispose()
  })

  it('says whether it committed, so an arrival is only waited for when one is coming', () => {
    const { input, context, commits } = setup({ current: 'murcia' })
    context.canNavigate = false
    expect(input.navigateTo('earth')).toBe(false)
    context.canNavigate = true
    expect(input.navigateTo('earth')).toBe(true)
    expect(commits).toEqual(['exit-murcia'])
    input.dispose()
  })

  it('checks live attention and never closes a focused district', () => {
    let releases = 0
    const { input, context, commits } = setup({ current: 'murcia' })
    context.canNavigate = false
    context.releaseFocus = () => { releases += 1 }
    input.navigateTo('earth')
    expect(commits).toEqual([])
    expect(releases).toBe(0)
    context.canNavigate = true
    input.navigateTo('earth')
    expect(commits).toEqual(['exit-murcia'])
    input.dispose()
  })
})

// A trackpad's two-finger sideways swipe arrives as deltaX, which the wheel used
// to drop — and the stray deltaY of a swipe meant to turn zoomed the city.
describe('wheel rotation follows camera zoom in both worlds', () => {
  it.each([
    ['earth', -40, 1],
    ['earth', 40, -1],
    ['murcia', -40, -1],
    ['murcia', 40, 1],
  ] as const)('%s maps deltaY %s to depth sign %s', (current, deltaY, sign) => {
    const { input, depth } = setup({ current })
    // Positive depth approaches Murcia from Earth, but pulls away from Murcia.
    // Negative deltaY must therefore produce opposite depth signs in each world.
    wheel(deltaY)
    expect(Math.sign(depth())).toBe(sign)
    input.dispose()
  })
})

describe('a horizontal wheel swipe in Murcia turns rather than zooms', () => {
  it('sends a deltaX-dominant event to onLook, signed like a drag, and leaves the zoom alone', () => {
    const { input, looks, depth } = setup({ current: 'murcia' })
    // Natural scrolling: fingers moving right report a negative deltaX.
    wheel(4, -40)
    expect(looks).toEqual([40])
    expect(depth()).toBe(0)
    input.dispose()
  })

  it('normalises line units and caps each event like travel', () => {
    const { input, looks } = setup({ current: 'murcia' })
    wheel(0, 5, 1)
    wheel(0, 20, 1)
    expect(looks).toEqual([-80, -NAVIGATION_ZOOM.maxEventTravelPx])
    input.dispose()
  })

  it('sends a vertical-dominant diagonal to the zoom and does not turn', () => {
    const { input, looks, depth } = setup({ current: 'murcia' })
    wheel(-40, 10)
    expect(looks).toEqual([])
    expect(depth()).toBeLessThan(0)
    input.dispose()
  })

  it('turns nothing while navigation is refused', () => {
    const { input, looks, depth } = setup({ current: 'murcia', canNavigate: false })
    wheel(0, -40)
    expect(looks).toEqual([])
    expect(depth()).toBe(0)
    input.dispose()
  })

  it('uses vertical wheel input on Earth even in a horizontal-dominant swipe', () => {
    const { input, looks, depth } = setup({ current: 'earth' })
    wheel(-10, -40)
    expect(looks).toEqual([])
    expect(depth()).toBeGreaterThan(0)
    input.dispose()
  })
})

describe('painted state derives from the navigation context', () => {
  it('paints the context state at wiring time, before any input event', () => {
    const { root, input } = setup({ canNavigate: false })
    expect(root.dataset.state).toBe('suppressed')
    input.dispose()
  })

  it('paints idle at wiring time when navigation is available', () => {
    const { root, input } = setup({ canNavigate: true })
    expect(root.dataset.state).toBe('idle')
    input.dispose()
  })

  it('contextChanged() re-derives the state with no wheel event involved', () => {
    const { root, context, input } = setup({ canNavigate: true })
    expect(root.dataset.state).toBe('idle')

    context.canNavigate = false
    input.contextChanged()
    expect(root.dataset.state).toBe('suppressed')

    context.canNavigate = true
    input.contextChanged()
    expect(root.dataset.state).toBe('idle')
    input.dispose()
  })

  it('derives the travel direction from the current experience', () => {
    const { root, context, input } = setup({ current: 'earth' })
    expect(root.dataset.direction).toBe('down')

    context.current = 'murcia'
    input.contextChanged()
    expect(root.dataset.direction).toBe('up')
    input.dispose()
  })
})

describe('one event cannot cross the zoom band from rest', () => {
  const CAP = NAVIGATION_ZOOM.maxEventTravelPx

  it('caps an absurd wheel event before the band sees it', async () => {
    // An extreme wheel impulse may move at most one capped step.
    const t = setup()
    wheel(-100_000)
    await twoFrames()

    expect(t.depth()).toBeCloseTo(CAP / NAVIGATION_ZOOM.towardTravelPx, 6)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('still lets a stream of ordinary events cross it', async () => {
    // The other half, without which the cap above is satisfiable by refusing
    // everything. The band is travel, not a rate limit: enough events get there.
    const t = setup()
    const events = Math.ceil(NAVIGATION_ZOOM.towardTravelPx / CAP)
    for (let i = 0; i < events; i += 1) wheel(-CAP)
    await twoFrames()

    expect(t.depth()).toBeCloseTo(1, 6)
    t.input.dispose()
  })
})

describe('the accessible control is the path a pinch cannot be', () => {
  it('names the destination, and renames it when the world changes', () => {
    const t = setup({ canNavigate: true })
    expect(t.control.getAttribute('aria-label')).toBe('Ir a Murcia')

    t.context.current = 'murcia'
    t.input.contextChanged()
    expect(t.control.getAttribute('aria-label')).toBe('Volver a la Tierra')
    t.input.dispose()
  })

  it('commits outright on Enter', () => {
    // A button, not the slider this replaced. Deliberateness is the answer to
    // "an accidental scroll must not warp you"; there is no accidental Enter on
    // a control you had to tab to and which announced its destination first.
    const t = setup({ canNavigate: true })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('commits outright on Space', () => {
    const t = setup({ canNavigate: true })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }))
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('commits on a click, for switch access and assistive activation', () => {
    const t = setup({ canNavigate: true })
    t.control.dispatchEvent(new MouseEvent('click', { bubbles: true }))
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('leaves every other key alone', () => {
    const t = setup({ canNavigate: true })
    for (const key of ['ArrowDown', 'ArrowUp', 'PageDown', 'a', 'Tab', 'Escape']) {
      t.control.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }))
    }
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('leaves the direction it would travel readable while it does so', () => {
    const t = setup({ current: 'murcia' })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(t.commits).toEqual(['exit-murcia'])
    t.input.dispose()
  })

  it('refuses when the context refuses, like every other path', () => {
    const t = setup({ canNavigate: false })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('cannot be double-fired into two transitions', () => {
    // The machine locks synchronously on the committing event, so the second
    // press has nothing legal left to do — the same guard the wheel gets.
    const t = setup({ canNavigate: true })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })
})

describe('a world may leave at the end of the zoom band', () => {
  // The shared threshold is the end of the band, with no extra push.
  const CAP = NAVIGATION_ZOOM.maxEventTravelPx
  const band = Math.ceil(NAVIGATION_ZOOM.towardTravelPx / CAP)

  it('commits the moment the band reaches its limit, with no push after it', async () => {
    const t = setup({})
    for (let i = 0; i < band - 1; i += 1) wheel(-CAP)
    await after(100)
    expect(t.commits).toEqual([])
    wheel(-CAP)
    await after(100)
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('still needs the whole band: one enormous event does not navigate', async () => {
    const t = setup({})
    wheel(-100_000)
    await after(100)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('lets go when the viewer zooms back out before the frame that would commit', async () => {
    // Events arrive between frames. Reaching the limit and leaving it again
    // inside one frame is a viewer who changed their mind, not a request.
    const t = setup({})
    for (let i = 0; i < band; i += 1) wheel(-CAP)
    wheel(CAP)
    await after(150)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('commits at the same threshold leaving Murcia', async () => {
    const t = setup({ current: 'murcia' })
    for (let i = 0; i < band - 1; i += 1) wheel(CAP)
    await twoFrames()
    expect(t.commits).toEqual([])
    wheel(CAP)
    await twoFrames()
    expect(t.commits).toEqual(['exit-murcia'])
    t.input.dispose()
  })

  it('refuses a commit if attention changes before its frame, then accepts a fresh notch', async () => {
    const t = setup()
    for (let i = 0; i < band; i += 1) wheel(-CAP)
    t.context.canNavigate = false
    await twoFrames()
    expect(t.commits).toEqual([])
    wheel(CAP)
    expect(t.depth()).toBe(1)
    t.context.canNavigate = true
    wheel(-CAP)
    await twoFrames()
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

})

// Fake time and event timestamps share an origin, as they do in the browser.
describe('momentum protection through real input', () => {
  afterEach(() => vi.useRealTimers())

  function timedWheel(deltaY: number) {
    const event = new WheelEvent('wheel', { deltaY, cancelable: true })
    Object.defineProperty(event, 'timeStamp', { value: performance.now() })
    window.dispatchEvent(event)
  }

  it('keeps the explicit-action latch across reset and releases only after a quiet gap', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    const t = setup({ current: 'murcia' })
    try {
      t.input.navigateTo('earth')
      t.input.reset()
      await vi.advanceTimersByTimeAsync(415)
      timedWheel(120)
      expect(t.depth()).toBe(0)
      await vi.advanceTimersByTimeAsync(415)
      timedWheel(120)
      expect(t.depth()).toBe(0)
      await vi.advanceTimersByTimeAsync(NAVIGATION_COOLDOWN.latchGapSeconds * 1000)
      timedWheel(120)
      expect(t.depth()).toBeCloseTo(0.1)
    } finally { t.input.dispose() }
  })

  it('records refused input, latches on the cooldown deadline, and never re-enters after leaving Murcia', async () => {
    vi.useFakeTimers({ toFake: ['performance', 'requestAnimationFrame', 'cancelAnimationFrame'] })
    const t = setup({ current: 'murcia' })
    try {
      for (let i = 0; i < 10; i++) timedWheel(120)
      await vi.advanceTimersByTimeAsync(32)
      expect(t.commits).toEqual(['exit-murcia'])
      t.context.current = 'earth'
      t.input.resetZoom()
      t.input.settle()
      for (let i = 0; i < 40; i++) {
        timedWheel(i % 2 ? -120 : 120)
        await vi.advanceTimersByTimeAsync(50)
        expect(t.depth()).toBe(0)
      }
      expect(t.root.dataset.state).toBe('idle')
      expect(t.commits).toEqual(['exit-murcia'])
      await vi.advanceTimersByTimeAsync(NAVIGATION_COOLDOWN.latchGapSeconds * 1000)
      for (let i = 0; i < 10; i++) timedWheel(-120)
      await vi.advanceTimersByTimeAsync(32)
      expect(t.commits).toEqual(['exit-murcia', 'enter-murcia'])
    } finally { t.input.dispose() }
  })
})
