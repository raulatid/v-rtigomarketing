import { COPYRIGHT } from '../content/site'

/**
 * The Earth scene's floor line: the brand mark, and nothing else.
 *
 * Mounted only at `phase === 'site'` on Earth — the caller's guard, the same
 * expression that gates the audit trigger (DECISIONS §26.16: chrome is
 * unmounted before the intro lands, never hidden). Murcia keeps its floor for
 * its own controls hint, which is why this never renders there.
 *
 * The phones and the legal links used to live here too. On 2026-08-24 the
 * client moved each to where the question it answers actually arises: the
 * numbers under the contact dialog's heading (ContactSection), the legal links
 * under the audit panel's note (AuditSection). DECISIONS §30 records the
 * reversal — the earlier note here argued against exactly this.
 */
export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span className="site-footer__copyright">{COPYRIGHT}</span>
    </footer>
  )
}
