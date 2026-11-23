import { useEffect, useRef } from 'react'
import { COOKIE_COPY } from '../content/site'
import type { LegalDocId } from '../content/site'
import { LEGAL_DOCS } from '../content/legal'
import { LegalBlock } from './LegalBlock'
import { ownsEscape, trapTab } from './focusTrap'
import { CookiePreferences } from './CookiePreferences'
import './modal.css'
import './legalPanel.css'

interface Props {
  /** Which document is showing; null renders nothing. Data-nulled rather than
   *  unmounted by the caller — the CasePanel precedent. */
  doc: LegalDocId | null
  onClose: () => void
  /** Prefix for the title id; two instances share a warm document (the blog
   *  mounts its own — AuditSection says why). */
  idPrefix?: string
}

/**
 * The legal documents, as a panel — there is no router and no second page in
 * this application, so "página legal" is an overlay like everything else the
 * viewer opens. One component for both documents; the content is CMS-owned
 * and reaches here through src/content/site.ts as typed blocks.
 */
export function LegalPanel({ doc, onClose, idPrefix = 'legal' }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Escape belongs to the topmost surface while it is open — the same
  // arrangement the audit section has with App's global handler.
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return
      // In the capture phase and stopped there: opened over Contacto or the
      // audit, this closes alone and leaves them open (accessibility audit
      // 2026-11-18, F4).
      if (!ownsEscape(titleRef.current?.closest('section') ?? null)) return
      e.stopPropagation()
      onClose()
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [doc, onClose])

  useEffect(() => {
    if (!doc) return
    const previous = document.activeElement as HTMLElement | null
    titleRef.current?.focus()
    // The shared trap (focusTrap.ts), which does not count the links inside a
    // closed <details> as reachable: the copy that stood here did, and Tab
    // walked out to the banner behind from «Configurar cookies» (accessibility
    // audit 2026-11-18, F6).
    const trap = (event: KeyboardEvent) => trapTab(event, titleRef.current?.closest('section') ?? null)
    window.addEventListener('keydown', trap)
    return () => {
      window.removeEventListener('keydown', trap)
      if (previous?.isConnected) previous.focus()
      else Array.from(document.querySelectorAll<HTMLElement>('.consent-info')).find(el => el.getClientRects().length > 0)?.focus()
    }
  }, [doc])

  if (!doc) return null
  const content = LEGAL_DOCS[doc]

  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        className="modal-panel legal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${idPrefix}-title`}
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label={doc === 'cookies' ? COOKIE_COPY.close : 'Cerrar'}>
          ✕
        </button>
        <h2 className="modal-title" id={`${idPrefix}-title`} tabIndex={-1} ref={titleRef}>
          {doc === 'cookies' ? COOKIE_COPY.title : content.title}
        </h2>
        {doc === 'cookies' && <CookiePreferences />}
        {doc === 'cookies' ? <details className="cookie-policy">
          <summary>{COOKIE_COPY.policy}</summary>
          <div className="legal-panel__body">{content.body.map((block, i) => <LegalBlock key={i} block={block} />)}</div>
        </details> : <div className="legal-panel__body">
          {content.body.map((block, i) => (
            // Keyed by index rather than by text: two identical paragraphs are
            // legitimate in a legal document, and the old text key collided.
            <LegalBlock key={i} block={block} />
          ))}
        </div>}
      </section>
    </div>
  )
}
