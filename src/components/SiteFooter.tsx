import { COPYRIGHT, SITE_PHONES } from '../content/site'
import type { LegalDocId } from '../content/site'

interface Props {
  /** Opens a legal document panel. App owns which one is showing. */
  onOpenLegal: (doc: LegalDocId) => void
}

/**
 * The Earth scene's floor line: phone numbers on the left, the legal links and
 * the brand mark on the right.
 *
 * Mounted only at `phase === 'site'` on Earth — the caller's guard, the same
 * expression that gates the audit trigger (DECISIONS §26.16: chrome is
 * unmounted before the intro lands, never hidden). Murcia keeps its floor for
 * its own controls hint, which is why this never renders there.
 *
 * The numbers are bare links, not a disclosure: a phone number that must be
 * discovered behind a button costs calls, and the strip is quiet enough that
 * hiding it would save nothing.
 */
export function SiteFooter({ onOpenLegal }: Props) {
  return (
    <footer className="site-footer">
      <div className="site-footer__phones">
        <svg
          className="site-footer__phone-icon"
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
          <a key={phone.tel} className="site-footer__phone" href={`tel:${phone.tel}`}>
            {phone.display}
          </a>
        ))}
      </div>
      <div className="site-footer__legal">
        <button type="button" className="site-footer__link" onClick={() => onOpenLegal('terminos')}>
          Términos y privacidad
        </button>
        <button type="button" className="site-footer__link" onClick={() => onOpenLegal('aviso')}>
          Aviso legal
        </button>
        <span className="site-footer__copyright">{COPYRIGHT}</span>
      </div>
    </footer>
  )
}
