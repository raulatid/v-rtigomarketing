// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CasePanel } from './CasePanel'

// The case's next step: the panel ends with a doorway into the audit when it
// is given one, and renders no dead link when it is not.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  container = document.createElement('div')
  document.body.appendChild(container)
  root = createRoot(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
})

describe('the case panel ends one step from the audit', () => {
  it('offers the audit and asks for it when pressed', () => {
    const onRequestAudit = vi.fn()
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} onRequestAudit={onRequestAudit} />)
    })
    const next = container.querySelector<HTMLButtonElement>('.case-panel__next')
    expect(next).not.toBeNull()
    expect(next!.textContent).toContain('Solicita la auditoría')
    act(() => next!.click())
    expect(onRequestAudit).toHaveBeenCalledTimes(1)
  })

  it('renders no doorway without an audit behind it', () => {
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} />)
    })
    expect(container.querySelector('.case-panel__next')).toBeNull()
  })

  it('keeps the doorway out of the tab order while no case is shown', () => {
    // The panel stays mounted while hidden; its controls must not be tabbable.
    act(() => {
      root.render(<CasePanel data={null} onClose={() => {}} onRequestAudit={() => {}} />)
    })
    expect(container.querySelector('.case-panel__next')!.getAttribute('tabindex')).toBe('-1')
  })
})
