// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { AuditSection } from './AuditSection'
import type { AuditRequest } from '../app/auditSubmission'

// The submission flow's state model: idle → submitting → success | error.
// What these pin down, in order of importance:
//  - a valid submission must NOT silently close the panel (the old prototype
//    behaviour): the person is told their request was received, in-panel;
//  - while the request is in flight the submit control refuses a second one;
//  - a failure keeps everything that was typed and offers a retry;
//  - the "Paso 01 / 02" label is gone — there is no step 2.
//
// The transport is injected: these are presentation tests, and the real
// transport's honesty rules are auditSubmission.test.ts's business.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

const VALID: Record<string, string> = {
  name: 'Nombre Prueba',
  email: 'prueba@example.com',
  website: 'https://example.com',
}

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  vi.useFakeTimers()
  // jsdom has no matchMedia; the section reads it on open and in an effect.
  window.matchMedia = ((query: string) => ({
    matches: false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    onchange: null,
    dispatchEvent: () => false,
  })) as typeof window.matchMedia
  container = document.createElement('div')
  document.body.appendChild(container)
})

afterEach(() => {
  act(() => root.unmount())
  container.remove()
  vi.useRealTimers()
})

function mount(submit: (data: AuditRequest) => Promise<void>) {
  root = createRoot(container)
  act(() => {
    root.render(<AuditSection onOpenChange={() => {}} ready active submit={submit} />)
  })
}

/** Native-setter write + input event, so React's controlled input sees it. */
function type(el: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function pick(el: HTMLSelectElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!
  setter.call(el, value)
  el.dispatchEvent(new Event('change', { bubbles: true }))
}

function openAndFill() {
  act(() => {
    document.querySelector<HTMLButtonElement>('.audit-trigger')!.click()
  })
  act(() => {
    vi.advanceTimersByTime(1500) // past ENTER_MS: phase 'open'
  })
  act(() => {
    pick(document.querySelector<HTMLSelectElement>('#audit-plan')!, 'completa')
    type(document.querySelector<HTMLInputElement>('#audit-name')!, VALID.name)
    type(document.querySelector<HTMLInputElement>('#audit-email')!, VALID.email)
    type(document.querySelector<HTMLInputElement>('#audit-website')!, VALID.website)
  })
}

function submitForm() {
  act(() => {
    document
      .querySelector<HTMLFormElement>('.audit-form')!
      .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
  })
}

describe('audit form submission states', () => {
  it('shows the in-panel success state instead of closing', async () => {
    mount(() => Promise.resolve())
    openAndFill()
    submitForm()
    await act(async () => {})

    const overlay = document.querySelector('.audit-overlay')!
    expect(overlay.getAttribute('data-state')).toBe('open')
    expect(document.querySelector('.audit-success')).not.toBeNull()
    expect(document.body.textContent).toMatch(/recibid/i)
  })

  it('refuses a second submission while one is in flight', async () => {
    let resolveSubmit: () => void = () => {}
    const submit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          resolveSubmit = resolve
        }),
    )
    mount(submit)
    openAndFill()
    submitForm()
    await act(async () => {})

    expect(document.querySelector<HTMLButtonElement>('.audit-cta')!.disabled).toBe(true)
    submitForm()
    expect(submit).toHaveBeenCalledTimes(1)

    await act(async () => {
      resolveSubmit()
    })
    expect(document.querySelector('.audit-success')).not.toBeNull()
  })

  it('keeps what was typed and offers a retry when the submission fails', async () => {
    let attempts = 0
    mount(() => {
      attempts += 1
      return attempts === 1 ? Promise.reject(new Error('down')) : Promise.resolve()
    })
    openAndFill()
    submitForm()
    await act(async () => {})

    // The failure is told, the data survives, the control is usable again.
    expect(document.body.textContent).toMatch(/no se ha podido/i)
    expect(document.querySelector<HTMLInputElement>('#audit-email')!.value).toBe(VALID.email)
    expect(document.querySelector<HTMLButtonElement>('.audit-cta')!.disabled).toBe(false)

    submitForm()
    await act(async () => {})
    expect(document.querySelector('.audit-success')).not.toBeNull()
  })

  it('carries no step label: the form is one step', () => {
    mount(() => Promise.resolve())
    openAndFill()
    expect(document.body.textContent).not.toMatch(/paso\s*0?1/i)
  })
})
