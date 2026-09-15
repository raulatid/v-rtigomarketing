import { ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import {
  MENU_MOTION_MS,
  MENU_REDUCED_MS,
  type HeaderMenuState,
} from '../corner-logo/headerMenuTiming'
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
  /**
   * Whether one of the panels this menu opens is already open.
   *
   * The burger goes away entirely while it is true. On a phone this menu is the
   * only way into Auditoría or Contacto, so no route is lost — and the header
   * sits above the audit curtain, so a burger left showing would float over
   * the panel it opened.
   */
  panelOpen?: boolean
  /**
   * Where the scene's phone menu goes: the layer App keeps BEHIND the canvas,
   * which the viewport reveals by hinging away from it (styles.css,
   * `.app__menu`). On a phone over the scene the menu box is portaled into it;
   * everywhere else — the desktop line, the blog — the box stays inline in the
   * tail. Null (or absent) means "there is no such layer", which is the blog.
   */
  menuHost?: HTMLElement | null
  /** Receives the element the triggers portal into. State, not a ref: the
   *  portals must re-render once the node exists. */
  onActionsHost: (el: HTMLElement | null) => void
  leading?: ReactNode
  brand?: ReactNode
  /** A third control beside the actions — the blog's phone search button. */
  extra?: ReactNode
  /**
   * Hears the phone menu's phase. App mirrors it onto `.app__scene` for the
   * stylesheet (the card's transform is keyed on it) and reads "not closed" as
   * the menu being up — to keep its global Escape out of the menu's way, and
   * to refuse navigation gestures until the card is flat again.
   */
  onMenuStateChange?: (state: HeaderMenuState) => void
}

/**
 * The phone menu's shape, and the one place the two layouts genuinely differ.
 *
 * On the SCENE the menu is the viewport hinging away and sliding down, revealing
 * the layer behind it. The close has a tail — the card's way back — and the
 * header stays "open" for it, so the close is a phase with a clock.
 *
 * On the BLOG it is the 2026-09-04 glass field, unchanged — the blog has no
 * scene canvas to move. It has no tail, so it has no phases: it toggles, and
 * `data-menu-open` is the only thing its stylesheet has ever read.
 */
function usesCard(layout: 'scene' | 'blog'): boolean {
  return layout === 'scene'
}

/** The burger exists only below this width; `siteHeader.css` says the same. */
const PHONE_QUERY = '(max-width: 767px)'

