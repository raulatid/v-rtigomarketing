import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import './siteHeader.css'

/**
 * The site's one header, on every surface: Earth, Murcia and the blog.
 *
 * ── A shell, not a menu ──
 *
 * This component owns LAYOUT and nothing else: the line the controls sit on,
 * the three cells (start · brand · tail) and, on a phone, the burger that
 * folds the tail away. The controls themselves belong to whoever owns their
 * behaviour — the back button and the mark are the blog's, and the two
 * triggers stay inside AuditSection and ContactSection, which render them
 * INTO `.site-header__end` through a portal (`triggerHost`). That is what keeps
 * their focus return, their `data-state` choreography and their tests exactly
 * as they were while the header became one thing.
 *
 * ── The scene draws its own brand ──
 *
 * Over Earth and Murcia the brand cell is empty on purpose: the 3D corner logo
 * is an overlay pass on the scene canvas (ADR 002), and CornerLogoLayer
 * measures `.site-header__row` to put it where this layout says the line is.
 * The blog has no canvas, so it passes an SVG mark as `brand` instead.
 *
 * ── Two documents ──
 *
 * `blog.html` never loads styles.css, so the header's own stylesheet is
 * imported here, the way BlogRoute imports blog.css. Nothing in this file may
 * reach `src/experiences/` or `src/graphics/` — the cold blog would pay for it.
 */

interface Props {
  /** 'scene' is transparent over the canvas; 'blog' is a paper bar. */
  layout: 'scene' | 'blog'
  /** Over a light ground (Murcia's sky, the blog's paper) the bare text goes ink. */
  tone: 'dark' | 'light'
  /**
   * Whether anything will be portaled into the tail. The burger renders only
   * then — on the site that is `phase === 'site'`, so no control exists over a
   * half-built scene (DECISIONS §26.16).
   */
  hasActions: boolean
  /** Receives the element the triggers portal into. State, not a ref: the
   *  portals must re-render once the node exists. */
  onActionsHost: (el: HTMLElement | null) => void
  leading?: ReactNode
  brand?: ReactNode
  /** A third control beside the actions — the blog's phone search button. */
  extra?: ReactNode
}

export function SiteHeader({ layout, tone, hasActions, onActionsHost, leading, brand, extra }: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const rootRef = useRef<HTMLElement>(null)
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null)

  // One ref callback feeds both the parent (which portals into the node) and
  // this component (which listens on it). Stable while `onActionsHost` is, so
  // React does not re-run it with null/element on every render.
  const actionsRef = useCallback(
    (el: HTMLElement | null) => {
      setActionsEl(el)
      onActionsHost(el)
    },
    [onActionsHost],
  )

  // Choosing an action is what the sheet was for, so it folds on any click
  // inside the actions cell — before the trigger's own handler runs. A NATIVE
  // capture listener, not a React one: the triggers arrive through portals,
  // whose events bubble along the React tree (to their sections) and never
  // reach an onClick on this DOM ancestor.
  useEffect(() => {
    if (!actionsEl) return
    const fold = () => setMenuOpen(false)
    actionsEl.addEventListener('click', fold, true)
    return () => actionsEl.removeEventListener('click', fold, true)
  }, [actionsEl])

  // Escape and a tap anywhere outside close the sheet. Both are registered only
  // while it is open, so they cannot race the panels' own Escape handlers.
  useEffect(() => {
    if (!menuOpen) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    const onPointer = (e: PointerEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setMenuOpen(false)
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [menuOpen])

  useEffect(() => {
    if (!hasActions) setMenuOpen(false)
  }, [hasActions])

  const actionsId = `site-header-actions-${layout}`

  return (
    <header
      ref={rootRef}
      className="site-header"
      data-layout={layout}
      data-tone={tone}
      data-menu-open={menuOpen || undefined}
    >
      <div className="site-header__row">
        <div className="site-header__start">{leading}</div>
        <div className="site-header__brand">{brand}</div>
        <div className="site-header__tail">
          <div className="site-header__end" id={actionsId} ref={actionsRef} />
          {extra !== undefined && <div className="site-header__extra">{extra}</div>}
          {hasActions && (
            <button
              type="button"
              className="site-header__burger"
              aria-label={menuOpen ? 'Cerrar el menú' : 'Menú'}
              aria-expanded={menuOpen}
              aria-controls={actionsId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              {menuOpen ? (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M5 5l14 14M19 5L5 19" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M4 7h16M4 12h16M4 17h16" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>
    </header>
  )
}
