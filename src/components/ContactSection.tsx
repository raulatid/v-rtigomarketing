import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { submitContactRequest } from '../app/contactSubmission'
import type { ContactRequest, SubmitContactRequest } from '../app/contactSubmission'
import { SITE_PHONES } from '../content/site'
import type { LegalDocId } from '../content/site'
import './modal.css'
import './contactSection.css'

// The contact form: a Contacto trigger beside the audit CTA in the site header
// and a compact dialog with three fields. AuditSection is the reference
// implementation this mirrors — same phase discipline (unmounted before
// `site`), same derived validation, same submission machine against the same
// kind of injected transport (contactSubmission.ts records why the transport
// must reject in production). It is deliberately a DIALOG and not a second
// curtain: the audit is the site's one full-attention ask, and a contact
// message does not outrank it. Mounted on Earth, Murcia and the blog alike
// since 2026-09-03, which is why its stylesheets are imported here rather than
// by styles.css.

type Field = 'name' | 'email' | 'message'

const FIELD_ORDER: Field[] = ['name', 'email', 'message']

// The audit form's email shape, restated here rather than shared: the two
// forms must be able to diverge (and get real backends) independently.
const EMAIL_RE = /.+@.+\..+/

interface Props {
  /** Chrome may exist at all — `phase === 'site'` (DECISIONS §26.16). */
  ready: boolean
  /** The site header's actions cell, which the trigger portals into. Null
   *  renders it inline (tests). */
  triggerHost?: HTMLElement | null
  /** Prefix for element ids; two instances share a warm document (AuditSection
   *  says why). */
  idPrefix?: string
  /** The audit section owns the viewer's attention; the trigger stands down. */
  suppressed: boolean
  onOpenChange: (open: boolean) => void
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

export function ContactSection({
  ready,
  triggerHost = null,
  idPrefix = 'contact',
  suppressed,
  onOpenChange,
  onOpenLegal,
  submit = submitContactRequest,
}: Props) {
  const [open, setOpen] = useState(false)
  const [values, setValues] = useState<ContactRequest>(EMPTY)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submission, setSubmission] = useState<Submission>('idle')

  const triggerRef = useRef<HTMLButtonElement>(null)
  const titleRef = useRef<HTMLHeadingElement>(null)
  const submitSeqRef = useRef(0)

  const errors = useMemo(() => validate(values), [values])

  const openDialog = useCallback(() => {
    setOpen(true)
    onOpenChange(true)
  }, [onOpenChange])

  const close = useCallback(() => {
    setOpen(false)
    onOpenChange(false)
    // The trigger is what opened this; focus returns there. In the same rAF
    // arrangement the audit close uses, because React has not re-enabled
    // anything yet in this tick.
    requestAnimationFrame(() => triggerRef.current?.focus())
    // Settle the afterlife the way the audit does: success clears the form for
    // a fresh message, an error keeps the words the visitor already wrote.
    setSubmission((s) => {
      if (s === 'success') {
        setValues(EMPTY)
        setTouched({})
        setSubmitAttempted(false)
      }
      return 'idle'
    })
  }, [onOpenChange])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, close])

  useEffect(() => {
    if (open) titleRef.current?.focus()
  }, [open])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (submission === 'submitting' || submission === 'success') return
    setSubmitAttempted(true)
    const firstInvalid = FIELD_ORDER.find((f) => errors[f])
    if (firstInvalid) {
      document.getElementById(`${idPrefix}-${firstInvalid}`)?.focus()
      return
    }
    const seq = ++submitSeqRef.current
    setSubmission('submitting')
    submit({ ...values }).then(
      () => {
        if (submitSeqRef.current === seq) setSubmission('success')
      },
      () => {
        if (submitSeqRef.current === seq) setSubmission('error')
      },
    )
  }

  const showError = (field: Field) =>
    Boolean(errors[field]) && Boolean(touched[field] || submitAttempted)

  const fieldProps = (field: Field) => ({
    id: `${idPrefix}-${field}`,
    value: values[field],
    'aria-invalid': showError(field) || undefined,
    'aria-describedby': showError(field) ? `${idPrefix}-${field}-error` : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>,
    ) => setValues((v) => ({ ...v, [field]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
  })

  const errorLine = (field: Field) =>
    showError(field) ? (
      <p className="contact-field__error" id={`${idPrefix}-${field}-error`}>
        {errors[field]}
      </p>
    ) : null

  const trigger = ready && (
    <button
      ref={triggerRef}
      type="button"
      className="contact-trigger"
      data-suppressed={suppressed || open || undefined}
      aria-haspopup="dialog"
      aria-expanded={open}
      disabled={suppressed || open}
      onClick={openDialog}
    >
      Contacto
    </button>
  )

  return (
    <>
      {/* Into the site header when there is one (SiteHeader.tsx). */}
      {triggerHost ? createPortal(trigger, triggerHost) : trigger}

      {open && (
        <div className="modal-scrim" onClick={close}>
          <section
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
                  Recibido
                </h2>
                <p className="contact-success__body">
                  Gracias por escribirnos. Te responderemos en menos de 24 horas.
                </p>
                <button type="button" className="contact-cta" onClick={close}>
                  Volver
                </button>
              </div>
            ) : (
              <form className="contact-form" noValidate onSubmit={handleSubmit}>
                <p className="contact-eyebrow">Hablemos</p>
                <h2 className="modal-title" id={`${idPrefix}-title`} tabIndex={-1} ref={titleRef}>
                  Escríbenos para lo que necesites
                </h2>

                <div className="contact-field">
                  <label className="contact-label" htmlFor={`${idPrefix}-name`}>
                    Nombre
                  </label>
                  <input
                    className="contact-input"
                    type="text"
                    autoComplete="name"
                    {...fieldProps('name')}
                  />
                  {errorLine('name')}
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor={`${idPrefix}-email`}>
                    Email
                  </label>
                  <input
                    className="contact-input"
                    type="email"
                    autoComplete="email"
                    {...fieldProps('email')}
                  />
                  {errorLine('email')}
                </div>

                <div className="contact-field">
                  <label className="contact-label" htmlFor={`${idPrefix}-message`}>
                    Mensaje
                  </label>
                  <textarea
                    className="contact-input contact-textarea"
                    rows={4}
                    {...fieldProps('message')}
                  />
                  {errorLine('message')}
                </div>

                {submission === 'error' && (
                  <p className="contact-form__error" role="alert">
                    No se ha podido enviar. Inténtalo de nuevo o escríbenos directamente.
                  </p>
                )}

                <button
                  type="submit"
                  className="contact-cta"
                  disabled={submission === 'submitting'}
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
                  {SITE_PHONES.map((phone) => (
                    <a key={phone.tel} className="contact-phone" href={`tel:${phone.tel}`}>
                      {phone.display}
                    </a>
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
