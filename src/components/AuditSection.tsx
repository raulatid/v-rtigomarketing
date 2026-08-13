import { FormEvent, useCallback, useEffect, useRef, useState } from 'react'
import { auditView } from '../auditView'

// Audit section (plan 005): a fixed trigger in the top-right corner and a solid
// black form panel that curtains in from the left over the live scene.
//
// The four-state machine below is the plan's §14 model verbatim. All motion is
// CSS transitions keyed off data-state — the timeline/GSAP clock is for the
// intro sequence, and this section is orthogonal to it (it can open during any
// phase). The scene recomposition runs in AuditCameraShift, which only reads
// the mutable auditView written here.

type AuditPhase = 'closed' | 'entering' | 'open' | 'leaving'

// Entry completes around 1.1s, exit is faster (plan 005 §6–7). These gate the
// STATE change only; the visuals are CSS transitions with their own timing.
const ENTER_MS = 1100
const LEAVE_MS = 680
const REDUCED_MS = 60

// Below this the remaining scene strip is not worth preserving: the panel goes
// full width in CSS and the camera recomposition is skipped (plan 005 §13).
const MOBILE_MAX = 768

type Field = 'plan' | 'name' | 'email' | 'website' | 'phone'
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const FIELD_ORDER: Field[] = ['plan', 'name', 'email', 'website', 'phone']

const EMPTY_VALUES: Values = { plan: '', name: '', email: '', website: '', phone: '' }

function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.plan) errors.plan = 'Selecciona un tipo de auditoría.'
  if (!values.name.trim()) errors.name = 'Introduce tu nombre.'
  if (!values.email.trim()) errors.email = 'Introduce tu email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim()))
    errors.email = 'El formato del email no es válido.'
  if (!values.website.trim()) errors.website = 'Introduce la URL de tu web.'
  else if (!/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i.test(values.website.trim()))
    errors.website = 'El formato de la URL no es válido.'
  return errors
}

// Isolated integration boundary — there is no backend or payment flow in this
// prototype, and nothing is simulated (plan 005 §10).
//
// A valid submission simply closes the panel. Deliberately NOT logged: the
// previous version console.info'd the whole payload, which put a real person's
// name, email and company into the browser console of a deployed site for no
// benefit. Nothing here leaves the browser — which is also what keeps this
// prototype clear of GDPR/LOPDGDD obligations. The moment a real endpoint is
// wired in, that changes and the form needs a privacy notice and a lawful
// basis BEFORE it collects anything.
//
// TODO(integration): send the validated payload to the real audit request /
// payment flow when it exists, and add the consent notice at the same time.

interface Props {
  // Lets App gate its global Escape handler (which otherwise skips the intro).
  onOpenChange: (open: boolean) => void
  // The trigger stays off-screen until the intro fully lands (satellites
  // revealed, phase 'site') — no interaction is offered over a half-built scene.
  ready: boolean
}

