// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'
import { NAVIGATION_GESTURE, NAVIGATION_ZOOM } from './navigationConfig'

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
    progress: () => Number(root.style.getPropertyValue('--nav-progress')) || 0,
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
    expect(looks).toEqual([-80, -NAVIGATION_GESTURE.maxEventTravelPx])
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

describe('one event cannot cross the gesture, whichever stage it lands in', () => {
  const CAP = NAVIGATION_GESTURE.maxEventTravelPx

  it('caps an absurd wheel event before either stage sees it', async () => {
    // The hazard `maxEventTravelPx` was written for: macOS momentum delivers
    // hundreds of pixels in the event at the head of a flick, so one physical
    // flick could carry a whole gesture.
    //
    // It used to be enforced inside `navigationGesture`, which was fine while
    // that was the only thing an event could reach. `adr/014` put the zoom band
    // in front of it and briefly broke the guarantee in the worst possible way:
    // the uncapped event saturated the entire band AND overflowed by 99,400px,
    // which the accumulator then clamped to a full 120px push. One notch threw
    // the camera to the end of its travel and banked 40% of a warp.
    const t = setup()
    wheel(-100_000)
    await twoFrames()

    expect(t.depth()).toBeCloseTo(CAP / NAVIGATION_ZOOM.towardTravelPx, 6)
    expect(t.progress()).toBe(0)
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

describe('a world may hold the commit until it is ready to leave', () => {
  // Earth holds `mayCommit` false until the camera is above Spain (DECISIONS §44).
  // A push that reaches the commit meanwhile is HELD — not refused, not decayed —
  // and the transition starts by itself the moment the world allows it.
  const CAP = NAVIGATION_GESTURE.maxEventTravelPx
  const band = Math.ceil(NAVIGATION_ZOOM.towardTravelPx / CAP)
  const push = Math.ceil(NAVIGATION_GESTURE.commitDistancePx / CAP) + 1
  const fillAndPush = () => {
    for (let i = 0; i < band + push; i += 1) wheel(-CAP)
  }

  it('arms, and holds, while the world is not ready', async () => {
    const t = setup({ mayCommit: false })
    fillAndPush()
    await after(150)
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.progress()).toBeGreaterThan(0.5)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('goes by itself, with no further input, the moment the world is ready', async () => {
    const t = setup({ mayCommit: false })
    fillAndPush()
    // Longer than the idle gap: a push that had merely been refused would have
    // decayed to nothing by now.
    await after(NAVIGATION_GESTURE.idleGapSeconds * 1000 + 250)
    expect(t.commits).toEqual([])
    t.context.mayCommit = true
    await after(100)
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('lets go when the viewer zooms back out', async () => {
    const t = setup({ mayCommit: false })
    fillAndPush()
    await after(100)
    wheel(CAP)
    await after(100)
    t.context.mayCommit = true
    await after(150)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('lets go when navigation is refused meanwhile', async () => {
    const t = setup({ mayCommit: false })
    fillAndPush()
    await after(100)
    t.context.canNavigate = false
    await after(100)
    t.context.canNavigate = true
    t.context.mayCommit = true
    await after(150)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('does not hold the accessible control, which has no zoom to line anything up with', () => {
    const t = setup({ mayCommit: false })
    t.control.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })
})

describe('a world may leave at the end of the zoom band', () => {
  // Earth (DECISIONS §44): past the steer threshold the zoom is an approach, so
  // arriving at the end of the band IS the request to leave — no push stage after
  // it for the viewer to find.
  const CAP = NAVIGATION_GESTURE.maxEventTravelPx
  const band = Math.ceil(NAVIGATION_ZOOM.towardTravelPx / CAP)

  it('commits the moment the band reaches its limit, with no push after it', async () => {
    const t = setup({ commitAtBandEnd: true })
    for (let i = 0; i < band - 1; i += 1) wheel(-CAP)
    await after(100)
    expect(t.commits).toEqual([])
    wheel(-CAP)
    await after(100)
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('still needs the whole band: one enormous event does not navigate', async () => {
    const t = setup({ commitAtBandEnd: true })
    wheel(-100_000)
    await after(100)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('holds at the limit while the world is not ready, then goes by itself', async () => {
    const t = setup({ commitAtBandEnd: true, mayCommit: false })
    for (let i = 0; i < band; i += 1) wheel(-CAP)
    await after(NAVIGATION_GESTURE.idleGapSeconds * 1000 + 250)
    expect(t.commits).toEqual([])
    t.context.mayCommit = true
    await after(100)
    expect(t.commits).toEqual(['enter-murcia'])
    t.input.dispose()
  })

  it('lets go of the held commit when the viewer zooms back out', async () => {
    const t = setup({ commitAtBandEnd: true, mayCommit: false })
    for (let i = 0; i < band; i += 1) wheel(-CAP)
    await after(100)
    wheel(CAP)
    await after(100)
    t.context.mayCommit = true
    await after(150)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })

  it('leaves a world without it parked at the limit, waiting for the push', async () => {
    const t = setup()
    for (let i = 0; i < band; i += 1) wheel(-CAP)
    await after(150)
    expect(t.depth()).toBeCloseTo(1, 6)
    expect(t.commits).toEqual([])
    t.input.dispose()
  })
})
