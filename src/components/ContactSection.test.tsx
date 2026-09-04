// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone list is rendered from CONTENT, and the content is whatever is in
// Sanity on the day the build ran. Mocking it is what makes this a test of the
// RENDERING rather than of the client's current phone numbers — the same reason
// AuditSection injects its transport. One labelled entry and one without, which
// is the pair the layout has to hold: the numbers must still line up.
vi.mock('../content/site', () => ({
  SITE_PHONES: [
    { label: 'Madrid', display: '+34 910 00 00 00', tel: '+34910000000' },
    { display: '+34 600 000 001', tel: '+34600000001' },
  ],
}))

import { ContactSection } from './ContactSection'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
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
})

/** `triggerHost={null}` renders the trigger inline — the component's own test seam. */
function openDialog() {
  root = createRoot(container)
  act(() => {
    root.render(
      <ContactSection
        ready
        triggerHost={null}
        suppressed={false}
        onOpenChange={() => {}}
        onOpenLegal={() => {}}
      />,
    )
  })
  act(() => {
    document.querySelector<HTMLButtonElement>('.contact-trigger')!.click()
  })
}

describe('the phones at the foot of the contact dialog', () => {
  it('puts the label beside its own number, and the number in the link', () => {
    openDialog()
    const labels = [...document.querySelectorAll('.contact-phone-label')]
    const links = [...document.querySelectorAll<HTMLAnchorElement>('.contact-phone')]

    expect(labels).toHaveLength(2)
    expect(links).toHaveLength(2)
    expect(labels[0].textContent).toBe('Madrid')
    expect(links[0].textContent).toBe('+34 910 00 00 00')
    expect(links[0].getAttribute('href')).toBe('tel:+34910000000')
  })

  it('renders an EMPTY label cell for a phone without one', () => {
    // Not "no cell": the three columns are a grid, and a missing cell would pull
    // the next row's number into the label column. `:not(:empty)` in the
    // stylesheet is what keeps the colon off this one.
    openDialog()
    const labels = [...document.querySelectorAll('.contact-phone-label')]
    expect(labels[1].textContent).toBe('')
  })

  it('never writes the colon into the markup', () => {
    // The colon is a CSS ::after, so that it cannot be forgotten on one entry,
    // doubled on another, or typed into Sanity by an editor.
    openDialog()
    for (const label of document.querySelectorAll('.contact-phone-label')) {
      expect(label.textContent).not.toContain(':')
    }
  })

  it('keeps the link labelled by the number alone', () => {
    // The label sits OUTSIDE the anchor: a screen-reader user hears the number
    // they are about to dial, not "Madrid +34…".
    openDialog()
    const link = document.querySelector<HTMLAnchorElement>('.contact-phone')!
    expect(link.textContent).not.toContain('Madrid')
    expect(link.querySelector('.contact-phone-label')).toBeNull()
  })
})