export function SiteHeader({
  layout,
  tone,
  hasActions,
  panelOpen,
  menuHost,
  onActionsHost,
  leading,
  brand,
  extra,
  onMenuStateChange,
}: Props) {
  const [phase, setPhase] = useState<HeaderMenuState>('closed')
  const rootRef = useRef<HTMLElement>(null)
  const burgerRef = useRef<HTMLButtonElement>(null)
  const menuRef = useRef<HTMLDivElement>(null)
  const [actionsEl, setActionsEl] = useState<HTMLElement | null>(null)
  // Whether the box is portaled is decided by the same query that decides
  // whether the burger is drawn; held as state because the portal target is
  // part of the render.
  const [phone, setPhone] = useState(() => window.matchMedia(PHONE_QUERY).matches)

  // One timer for the whole machine, cleared before it is ever re-armed — the
  // AuditSection arrangement. `phaseRef` is what the capture listener reads,
  // because that listener is registered once and must not close over a stale
  // phase.
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const phaseRef = useRef<HeaderMenuState>('closed')
  phaseRef.current = phase

  const menuOpen = phase !== 'closed'

  const clearTimer = useCallback(() => {
    if (timerRef.current !== null) clearTimeout(timerRef.current)
    timerRef.current = null
  }, [])

  useEffect(() => clearTimer, [clearTimer])

  /**
   * Fold. On the scene the card travels back for `MENU_MOTION_MS`, and the
   * header stays open for that tail; the blog is closed in the same tick.
   *
   * Reduced motion is read HERE, at the moment it matters — a media query
   * cannot reach a setTimeout, and the stylesheet collapses its own transition
   * under the same query, so the phase is the only thing that has to agree.
   */
  const closeMenu = useCallback(() => {
    clearTimer()
    if (!usesCard(layout) || phaseRef.current === 'closed') {
      setPhase('closed')
      return
    }
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    setPhase('closing')
    timerRef.current = setTimeout(
      () => setPhase('closed'),
      reduced ? MENU_REDUCED_MS : MENU_MOTION_MS,
    )
  }, [clearTimer, layout])

  /** Open — at once. The stylesheet transitions from wherever the card is. */
  const openMenu = useCallback(() => {
    clearTimer()
    setPhase('open')
  }, [clearTimer])

  /** No tail — for a breakpoint change or a lost host. */
  const hardClose = useCallback(() => {
    clearTimer()
    setPhase('closed')
  }, [clearTimer])

  // A tap on the burger mid-close REOPENS rather than closing again: the card
  // reverses from where it is, which is what a transition does for free, and
  // the close's timer must not fire into the reopened menu.
  const toggleMenu = useCallback(() => {
    if (phaseRef.current === 'open') closeMenu()
    else openMenu()
  }, [openMenu, closeMenu])

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

  // Choosing a door folds the menu, and the door opens in the same tick: on the
  // scene the card returns to fullscreen underneath the arriving panel.
  //
  // A NATIVE capture listener, not a React one: the triggers arrive through
  // portals, whose events bubble along the React tree (to their sections) and
  // never reach an onClick on this DOM ancestor. Nothing is stopped — the
  // trigger's own handler, focus return and `data-state` choreography run
  // exactly as they do from the desktop line.
  useEffect(() => {
    if (!actionsEl) return
    const onClick = () => {
      if (phaseRef.current === 'closed') return
      closeMenu()
    }
    actionsEl.addEventListener('click', onClick, true)
    return () => actionsEl.removeEventListener('click', onClick, true)
  }, [actionsEl, closeMenu])

  // Escape and a press anywhere outside close the menu, opening nothing. Live
  // only while it is open — registering during the tail would race the panels'
  // own Escape handlers.
  //
  // "Outside" is outside the header AND outside the menu box: on the scene the
  // box lives in the layer behind the card, and a tap on the card itself falls
  // through to that layer's ground (the viewport is pointer-events: none while
  // the menu is up), so the ground counts as outside and the doors do not.
  //
  // The close hands focus back to the burger — the rAF idiom the panels use,
  // because the button's own visibility changes in the same commit.
  useEffect(() => {
    if (phase !== 'open') return
    const dismiss = () => {
      closeMenu()
      requestAnimationFrame(() => burgerRef.current?.focus())
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    const onPointer = (e: PointerEvent) => {
      const target = e.target as Node
      if (rootRef.current?.contains(target)) return
      if (menuRef.current?.contains(target)) return
      dismiss()
    }
    window.addEventListener('keydown', onKey)
    window.addEventListener('pointerdown', onPointer)
    return () => {
      window.removeEventListener('keydown', onKey)
      window.removeEventListener('pointerdown', onPointer)
    }
  }, [phase, closeMenu])

  useEffect(() => {
    if (!hasActions) hardClose()
  }, [hasActions, hardClose])

  // A rotation to a desktop width puts the actions back on the line; the
  // stylesheet stops drawing the menu, so the state must not linger either —
  // an `aria-expanded` burger nobody can see. A HARD close, with no tail: the
  // layout the card was drawn for does not exist any more.
  useEffect(() => {
    const query = window.matchMedia(PHONE_QUERY)
    const onChange = (e: MediaQueryListEvent) => {
      setPhone(e.matches)
      if (!e.matches) hardClose()
    }
    query.addEventListener('change', onChange)
    return () => query.removeEventListener('change', onChange)
  }, [hardClose])

  // A panel taking over folds the menu SOFTLY: the burger goes away under the
  // panel, and the card returns to fullscreen beneath it rather than snapping.
  // Only from 'open' — a close already under way is left to finish.
  useEffect(() => {
    if (panelOpen && phaseRef.current === 'open') closeMenu()
  }, [panelOpen, closeMenu])

  useEffect(() => {
    onMenuStateChange?.(phase)
  }, [phase, onMenuStateChange])

  // The right-hand group's width, published on the root as `--site-header-tail`
  // for whatever has to keep clear of it — the Murcia compass centres itself
  // between the header's ends (murcia.css). The group is text and a toggle, so
  // only a measurement knows its width; an observer re-reports on a font swap,
  // a breakpoint, or a control added to the cell. The scene's header only: in a
  // warm session the blog's bar is in the same document, with its own line.
  const tailRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const tail = tailRef.current
    if (layout !== 'scene' || !tail || typeof ResizeObserver !== 'function') return
    const root = document.documentElement
    const observer = new ResizeObserver(([entry]) => {
      root.style.setProperty('--site-header-tail', `${entry.contentRect.width}px`)
    })
    observer.observe(tail)
    return () => {
      observer.disconnect()
      root.style.removeProperty('--site-header-tail')
    }
  }, [layout])

  const actionsId = `site-header-actions-${layout}`

  /* The box around the portal host.

     ALWAYS MOUNTED, in one place or the other, and `display: contents`
     wherever it is not a surface: the actions cell inside it is the portal
     host, and losing that makes ContactSection render its trigger inline into
     the page. On a phone over the scene it is portaled into App's layer behind
     the card; moving it there and back remounts the cell once, which only
     re-portals the two triggers. */
  const menuBox = (
    <div className="site-header__menu" ref={menuRef}>
      <div className="site-header__end" id={actionsId} ref={actionsRef} />
    </div>
  )
  const portalTarget = usesCard(layout) && phone && menuHost ? menuHost : null

  return (
    <header
      ref={rootRef}
      className="site-header"
      data-layout={layout}
      data-tone={tone}
      data-panel-open={panelOpen || undefined}
      // The blog's stylesheet has always read this one, and still does.
      data-menu-open={menuOpen || undefined}
      // The scene's phases. App mirrors this onto `.app__scene`, which is what
      // the card's stylesheet reads; here it is for the burger and for tests.
      data-menu-state={phase}
    >
      <div className="site-header__row">
        <div className="site-header__start">{leading}</div>
        <div className="site-header__brand">{brand}</div>
        <div className="site-header__tail" ref={tailRef}>
          {/* FIRST in the DOM, last on the line (CSS `order`): Tab from the
              burger has to land on the items it just revealed. Three bars that
              fold into a ✕ while the menu is open (siteHeader.css, keyed on
              `data-menu-state`); the state is announced by `aria-expanded`. */}
          {hasActions && (
            <button
              type="button"
              className="site-header__burger"
              aria-label={menuOpen ? 'Cerrar el menú' : 'Menú'}
              aria-expanded={menuOpen}
              aria-controls={actionsId}
              ref={burgerRef}
              onClick={toggleMenu}
            >
              <span className="site-header__burger-bar" aria-hidden="true" />
              <span className="site-header__burger-bar" aria-hidden="true" />
              <span className="site-header__burger-bar" aria-hidden="true" />
            </button>
          )}
          {portalTarget ? createPortal(menuBox, portalTarget) : menuBox}
          {extra !== undefined && <div className="site-header__extra">{extra}</div>}
        </div>
      </div>
      {/* The glass under the line on a phone: the menu's ground and its scrim
          in one. Decorative to assistive tech; a tap on it is "leave". Closed
          on click rather than pointerdown so the press that lands here also
          lifts here — otherwise the field would lose its pointer-events
          mid-gesture and the click would land on the page beneath.

          THE BLOG'S, and only the blog's. The scene's menu is the layer the
          viewport reveals by moving away, and needs no field. */}
      {layout === 'blog' && (
        <div className="site-header__field" aria-hidden="true" onClick={closeMenu} />
      )}
    </header>
  )
}
