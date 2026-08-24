import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { submitContactRequest } from '../app/contactSubmission'
import type { ContactRequest, SubmitContactRequest } from '../app/contactSubmission'
import { SITE_PHONES } from '../content/site'
import type { LegalDocId } from '../content/site'

// The contact form: a Contacto trigger beside the audit CTA and a compact
// dialog with three fields. AuditSection is the reference implementation this
// mirrors — same phase discipline (unmounted before `site`, hard-closed when
// Earth stops showing), same derived validation, same submission machine
// against the same kind of injected transport (contactSubmission.ts records
// why the transport must reject in production). It is deliberately a DIALOG
// and not a second curtain: the audit is the site's one full-attention ask,
// and a contact message does not outrank it.

type Field = 'name' | 'email' | 'message'

const FIELD_ORDER: Field[] = ['name', 'email', 'message']

// The audit form's email shape, restated here rather than shared: the two
// forms must be able to diverge (and get real backends) independently.
const EMAIL_RE = /.+@.+\..+/

interface Props {
  /** Chrome may exist at all — `phase === 'site'` on Earth (DECISIONS §26.16). */
  ready: boolean
  /** Earth is the experience showing. Deactivating hard-closes, keeping values. */
  active: boolean
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
  active,
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

  // Earth stopped showing: hard cut, no exit choreography, values kept —
  // the same contract AuditSection documents for its own deactivation.
  useEffect(() => {
    if (!active && open) {
      setOpen(false)
      onOpenChange(false)
    }
  }, [active, open, onOpenChange])

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
      document.getElementById(`contact-${firstInvalid}`)?.focus()
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
    id: `contact-${field}`,
    value: values[field],
    'aria-invalid': showError(field) || undefined,
    'aria-describedby': showError(field) ? `contact-${field}-error` : undefined,
    onChange: (
      e: React.ChangeEvent<HTMLInputElement> | React.ChangeEvent<HTMLTextAreaElement>,
    ) => setValues((v) => ({ ...v, [field]: e.target.value })),
    onBlur: () => setTouched((t) => ({ ...t, [field]: true })),
  })

  const errorLine = (field: Field) =>
    showError(field) ? (
      <p className="contact-field__error" id={`contact-${field}-error`}>
        {errors[field]}
      </p>
    ) : null

  return (
    <>
      {ready && (
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
      )}

      {open && (
        <div className="modal-scrim" onClick={close}>
          <section
            className="modal-panel contact-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="contact-title"
            onClick={(e) => e.stopPropagation()}
          >
            <button type="button" className="modal-close" onClick={close} aria-label="Cerrar">
              ✕
            </button>

            {submission === 'success' ? (
              <div className="contact-success" role="status">
                <h2 className="modal-title" id="contact-title" tabIndex={-1} ref={titleRef}>
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
                <h2 className="modal-title" id="contact-title" tabIndex={-1} ref={titleRef}>
                  Escríbenos para lo que necesites
                </h2>

                {/* The numbers used to sit on the Earth floor line; they live
                    here now (DECISIONS §30), offered at the moment someone has
                    decided to reach out — calling instead of writing is the
                    alternative this dialog exists to present. Bare tel: links,
                    never a disclosure inside a disclosure. */}
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

                <div className="contact-field">
                  <label className="contact-label" htmlFor="contact-name">
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
                  <label className="contact-label" htmlFor="contact-email">
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
                  <label className="contact-label" htmlFor="contact-message">
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
              </form>
            )}
          </section>
        </div>
      )}
    </>
  )
}
