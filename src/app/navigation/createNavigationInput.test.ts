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

/** The arrival beat: short enough that a test need not wait a real second. */
const HINT_MS = 30
/**
 * The linger after the first interaction. Longer than the beat, and longer than
 * the two animation frames a gesture assertion waits through — jsdom's frames
 * are ~16ms timers, so a 30ms clock would have closed the hint before the
 * assertion ran.
 */
const HINT_LINGER_MS = 120

function setup(initial: Partial<NavigationContext> = {}) {
  // The real markup, because the hint is a SIBLING of the control now and the
  // module finds both by selector. A bare element still works — deliberately, so
  // the accumulator can be driven without any of this — but then there is no
  // hint and no button to assert on.
  const root = document.createElement('div')
  // A stand-in for the scene, so a press can land on it rather than on a control.
  const canvas = document.createElement('canvas')
  canvas.className = 'scene-canvas'
  document.body.appendChild(canvas)
  root.innerHTML =
    '<button class="nav-control" data-label-earth="Ir a Murcia" ' +
    'data-label-murcia="Volver a la Tierra"></button>' +
    '<span class="nav-hint"></span>'
  document.body.appendChild(root)
  const context: NavigationContext = { current: 'earth', canNavigate: true, ...initial }
  const commits: string[] = []
  let depth = 0
  const input = createNavigationInput({
    root,
    hintLingerMs: HINT_LINGER_MS,
    hintArrivalMs: HINT_MS,
    getContext: () => ({ ...context }),
    onCommit: (intent) => commits.push(intent),
    onZoom: (value) => {
      depth = value
    },
  })
  return {
    root,
    context,
    input,
    commits,
    depth: () => depth,
    progress: () => Number(root.style.getPropertyValue('--nav-progress')) || 0,
    hint: root.querySelector<HTMLElement>('.nav-hint')!,
    canvas,
    control: root.querySelector<HTMLElement>('.nav-control')!,
  }
}

/** One wheel event, in CSS pixels. `deltaMode: 0` is what a browser sends. */
function wheel(deltaY: number) {
  window.dispatchEvent(
    new WheelEvent('wheel', { deltaY, deltaMode: 0, bubbles: true, cancelable: true }),
  )
}

const after = (ms: number) => new Promise((r) => setTimeout(r, ms))
const twoFrames = async () => {
  await new Promise((r) => requestAnimationFrame(r))
  await new Promise((r) => requestAnimationFrame(r))
}

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
    wheel(100_000)
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
    for (let i = 0; i < events; i += 1) wheel(CAP)
    await twoFrames()

    expect(t.depth()).toBeCloseTo(1, 6)
    t.input.dispose()
  })
})

