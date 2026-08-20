// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'
import { createNavigationInput } from './createNavigationInput'
import type { NavigationContext } from './createNavigationInput'

// The rail's visual state must derive from the navigation context, never from
// the input loop happening to run. The bug these tests pin down: the loop only
// runs while a gesture is in flight, so opening a panel (audit, case, district)
// never repainted the rail — it sat at 'idle', fully visible, while navigation
// was refused. The application now notifies `contextChanged()` on the semantic
// edges, and wiring itself derives the initial state.

function setup(initial: Partial<NavigationContext> = {}) {
  const rail = document.createElement('div')
  document.body.appendChild(rail)
  const context: NavigationContext = { current: 'earth', canNavigate: true, ...initial }
  const input = createNavigationInput({
    rail,
    getContext: () => ({ ...context }),
    onCommit: () => {},
  })
  return { rail, context, input }
}

describe('rail state derives from the navigation context', () => {
  it('paints the context state at wiring time, before any input event', () => {
    const { rail, input } = setup({ canNavigate: false })
    expect(rail.dataset.state).toBe('suppressed')
    input.dispose()
  })

  it('paints idle at wiring time when navigation is available', () => {
    const { rail, input } = setup({ canNavigate: true })
    expect(rail.dataset.state).toBe('idle')
    input.dispose()
  })

  it('contextChanged() re-derives the state with no wheel event involved', () => {
    const { rail, context, input } = setup({ canNavigate: true })
    expect(rail.dataset.state).toBe('idle')

    context.canNavigate = false
    input.contextChanged()
    expect(rail.dataset.state).toBe('suppressed')

    context.canNavigate = true
    input.contextChanged()
    expect(rail.dataset.state).toBe('idle')
    input.dispose()
  })

  it('derives the travel direction from the current experience', () => {
    const { rail, context, input } = setup({ current: 'earth' })
    expect(rail.dataset.direction).toBe('down')

    context.current = 'murcia'
    input.contextChanged()
    expect(rail.dataset.direction).toBe('up')
    input.dispose()
  })
})

describe('the gesture hint dismisses once, on the first real gesture', () => {
  it('sets data-hint-dismissed on the first active frame and never clears it', async () => {
    const { rail, input } = setup({ canNavigate: true })
    // The hint's whole lifecycle is presentation state on the rail: nothing at
    // wiring time, dismissed by the first gesture, and never resurrected — a
    // reset returns progress to zero but must not re-teach a gesture the
    // viewer has already proven they know.
    expect(rail.dataset.hintDismissed).toBeUndefined()

    window.dispatchEvent(new WheelEvent('wheel', { deltaY: 200, cancelable: true }))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    await new Promise((resolve) => requestAnimationFrame(resolve))
    expect(rail.dataset.hintDismissed).toBe('true')

    input.contextChanged()
    input.reset()
    expect(rail.dataset.hintDismissed).toBe('true')
    input.dispose()
  })
})
