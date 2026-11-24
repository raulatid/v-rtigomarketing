import { Fragment, useEffect, useMemo, useRef, useState } from 'react'
import { submitContactRequest } from '../app/contactSubmission'
import type { ContactRequest, SubmitContactRequest } from '../app/contactSubmission'
import { codeOf, fieldsOf, type SubmissionErrorCode } from '../app/submissionError'
import { BOOKING_LABEL, BOOKING_URL, FORM_MESSAGES, SITE_PHONES } from '../content/site'
import type { LegalDocId } from '../content/site'
import { ownsEscape, trapTab } from './focusTrap'

// The contact dialog: the form behind ContactSection's trigger, in a chunk of
// its own (LazyContactDialog.tsx) that a cold `/` does not download (excluded
// in vite.config.ts, `isPreloadedOnIndex`). ContactSection owns whether it is
// open and where the focus goes back to; this owns what is written in it and
// the sending. Mounted at the first open and never unmounted after, so a
// message kept after an error is still there on the next open (the audit's
// afterlife). The stylesheets stay with the trigger, in ContactSection.

type Field = 'name' | 'email' | 'message'

const FIELD_ORDER: Field[] = ['name', 'email', 'message']

// The audit form's email shape, restated here rather than shared: the two
// forms must be able to diverge (and get real backends) independently.
const EMAIL_RE = /.+@.+\..+/

export interface ContactPreview {
  state: 'form' | 'success'
  bookingUrl: string
  bookingLabel: string
  phones: {label: string; display: string; tel: string}[]
  successTitle: string
  successBody: string
}

interface Props {
  open: boolean
  /** Editorial rendering without navigation, focus changes or submission. */
  preview?: ContactPreview
  idPrefix: string
  /** ContactSection's close: the open state, the header and the focus's way back. */
  onClose: () => void
  onOpenLegal: (doc: LegalDocId) => void
  /** Injectable for tests; defaults to the demo/production split transport. */
  submit?: SubmitContactRequest
}

type Submission = 'idle' | 'submitting' | 'success' | 'error'

const EMPTY: ContactRequest = { name: '', email: '', message: '' }

function validate(values: ContactRequest): Partial<Record<Field, string>> {
  const errors: Partial<Record<Field, string>> = {}
  if (!values.name.trim()) errors.name = 'Escribe tu nombre.'
  if (!values.email.trim()) errors.email = 'Escribe tu email.'
  else if (!EMAIL_RE.test(values.email)) errors.email = 'Revisa el formato del email.'
  if (!values.message.trim()) errors.message = 'Cuéntanos en qué podemos ayudarte.'
  return errors
}

/**
 * Three outcomes, not seven. See AuditSection.tsx: a visitor cannot act on
 * the difference between a missing key and an upstream timeout, and telling
 * them apart would only describe the deployment to whoever asked.
 */
function failureMessage(code: SubmissionErrorCode): string {
  if (code === 'rate_limited') {
    // Not "you sent several": the server answers a single message sent faster
    // than a person types with the same code (F15 of the 2026-11-18 audit).
    return 'Ahora no podemos aceptar el mensaje. Espera un minuto y vuelve a intentarlo.'
  }
  if (code === 'invalid') return 'Revisa los datos marcados.'
  return 'No se ha podido enviar. Inténtalo de nuevo o escríbenos directamente.'
}

