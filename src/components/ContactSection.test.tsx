// @vitest-environment jsdom
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

// The phone list is rendered from CONTENT, and the content is whatever is in
// Sanity on the day the build ran. Mocking it is what makes this a test of the
// RENDERING rather than of the client's current phone numbers — the same reason
// AuditSection injects its transport. One labelled entry and one without, which
// is the pair the layout has to hold: the numbers must still line up.
//
// The booking link is read through a GETTER so one file can cover both of its
// states. It is genuinely optional content — the client may not have given us a
// booking page — and "renders nothing" is as much of a requirement as "renders
// a link", so both need a test. The label goes through the same getter: it has
// a shipped default, but the client can override it, and the component reads
// whatever the build resolved rather than defaulting again here.
const content = vi.hoisted(() => ({
  bookingUrl: undefined as string | undefined,
  bookingLabel: 'Agenda una cita',
}))

vi.mock('../content/site', () => ({
  SITE_PHONES: [
    { label: 'Madrid', display: '+34 910 00 00 00', tel: '+34910000000' },
    { display: '+34 600 000 001', tel: '+34600000001' },
  ],
  get BOOKING_URL() {
    return content.bookingUrl
  },
  get BOOKING_LABEL() {
    return content.bookingLabel
  },
  // The success's copy, for the sending test below.
  FORM_MESSAGES: { contactTitle: 'Mensaje enviado', contactBody: 'Te respondemos pronto.' },
}))

import { ContactSection } from './ContactSection'
import { SubmissionError } from '../app/submissionError'

