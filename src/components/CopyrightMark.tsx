import { COPYRIGHT } from '../content/site'

/**
 * The floor line's brand mark, and nothing else.
 *
 * Named for what it holds rather than for where it sits: it was `SiteFooter`
 * while it carried the phones and the legal links, and those left on
 * 2026-08-24 (DECISIONS §30) for the places the questions they answer actually
 * arise — the numbers under the contact dialog's heading (ContactSection), the
 * legal links under the audit panel's note (AuditSection). The old name kept
 * promising a container that would grow again, which is the move §30 undid.
 * The `.site-footer` class stays: it is a measured contract the hint's floor
 * and an e2e both read against (DECISIONS §41).
 *
 * The element is still `<footer>`. A copyright IS what the `contentinfo`
 * landmark is for, so one child is a correct landmark rather than an amputated
 * section.
 *
 * Mounted at `phase === 'site'` on BOTH experiences — the caller's guard, the
 * same expression that gates the audit trigger (DECISIONS §26.16: chrome is
 * unmounted before the intro lands, never hidden). It used to be Earth-only;
 * the mark belongs to the site, not to one scene, and Murcia's own floor is
 * the shared `.scene-hint`, which already clears this line by 36px on both.
 *
 * `tone` is the SiteHeader prop, passed the same way and for the same reason:
 * the ground under the mark is black on Earth and pale daylight on Murcia. The
 * mark stays white over both and gets something to sit on instead of going
 * ink — the client's direction for scene chrome (siteHeader.css, 2026-09-04).
 */
export function CopyrightMark({ tone }: { tone: 'dark' | 'light' }) {
  return (
    <footer className="site-footer" data-tone={tone}>
      <span className="site-footer__copyright">{COPYRIGHT}</span>
    </footer>
  )
}