export function AuditSection({ onOpenChange, ready }: Props) {
  const [phase, setPhase] = useState<AuditPhase>('closed')
  const [values, setValues] = useState<Values>(EMPTY_VALUES)
  const [errors, setErrors] = useState<Errors>({})
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)

  const timerRef = useRef(-1)
  const reducedRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLSelectElement | null>>>({})

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const open = useCallback(() => {
    if (phase !== 'closed') return
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    auditView.reducedMotion = reducedRef.current
    // No recomposition on mobile — the panel covers the full width there.
    auditView.open = window.innerWidth >= MOBILE_MAX
    onOpenChange(true)
    setPhase('entering')
    timerRef.current = window.setTimeout(
      () => setPhase('open'),
      reducedRef.current ? REDUCED_MS : ENTER_MS,
    )
  }, [phase, onOpenChange])

  const close = useCallback(() => {
    if (phase !== 'open') return
    auditView.open = false
    setPhase('leaving')
    timerRef.current = window.setTimeout(() => {
      setPhase('closed')
      onOpenChange(false)
      // Focus returns to the trigger (plan 005 §12). Deferred a frame: the
      // trigger is disabled in every non-closed phase, and React has not
      // re-rendered yet inside this callback — focusing the still-disabled
      // element would silently no-op.
      requestAnimationFrame(() => triggerRef.current?.focus())
    }, reducedRef.current ? REDUCED_MS : LEAVE_MS)
  }, [phase, onOpenChange])

  // Focus moves to the section heading once the entry completes; form controls
  // are already interactive before that (pointer-events are never blocked).
  useEffect(() => {
    if (phase === 'open') headingRef.current?.focus({ preventScroll: true })
  }, [phase])

  // Escape closes the section. Registered only while open, so it cannot race
  // the entry/exit animations, and App's own Escape handler is gated off while
  // this one is live.
  useEffect(() => {
    if (phase !== 'open') return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [phase, close])

  const setValue = useCallback((field: Field, value: string) => {
    setValues((prev) => {
      const next = { ...prev, [field]: value }
      // Errors are recomputed live but only *shown* once the field was touched
      // or a submit was attempted — no errors before interaction (plan 005 §11).
      setErrors(validate(next))
      return next
    })
  }, [])

  const markTouched = useCallback((field: Field) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
    setErrors(validate(valuesRef.current))
  }, [])

  // Blur validation reads the latest values without re-binding the handler.
  const valuesRef = useRef(values)
  valuesRef.current = values

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      setSubmitAttempted(true)
      const errs = validate(valuesRef.current)
      setErrors(errs)
      const firstInvalid = FIELD_ORDER.find((f) => errs[f])
      if (firstInvalid) {
        fieldRefs.current[firstInvalid]?.focus()
        return
      }
      // Prototype: a valid submission just closes the panel. See the note on
      // the integration boundary above.
      close()
    },
    [close],
  )

  const showError = (field: Field): string | undefined =>
    touched[field] || submitAttempted ? errors[field] : undefined

  const fieldProps = (field: Field) => {
    const error = showError(field)
    return {
      id: `audit-${field}`,
      value: values[field],
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `audit-${field}-error` : undefined,
      onBlur: () => markTouched(field),
      ref: (el: HTMLInputElement | HTMLSelectElement | null) => {
        fieldRefs.current[field] = el
      },
    }
  }

  const errorLine = (field: Field) => {
    const error = showError(field)
    if (!error) return null
    return (
      <p className="audit-field__error" id={`audit-${field}-error`}>
        {error}
      </p>
    )
  }

  const isOpenish = phase === 'entering' || phase === 'open'

  return (
    <>
      {/* Opens only. While the section is open the trigger fades out entirely
          (closing lives on the panel's back arrow) but stays MOUNTED: it is the
          fade target on the way out, and close() returns focus to it. Disabled
          in every non-closed phase so the invisible control cannot be clicked
          mid-fade. Kept mounted while the section is open even if `ready` drops
          (a debug replay rewinds the phase). */}
      {(ready || phase !== 'closed') && (
        <button
          ref={triggerRef}
          type="button"
          className="audit-trigger"
          data-state={phase}
          aria-expanded={isOpenish}
          aria-hidden={isOpenish}
          disabled={phase !== 'closed'}
          onClick={open}
        >
          Auditoría
        </button>
      )}

      <section
        className="audit-overlay"
        data-state={phase}
        aria-hidden={phase === 'closed'}
        aria-labelledby="audit-title"
      >
        {/* The curtain translates at its final width — transform only, never
            an animated width (plan 005 §5). */}
        <div className="audit-curtain">
          {/* The close control: a back arrow at the panel's top-left. Sits on
              the curtain (not the scrollable panel) so it never scrolls away.
              close() no-ops outside 'open', so mid-transition clicks are safe. */}
          <button
            type="button"
            className="audit-close"
            onClick={close}
            aria-label="Cerrar la auditoría y volver"
          >
            <svg viewBox="0 0 44 16" aria-hidden="true" focusable="false">
              <path d="M9 1 L2 8 L9 15" fill="none" />
              <line x1="2" y1="8" x2="43" y2="8" />
            </svg>
          </button>
          <div className="audit-panel">
            <form className="audit-form" noValidate onSubmit={handleSubmit}>
              <div className="audit-group audit-group--1">
                <p className="audit-eyebrow">
                  Auditoría SEO
                  <span className="audit-step">Paso 01 / 02</span>
                </p>
              </div>

              <div className="audit-group audit-group--2">
                <h2 className="audit-title" id="audit-title" tabIndex={-1} ref={headingRef}>
                  Solicita la auditoría de tu presencia digital
                </h2>
                <p className="audit-description">
                  Analizamos tu web, tu posicionamiento y tu competencia. Recibirás un
                  informe con las acciones priorizadas para tu marca.
                </p>
              </div>

              <div className="audit-group audit-group--3">
                <div className="audit-field">
                  <label className="audit-label" htmlFor="audit-plan">
                    Tipo de auditoría
                  </label>
                  <div className="audit-select-wrap">
                    <select
                      className="audit-input audit-select"
                      {...fieldProps('plan')}
                      onChange={(e) => setValue('plan', e.target.value)}
                    >
                      <option value="" disabled>
                        Selecciona una opción
                      </option>
                      <option value="seo-tecnico">Auditoría SEO técnica</option>
                      <option value="contenido">Auditoría de contenido y keywords</option>
                      <option value="completa">Auditoría completa</option>
                    </select>
                  </div>
                  {errorLine('plan')}
                </div>

                <div className="audit-field">
                  <label className="audit-label" htmlFor="audit-name">
                    Nombre completo
                  </label>
                  <input
                    className="audit-input"
                    type="text"
                    autoComplete="name"
                    placeholder="Tu nombre"
                    {...fieldProps('name')}
                    onChange={(e) => setValue('name', e.target.value)}
                  />
                  {errorLine('name')}
                </div>

                <div className="audit-field">
                  <label className="audit-label" htmlFor="audit-email">
                    Email
                  </label>
                  <input
                    className="audit-input"
                    type="email"
                    autoComplete="email"
                    placeholder="nombre@empresa.com"
                    {...fieldProps('email')}
                    onChange={(e) => setValue('email', e.target.value)}
                  />
                  {errorLine('email')}
                </div>

                <div className="audit-field">
                  <label className="audit-label" htmlFor="audit-website">
                    Web de la empresa
                  </label>
                  <input
                    className="audit-input"
                    type="url"
                    autoComplete="url"
                    placeholder="https://tuempresa.com"
                    {...fieldProps('website')}
                    onChange={(e) => setValue('website', e.target.value)}
                  />
                  {errorLine('website')}
                </div>

                <div className="audit-field">
                  <label className="audit-label" htmlFor="audit-phone">
                    Teléfono <span className="audit-label__optional">(opcional)</span>
                  </label>
                  <input
                    className="audit-input"
                    type="tel"
                    autoComplete="tel"
                    placeholder="+34 600 000 000"
                    {...fieldProps('phone')}
                    onChange={(e) => setValue('phone', e.target.value)}
                  />
                  {errorLine('phone')}
                </div>
              </div>

              <div className="audit-group audit-group--4">
                <button type="submit" className="audit-cta">
                  Continuar
                  <span className="audit-cta__arrow" aria-hidden="true">
                    →
                  </span>
                </button>
                <p className="audit-note">
                  Revisamos cada solicitud de forma manual. Sin compromiso.
                </p>
                {/* Attribution for the space backdrop, and it is REQUIRED —
                    the panorama is CC BY 4.0 and the credit is the licence
                    condition, not a nicety. This panel is the only persistent
                    text surface the site has, which is why it lives here; if
                    a real footer ever appears, move it there and update the
                    pointer in CREDITS.md. The wording must stay exactly
                    "ESO/S. Brunier". */}
                <p className="audit-credit">
                  Imagen del cielo:{' '}
                  <a
                    href="https://www.eso.org/public/images/eso0932a/"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    ESO/S. Brunier
                  </a>{' '}
                  (CC BY 4.0)
                </p>
              </div>
            </form>
          </div>
          {/* Soft black-to-transparent falloff into the canvas area, so the
              panel edge does not read as a hard cut (plan 005 §4). */}
          <div className="audit-curtain__edge" aria-hidden="true" />
        </div>
      </section>
    </>
  )
}
