import { type ReactNode, useState } from 'react'
import { BlogHeaderLogo } from './BlogHeaderLogo'
import { SiteMenuLayer, SiteMenuStage } from '../components/SiteMenu'
import type { HeaderMenuState } from '../corner-logo/headerMenuTiming'
import { SiteHeader } from '../components/SiteHeader'
import { AuditSection } from '../components/AuditSection'
import { ContactSection } from '../components/ContactSection'
import { LegalPanel } from '../components/LazyLegalPanel'
import { ConsentBanner } from '../components/ConsentBanner'
import { COPYRIGHT, type LegalDocId } from '../content/site'
import './blog.css'

/**
 * The blog's chrome — header bar, menu layer, footer — without the blog.
 *
 * Lifted out of `BlogRoute.tsx` on 2026-09-26 so the 404 document could wear
 * the same dress. That page must NOT import `BlogRoute`: the route statically
 * carries `BLOG_POSTS` (every article body) and the post serializer, which is
 * exactly what a page with no articles on it should not pay for. What it needs
 * is here, and nothing in this module reaches the dataset.
 */

/**
 * Two glyphs, one per breakpoint, because a viewBox does not rescale.
 *
 * The desktop artboard draws a long arrow beside the word; the phone artboard
 * draws a square chevron alone. Constraining the 44x16 arrow to a 44px square —
 * which is what the mobile rule did before — renders it at 22x8, adrift in the
 * middle of its own tap target. CSS shows exactly one of these at a time.
 */
function BackControl({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button type="button" className="blog-back" onClick={onClick}>
      <svg className="blog-back__arrow" viewBox="0 0 44 16" width="44" height="16" aria-hidden="true">
        <path
          d="M9 1 L2 8 L9 15"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <line x1="2" y1="8" x2="43" y2="8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      </svg>
      <svg
        className="blog-back__chevron"
        viewBox="0 0 24 24"
        width="22"
        height="22"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M15 5l-7 7 7 7" />
      </svg>
      <span className="blog-back__label">{label}</span>
    </button>
  )
}

/**
 * The bar, and how many controls it carries depends on where you are.
 *
 * It is the SITE's header (components/SiteHeader.tsx, 2026-09-03) in its blog
 * dress — paper, a hairline, the mark centred where the scene draws its 3D logo
 * — carrying the two doors every surface carries, Contacto and Auditoría. Both
 * sections mount HERE, in the blog, with their own ids: in a warm session App's
 * copies sit hidden and inert behind this page, and a cold `blog.html` has no
 * App at all. This component still knows nothing about which document it is in.
 *
 * On the INDEX there is nowhere for a mark or a search icon to go — the search
 * field is already on the page and the mark would link to the page you are on —
 * so the mark is decorative and the third cell holds the doors alone.
 *
 * On an ARTICLE both have somewhere to go, and `MovilArticulo.dc.html` draws all
 * three as 44x44 targets. The search control is in the markup at every width and
 * hidden above the breakpoint, where the desktop artboards draw none.
 */
