import { useCallback, useEffect, useRef, useState } from 'react'
import { readConsent, subscribeConsent, writeConsent, type ConsentRecord } from '../app/consent'
import type { LegalDocId } from '../content/site'
import './consentBanner.css'

/**
 * The cookie consent banner — asked once, as the intro's last stroke.
 *
 * ── What it asks, and what it does not ──
 *
 * Aceptar / Rechazar for ANALYTICS cookies. Nothing loads either way today: the
 * site sets no cookies and runs no vendor (plan 018 records the inventory), and
 * the client's planned Google Analytics will gate on `src/app/consent.ts` when
 * it lands. Two equal ghost buttons on purpose — the blue family belongs to the
 * primary CTA alone (DECISIONS §30), and rejecting has to be as easy as
 * accepting. The long text is the third legal document, opened through the
 * caller's LegalPanel like the other two.
 *
 * ── Two copies, one signal ──
 *
 * App mounts one inside `.app__scene` and the blog's TopBar mounts another
 * inside `.blog-root`, each under its own LegalPanel — the SiteHeader argument:
 * a warm session hides the scene wholesale, and a cold `blog.html` has no App.
 * Both subscribe to the same module-level record, so a choice made in either
 * unmounts both. The CSS is imported HERE for the same reason: blog.html never
 * loads styles.css.
 *
 * ── Non-modal, and it gates on `phase === 'site'` in the caller ──
 *
 * A region, not a dialog: no scrim, no focus trap, and it never takes focus on
 * arrival — the scroll and pinch gestures must keep working underneath it, so it
 * is in neither `canNavigate` nor App's Escape handler. It mounts only once the
 * intro has landed (DECISIONS §26.16), which is also what fires its entry
 * animation exactly once.
 *
 * ── Exit ──
 *
 * The state flips to 'leaving' and a timer unmounts after the CSS exit has
 * played — the AuditSection arrangement. The timer is what the reduced-motion
 * value shortens; the stylesheet shortens the motion to match.
 *
 * ── After the choice ──
 *
 * The dot stays, as a small ⓘ that opens the policy. The banner's link was the
 * only way to it: the footer carries the © alone and the panels link only the
 * terms and the legal notice, so without this the policy was unreachable the
 * moment a visitor had answered.
 */

interface Props {
  onOpenLegal: (doc: LegalDocId) => void
  /** Prefix for the title id; the blog's copy passes its own. */
  idPrefix?: string
}

// Long enough for the stroke to retract and the leader to fold (consentBanner.css).
const LEAVE_MS = 360
const REDUCED_MS = 60

export function ConsentBanner({ onOpenLegal, idPrefix = 'consent' }: Props) {
  const [record, setRecord] = useState<ConsentRecord | null>(readConsent)
  const [state, setState] = useState<'open' | 'leaving'>('open')
  const [done, setDone] = useState(false)
  const timerRef = useRef<number | undefined>(undefined)

  useEffect(() => subscribeConsent(setRecord), [])
  useEffect(() => () => window.clearTimeout(timerRef.current), [])

  const choose = useCallback((analytics: boolean) => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    writeConsent({ analytics })
    setState('leaving')
    window.clearTimeout(timerRef.current)
    timerRef.current = window.setTimeout(() => setDone(true), reduced ? REDUCED_MS : LEAVE_MS)
  }, [])

  // A stored choice — from before this visit, or made just now by the other
  // copy — means there is nothing to ask, only the policy to keep in reach.
  // This copy's own choice goes through 'leaving' first so the exit plays.
  if (done || (record !== null && state === 'open')) {
    return (
      <button
        type="button"
        className="consent-info"
        aria-label="Política de cookies"
        onClick={() => onOpenLegal('cookies')}
      >
        <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeLinecap="round" aria-hidden="true">
          <circle cx="8" cy="8" r="6.25" strokeWidth="1.2" />
          <path d="M8 7.2v4" strokeWidth="1.5" />
          <circle cx="8" cy="4.9" r="0.35" fill="currentColor" strokeWidth="0.9" />
        </svg>
      </button>
    )
  }

  const titleId = `${idPrefix}-title`

  return (
    <section className="consent-banner" role="region" aria-labelledby={titleId} data-state={state}>
      <span className="consent-banner__dot" aria-hidden="true" />
      <span className="consent-banner__leader" aria-hidden="true" />
      {/* The plate used to carry a stroke-drawn outline here — an SVG rect
          whose dash offset traced it from the leader's landing point, like
          the intro's mark. Plan 020 gave the plate a real material edge, and
          a box cannot have two: a traced hairline ON a bordered plate reads
          as a mistake, not as a drawing. The arrival keeps its order — dot,
          leader, glass, copy — and simply lost a beat. */}
      <div className="consent-banner__plate">
        <p className="consent-banner__label" id={titleId}>
          Cookies
        </p>
        <p className="consent-banner__caption">
          Usaremos cookies de analítica solo si lo aceptas. Hoy este sitio no instala ninguna.
        </p>
        <div className="consent-banner__actions">
          <button type="button" className="consent-banner__button" onClick={() => choose(false)}>
            Rechazar
          </button>
          <button type="button" className="consent-banner__button" onClick={() => choose(true)}>
            Aceptar
          </button>
          <button type="button" className="consent-banner__link" onClick={() => onOpenLegal('cookies')}>
            Política de cookies
          </button>
        </div>
      </div>
    </section>
  )
}