describe('the hint frame is offered on arrival, and closes after the first interaction', () => {
  it('is not on screen at first paint', () => {
    const { hint, input } = setup({ canNavigate: true })
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('appears a beat after the intro hands the world over', async () => {
    // The intro reaching 'site' arrives as a reset, not as a context change.
    const { hint, input } = setup({ canNavigate: true })
    input.reset()
    await after(HINT_MS * 2)
    expect(hint.dataset.visible).toBe('true')
    input.dispose()
  })

  it('appears a beat after a warp settles', async () => {
    const { hint, input } = setup({ canNavigate: true })
    input.settle()
    await after(HINT_MS * 2)
    expect(hint.dataset.visible).toBe('true')
    input.dispose()
  })

  it('does not appear without an arrival, however long the silence', async () => {
    // There is no idle clock any more (2026-09-05, second round): the client
    // asked for one rule, and a hint that came back on a timer was the other.
    const { hint, input } = setup({ canNavigate: true })
    await after(HINT_MS * 4)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('never appears while the context is refusing navigation', async () => {
    // The rail used to get this for free by being the hint's parent and lending
    // it every opacity state. A sibling has to be asked.
    const { hint, input } = setup({ canNavigate: false })
    input.reset()
    await after(HINT_MS * 3)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('keeps an arrival owed until the context stops refusing', async () => {
    // The app settles the machine a render before it clears `transitioning`,
    // so the offer lands on a refusing context. It must be paid on the next
    // edge at the arrival beat.
    const t = setup({ canNavigate: false })
    t.input.settle()
    t.context.canNavigate = true
    t.input.contextChanged()
    await after(HINT_MS * 2)
    expect(t.hint.dataset.visible).toBe('true')
    t.input.dispose()
  })

  it('does not treat a panel closing as an arrival', async () => {
    const t = setup({ canNavigate: false })
    t.context.canNavigate = true
    t.input.contextChanged()
    await after(HINT_MS * 2)
    expect(t.hint.dataset.visible).toBeUndefined()
    t.input.dispose()
  })

  it('stands down while something else owns attention', async () => {
    const t = setup({ canNavigate: true })
    t.input.settle()
    await after(HINT_MS * 2)
    expect(t.hint.dataset.visible).toBe('true')
    t.context.canNavigate = false
    t.input.contextChanged()
    expect(t.hint.dataset.visible).toBeUndefined()
    t.input.dispose()
  })

  it('stays for the linger after the first navigation input, then closes', async () => {
    // THE rule. A viewer who has started doing something has read it; three
    // seconds is enough to finish the sentence, and then it is in the way.
    const { hint, input } = setup({ canNavigate: true })
    input.settle()
    await after(HINT_MS * 2)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await twoFrames()
    expect(hint.dataset.visible).toBe('true')
    // Well inside the linger — the two frames above are jsdom timers too, and
    // a margin of a few milliseconds would make this a coin toss.
    await after(HINT_LINGER_MS * 0.3)
    expect(hint.dataset.visible).toBe('true')
    await after(HINT_LINGER_MS)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('counts a press on the scene as the first interaction', async () => {
    const t = setup({ canNavigate: true })
    t.input.settle()
    await after(HINT_MS * 2)
    t.canvas.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
    await after(HINT_LINGER_MS * 1.2)
    expect(t.hint.dataset.visible).toBeUndefined()
    t.input.dispose()
  })

  it('does not count a press on a control as interacting with the scene', async () => {
    // A tap on the header's button is not the viewer trying the world.
    const t = setup({ canNavigate: true })
    t.input.settle()
    await after(HINT_MS * 2)
    t.control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1 }))
    await after(HINT_LINGER_MS * 1.2)
    expect(t.hint.dataset.visible).toBe('true')
    t.input.dispose()
  })

  it('does not restart the linger on a second interaction', async () => {
    const { hint, input } = setup({ canNavigate: true })
    input.settle()
    await after(HINT_MS * 2)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await after(HINT_LINGER_MS * 0.7)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await after(HINT_LINGER_MS * 0.5)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('ignores an interaction that lands before it is on screen', async () => {
    // The tail of the gesture that carried the viewer here keeps producing
    // events after the arrival (mobile audit M22). Nothing the viewer has not
    // seen can be something they have read.
    const { hint, input } = setup({ canNavigate: true })
    input.settle()
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await after(HINT_MS * 2 + HINT_LINGER_MS)
    expect(hint.dataset.visible).toBe('true')
    input.dispose()
  })

  it('does not come back once closed, until the next arrival', async () => {
    const t = setup({ canNavigate: true })
    t.input.settle()
    await after(HINT_MS * 2)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await after(HINT_LINGER_MS * 1.2)
    expect(t.hint.dataset.visible).toBeUndefined()
    await after(HINT_MS * 3)
    expect(t.hint.dataset.visible).toBeUndefined()

    // Arriving in the other world. Leaving it is a CLOSE where entering was a
    // spread, so the viewer has demonstrated nothing about the gesture they now
    // need.
    t.context.current = 'murcia'
    t.input.contextChanged()
    t.input.settle()
    await after(HINT_MS * 2)
    expect(t.hint.dataset.visible).toBe('true')
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

