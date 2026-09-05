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
 * ── The brand cell is drawn by whoever can draw it ──
 *
 * Over Earth and Murcia it is empty on purpose: the 3D corner logo is an overlay
 * pass on the scene canvas (ADR 002), and CornerLogoLayer measures
 * `.site-header__row` to put it where this layout says the line is.
 *
 * The blog has no scene canvas, so it passes `BlogHeaderLogo` as `brand` — an
 * SVG that upgrades itself into the same 3D mark on a little canvas of its own
 * (adr/013, amended 2026-09-04). Either way this component only owns the cell.
 * The blog's bar is black (plan 019 §4) and the mark is white on it: the SVG
 * through `currentColor`, the 3D one by its own material.
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
  /**
   * Hears the phone menu open and close. App uses it to keep its global Escape
   * (skip to the end of the intro) out of the menu's way: both listen on
   * `window`, and a re-seek to 'site' snaps the parked logo.
   */
  onMenuOpenChange?: (open: boolean) => void
}

/** The burger exists only below this width; `siteHeader.css` says the same. */
const PHONE_QUERY = '(max-width: 767px)'

export function SiteHeader({
  layout,
  tone,
  hasActions,
  onActionsHost,
  leading,
  brand,
  extra,
  onMenuOpenChange,
}: Props) {
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

  // A rotation to a desktop width puts the actions back on the line; the
  // stylesheet stops drawing the menu, so the state must not linger either —
  // an `aria-expanded` burger nobody can see, and a field ready to swallow
  // the next tap.
  useEffect(() => {
    const phone = window.matchMedia(PHONE_QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      if (!e.matches) setMenuOpen(false)
    }
    phone.addEventListener('change', onChange)
    return () => phone.removeEventListener('change', onChange)
  }, [])

  useEffect(() => {
    onMenuOpenChange?.(menuOpen)
  }, [menuOpen, onMenuOpenChange])

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
          {/* FIRST in the DOM, last on the line (CSS `order`): Tab from the
              burger has to land on the items it just revealed. Three bars, not
              two glyphs — the stylesheet morphs them into the ✕. */}
          {hasActions && (
            <button
              type="button"
              className="site-header__burger"
              aria-label={menuOpen ? 'Cerrar el menú' : 'Menú'}
              aria-expanded={menuOpen}
              aria-controls={actionsId}
              onClick={() => setMenuOpen((open) => !open)}
            >
              <span className="site-header__burger-bar" aria-hidden="true" />
              <span className="site-header__burger-bar" aria-hidden="true" />
              <span className="site-header__burger-bar" aria-hidden="true" />
            </button>
          )}
          <div className="site-header__end" id={actionsId} ref={actionsRef} />
          {extra !== undefined && <div className="site-header__extra">{extra}</div>}
        </div>
      </div>
      {/* The glass under the line on a phone: the menu's ground and its scrim
          in one. Decorative to assistive tech; a tap on it is "leave". Closed
          on click rather than pointerdown so the press that lands here also
          lifts here — otherwise the field would lose its pointer-events
          mid-gesture and the click would land on the page beneath. Outside the
          phone query the stylesheet does not draw it. */}
      <div className="site-header__field" aria-hidden="true" onClick={() => setMenuOpen(false)} />
    </header>
  )
}
