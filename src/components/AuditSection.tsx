import {
  FormEvent,
  ReactNode,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { createPortal } from 'react-dom'
import { auditView, shiftsFor, type AuditPhase } from '../auditView'
import { submitAuditRequest, type SubmitAuditRequest } from '../app/auditSubmission'
import { codeOf, fieldsOf, type SubmissionErrorCode } from '../app/submissionError'
import { FORM_MESSAGES, type LegalDocId } from '../content/site'
import './auditSection.css'

// Audit section (plan 005): a trigger in the site header and a solid black form
// panel that curtains in from the left over whatever is showing — Earth, Murcia
// or the blog (2026-09-03). The stylesheet is imported here, not by styles.css,
// because the cold blog document mounts this too.
//
// The four-state machine below is the plan's §14 model verbatim. All motion is
// CSS transitions keyed off data-state — the timeline/GSAP clock is for the
// intro sequence, and this section is orthogonal to it (it can open during any
// phase). The scene recomposition runs in AuditCameraShift, which only reads
// the mutable auditView written here.

// Entry completes around 1.1s, exit is faster (plan 005 §6–7). These gate the
// STATE change only; the visuals are CSS transitions with their own timing.
const ENTER_MS = 1100
const LEAVE_MS = 680
const REDUCED_MS = 60

// Below this the remaining scene strip is not worth preserving: the panel goes
// full width in CSS and the camera recomposition is skipped (plan 005 §13).
const MOBILE_MAX = 768

type Field = 'plan' | 'name' | 'email' | 'website' | 'phone' | 'revenue' | 'budget'
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

// `plan` keeps its key through the 2026-09-04 relabelling: the field is now
// "Servicio de interés" on screen, but the wire name is shared with
// `server/validate.ts` and with whatever is already sitting in the client's
// inbox, and renaming it would break both for a caption.
const FIELD_ORDER: Field[] = [
  'plan',
  'revenue',
  'budget',
  'name',
  'email',
  'website',
  'phone',
]

/**
 * What differs between the five fields, which is all that ever differed.
 *
 * They were five hand-written twelve-line blocks distinguished only by type,
 * label, placeholder and autocomplete — so a change to the shared markup (a
 * class, an aria wiring, the error slot) had to be made five times and could be
 * made four. FIELD_ORDER already existed and already listed them in order; this
 * is the rest of what the list needs to render itself.
 *
 * The select is a genuinely different control, not a variant of the input, so
 * it is a different `kind` rather than an input with an options array bolted on.
 */
type FieldDef =
  | {
      kind: 'input'
      label: string
      type: 'text' | 'email' | 'url' | 'tel'
      autoComplete: string
      placeholder: string
      /**
       * The same number `server/validate.ts` caps this field at. Duplicated on
       * purpose — the server cannot trust an attribute, and the browser should
       * not let somebody type two thousand characters it will then refuse — so
       * a change here is a change somebody has to make twice, deliberately.
       * (SEC-12: there was no maxLength on any control at all before this.)
       */
      maxLength: number
      /** Renders the "(opcional)" qualifier. Only the phone is. */
      optional?: true
    }
  | {
      kind: 'select'
      label: string
      /** Shown first, disabled — the empty value `validate` rejects. */
      placeholder: string
      options: Array<{ value: string; label: string }>
    }

const FIELD_DEFS: Record<Field, FieldDef> = {
  plan: {
    kind: 'select',
    label: 'Servicio de interés',
    placeholder: 'Selecciona una opción',
    // The values are wire identifiers and stay ASCII and stable; the labels are
    // what the visitor reads. `server/validate.ts` PLANS is the authority and
    // must list exactly these values — a select is a suggestion, not a
    // guarantee, and nothing here is trusted.
    options: [
      { value: 'seo', label: 'SEO' },
      { value: 'geo', label: 'GEO (Posicionamiento LLMs)' },
      { value: 'auditoria-seo-completa', label: 'Auditoría SEO completa' },
      { value: 'sem', label: 'SEM' },
      { value: 'diseno-web', label: 'Diseño web' },
      { value: 'desarrollo', label: 'Desarrollo y programación' },
      { value: 'estrategia-marketing', label: 'Estrategias de marketing' },
    ],
  },
  // FREE TEXT, deliberately, and this is the decision most likely to be
  // second-guessed later. The client asked for business context, not for a
  // figure to compute with: "20k / 100k", "aprox. 3.000 al mes" and "No
  // definido todavía" are all useful answers, and a select would have forced
  // somebody to invent the brackets. Nothing downstream parses these — they
  // travel as text into an email a person reads.
  //
  // Free text is not unvalidated text. Both go through the same `readText`
  // rule as every other field on the server (control characters stripped, line
  // breaks folded, length capped) and the same `escapeHtml` in renderEmail.
  revenue: {
    kind: 'input',
    label: 'Rango de facturación de tu empresa',
    type: 'text',
    // No autocomplete token describes this. `off` rather than a wrong one:
    // the browser has nothing useful to offer and a mismatched token invites
    // it to fill in something else.
    autoComplete: 'off',
    placeholder: '20.000 - 100.000 €',
    maxLength: 60,
  },
  budget: {
    kind: 'input',
    label: 'Presupuesto mensual',
    type: 'text',
    autoComplete: 'off',
    placeholder: '2.000 - 5.000 €',
    maxLength: 60,
  },
  name: {
    kind: 'input',
    label: 'Nombre completo',
    type: 'text',
    autoComplete: 'name',
    placeholder: 'Tu nombre',
    maxLength: 80,
  },
  email: {
    kind: 'input',
    label: 'Email',
    type: 'email',
    autoComplete: 'email',
    placeholder: 'nombre@empresa.com',
    maxLength: 254,
  },
  website: {
    kind: 'input',
    label: 'Web de la empresa',
    type: 'url',
    autoComplete: 'url',
    placeholder: 'https://tuempresa.com',
    maxLength: 200,
  },
  phone: {
    kind: 'input',
    label: 'Teléfono',
    type: 'tel',
    autoComplete: 'tel',
    placeholder: '+34 600 000 000',
    maxLength: 32,
    optional: true,
  },
}

/**
 * The shared markup: label, control, error slot. One copy, so the aria wiring
 * between the three cannot drift between fields.
 *
 * `controlProps` arrives pre-built by `fieldProps` — id, value, aria-invalid,
 * aria-describedby, the blur handler and the ref. It is spread rather than
 * destructured because the aria attributes are conditional and spreading
 * `undefined` is how JSX omits an attribute.
 */
function AuditField({
  idPrefix,
  field,
  def,
  controlProps,
  onChange,
  error,
}: {
  idPrefix: string
  field: Field
  def: FieldDef
  controlProps: Record<string, unknown>
  onChange: (value: string) => void
  error: ReactNode
}) {
  return (
    <div className="audit-field">
      <label className="audit-label" htmlFor={`${idPrefix}-${field}`}>
        {def.label}
        {def.kind === 'input' && def.optional ? (
          <>
            {' '}
            <span className="audit-label__optional">(opcional)</span>
          </>
        ) : null}
      </label>
      {def.kind === 'select' ? (
        <div className="audit-select-wrap">
          <select
            className="audit-input audit-select"
            {...controlProps}
            onChange={(e) => onChange(e.target.value)}
          >
            <option value="" disabled>
              {def.placeholder}
            </option>
            {def.options.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
        </div>
      ) : (
        <input
          className="audit-input"
          type={def.type}
          autoComplete={def.autoComplete}
          placeholder={def.placeholder}
          maxLength={def.maxLength}
          {...controlProps}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
      {error}
    </div>
  )
}

const EMPTY_VALUES: Values = {
  plan: '',
  revenue: '',
  budget: '',
  name: '',
  email: '',
  website: '',
  phone: '',
}

/**
 * Hosts the server will refuse, refused here too so the form says so before a
 * round trip rather than after one.
 *
 * The old rule was `/^(https?:\/\/)?[\w-]+(\.[\w-]+)+\S*$/i`, which accepted
 * `127.0.0.1`, `192.168.1.1` and `169.254.169.254` — the finding recorded as
 * API-2. `server/validate.ts` is the authority and rejects all of them; this is
 * the courtesy copy, and the two carry a comment pointing at each other.
 */
function websiteProblem(raw: string): string | undefined {
  const invalid = 'El formato de la URL no es válido.'
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : 'https://' + raw

  let url: URL
  try {
    url = new URL(withScheme)
  } catch {
    return invalid
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return invalid
  if (url.username.length > 0 || url.password.length > 0) return invalid

  const host = url.hostname.toLowerCase()
  if (!host.includes('.')) return invalid
  if (host === 'localhost' || host.endsWith('.localhost')) return invalid
  if (host.endsWith('.local') || host.endsWith('.internal')) return invalid
  if (/^\d+(\.\d+){0,3}$/.test(host)) {
    const first = Number(host.split('.')[0])
    const second = Number(host.split('.')[1] ?? '0')
    if (first === 0 || first === 127 || first === 10 || first >= 224) return invalid
    if (first === 169 && second === 254) return invalid
    if (first === 172 && second >= 16 && second <= 31) return invalid
    if (first === 192 && second === 168) return invalid
  }
  return undefined
}

function validate(values: Values): Errors {
  const errors: Errors = {}
  if (!values.plan) errors.plan = 'Selecciona un servicio.'
  // Presence and length only. There is deliberately no format rule: every
  // separator, currency, abbreviation and "no lo sé todavía" is a valid answer,
  // and a pattern here would reject real ones. The cap mirrors FIELD_DEFS,
  // which mirrors the server — see the maxLength comment above.
  if (!values.revenue.trim()) errors.revenue = 'Indica tu rango de facturación.'
  else if (values.revenue.trim().length > 60) errors.revenue = 'Máximo 60 caracteres.'
  if (!values.budget.trim()) errors.budget = 'Indica tu presupuesto mensual.'
  else if (values.budget.trim().length > 60) errors.budget = 'Máximo 60 caracteres.'
  if (!values.name.trim()) errors.name = 'Introduce tu nombre.'
  if (!values.email.trim()) errors.email = 'Introduce tu email.'
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(values.email.trim()))
    errors.email = 'El formato del email no es válido.'
  if (!values.website.trim()) errors.website = 'Introduce la URL de tu web.'
  else {
    const problem = websiteProblem(values.website.trim())
    if (problem !== undefined) errors.website = problem
  }
  return errors
}

/**
 * What the panel says when a submission failed, by cause.
 *
 * THREE outcomes, not seven. A visitor can act on "you sent several in a row"
 * and on "check the fields"; they cannot act on the difference between a
 * missing API key and a mail provider timing out, and pretending otherwise
 * would only tell an attacker how the endpoint is configured. That distinction
 * lives in the server's log.
 */
function failureMessage(code: SubmissionErrorCode): string {
  if (code === 'rate_limited') {
    return 'Has enviado varias solicitudes seguidas. Espera un minuto y vuelve a intentarlo.'
  }
  if (code === 'invalid') return 'Revisa los datos marcados.'
  return 'No se ha podido enviar la solicitud. Inténtalo de nuevo.'
}

// The integration boundary moved to src/app/auditSubmission.ts: this component
// owns PRESENTATION of the submission (idle → submitting → success | error) and
// hands the payload to one injected transport. The transport is a demo stub
// until the real endpoint exists — and in a production build it rejects rather
// than fake a success (the rule is recorded at the transport).
//
// Nothing is logged, deliberately: the previous prototype console.info'd the
// whole payload, which put a real person's name, email and company into the
// browser console of a deployed site for no benefit. Nothing here leaves the
// browser yet — which is also what keeps this prototype clear of GDPR/LOPDGDD
// obligations. The moment a real endpoint is wired in, that changes and the
// form needs a privacy notice and a lawful basis BEFORE it collects anything
// (the legal implementation is a separate, deferred task).
//
// The submission model this component keeps, for when that day comes:
//  - `success` is only entered when the transport's promise RESOLVES;
//  - `error` keeps everything typed and turns the CTA into a retry;
//  - a submission in flight refuses a second one.

interface Props {
  // Lets App gate its global Escape handler (which otherwise skips the intro).
  onOpenChange: (open: boolean) => void
  // The trigger stays off-screen until the intro fully lands (satellites
  // revealed, phase 'site') — no interaction is offered over a half-built scene.
  ready: boolean
  /**
   * Where the trigger renders: the site header's actions cell, through a
   * portal. Null renders it inline where the section is — the arrangement the
   * tests use, and the one this component had before the header existed.
   */
  triggerHost?: HTMLElement | null
  /**
   * Whether opening writes `auditView.open`, the flag AuditCameraShift reads to
   * recompose Earth's camera beside the curtain. The blog mounts a second
   * instance over a suspended canvas and passes false, so the flag keeps
   * exactly one writer per rendered scene (see the effect below).
   */
  recomposesScene?: boolean
  /**
   * Prefix for every element id (title, fields, error lines). Two instances
   * share a warm document — App's, hidden and inert behind the blog, and the
   * blog's own — and ids are document-global.
   */
  idPrefix?: string
  /** Opens a legal document panel. App owns which one is showing. The links
      sit at the foot of this panel (DECISIONS §30): the consent question
      belongs beside the form that asks for the data, not on the floor line. */
  onOpenLegal: (doc: LegalDocId) => void
  /** Submission transport. Injectable for tests; defaults to the application's. */
  submit?: SubmitAuditRequest
}

/** Where the submission is, as a state and never as inference. */
type Submission = 'idle' | 'submitting' | 'success' | 'error'

export function AuditSection({
  onOpenChange,
  ready,
  triggerHost = null,
  recomposesScene = true,
  idPrefix = 'audit',
  onOpenLegal,
  submit = submitAuditRequest,
}: Props) {
  const [phase, setPhase] = useState<AuditPhase>('closed')
  const [values, setValues] = useState<Values>(EMPTY_VALUES)
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({})
  const [submitAttempted, setSubmitAttempted] = useState(false)
  const [submission, setSubmission] = useState<Submission>('idle')
  /** Why the last attempt failed, so the banner can say something useful. */
  const [failure, setFailure] = useState<SubmissionErrorCode>('unknown')
  /**
   * Field messages the SERVER rejected, which the client's own rules let
   * through. Cleared as soon as that field is edited, so a corrected field
   * stops complaining without waiting for another round trip.
   */
  const [serverErrors, setServerErrors] = useState<Partial<Record<Field, string>>>({})
  /**
   * The honeypot's value, and when this panel opened.
   *
   * Refs rather than state: nothing renders from either, and a keystroke in a
   * field nobody can see must not re-render the form. The pair is what
   * `server/handleSubmission.ts` reads to tell a person from a script.
   */
  const honeypotRef = useRef('')
  const openedAtRef = useRef(0)

  const timerRef = useRef(-1)
  const reducedRef = useRef(false)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const successHeadingRef = useRef<HTMLHeadingElement>(null)
  /**
   * Which submission attempt is current. A settled promise from an attempt
   * that is no longer the current one (the panel was closed and the form
   * reset, say) must not move the state — it reports on a request nobody is
   * looking at any more.
   */
  const submitSeqRef = useRef(0)
  const fieldRefs = useRef<Partial<Record<Field, HTMLInputElement | HTMLSelectElement | null>>>({})

  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const open = useCallback(() => {
    if (phase !== 'closed') return
    reducedRef.current = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    auditView.reducedMotion = reducedRef.current
    // Measured from when the FORM appeared, not from page load: the server's
    // question is how long this person spent filling it in.
    openedAtRef.current = Date.now()
    honeypotRef.current = ''
    // `auditView.open` is NOT written here — the phase effect below owns it.
    onOpenChange(true)
    setPhase('entering')
    // Cancels any timer still pending from the previous phase change: open() and
    // close() share this handle, so an open->close inside LEAVE_MS would
    // otherwise leave an orphaned setPhase() to fire against the new phase.
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(
      () => setPhase('open'),
      reducedRef.current ? REDUCED_MS : ENTER_MS,
    )
  }, [phase, onOpenChange])

  const close = useCallback(() => {
    if (phase !== 'open') return
    setPhase('leaving')
    window.clearTimeout(timerRef.current)
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

  // THE ONLY WRITER of `auditView.open` (per rendered scene — an instance with
  // `recomposesScene` false never touches it), and it runs for every phase
  // including 'closed'. Two properties matter and the previous version had
  // neither:
  //
  //  - It is not a partial view. `shiftsFor` maps (phase, breakpoint) to the
  //    flag, so the effect cannot disagree with a write made somewhere else —
  //    there is nowhere else. What made the panel strand the camera was exactly
  //    that disagreement: close() cleared the flag, this effect re-ran on the
  //    'leaving' change close() had just caused, and set it straight back.
  //  - It always has an exit. The cleanup clears the flag, so the last phase
  //    change and an unmount both land on false rather than on "whatever the
  //    early return skipped".
  //
  // The subscription itself is still here for the reason it was added: the
  // recomposition decision has to survive a rotation. Turn a phone to landscape
  // with the section open and it crosses 768px, and a one-shot read taken when
  // the gesture started would have the camera keeping its portrait answer.
  useEffect(() => {
    if (!recomposesScene) return
    const wide = window.matchMedia(`(min-width: ${MOBILE_MAX}px)`)
    const sync = () => {
      auditView.open = shiftsFor(phase, wide.matches)
    }
    sync()
    wide.addEventListener('change', sync)
    return () => {
      wide.removeEventListener('change', sync)
      auditView.open = false
    }
  }, [phase, recomposesScene])

  // No hard-close on an experience swap any more (2026-09-03): the header, and
  // with it this section, lives on Murcia as well as Earth, and a warp cannot
  // start while the section is open — App's `canNavigate` refuses it. In Murcia
  // the curtain simply covers the left strip; the camera recomposition is
  // Earth's (AuditCameraShift is a no-op there).

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

  // Errors are DERIVED, not stored. They are a pure function of `values`, and
  // the previous version kept them in state — which meant every writer had to
  // remember to recompute them, and `setValue` did it by calling `setErrors`
  // from inside the `setValues` updater. React 19 may invoke an updater twice
  // (StrictMode does), and an updater that fires another setState is not pure.
  //
  // Deriving also retires the `valuesRef` this file kept purely so the blur
  // handler could read fresh values without re-binding: there is nothing left
  // to read, because validation happens at render against the current values.
  //
  // Errors are computed live but only *shown* once the field was touched or a
  // submit was attempted — no errors before interaction (plan 005 §11). That is
  // `showError` below; this is just the arithmetic.
  const errors = useMemo(() => validate(values), [values])

  const setValue = useCallback((field: Field, value: string) => {
    setValues((prev) => ({ ...prev, [field]: value }))
    // A server complaint about this field is about the value it just replaced.
    setServerErrors((prev) => (prev[field] === undefined ? prev : { ...prev, [field]: undefined }))
  }, [])

  const markTouched = useCallback((field: Field) => {
    setTouched((prev) => (prev[field] ? prev : { ...prev, [field]: true }))
  }, [])

  const handleSubmit = useCallback(
    (e: FormEvent) => {
      e.preventDefault()
      // In flight or already delivered: there is nothing a second press should
      // do. 'error' deliberately falls through — the CTA is the retry.
      if (submission === 'submitting' || submission === 'success') return
      setSubmitAttempted(true)
      const firstInvalid = FIELD_ORDER.find((f) => errors[f])
      if (firstInvalid) {
        fieldRefs.current[firstInvalid]?.focus()
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
          // `success` only on a RESOLVED request — the transport owns what
          // resolution means, and refuses to read anything but a delivered
          // 2xx as one.
          if (submitSeqRef.current === seq) setSubmission('success')
        },
        (error: unknown) => {
          if (submitSeqRef.current !== seq) return
          setFailure(codeOf(error))
          // Only the server knows some of these — a URL our rules allow and
          // its rules do not, say. Rendered against the field, not just in the
          // banner, or the person has to guess which one it meant.
          const fields = fieldsOf(error)
          if (fields !== undefined) {
            const mapped: Partial<Record<Field, string>> = {}
            for (const field of FIELD_ORDER) {
              const message = fields[field]
              if (typeof message === 'string') mapped[field] = message
            }
            setServerErrors(mapped)
          }
          setSubmission('error')
        },
      )
    },
    [submission, errors, values, submit],
  )

  // The success state is an announcement, and focus is how it is announced to
  // everyone: the heading is what a screen reader lands on, and what the eye
  // finds where the form just was.
  useEffect(() => {
    if (submission === 'success') successHeadingRef.current?.focus({ preventScroll: true })
  }, [submission])

  // Closing settles the submission's afterlife. A delivered request means the
  // form's job is done — reopening offers a fresh one. A failed attempt keeps
  // what was typed (closing is a navigation, not a cancel), but returns to
  // 'idle' so reopening shows the form, not a stale banner. A request still in
  // flight is left to land — its .then above runs while closed, and THEN this
  // effect settles it.
  useEffect(() => {
    if (phase !== 'closed') return
    if (submission === 'idle' || submission === 'submitting') return
    submitSeqRef.current += 1
    if (submission === 'success') {
      setValues(EMPTY_VALUES)
      setTouched({})
      setSubmitAttempted(false)
      setServerErrors({})
    }
    setSubmission('idle')
  }, [phase, submission])

  const showError = (field: Field): string | undefined => {
    // The server's complaint outranks ours: it saw the value we let through.
    const fromServer = serverErrors[field]
    if (fromServer !== undefined) return fromServer
    return touched[field] || submitAttempted ? errors[field] : undefined
  }

  // Built once, per field, and never rebuilt: a `ref` callback is compared by
  // identity, so a fresh closure on every render makes React call the old one
  // with `null` and the new one with the element — for all five fields, on
  // every keystroke. `onBlur` is bundled in for the same reason.
  const fieldHandlers = useMemo(() => {
    const handlers = {} as Record<
      Field,
      {
        ref: (el: HTMLInputElement | HTMLSelectElement | null) => void
        onBlur: () => void
      }
    >
    for (const field of FIELD_ORDER) {
      handlers[field] = {
        ref: (el) => {
          fieldRefs.current[field] = el
        },
        onBlur: () => markTouched(field),
      }
    }
    return handlers
  }, [markTouched])

  const fieldProps = (field: Field) => {
    const error = showError(field)
    return {
      id: `${idPrefix}-${field}`,
      value: values[field],
      'aria-invalid': error ? true : undefined,
      'aria-describedby': error ? `${idPrefix}-${field}-error` : undefined,
      onBlur: fieldHandlers[field].onBlur,
      ref: fieldHandlers[field].ref,
    }
  }

  const errorLine = (field: Field) => {
    const error = showError(field)
    if (!error) return null
    return (
      <p className="audit-field__error" id={`${idPrefix}-${field}-error`}>
        {error}
      </p>
    )
  }

  const isOpenish = phase === 'entering' || phase === 'open'

  // Opens only. While the section is open the trigger fades out entirely
  // (closing lives on the panel's back arrow) but stays MOUNTED: it is the fade
  // target on the way out, and close() returns focus to it. Disabled in every
  // non-closed phase so the invisible control cannot be clicked mid-fade. Kept
  // mounted while the section is open even if `ready` drops (a debug replay
  // rewinds the phase).
  const trigger = (ready || phase !== 'closed') && (
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
  )

  return (
    <>
      {/* Into the site header when there is one; the section keeps owning the
          button either way (SiteHeader.tsx explains the arrangement). */}
      {triggerHost ? createPortal(trigger, triggerHost) : trigger}

      <section
        className="audit-overlay"
        data-state={phase}
        aria-hidden={phase === 'closed'}
        aria-labelledby={`${idPrefix}-title`}
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
            {submission === 'success' ? (
              /* The delivered state, in-panel: the person is TOLD their request
                 arrived, where the form just was, instead of the panel silently
                 closing under them. role="status" so the announcement also
                 reaches assistive tech that missed the focus move. */
              <div className="audit-form audit-success" role="status">
                <div className="audit-group">
                  <p className="audit-eyebrow">Auditoría SEO</p>
                </div>
                <div className="audit-group">
                  <h2
                    className="audit-title"
                    id={`${idPrefix}-title`}
                    tabIndex={-1}
                    ref={successHeadingRef}
                  >
                    {FORM_MESSAGES.auditTitle}
                  </h2>
                  {/* Both strings come from Sanity (plan 012): the promise in
                      them is about the client's own working week, so they can
                      reword it without a deploy. */}
                  <p className="audit-description">{FORM_MESSAGES.auditBody}</p>
                </div>
                <div className="audit-group">
                  <button type="button" className="audit-cta" onClick={close}>
                    Cerrar
                  </button>
                </div>
              </div>
            ) : (
              <form className="audit-form" noValidate onSubmit={handleSubmit}>
                {/* THE HONEYPOT. A real input, off screen, that no person can
                    see, reach by keyboard or hear read out — so anything that
                    arrives with a value in it filled in every field it found.
                    The server answers such a submission 200 and sends nothing,
                    which is the one place this codebase reports a success that
                    did not happen; `server/handleSubmission.ts` says why.

                    Positioned off screen rather than `display: none`, because
                    the cruder scripts skip what is displayed as none — and
                    `tabIndex={-1}` plus `aria-hidden` keep it away from
                    everyone the form is actually for. */}
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
                <div className="audit-group audit-group--1">
                  <p className="audit-eyebrow">Auditoría SEO</p>
                </div>

                <div className="audit-group audit-group--2">
                  <h2 className="audit-title" id={`${idPrefix}-title`} tabIndex={-1} ref={headingRef}>
                    Solicita la auditoría de tu presencia digital
                  </h2>
                  <p className="audit-description">
                    Analizamos tu web, tu posicionamiento y tu competencia. Recibirás un
                    informe con las acciones priorizadas para tu marca.
                  </p>
                </div>

                <div className="audit-group audit-group--3">
                  {FIELD_ORDER.map((field) => (
                    <AuditField
                      key={field}
                      idPrefix={idPrefix}
                      field={field}
                      def={FIELD_DEFS[field]}
                      controlProps={fieldProps(field)}
                      onChange={(value) => setValue(field, value)}
                      error={errorLine(field)}
                    />
                  ))}
                </div>

                <div className="audit-group audit-group--4">
                  {/* Failure is direction, not mood: what happened, what to do.
                      Everything typed is still in the fields above. */}
                  {submission === 'error' && (
                    <p className="audit-form__error" role="alert">
                      {failureMessage(failure)}
                    </p>
                  )}
                  <button
                    type="submit"
                    className="audit-cta"
                    disabled={submission === 'submitting'}
                  >
                    {submission === 'submitting'
                      ? 'Enviando…'
                      : submission === 'error'
                        ? 'Reintentar'
                        : 'Continuar'}
                    <span className="audit-cta__arrow" aria-hidden="true">
                      →
                    </span>
                  </button>
                  {/* The response promise, and it sits ABOVE the fine print
                      rather than inside it on purpose: it is the answer to
                      "what happens after I press this", which is the question
                      being asked at the moment the button is in reach.

                      Local copy, not a SiteSettings field. Every visible string
                      in this form is local; the four CMS fields exist for the
                      post-submission state, and a schema field plus mapper plus
                      fixture plus invariant for one static sentence is churn.
                      NOTE: the same promise also lives in the CMS-owned
                      `auditSuccessBody` — if the client ever changes the SLA,
                      both have to move. */}
                  <p className="audit-note audit-note--sla">
                    Solemos responder en menos de 24 horas.
                  </p>
                  <p className="audit-note">
                    Revisamos cada solicitud de forma manual. Sin compromiso.
                  </p>
                  {/* The same implied-consent note the contact dialog has
                      carried since it was written, extended here now that a
                      submission genuinely leaves the browser. A checkbox waits
                      on the real legal text (SEC-12 stays open until then). */}
                  <p className="audit-note">
                    Al enviar aceptas los{' '}
                    <button
                      type="button"
                      className="audit-legal__link"
                      onClick={() => onOpenLegal('terminos')}
                    >
                      términos y privacidad
                    </button>
                    .
                  </p>
                  {/* The legal links, moved off the Earth floor line on
                      2026-08-24 (DECISIONS §30). Form branch only: on the
                      success screen the ask is already made and the panel is a
                      receipt. They ride audit-group--4's staggered entrance. */}
                  <p className="audit-legal">
                    <button
                      type="button"
                      className="audit-legal__link"
                      onClick={() => onOpenLegal('terminos')}
                    >
                      Términos y privacidad
                    </button>
                    <button
                      type="button"
                      className="audit-legal__link"
                      onClick={() => onOpenLegal('aviso')}
                    >
                      Aviso legal
                    </button>
                  </p>
                  {/* No sky credit here, deliberately. The backdrop used to be
                      ESO's CC BY 4.0 panorama and this is where its mandatory
                      attribution lived. The client requires that the site carry
                      no attribution, so the panorama was replaced with a public
                      domain source and the credit came out with it — see
                      CREDITS.md. If the sky is ever swapped again, check the new
                      source's licence before assuming this stays empty. */}
                </div>
              </form>
            )}
          </div>
          {/* Soft black-to-transparent falloff into the canvas area, so the
              panel edge does not read as a hard cut (plan 005 §4). */}
          <div className="audit-curtain__edge" aria-hidden="true" />
        </div>
      </section>
    </>
  )
}