export function ContactDialog({
  open,
  preview,
  idPrefix,
  onClose: close,
  onOpenLegal,
  submit = submitContactRequest,
}: Props) {
  const [values, setValues] = useState<ContactRequest>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [liveSubmission, setSubmission] = useState<Submission>('idle')
  const submission: Submission = preview ? (preview.state === 'success' ? 'success' : 'idle') : liveSubmission
  const content = preview ?? {
    bookingUrl: BOOKING_URL, bookingLabel: BOOKING_LABEL, phones: SITE_PHONES,
  }

  const [failure, setFailure] = useState<SubmissionErrorCode>('unknown')
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({})

  /** A 422 waiting for its render to hand the focus to the refused field. */
  const focusServerErrorRef = useRef(false)
  /** What the polite status in the form says: the error a blur revealed. */
  const [notice, setNotice] = useState('')
  const titleRef = useRef<HTMLHeadingElement>(null)
  const panelRef = useRef<HTMLElement>(null)
  const submitSeqRef = useRef(0)
  /** See AuditSection: the honeypot value and when this dialog opened. */
  const honeypotRef = useRef('')
  const openedAtRef = useRef(0)

  const errors = useMemo(() => validate(values), [values])

  // Each opening starts the clock and an empty honeypot (its input remounts
  // empty with the form). Each closing settles the afterlife the way the audit
  // does: success clears the form for a fresh message, an error keeps the
  // words the visitor already wrote.
  useEffect(() => {
    if (preview) return
    if (open) {
      openedAtRef.current = Date.now()
      honeypotRef.current = ''
      return
    }
    setNotice('')
    setSubmission((s) => {
      if (s === 'success') {
        setValues(EMPTY)
        setTouched({})
        setSubmitAttempted(false)
      }
      return 'idle'
    })
  }, [open, preview])

  useEffect(() => {
    if (preview || !open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        // Only while it is on top, and no further: the legal panel opened over
        // it closes alone, and the campus under it does not leave too (F4, M6).
        if (!ownsEscape(panelRef.current)) return
        e.stopPropagation()
        close()
      }
      // It says `aria-modal`, so Tab stays in it (F1 of the 2026-11-18
      // accessibility audit): it used to walk out to the page behind.
      else trapTab(e, panelRef.current)
    }
    // Capture: ahead of the sections' own listeners on window.
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [open, close, preview])

  useEffect(() => {
    if (!preview && open) titleRef.current?.focus()
  }, [open, preview])

  // The success replaces the form, and the focus with it: it goes to the
  // success heading, as the audit's does (accessibility audit 2026-11-18, F5).
  useEffect(() => {
    if (!preview && submission === 'success') titleRef.current?.focus({ preventScroll: true })
  }, [submission, preview])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (preview) return
    if (submission === 'submitting' || submission === 'success') return
    setSubmitAttempted(true)
    const firstInvalid = FIELD_ORDER.find((f) => errors[f])
    if (firstInvalid) {
      document.getElementById(`${idPrefix}-${firstInvalid}`)?.focus()
      return
    }
    const seq = ++submitSeqRef.current
    setSubmission('submitting')
    submit({
      ...values,
      empresa: honeypotRef.current,
      startedAt: openedAtRef.current,
    }).then(
      () => {
        if (submitSeqRef.current === seq) setSubmission('success')
      },
      (error: unknown) => {
        if (submitSeqRef.current !== seq) return
        setFailure(codeOf(error))
        const fields = fieldsOf(error)
        if (fields !== undefined) {
          const mapped: Partial<Record<Field, string>> = {}
          for (const field of FIELD_ORDER) {
            const message = fields[field]
            if (typeof message === 'string') mapped[field] = message
          }
          focusServerErrorRef.current = true
          setServerErrors(mapped)
        }
        setSubmission('error')
      },
    )
  }

  // A 422 names the fields it refused: the focus goes to the first, once its
  // aria-invalid and its error are rendered, so it is read with them (F12 of
  // the 2026-11-18 accessibility audit). Once per answer, not on every edit
  // that clears an error. Only if the focus is still in the dialog or on
  // <body>: one moved elsewhere while the request flew is the reader's.
  useEffect(() => {
    if (!focusServerErrorRef.current) return
    focusServerErrorRef.current = false
    const active = document.activeElement
    if (active && active !== document.body && !panelRef.current?.contains(active)) return
    const first = FIELD_ORDER.find((f) => serverErrors[f] !== undefined)
    if (first) document.getElementById(`${idPrefix}-${first}`)?.focus()
  }, [serverErrors, idPrefix])

  const answered = (field: Field) => values[field].trim() !== ''

  /**
   * The server saw the value our own rules let through, so it outranks them.
   * Otherwise a field is only wrong once there is something wrong in it, or
   * once "Enviar" was pressed: entering a field and leaving it empty is not an
   * error, it is a question not answered yet (plan 026).
   */
  const messageFor = (field: Field): string | undefined =>
    serverErrors[field] ??
    ((touched[field] && answered(field)) || submitAttempted ? errors[field] : undefined)

  const showError = (field: Field) => messageFor(field) !== undefined

  /** Drives the check at the end of the line; the stylesheet draws it. */
  const isValid = (field: Field) =>
    (touched[field] || submitAttempted) &&
    answered(field) &&
    errors[field] === undefined &&
    serverErrors[field] === undefined

  const fieldProps = (field: Field) => ({
    id: `${idPrefix}-${field}`,
    value: values[field],
    // All three are required; nothing else says so to a reader (F11).
    'aria-required': true,
    'aria-invalid': showError(field) || undefined,
    'aria-describedby': showError(field) ? `${idPrefix}-${field}-error` : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>,
    ) => {
      setValues((v) => ({ ...v, [field]: e.target.value }))
      setServerErrors((prev) =>
        prev[field] === undefined ? prev : { ...prev, [field]: undefined },
      )
    },
    onBlur: () => {
      // The error this blur reveals is said aloud: it appears under a field
      // the focus has just left (F12). Only a new one; otherwise the region is
      // emptied, so the same words can be said again next time.
      setNotice(!showError(field) && answered(field) ? errors[field] ?? '' : '')
      setTouched((t) => ({ ...t, [field]: true }))
    },
  })

  const errorLine = (field: Field) =>
    showError(field) ? (
      <p className="contact-field__error" id={`${idPrefix}-${field}-error`}>
        {messageFor(field)}
      </p>
    ) : null

  /** Decorative: the field's state is already in aria-invalid and the error text. */
  const fieldCheck = (
    <svg className="contact-check" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d="M2.5 7.5l3 3 6-7" />
    </svg>
  )

  return (
    <>
      {open && (
        <div className="modal-scrim" onClick={close}>
          <section
            ref={panelRef}
            className="modal-panel contact-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby={`${idPrefix}-title`}
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
              ✕
            </button>

            {submission === 'success' ? (
              <div className="contact-success" role="status">
                <h2 className="modal-title" id={`${idPrefix}-title`} tabIndex={-1} ref={titleRef}>
                  {preview ? preview.successTitle : FORM_MESSAGES.contactTitle}
                </h2>
                {/* From Sanity (plan 012), so the promise in it is the
                    client's to reword. */}
                <p className="contact-success__body">{preview ? preview.successBody : FORM_MESSAGES.contactBody}</p>
                <button type="button" className="contact-cta" onClick={close}>
                  Volver
                </button>
              </div>
            ) : (
              <form className="contact-form" noValidate onSubmit={handleSubmit}>
                {/* The honeypot. See AuditSection.tsx for what it is and what
                    the server does with it. */}
                <div className="form-honeypot" aria-hidden="true">
                  <label htmlFor={`${idPrefix}-empresa`}>Empresa</label>
                  <input
                    id={`${idPrefix}-empresa`}
                    name="empresa"
                    type="text"
                    tabIndex={-1}
                    autoComplete="off"
                    defaultValue=""
                    onChange={(e) => {
                      honeypotRef.current = e.target.value
                    }}
                  />
                </div>
                <h2 className="modal-title" id={`${idPrefix}-title`} tabIndex={-1} ref={titleRef}>
                  Escríbenos para lo que necesites
                </h2>

                <div className="contact-field" data-valid={isValid('name') || undefined}>
                  <label className="contact-label" htmlFor={`${idPrefix}-name`}>
                    <span className="contact-label__stroke" aria-hidden="true" />
                    Nombre
                  </label>
                  <div className="contact-control">
                    <input
                      className="contact-input"
                      type="text"
                      autoComplete="name"
                      maxLength={80}
                      {...fieldProps('name')}
                    />
                    {fieldCheck}
                  </div>
                  {errorLine('name')}
                </div>

                <div className="contact-field" data-valid={isValid('email') || undefined}>
                  <label className="contact-label" htmlFor={`${idPrefix}-email`}>
                    <span className="contact-label__stroke" aria-hidden="true" />
                    Email
                  </label>
                  <div className="contact-control">
                    <input
                      className="contact-input"
                      type="email"
                      autoComplete="email"
                      maxLength={254}
                      {...fieldProps('email')}
                    />
                    {fieldCheck}
                  </div>
                  {errorLine('email')}
                </div>

                <div className="contact-field" data-valid={isValid('message') || undefined}>
                  <label className="contact-label" htmlFor={`${idPrefix}-message`}>
                    <span className="contact-label__stroke" aria-hidden="true" />
                    Mensaje
                  </label>
                  {/* Shown only while typing; the maxLength is what enforces it.
                      Read with the field, not live: a count spoken on every
                      keystroke would drown the typing (F16). */}
                  <span className="contact-counter" id={`${idPrefix}-message-count`}>
                    {values.message.length} / 2000
                    <span className="form-sr-only"> caracteres</span>
                  </span>
                  <div className="contact-control">
                    <textarea
                      className="contact-input contact-textarea"
                      rows={4}
                      maxLength={2000}
                      {...fieldProps('message')}
                      aria-describedby={
                        showError('message')
                          ? `${idPrefix}-message-error ${idPrefix}-message-count`
                          : `${idPrefix}-message-count`
                      }
                    />
                    {fieldCheck}
                  </div>
                  {errorLine('message')}
                </div>

                <p className="form-sr-only" role="status">{notice}</p>

                {submission === 'error' && (
                  <p className="contact-form__error" role="alert">
                    {failureMessage(failure)}
                  </p>
                )}

                <button
                  type="submit"
                  className="contact-cta"
                  // Not `disabled`: a disabled button drops the focus it holds
                  // to <body> (accessibility audit 2026-11-18, F5). handleSubmit
                  // already refuses a second send while one is in flight.
                  aria-disabled={submission === 'submitting' || undefined}
                >
                  {submission === 'submitting' ? 'Enviando…' : 'Enviar'}
                  <span className="contact-cta__arrow" aria-hidden="true">
                    →
                  </span>
                </button>

                <p className="contact-note">
                  Al enviar aceptas los{' '}
                  <button
                    type="button"
                    className="contact-note__link"
                    onClick={() => onOpenLegal('terminos')}
                  >
                    términos y privacidad
                  </button>
                  .
                </p>

                {/* The middle door: write to us, BOOK A SLOT, or call. Opens
                    the client's own booking page — whatever platform it is on,
                    which is deliberate: they book on Calendly today and are
                    moving, and the build checks the link's shape rather than
                    its domain so that move costs no deploy. Renders only when
                    they have given us one — the field is optional and empty
                    until they paste a link into the Studio (`site.ts`), so this
                    shipped as no button at all rather than as a dead one.

                    An ANCHOR, not a button: this is inside the <form>, where a
                    <button> without an explicit type submits, and "book a call"
                    must never post the contact form. It carries the hairline
                    that opens the alternatives block when it is present, and
                    hands it back to the phones when it is not — see the
                    `+ .contact-phones` rule in the stylesheet. */}
                {content.bookingUrl && (
                  <a
                    className="contact-booking"
                    href={content.bookingUrl}
                    target="_blank"
                    // Modern browsers imply noopener with target=_blank; the
                    // attribute is what makes it true on the ones that do not.
                    rel="noopener noreferrer"
                  >
                    <svg
                      className="contact-booking__icon"
                      viewBox="0 0 16 16"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <rect x="2" y="3.5" width="12" height="10" rx="2" />
                      <path d="M2 6.5h12M5.5 2v3M10.5 2v3" />
                    </svg>
                    {content.bookingLabel}
                    <span className="form-sr-only"> (se abre en otra pestaña)</span>
                  </a>
                )}

                {/* The numbers used to sit on the Earth floor line; they live
                    here now (DECISIONS §30) — at the dialog's foot since
                    2026-09-03, under a hairline, offered as the alternative
                    once the form has made its ask. Bare tel: links, never a
                    disclosure inside a disclosure. */}
                <div className="contact-phones">
                  <svg
                    className="contact-phone-icon"
                    viewBox="0 0 16 16"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="1.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M3 2.5h2.5l1.2 3-1.6 1.2a9.5 9.5 0 0 0 4.2 4.2l1.2-1.6 3 1.2v2.5a1 1 0 0 1-1 1A11.5 11.5 0 0 1 2 3.5a1 1 0 0 1 1-1z" />
                  </svg>
                  {/* The label cell is rendered even when there is no label:
                      it is a grid column, and an omitted cell would slide the
                      next row's number into it. The colon lives in the
                      stylesheet, on `:not(:empty)`, so an unlabelled number
                      shows no stray punctuation.

                      OUTSIDE the anchor, deliberately — the link's accessible
                      name should be the number a screen-reader user is about to
                      dial, not "Madrid +34…". */}
                  {content.phones.map((phone, i) => (
                    // Two offices can legitimately share one number, so the tel
                    // alone is not a key.
                    <Fragment key={`${phone.tel}-${i}`}>
                      <span className="contact-phone-label">{phone.label}</span>
                      <a className="contact-phone" href={`tel:${phone.tel}`}>
                        {phone.display}
                      </a>
                    </Fragment>
                  ))}
                </div>
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
