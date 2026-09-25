import { useEffect, useRef, useState } from 'react'
import type { LegalDocId } from '../content/site'
import type { ClaimOutcome, ViewpointClaim } from '../experiences/murcia/observer/viewClient'
import './modal.css'
import './contactSection.css'
import './claimDialog.css'

interface Props {
  /** Spends the city's final-stage token. Handed out by MurciaExperience. */
  claim: ViewpointClaim
  onClose: () => void
  /** The claim settled for good — won, or somebody else had. No reoffer after this. */
  onSettled: () => void
  onOpenLegal: (doc: LegalDocId) => void
  idPrefix?: string
}

type Step =
  | { kind: 'form' }
  | { kind: 'submitting' }
  | { kind: 'won'; code: string }
  | { kind: 'closed' }
  | { kind: 'error' }

/** The same deliberately-loose shape the server checks. */
const ADDRESS_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/

/**
 * The claim behind the final vantage point: an email, the privacy box, and the
 * code that proves the claimant was first.
 *
 * The contact dialog's surface and classes (`modal.css`, `contactSection.css`),
 * and LegalPanel's focus trap. Lazy: `/` never downloads it (see LazyClaimDialog
 * and `isPreloadedOnIndex`).
 *
 * The first place in the site with a consent CHECKBOX rather than the forms'
 * implied note: this stores an address to hand over a prize, and the server
 * refuses a claim without the tick.
 */
export function ClaimDialog({ claim, onClose, onSettled, onOpenLegal, idPrefix = 'claim' }: Props) {
  const [step, setStep] = useState<Step>({ kind: 'form' })
  const [email, setEmail] = useState('')
  const [consent, setConsent] = useState(false)
  const [attempted, setAttempted] = useState(false)
  const titleRef = useRef<HTMLHeadingElement>(null)

  const emailValid = ADDRESS_PATTERN.test(email.trim())
  const emailError = attempted && !emailValid ? 'Escribe un email válido.' : undefined
  const consentError = attempted && !consent ? 'Necesitamos tu permiso para guardar el email.' : undefined

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose])

  // LegalPanel's trap, for the same reason: a modal whose Tab walks out into
  // the page behind it is not modal.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null
    titleRef.current?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const panel = titleRef.current?.closest('section')
      const nodes = Array.from(
        panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), a[href]') ?? [],
      ).filter((el) => el.getClientRects().length > 0)
      const first = nodes[0]
      const last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault()
        last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault()
        first?.focus()
      }
    }
    window.addEventListener('keydown', trap)
    return () => {
      window.removeEventListener('keydown', trap)
      if (previous?.isConnected) previous.focus()
    }
  }, [])

  // Each step has its own heading; focus follows it so a screen reader hears
  // the outcome rather than silence.
  useEffect(() => {
    titleRef.current?.focus()
  }, [step.kind])

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (step.kind === 'submitting') return
    setAttempted(true)
    if (!emailValid) {
      document.getElementById(`${idPrefix}-email`)?.focus()
      return
    }
    if (!consent) {
      document.getElementById(`${idPrefix}-consent`)?.focus()
      return
    }
    setStep({ kind: 'submitting' })
    claim(email.trim()).then(
      (outcome: ClaimOutcome) => {
        if (outcome.code !== null) {
          setStep({ kind: 'won', code: outcome.code })
          onSettled()
        } else if (outcome.closed) {
          setStep({ kind: 'closed' })
          onSettled()
        } else {
          setStep({ kind: 'error' })
        }
      },
      () => setStep({ kind: 'error' }),
    )
  }

  const title = (text: string) => (
    <h2 className="modal-title" id={`${idPrefix}-title`} tabIndex={-1} ref={titleRef}>
      {text}
    </h2>
  )

  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        className="modal-panel contact-panel claim-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>

        {step.kind === 'won' ? (
          <div className="contact-success" role="status">
            {title('Eres la primera persona')}
            <p className="contact-success__body">Este es tu código de reclamación:</p>
            <p className="claim-code">
              <code>{step.code}</code>
            </p>
            <p className="contact-success__body">
              Guárdalo: es la prueba de que lo encontraste. Te lo hemos enviado también por email y nos
              pondremos en contacto contigo.
            </p>
            <button type="button" className="contact-cta" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : step.kind === 'closed' ? (
          <div className="contact-success" role="status">
            {title('Alguien llegó antes')}
            <p className="contact-success__body">
              Encontraste el punto de vista, pero otra persona lo reclamó primero.
            </p>
            <button type="button" className="contact-cta" onClick={onClose}>
              Cerrar
            </button>
          </div>
        ) : (
          <form className="contact-form" noValidate onSubmit={handleSubmit}>
            {title('Has encontrado el punto de vista')}
            <p className="contact-note claim-lead">
              Deja tu email para registrar el hallazgo. Si eres la primera persona, recibirás un código
              de reclamación.
            </p>

            <div className="contact-field">
              <label className="contact-label" htmlFor={`${idPrefix}-email`}>
                Email
              </label>
              <input
                id={`${idPrefix}-email`}
                className="contact-input"
                type="email"
                autoComplete="email"
                maxLength={254}
                value={email}
                aria-invalid={emailError !== undefined || undefined}
                aria-describedby={emailError ? `${idPrefix}-email-error` : undefined}
                onChange={(e) => setEmail(e.target.value)}
              />
              {emailError && (
                <p className="contact-field__error" id={`${idPrefix}-email-error`}>
                  {emailError}
                </p>
              )}
            </div>

            <div className="claim-consent">
              <input
                id={`${idPrefix}-consent`}
                type="checkbox"
                checked={consent}
                aria-invalid={consentError !== undefined || undefined}
                aria-describedby={consentError ? `${idPrefix}-consent-error` : undefined}
                onChange={(e) => setConsent(e.target.checked)}
              />
              <label htmlFor={`${idPrefix}-consent`}>
                Acepto que Vértigo guarde mi email solo para gestionar esta reclamación, según los{' '}
                <button type="button" className="contact-note__link" onClick={() => onOpenLegal('terminos')}>
                  términos y privacidad
                </button>
                .
              </label>
            </div>
            {consentError && (
              <p className="contact-field__error" id={`${idPrefix}-consent-error`}>
                {consentError}
              </p>
            )}

            {step.kind === 'error' && (
              <p className="contact-form__error" role="alert">
                No se ha podido registrar ahora mismo. Inténtalo de nuevo en un momento.
              </p>
            )}

            <button type="submit" className="contact-cta" disabled={step.kind === 'submitting'}>
              {step.kind === 'submitting' ? 'Registrando…' : 'Registrar'}
              <span className="contact-cta__arrow" aria-hidden="true">
                →
              </span>
            </button>
          </form>
        )}
      </section>
    </div>
  )
}
