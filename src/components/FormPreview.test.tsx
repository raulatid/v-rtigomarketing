// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, expect, it, vi } from 'vitest'
import { ContactSection } from './ContactSection'
import { AuditSection } from './AuditSection'
import { auditView } from '../app/auditView'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true
let root: Root
let container: HTMLDivElement
beforeEach(() => {
  container = document.createElement('div')
  document.body.append(container)
  root = createRoot(container)
})
afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.restoreAllMocks()
})

it('renders the contact draft, updates its confirmation, and refuses submissions', () => {
  const submit = vi.fn()
  const focus = vi.spyOn(HTMLElement.prototype, 'focus')
  const preview = {state: 'form' as const, bookingUrl: '', bookingLabel: '',
    phones: [{label: 'Oficina', display: '123 456', tel: '123456'}], successTitle: 'Recibido', successBody: 'Texto del borrador'}
  const render = (state: 'form' | 'success') => act(() => root.render(<ContactSection
    ready={false} suppressed={false} onOpenChange={() => {}} onOpenLegal={() => {}}
    submit={submit} preview={{...preview, state}} />))
  render('form')
  expect(container.querySelectorAll('.contact-field')).toHaveLength(3)
  expect(container.textContent).toContain('123 456')
  act(() => {container.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))})
  expect(submit).not.toHaveBeenCalled()
  render('success')
  expect(container.querySelector('.contact-success')?.textContent).toContain('Texto del borrador')
  expect(container.querySelector('form')).toBeNull()
  expect(focus).not.toHaveBeenCalled()
})

it('uses draft audit ranges without changing camera state or submitting', () => {
  const submit = vi.fn()
  const initial = {...auditView}
  const preview = {state: 'form' as const, revenueRanges: ['Rango del borrador'], successTitle: 'Recibido', successBody: 'Respuesta del borrador'}
  act(() => root.render(<AuditSection ready={false} onOpenChange={() => {}} onOpenLegal={() => {}}
    submit={submit} preview={preview} />))
  expect(container.querySelectorAll('.audit-field')).toHaveLength(7)
  expect(container.querySelector('#audit-revenue')?.textContent).toContain('Rango del borrador')
  act(() => {container.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}))})
  expect(submit).not.toHaveBeenCalled()
  expect(auditView).toEqual(initial)
  act(() => root.render(<AuditSection ready={false} onOpenChange={() => {}} onOpenLegal={() => {}}
    submit={submit} preview={{...preview, state: 'success'}} />))
  expect(container.querySelector('.audit-success')?.textContent).toContain('Respuesta del borrador')
})