;(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true

let container: HTMLDivElement
let root: Root

beforeEach(() => {
  content.bookingUrl = undefined
  content.bookingLabel = 'Agenda una cita'
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

// Conócenos' doorway: `openRequest` opens the dialog without its trigger, on
// AuditSection's terms — the first value is not a request, and a request the
// dialog cannot act on is spent rather than held for later.
describe('an open request from outside the trigger', () => {
  function render(openRequest: number, onOpenChange: (open: boolean) => void, ready = true, suppressed = false) {
    act(() => {
      root.render(
        <ContactSection
          ready={ready}
          triggerHost={null}
          suppressed={suppressed}
          onOpenChange={onOpenChange}
          onOpenLegal={() => {}}
          openRequest={openRequest}
        />,
      )
    })
  }

  it('opens on a changed request, and not on the value it mounted with', () => {
    const onOpenChange = vi.fn()
    root = createRoot(container)
    render(0, onOpenChange)
    expect(onOpenChange).not.toHaveBeenCalled()
    expect(document.querySelector('[role="dialog"]')).toBeNull()

    render(1, onOpenChange)
    expect(onOpenChange).toHaveBeenCalledWith(true)
    expect(document.querySelector('[role="dialog"]')).not.toBeNull()
  })

  it('spends a request made before the section is ready', () => {
    const onOpenChange = vi.fn()
    root = createRoot(container)
    render(0, onOpenChange, false)
    render(1, onOpenChange, false)
    // Becoming ready later must not act on the old request.
    render(1, onOpenChange, true)
    expect(onOpenChange).not.toHaveBeenCalled()
  })

  it('refuses while the audit has the screen, as the trigger does', () => {
    const onOpenChange = vi.fn()
    root = createRoot(container)
    render(0, onOpenChange, true, true)
    render(1, onOpenChange, true, true)
    render(1, onOpenChange, true, false)
    expect(onOpenChange).not.toHaveBeenCalled()
  })
})

describe('the booking button above the phones', () => {
  it('renders nothing at all until the CMS has a link', () => {
    // The field arrived after the dataset it lives in, so "empty" is the normal
    // state until the client pastes a booking URL in. An empty state must be an
    // absent button, never a dead link or a disabled control.
    openDialog()
    expect(document.querySelector('.contact-booking')).toBeNull()
  })

  it('links straight out to the client calendar when there is one', () => {
    content.bookingUrl = 'https://calendly.com/vertigo/30min'
    openDialog()
    const link = document.querySelector<HTMLAnchorElement>('.contact-booking')!
    expect(link).not.toBeNull()
    expect(link.getAttribute('href')).toBe('https://calendly.com/vertigo/30min')
    expect(link.textContent).toContain('Agenda una cita')
  })

  it('takes whatever platform the client has moved to', () => {
    // The component must not care. This is the case the whole change exists
    // for: a link on a host nothing in the codebase has ever named.
    content.bookingUrl = 'https://reservas.vertigomkt.com/cita-30min'
    openDialog()
    const link = document.querySelector<HTMLAnchorElement>('.contact-booking')!
    expect(link.getAttribute('href')).toBe('https://reservas.vertigomkt.com/cita-30min')
  })

  it('says what the CMS says, not what the JSX used to', () => {
    content.bookingUrl = 'https://cal.com/vertigo/30min'
    content.bookingLabel = 'Reserva tu hueco'
    openDialog()
    const link = document.querySelector<HTMLAnchorElement>('.contact-booking')!
    expect(link.textContent).toContain('Reserva tu hueco')
    expect(link.textContent).not.toContain('Agenda una cita')
  })

  it('opens in a new tab without handing the platform the opener', () => {
    // `target=_blank` gives the opened page a `window.opener` handle back into
    // this one unless `rel` says otherwise. Modern browsers imply noopener, but
    // the attribute is what makes it true everywhere and is one word.
    content.bookingUrl = 'https://calendly.com/vertigo/30min'
    openDialog()
    const link = document.querySelector<HTMLAnchorElement>('.contact-booking')!
    expect(link.getAttribute('target')).toBe('_blank')
    expect(link.getAttribute('rel')).toContain('noopener')
    expect(link.getAttribute('rel')).toContain('noreferrer')
  })

  it('sits above the phones, not below them', () => {
    // The dialog reads "write to us · book a slot · or call". The order is the
    // point of the request, so it is asserted rather than left to the JSX.
    content.bookingUrl = 'https://calendly.com/vertigo/30min'
    openDialog()
    const link = document.querySelector('.contact-booking')!
    const phones = document.querySelector('.contact-phones')!
    expect(link.compareDocumentPosition(phones) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy()
  })

  it('is a link, not a form control', () => {
    // Inside a <form>, a <button> with no type submits it. This navigates, so
    // it must be an anchor — a submit button that opened a calendar would post
    // the contact form every time somebody wanted to book a call.
    content.bookingUrl = 'https://calendly.com/vertigo/30min'
    openDialog()
    expect(document.querySelector('.contact-booking')!.tagName).toBe('A')
  })
})

/** Native-setter write + input event, so React's controlled control sees it. */
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value)
  el.dispatchEvent(new Event('input', { bubbles: true }))
}

function visit(el: HTMLElement) {
  act(() => {
    el.focus()
    el.blur()
  })
}

const control = (field: string) =>
  document.querySelector<HTMLInputElement | HTMLTextAreaElement>(`#contact-${field}`)!

// Red is an error, and an error needs something to be wrong. A field that was
// entered and left empty has not been answered yet — only a value that is
// there and wrong, or a press of "Enviar", earns the mark.
describe('when a field says it is wrong', () => {
  it('leaves a field that was entered and left empty unmarked', () => {
    openDialog()
    visit(control('name'))
    expect(control('name').getAttribute('aria-invalid')).toBeNull()
    expect(document.querySelector('#contact-name-error')).toBeNull()
  })

  it('marks a value that is there but wrong once the field is left', () => {
    openDialog()
    act(() => type(control('email'), 'nombre@'))
    visit(control('email'))
    expect(control('email').getAttribute('aria-invalid')).toBe('true')
    expect(document.querySelector('#contact-email-error')!.textContent).toMatch(/formato/i)
  })

  it('marks every empty field once "Enviar" is pressed', () => {
    openDialog()
    act(() => {
      document
        .querySelector<HTMLFormElement>('.contact-form')!
        .dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    for (const field of ['name', 'email', 'message']) {
      expect(control(field).getAttribute('aria-invalid')).toBe('true')
    }
  })

  it('drops the mark while the value is being corrected', () => {
    openDialog()
    act(() => type(control('email'), 'nombre@'))
    visit(control('email'))
    act(() => type(control('email'), 'nombre@empresa.com'))
    expect(control('email').getAttribute('aria-invalid')).toBeNull()
  })

  it('marks a left field with a right value as valid, and an untouched one as nothing', () => {
    openDialog()
    act(() => type(control('name'), 'Nombre Prueba'))
    visit(control('name'))
    expect(control('name').closest('.contact-field')!.hasAttribute('data-valid')).toBe(true)
    expect(control('email').closest('.contact-field')!.hasAttribute('data-valid')).toBe(false)
  })
})

// Accessibility audit 2026-11-18, F1: it says aria-modal, and Tab used to
// walk out of it to the page behind.
describe('the contact dialog and Tab', () => {
  it('keeps Tab inside, from the last control round to the first', () => {
    // jsdom lays nothing out; the trap counts only what has a box.
    const rects = vi.spyOn(Element.prototype, 'getClientRects').mockReturnValue([{}] as unknown as DOMRectList)
    openDialog()
    const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!
    const controls = Array.from(dialog.querySelectorAll<HTMLElement>('button:not(:disabled), input:not([type="hidden"]), textarea, a[href]'))
      .filter((el) => el.tabIndex >= 0 && !el.closest('[aria-hidden="true"]'))
    const last = controls[controls.length - 1]!
    act(() => last.focus())
    const tab = new KeyboardEvent('keydown', { key: 'Tab', cancelable: true, bubbles: true })
    act(() => {
      window.dispatchEvent(tab)
    })
    expect(tab.defaultPrevented).toBe(true)
    expect(document.activeElement).toBe(controls[0])
    rects.mockRestore()
  })
})

// Accessibility audit 2026-11-18, M6: an Escape for the dialog is the
// dialog's; the section under it (listening on window) never hears it.
describe('the contact dialog and Escape', () => {
  it('closes and stops the key before the scene behind hears it', () => {
    const behind = vi.fn()
    window.addEventListener('keydown', behind)
    openDialog()
    const close = document.querySelector<HTMLElement>('.modal-close')!
    act(() => {
      close.focus()
      // From the focused control, as a real key press travels: the capture
      // listener on window runs first and stops it there.
      close.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(behind).not.toHaveBeenCalled()
    window.removeEventListener('keydown', behind)
  })
})

// The trigger gets the focus back once the closed render is committed. It used
// to be a frame after the close, which is no promise that React has re-enabled
// the trigger by then: when the frame came first, focus() landed on a disabled
// button and the focus ended on <body> (the audit's race, forms trap n.º 24).
describe('the focus when the dialog closes', () => {
  beforeEach(() => {
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0)
      return 0
    })
  })
  afterEach(() => {
    vi.mocked(window.requestAnimationFrame).mockRestore()
  })

  it('returns to the trigger even when a frame lands before React re-renders', () => {
    openDialog()
    act(() => {
      document.querySelector<HTMLButtonElement>('.modal-close')!.click()
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(document.querySelector('.contact-trigger'))
  })

  // Pins the behaviour, not the race: the disabled trigger refused the focus
  // under the old frame too.
  it('leaves it with the audit when the audit takes the screen', () => {
    openDialog()
    const curtain = document.body.appendChild(document.createElement('button'))
    act(() => curtain.focus())
    act(() => {
      root.render(
        <ContactSection ready triggerHost={null} suppressed onOpenChange={() => {}} onOpenLegal={() => {}} />,
      )
    })
    expect(document.querySelector('[role="dialog"]')).toBeNull()
    expect(document.activeElement).toBe(curtain)
    curtain.remove()
  })
})

// Accessibility audit 2026-11-18, F5: sending kept the focus nowhere, and the
// success that replaces the form never took it.
describe('the focus while and after sending', () => {
  it('keeps it on the busy button, then gives it to the success heading', async () => {
    let finish: () => void = () => {}
    const submit = vi.fn(() => new Promise<void>((resolve) => { finish = resolve }))
    root = createRoot(container)
    act(() => {
      root.render(
        <ContactSection ready triggerHost={null} suppressed={false} onOpenChange={() => {}} onOpenLegal={() => {}} submit={submit} />,
      )
    })
    act(() => document.querySelector<HTMLButtonElement>('.contact-trigger')!.click())
    act(() => {
      type(control('name'), 'Ana Pérez')
      type(control('email'), 'ana@example.com')
      type(control('message'), 'Queremos medir mejor nuestro SEO este año.')
    })
    const cta = document.querySelector<HTMLButtonElement>('.contact-cta')!
    act(() => {
      cta.focus()
      document.querySelector<HTMLFormElement>('.contact-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    expect(submit).toHaveBeenCalledTimes(1)
    expect(cta.disabled).toBe(false)
    expect(cta.getAttribute('aria-disabled')).toBe('true')
    expect(document.activeElement).toBe(cta)
    await act(async () => {
      finish()
    })
    expect(document.activeElement?.tagName).toBe('H2')
    expect(document.activeElement?.closest('.contact-success')).not.toBeNull()
  })
})

// The low ones of the 2026-11-18 accessibility audit, F11, F12, F15 and F16:
// what a screen reader is told about the fields, and when.
describe('what the contact form tells a screen reader', () => {
  function mountWith(submit: () => Promise<void>) {
    root = createRoot(container)
    act(() => {
      root.render(
        <ContactSection ready triggerHost={null} suppressed={false} onOpenChange={() => {}} onOpenLegal={() => {}} submit={submit} />,
      )
    })
    act(() => document.querySelector<HTMLButtonElement>('.contact-trigger')!.click())
  }

  const status = () => document.querySelector('.contact-form [role="status"]')!

  it('says every field is required', () => {
    openDialog()
    for (const field of ['name', 'email', 'message']) {
      expect(control(field).getAttribute('aria-required')).toBe('true')
    }
  })

  it('says the error a blur reveals, and only a new one', () => {
    openDialog()
    act(() => type(control('email'), 'ana@'))
    visit(control('email'))
    expect(control('email').getAttribute('aria-invalid')).toBe('true')
    expect(status().textContent).toBe(document.getElementById('contact-email-error')!.textContent)
    // Shown already: leaving the field again says nothing new.
    visit(control('email'))
    expect(status().textContent).toBe('')
    // Left empty is a question not answered yet, not an error.
    visit(control('name'))
    expect(status().textContent).toBe('')
  })

  it('hands the focus to the field a 422 refused', async () => {
    let refuse: (error: unknown) => void = () => {}
    mountWith(() => new Promise<void>((_, reject) => { refuse = reject }))
    act(() => {
      type(control('name'), 'Ana Pérez')
      type(control('email'), 'ana@example.com')
      type(control('message'), 'Queremos medir mejor nuestro SEO este año.')
    })
    const cta = document.querySelector<HTMLButtonElement>('.contact-cta')!
    act(() => {
      cta.focus()
      document.querySelector<HTMLFormElement>('.contact-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await act(async () => {
      refuse(new SubmissionError('invalid', { email: 'Ese dominio no recibe correo.' }))
    })
    expect(document.activeElement).toBe(control('email'))
    expect(control('email').getAttribute('aria-invalid')).toBe('true')
    expect(document.getElementById('contact-email-error')!.textContent).toBe('Ese dominio no recibe correo.')
    // Editing clears that error; the focus is not moved again.
    act(() => type(control('email'), 'ana@example.org'))
    expect(document.activeElement).toBe(control('email'))
  })

  it('does not tell someone who sent once that they sent several', async () => {
    let refuse: (error: unknown) => void = () => {}
    mountWith(() => new Promise<void>((_, reject) => { refuse = reject }))
    act(() => {
      type(control('name'), 'Ana Pérez')
      type(control('email'), 'ana@example.com')
      type(control('message'), 'Queremos medir mejor nuestro SEO este año.')
    })
    act(() => {
      document.querySelector<HTMLFormElement>('.contact-form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }))
    })
    await act(async () => {
      refuse(new SubmissionError('rate_limited'))
    })
    const alert = document.querySelector('.contact-form__error')!.textContent!
    expect(alert).toMatch(/espera un minuto/i)
    expect(alert).not.toMatch(/varios|seguid/i)
  })

  it('reads the counter with the message field, not on every keystroke', () => {
    openDialog()
    const counter = document.getElementById('contact-message-count')!
    expect(counter.closest('[aria-hidden="true"]')).toBeNull()
    expect(counter.getAttribute('role')).toBeNull()
    expect(control('message').getAttribute('aria-describedby')).toBe('contact-message-count')
    expect(counter.textContent).toContain('caracteres')
  })

  it('says the booking link opens another tab', () => {
    content.bookingUrl = 'https://calendly.com/vertigo/30min'
    openDialog()
    expect(document.querySelector('.contact-booking')!.textContent).toContain('(se abre en otra pestaña)')
  })
})
