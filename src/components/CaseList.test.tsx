// @vitest-environment jsdom
import { act, createRef } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { CaseList, caseListButton } from './CaseList'

// The satellites as buttons (accessibility audit 2026-11-18, T1): one per case
// in orbit, named by the brand, calling the scene's own selection.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const CASES = [
  { id: 'acme', name: 'Acme' },
  { id: 'globex', name: 'Globex' },
]

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

describe('the case list', () => {
  it('is a named group with one real button per case, named by the brand', () => {
    act(() => root.render(<CaseList cases={CASES} selectedId={null} hidden={false} onSelect={() => true} />))
    const group = container.querySelector('[role="group"]')!
    expect(group.getAttribute('aria-label')).toBe('Casos de éxito')
    const buttons = Array.from(group.querySelectorAll('button'))
    expect(buttons.map((b) => b.textContent)).toEqual(['Acme', 'Globex'])
    expect(buttons.every((b) => b.type === 'button' && b.getAttribute('aria-controls') === 'case-panel')).toBe(true)
  })

  it('selects through the scene, with the case id', () => {
    const onSelect = vi.fn(() => true)
    act(() => root.render(<CaseList cases={CASES} selectedId={null} hidden={false} onSelect={onSelect} />))
    act(() => container.querySelectorAll('button')[1].click())
    expect(onSelect).toHaveBeenCalledWith('globex')
  })

  it('marks the open case as expanded', () => {
    act(() => root.render(<CaseList cases={CASES} selectedId="acme" hidden={false} onSelect={() => true} />))
    const expanded = Array.from(container.querySelectorAll('button')).map((b) => b.getAttribute('aria-expanded'))
    expect(expanded).toEqual(['true', 'false'])
  })

  it('leaves the tab order off Earth, and renders nothing with no cases', () => {
    act(() => root.render(<CaseList cases={CASES} selectedId={null} hidden onSelect={() => true} />))
    expect(container.querySelector<HTMLElement>('.case-list')!.hidden).toBe(true)
    act(() => root.render(<CaseList cases={[]} selectedId={null} hidden={false} onSelect={() => true} />))
    expect(container.querySelector('.case-list')).toBeNull()
  })

  it('finds a case button for the panel to return focus to', () => {
    const ref = createRef<HTMLDivElement>()
    act(() => root.render(<CaseList cases={CASES} selectedId={null} hidden={false} onSelect={() => true} listRef={ref} />))
    expect(caseListButton(ref.current, 'globex')?.textContent).toBe('Globex')
    expect(caseListButton(ref.current, 'nope')).toBeNull()
    expect(caseListButton(null, 'acme')).toBeNull()
  })
})
