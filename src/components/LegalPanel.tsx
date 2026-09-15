import { useEffect, useRef } from 'react'
import { COOKIE_COPY, LEGAL_DOCS } from '../content/site'
import type { LegalDocId } from '../content/site'
import type { LegalBlock } from '../content/types'
import { spans } from './textSpans'
import { CookiePreferences } from './CookiePreferences'
import './modal.css'
import './legalPanel.css'

/**
 * The block half of the serializer.
 *
 * An EXPLICIT map from block kind to element, not a rich-text library and not
 * `dangerouslySetInnerHTML`. The inline half — marks and links — moved to
 * `textSpans.tsx` when the blog needed the same rules; the argument for it is
 * recorded there.
 *
 * The switch has no default that renders nothing: a block kind that reached here
 * without a case would be a type error, which is the point of the union.
 */
function Block({ block }: { block: LegalBlock }) {
  if (block.kind === 'heading') {
    // The panel's own title is the h2, so a document heading starts at h3 and
    // the outline stays in order for anyone navigating by headings.
    return block.level === 2 ? <h3>{spans(block.spans)}</h3> : <h4>{spans(block.spans)}</h4>
  }
  if (block.kind === 'list') {
    const items = block.items.map((item, i) => <li key={i}>{spans(item)}</li>)
    return block.ordered ? <ol>{items}</ol> : <ul>{items}</ul>
  }
  return <p>{spans(block.spans)}</p>
}

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
      if (e.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [doc, onClose])

  useEffect(() => {
    if (!doc) return
    const previous = document.activeElement as HTMLElement | null
    titleRef.current?.focus()
    const trap = (event: KeyboardEvent) => {
      if (event.key !== 'Tab') return
      const panel = titleRef.current?.closest('section')
      const nodes = Array.from(panel?.querySelectorAll<HTMLElement>('button:not(:disabled), input:not(:disabled), summary, a[href]') ?? []).filter(el => el.getClientRects().length > 0)
      const first = nodes[0], last = nodes[nodes.length - 1]
      if (event.shiftKey && (document.activeElement === first || document.activeElement === titleRef.current)) {
        event.preventDefault(); last?.focus()
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault(); first?.focus()
      }
    }
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
          <div className="legal-panel__body">{content.body.map((block, i) => <Block key={i} block={block} />)}</div>
        </details> : <div className="legal-panel__body">
          {content.body.map((block, i) => (
            // Keyed by index rather than by text: two identical paragraphs are
            // legitimate in a legal document, and the old text key collided.
            <Block key={i} block={block} />
          ))}
        </div>}
      </section>
    </div>
  )
}
