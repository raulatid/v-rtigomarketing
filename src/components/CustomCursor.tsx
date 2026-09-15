import { prefersReducedMotion } from '../platform/motionPreference'
import { useEffect, useRef } from 'react'
import { CursorHint, subscribeCursorHint } from '../interaction/cursorSignal'
import { clampFrameDelta } from '../graphics/frameDelta'

// Trailing-follower stiffness for the exponential lerp. Higher = tighter trail.
// Applied as 1 - exp(-RATE * dt) so the feel is identical at 60Hz and 144Hz.
const FOLLOW_RATE = 13

// Squared px distance under which the follower snaps to the target and the
// rAF loop stops — no work at all while the mouse is still.
const SETTLE_EPSILON_SQ = 0.01

// DOM elements that should read as "interactive" to the cursor. The 3D scene's
// hovers arrive through cursorSignal instead — this only covers regular UI
// (audit trigger, panel close, links, debug controls).
const INTERACTIVE_SELECTOR = 'a, button, [role="button"], input, select, textarea, label, summary'

// White hand pinned to the pointer (open at rest, a fist while the button is
// held — the grab/drag metaphor), blue follower ring easing after it.
// All motion is direct style writes inside one rAF loop — this component
// renders exactly once and never again. Positioning is transform-only
// (compositor work, no layout/paint), and visual states (hover grow, grabbing
// shrink, show/hide) live in CSS keyed off a data attribute so they never
// touch the JS hot path.
interface Props {
  /**
   * Off on blog routes, and this is the one place the "never unmount me" note in
   * App.tsx does not apply.
   *
   * `styles.css` sets `cursor: none !important` on EVERY element while this is
   * running, so a page of serif prose would have no I-beam and no visible
   * text-selection affordance. The white hand is drawn for a dark canvas and
   * cannot become a caret.
   *
   * Disabling runs the effect cleanup below, which is already exactly the three
   * things that have to happen: the `has-custom-cursor` class comes off <html>,
   * the settle rAF is cancelled, and every listener is removed. Re-enabling
   * rebuilds all of it from the same effect.
   */
  enabled?: boolean
}

