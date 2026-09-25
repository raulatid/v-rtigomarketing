// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { ClaimDialog } from './ClaimDialog'
import type { ClaimOutcome } from '../experiences/murcia/observer/viewClient'

// What these pin down: the claim is never spent without a valid address AND
// the consent tick; each outcome the server can give reaches the visitor as
// its own screen; and only a final outcome marks the claim settled, so an
// error leaves the offer open for a retry.

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let host: HTMLDivElement
let root: Root

beforeEach(() => {
  host = document.createElement('div')
  document.body.appendChild(host)
  root = createRoot(host)
})

afterEach(() => {
  act(() => root.unmount())
  host.remove()
})

function render(claim: (email: string) => Promise<ClaimOutcome>) {
  const onSettled = vi.fn()
  const onClose = vi.fn()
  act(() => {
    root.render(<ClaimDialog claim={claim} onClose={onClose} onSettled={onSettled} onOpenLegal={() => {}} />)
  })
  return { onSettled, onClose }
}

function type(value: string) {
  const input = host.querySelector<HTMLInputElement>('#claim-email')!
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!
    setter.call(input, value)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

function tick() {
  act(() => {
    host.querySelector<HTMLInputElement>('#claim-consent')!.click()
  })
}

async function submit() {
  await act(async () => {
    host.querySelector<HTMLFormElement>('form')!.requestSubmit()
    await Promise.resolve()
  })
}

describe('the claim dialog', () => {
  it('does not spend the claim without a valid address', async () => {
    const claim = vi.fn()
    render(claim)
    tick()
    type('not-an-address')
    await submit()
    expect(claim).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Escribe un email válido.')
  })

  it('does not spend the claim without the consent tick', async () => {
    const claim = vi.fn()
    render(claim)
    type('a@example.com')
    await submit()
    expect(claim).not.toHaveBeenCalled()
    expect(host.textContent).toContain('Necesitamos tu permiso')
  })

  it('shows the code and settles when the claim wins', async () => {
    const claim = vi.fn(async () => ({ code: 'AAAA-BBBB' }) as ClaimOutcome)
    const { onSettled } = render(claim)
    type('  winner@example.com ')
    tick()
    await submit()
    expect(claim).toHaveBeenCalledWith('winner@example.com')
    expect(host.querySelector('.claim-code')?.textContent).toBe('AAAA-BBBB')
    expect(onSettled).toHaveBeenCalledOnce()
  })

  it('says somebody was first, and settles, when the claim is closed', async () => {
    const { onSettled } = render(async () => ({ code: null, closed: true }))
    type('late@example.com')
    tick()
    await submit()
    expect(host.textContent).toContain('Alguien llegó antes')
    expect(onSettled).toHaveBeenCalledOnce()
  })

  it('offers a retry, without settling, when the claim fails', async () => {
    const { onSettled } = render(async () => {
      throw new Error('network')
    })
    type('a@example.com')
    tick()
    await submit()
    expect(host.querySelector('[role="alert"]')?.textContent).toContain('Inténtalo de nuevo')
    expect(onSettled).not.toHaveBeenCalled()
  })

  it('closes on Escape', () => {
    const { onClose } = render(vi.fn())
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(onClose).toHaveBeenCalled()
  })
})