function TopBar({
  onBack,
  onHome,
  onSearch,
  markUpgrade,
  menuHost,
  onMenuStateChange,
}: {
  menuHost: HTMLElement | null
  onMenuStateChange: (state: HeaderMenuState) => void
  onBack: () => void
  onHome?: () => void
  onSearch?: () => void
  markUpgrade: boolean
}) {
  const [actionsHost, setActionsHost] = useState<HTMLElement | null>(null)
  const [auditOpen, setAuditOpen] = useState(false)
  const [contactOpen, setContactOpen] = useState(false)
  const [legalDoc, setLegalDoc] = useState<LegalDocId | null>(null)

  return (
    <>
      <SiteHeader
        layout="blog"
        // The bar is black (siteHeader.css, plan 019 §4): a dark ground, and the
        // header's two triggers dress for it the way they do over Earth.
        tone="dark"
        hasActions
        menuHost={menuHost}
        onMenuStateChange={onMenuStateChange}
        panelOpen={auditOpen || contactOpen || legalDoc !== null}
        onActionsHost={setActionsHost}
        // Both hosts render the same control; only what it does differs, and on
        // an article it goes to the index rather than out of the blog.
        leading={<BackControl label="Ir atrás" onClick={onBack} />}
        // The SVG mark, which upgrades itself to the scene's 3D logo once that
        // has loaded — deferred, and never at the article's expense. Both the
        // decorative and the go-home shapes live in there, because which one it
        // is has nothing to do with how it is drawn.
        brand={<BlogHeaderLogo onHome={onHome} upgrade={markUpgrade} />}
        extra={
          onSearch === undefined ? undefined : (
            <button
              type="button"
              className="blog-topbar__search"
              aria-label="Buscar en el blog"
              onClick={onSearch}
            >
              <svg
                viewBox="0 0 24 24"
                width="20"
                height="20"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-3.5-3.5" />
              </svg>
            </button>
          )
        }
      />

      {/* Contacto first: portals append in mount order and it sits to the LEFT
          of the Auditoría box. The blog has no scene to recompose and no global
          Escape handler to stand down, hence `recomposesScene={false}`.
          Both forms report their state to the shared header. */}
      <ContactSection
        ready
        triggerHost={actionsHost}
        idPrefix="blog-contact"
        suppressed={auditOpen}
        onOpenChange={setContactOpen}
        onOpenLegal={setLegalDoc}
      />
      <AuditSection
        ready
        triggerHost={actionsHost}
        idPrefix="blog-audit"
        recomposesScene={false}
        onOpenChange={setAuditOpen}
        onOpenLegal={setLegalDoc}
      />
      <LegalPanel doc={legalDoc} idPrefix="blog-legal" onClose={() => setLegalDoc(null)} />
      {/* The blog's own copy, under its own LegalPanel: the scene's copy is
          hidden with the scene in a warm session and absent in a cold one. Both
          read one consent record, so a choice made here closes both. */}
      <ConsentBanner idPrefix="blog-consent" onOpenLegal={setLegalDoc} />
    </>
  )
}

/**
 * Keep the header and panels flat while the reading viewport moves behind them.
 *
 * `markUpgrade` is whether the header's mark may claim the document's ONE 3D
 * logo instance (`headerLogoRuntime`). The blog says yes; the 404 page says no,
 * because it draws that instance large in its hero instead. `className` lets a
 * host scope its own overrides (the 404's black ground) without this module
 * knowing which host it is.
 */
export function BlogSurface({
  children,
  onBack,
  onHome,
  onSearch,
  markUpgrade = true,
  className,
}: {
  children: ReactNode
  onBack: () => void
  onHome?: () => void
  onSearch?: () => void
  markUpgrade?: boolean
  className?: string
}) {
  const [menuHost, setMenuHost] = useState<HTMLElement | null>(null)
  const [menuState, setMenuState] = useState<HeaderMenuState>('closed')
  const classes = className === undefined ? 'blog-surface site-menu-surface' : `blog-surface site-menu-surface ${className}`
  return (
    <div className={classes} data-menu-state={menuState} data-menu-open={menuState !== 'closed' || undefined}>
      <TopBar
        onBack={onBack}
        onHome={onHome}
        onSearch={onSearch}
        markUpgrade={markUpgrade}
        menuHost={menuHost}
        onMenuStateChange={setMenuState}
      />
      <SiteMenuLayer hostRef={setMenuHost} />
      <SiteMenuStage inert={menuState !== 'closed'}>{children}</SiteMenuStage>
    </div>
  )
}

/**
 * The floor line, reading the same CMS copyright the scene's `CopyrightMark`
 * does, so an edit in «Ajustes del sitio» lands on every document at once.
 */
export function BlogFooter() {
  return (
    <footer className="blog-footer">
      <span>{COPYRIGHT}</span>
    </footer>
  )
}
