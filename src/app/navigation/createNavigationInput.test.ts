// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'

// The control's painted state must derive from the navigation context, never
// from the input loop happening to run. The bug these tests pin down: the loop
// only runs while a gesture is in flight, so opening a panel (audit, case,
// district) never repainted it — it sat at 'idle' while navigation was refused.
// The application notifies `contextChanged()` on the semantic edges, and wiring
// itself derives the initial state.

/** Short enough that a test need not wait five real seconds for the hint. */
const HINT_MS = 30

function setup(initial: Partial<NavigationContext> = {}) {
  // The real markup, because the hint is a SIBLING of the control now and the
  // module finds both by selector. A bare element still works — deliberately, so
  // the accumulator can be driven without any of this — but then there is no
  // hint and no button to assert on.
  const root = document.createElement('div')
  root.innerHTML =
    '<button class="nav-control" data-label-earth="Ir a Murcia" ' +
    'data-label-murcia="Volver a la Tierra"></button>' +
    '<span class="nav-hint"></span>'
  document.body.appendChild(root)
  const context: NavigationContext = { current: 'earth', canNavigate: true, ...initial }
  const commits: string[] = []
  const input = createNavigationInput({
    root,
    hintDelayMs: HINT_MS,
    getContext: () => ({ ...context }),
    onCommit: (intent) => commits.push(intent),
  })
  return {
    root,
    context,
    input,
    commits,
    hint: root.querySelector<HTMLElement>('.nav-hint')!,
    control: root.querySelector<HTMLElement>('.nav-control')!,
  }
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

describe('the gesture hint offers itself once per world', () => {
  it('stays away at first, rather than greeting everyone', () => {
    const { hint, input } = setup({ canNavigate: true })
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('appears after the idle delay', async () => {
    const { hint, input } = setup({ canNavigate: true })
    await after(HINT_MS * 3)
    expect(hint.dataset.visible).toBe('true')
    input.dispose()
  })

  it('never appears while the context is refusing navigation', async () => {
    // The rail used to get this for free by being the hint's parent and lending
    // it every opacity state. A sibling has to be asked.
    const { hint, input } = setup({ canNavigate: false })
    await after(HINT_MS * 3)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('is postponed by a navigation input, because that viewer is not stuck', async () => {
    const { hint, input } = setup({ canNavigate: true })
    await after(HINT_MS * 0.6)
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 20, cancelable: true }))
    await after(HINT_MS * 0.7)
    // The original clock would have fired by now; the wheel restarted it.
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('retires for good in this world once a gesture is in flight', async () => {
    const { hint, input } = setup({ canNavigate: true })
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await twoFrames()
    await after(HINT_MS * 4)
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('hides again the moment it is acted on', async () => {
    const { hint, input } = setup({ canNavigate: true })
    await after(HINT_MS * 3)
    expect(hint.dataset.visible).toBe('true')

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await twoFrames()
    expect(hint.dataset.visible).toBeUndefined()
    input.dispose()
  })

  it('re-arms for the other world, which is left by the opposite gesture', async () => {
    const t = setup({ canNavigate: true })
    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await twoFrames()
    await after(HINT_MS * 4)
    expect(t.hint.dataset.visible).toBeUndefined()

    // Arriving in Murcia. Leaving it is a CLOSE where entering was a spread, so
    // the viewer has demonstrated nothing about the gesture they now need.
    t.context.current = 'murcia'
    t.input.contextChanged()
    await after(HINT_MS * 4)
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
