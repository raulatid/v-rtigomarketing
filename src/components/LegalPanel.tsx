import { useEffect, useRef } from 'react'
import { LEGAL_DOCS } from '../content/site'
import type { LegalDocId } from '../content/site'

interface Props {
  /** Which document is showing; null renders nothing. Data-nulled rather than
   *  unmounted by the caller — the CasePanel precedent. */
  doc: LegalDocId | null
  onClose: () => void
}

/**
 * The legal documents, as a panel — there is no router and no second page in
 * this application, so "página legal" is an overlay like everything else the
 * viewer opens. One component for both documents; the content lives in
 * src/content/site.ts beside the rest of the placeholder brand data.
 */
export function LegalPanel({ doc, onClose }: Props) {
  const titleRef = useRef<HTMLHeadingElement>(null)

  // Escape belongs to the topmost surface while it is open — the same
  // arrangement the audit section has with App's global handler.
  useEffect(() => {
    if (!doc) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  useEffect(() => {
    if (doc) titleRef.current?.focus()
  }, [doc])

  if (!doc) return null
  const content = LEGAL_DOCS[doc]

  return (
    <div className="modal-scrim" onClick={onClose}>
      <section
        className="modal-panel legal-panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="legal-title"
        onClick={(e) => e.stopPropagation()}
      >
        <button type="button" className="modal-close" onClick={onClose} aria-label="Cerrar">
          ✕
        </button>
        <h2 className="modal-title" id="legal-title" tabIndex={-1} ref={titleRef}>
          {content.title}
        </h2>
        <div className="legal-panel__body">
          {content.body.map((paragraph) => (
            <p key={paragraph}>{paragraph}</p>
          ))}
        </div>
      </section>
    </div>
  )
}