export function CustomCursor({ enabled = true }: Props) {
  const layerRef = useRef<HTMLDivElement>(null)
  const leadRef = useRef<HTMLDivElement>(null)
  const followRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!enabled) return
    // Coarse pointers (touch) get no custom cursor — it would just be a dot
    // frozen wherever the last tap landed. Native cursor behavior stays.
    if (!window.matchMedia('(pointer: fine)').matches) return

    const layer = layerRef.current
    const lead = leadRef.current
    const follow = followRef.current
    if (!layer || !lead || !follow) return

    // Scoped to <html> so the CSS `cursor: none` override only applies while
    // the custom cursor is actually mounted and running.
    document.documentElement.classList.add('has-custom-cursor')

    // With reduced motion the follower snaps to the pointer instead of
    // trailing — the two-circle look stays, the chase animation goes.
    const reducedMotion = prefersReducedMotion()

    let targetX = 0
    let targetY = 0
    let followX = 0
    let followY = 0
    let seen = false
    let running = false
    let raf = 0
    let lastTime = 0

    // Two hover sources merge into one visual state: the 3D scene's arbitrated
    // hint (satellites, drag) and plain DOM hover over interactive elements.
    let hint: CursorHint = ''
    let domHover = false
    let appliedState = ''

    function applyState() {
      const next = hint || (domHover ? 'pointer' : '')
      if (next === appliedState || !layer) return
      appliedState = next
      layer.dataset.state = next
    }

    function frame(now: number) {
      const dt = clampFrameDelta((now - lastTime) / 1000)
      lastTime = now

      const f = reducedMotion ? 1 : 1 - Math.exp(-FOLLOW_RATE * dt)
      followX += (targetX - followX) * f
      followY += (targetY - followY) * f

      lead!.style.transform = `translate3d(${targetX}px, ${targetY}px, 0)`
      follow!.style.transform = `translate3d(${followX}px, ${followY}px, 0)`

      const dx = targetX - followX
      const dy = targetY - followY
      if (dx * dx + dy * dy < SETTLE_EPSILON_SQ) {
        followX = targetX
        followY = targetY
        running = false
        return
      }
      raf = requestAnimationFrame(frame)
    }

    function wake() {
      if (running) return
      running = true
      lastTime = performance.now()
      raf = requestAnimationFrame(frame)
    }

    function onPointerMove(event: PointerEvent) {
      targetX = event.clientX
      targetY = event.clientY
      if (!seen) {
        // First sighting: spawn the follower AT the pointer, not sliding in
        // from the (0,0) corner.
        seen = true
        followX = targetX
        followY = targetY
        layer!.classList.add('is-visible')
      }
      const target = event.target as Element | null
      domHover = !!target?.closest?.(INTERACTIVE_SELECTOR)
      applyState()
      wake()
    }

    // The open→fist swap is CSS keyed off data-pressed; these just flip the
    // attribute. Listening on window (not the canvas) means the fist shows for
    // any press — matching how the hand metaphor reads: press = grab.
    function onPointerDown() {
      layer!.dataset.pressed = 'true'
    }

    function onPointerRelease() {
      delete layer!.dataset.pressed
    }

    // relatedTarget === null means the pointer left the window entirely.
    function onPointerOut(event: PointerEvent) {
      if (event.relatedTarget) return
      seen = false
      layer!.classList.remove('is-visible')
    }

    const unsubscribe = subscribeCursorHint((next) => {
      hint = next
      applyState()
    })

    window.addEventListener('pointermove', onPointerMove, { passive: true })
    window.addEventListener('pointerout', onPointerOut, { passive: true })
    window.addEventListener('pointerdown', onPointerDown, { passive: true })
    window.addEventListener('pointerup', onPointerRelease, { passive: true })
    window.addEventListener('pointercancel', onPointerRelease, { passive: true })
    // A press that ends outside the window (drag out, alt-tab) never fires
    // pointerup here — blur is the reliable release signal for that.
    window.addEventListener('blur', onPointerRelease)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerout', onPointerOut)
      window.removeEventListener('pointerdown', onPointerDown)
      window.removeEventListener('pointerup', onPointerRelease)
      window.removeEventListener('pointercancel', onPointerRelease)
      window.removeEventListener('blur', onPointerRelease)
      unsubscribe()
      cancelAnimationFrame(raf)
      document.documentElement.classList.remove('has-custom-cursor')
    }
  }, [enabled])

  // Nothing rendered while disabled, so no stale `is-visible` layer can be left
  // painted over the blog. The component itself stays mounted, so the effect
  // above owns the teardown rather than the parent.
  if (!enabled) return null

  return (
    <div className="cursor-layer" ref={layerRef} aria-hidden="true">
      {/* Follower first so the white leader paints on top when they overlap. */}
      <div className="cursor-follow" ref={followRef}>
        <div className="cursor-follow-core" />
      </div>
      {/* Artwork is the designer's, from docs/icons/{open,pointer,close}-hand-icon.svg
          — path data inlined rather than fetched, because a cursor that 404s or
          flashes on first hover leaves the site with no visible pointer at all.
          THOSE FILES ARE NOT READ AT RUNTIME: re-paste the `d` attribute here if
          they are ever redrawn.

          All three stay mounted; CSS crossfades them on data-pressed /
          data-state so the swap costs one attribute write, no DOM churn. */}
      <div className="cursor-lead" ref={leadRef}>
        <svg className="cursor-hand cursor-hand--open" viewBox="0 0 32 32">
          <path d="M17.6 4.8c0-.885-.715-1.6-1.6-1.6s-1.6.715-1.6 1.6v10.4c0 .44-.36.8-.8.8s-.8-.36-.8-.8V6.4c0-.885-.715-1.6-1.6-1.6s-1.6.715-1.6 1.6V20c0 .075 0 .155.005.23L6.58 17.35c-.8-.76-2.065-.73-2.83.07a2 2 0 0 0 .07 2.83l5.62 5.35a11.6 11.6 0 0 0 8 3.2h.96a8.8 8.8 0 0 0 8.8-8.8V9.6c0-.885-.715-1.6-1.6-1.6S24 8.715 24 9.6v5.6c0 .44-.36.8-.8.8s-.8-.36-.8-.8V6.4c0-.885-.715-1.6-1.6-1.6s-1.6.715-1.6 1.6v8.8c0 .44-.36.8-.8.8s-.8-.36-.8-.8z" />
        </svg>
        <svg className="cursor-hand cursor-hand--point" viewBox="0 0 32 32">
          <path d="M11.2 5.2a2 2 0 1 1 4 0v7.41a2.404 2.404 0 0 1 3.85.95 2.4 2.4 0 0 1 4.145 1.455A2.4 2.4 0 0 1 27.2 16.8v5.6a6.4 6.4 0 0 1-6.4 6.4h-4.265q-.375.001-.735-.05c-2.765-.28-5.31-1.7-7-3.95L5.2 20a1.997 1.997 0 0 1 .4-2.8 1.997 1.997 0 0 1 2.8.4l2.8 3.735zm5.6 13.2c0-.44-.36-.8-.8-.8s-.8.36-.8.8v4.8c0 .44.36.8.8.8s.8-.36.8-.8zm2.4-.8c-.44 0-.8.36-.8.8v4.8c0 .44.36.8.8.8s.8-.36.8-.8v-4.8c0-.44-.36-.8-.8-.8Zm4 .8c0-.44-.36-.8-.8-.8s-.8.36-.8.8v4.8c0 .44.36.8.8.8s.8-.36.8-.8z" />
        </svg>
        <svg className="cursor-hand cursor-hand--fist" viewBox="0 0 32 32">
          <path d="M6.77 19.88a2.4 2.4 0 0 1-.37-1.28v-1.8a2.4 2.4 0 0 1 2.4-2.4h.8v-4a2.4 2.4 0 0 1 4.445-1.26 2.4 2.4 0 0 1 4.71.005 2.4 2.4 0 0 1 3.56 1.425A2.4 2.4 0 0 1 25.6 12.8v4.845c0 .495-.115.985-.34 1.43l-1.98 3.955a3.2 3.2 0 0 1-2.86 1.77H11.2c-.825 0-1.59-.42-2.03-1.12z" />
        </svg>
      </div>
    </div>
  )
}
