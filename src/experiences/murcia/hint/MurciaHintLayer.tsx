import { RefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { createIdleWatch } from '../../../interaction/hintIdle'
import { subscribeCursorHint } from '../../../interaction/cursorSignal'
import type { MurciaExperience } from '../MurciaExperience'

/**
 * WHEN Murcia's hint is offered. What it looks like is `MurciaHint.tsx` and
 * `.scene-hint` in `styles.css`; this file decides nothing about that.
 *
 * Earth's `HintLayer`, brought to the city as it is (2026-09-22) and turned
 * with it on 2026-09-23: the sentence STANDS on arrival, holds for five
 * seconds into a burst of activity, and comes back after two seconds of
 * stillness (`interaction/hintIdle`). The plate that stood here until
 * 2026-09-15 was offered a beat after each landing and did not come back; this
 * comes back whenever the viewer stops, which is when a way out is wanted.
 *
 * ## What it needs from the city
 *
 * PERMISSION from the app — `attention.hintAllowed`, meaning the viewer is in
 * Murcia and nothing else has their attention — and, from the experience,
 * whether the viewer is actually NAVIGATING the city: not inside the campus,
 * not flying to the blog, not under a cinematic. A hint about leaving, offered
 * over the services ring, would be in the way of the thing they just entered.
 *
 * ## The hover is the cursor's word
 *
 * Earth reads a per-frame satellite hover ref. The city has no one pick to
 * read; its hovers arbitrate through the cursor manager and come out as one
 * `cursorSignal` hint, so a `'pointer'` there — a building under the pointer —
 * is what counts as "the viewer has found a target" here. Held rather than
 * poked once, so the wait only restarts when the pointer leaves.
 *
 * ## The element is FOUND, not threaded
 *
 * One `data-visible` attribute crosses from the scene to the page: this
 * queries `.murcia-hint` and paints `dataset.visible`, and CSS owns every
 * pixel after that. Visibility never becomes React state, for the reason
 * `App.tsx` gives about its neighbour.
 */
export function MurciaHintLayer({
  attention,
  active,
  experienceRef,
  idleSeconds,
  graceSeconds,
}: {
  attention: Readonly<{ hintAllowed: boolean }>
  active: boolean
  experienceRef: RefObject<MurciaExperience | null>
  /** Stillness before the hint returns; Earth's number, shared on purpose. */
  idleSeconds: number
  /** How long it stands while the viewer is busy; Earth's number too. */
  graceSeconds: number
}) {
  const idle = useMemo(
    () => createIdleWatch({ idleSeconds, graceSeconds }),
    [idleSeconds, graceSeconds],
  )
  /** The node `App` renders. Null wherever nothing rendered it — the harnesses. */
  const el = useRef<HTMLElement | null>(null)
  /** What is currently painted, so a frame that changes nothing writes nothing. */
  const painted = useRef(false)
  /** The cursor's current word; `'pointer'` is a building under the pointer. */
  const hovering = useRef(false)

  useEffect(() => {
    el.current = document.querySelector<HTMLElement>('.murcia-hint')
    return () => {
      // A layer that goes away must not leave a sentence on the screen.
      paint(el.current, painted, false)
      el.current = null
    }
  }, [])

  // The same committed acts Earth's layer counts, for the same reasons: a
  // press, a scroll, a key — never a bare pointer move, which is what a viewer
  // does while reading. On `window` in the capture phase, so a panel that
  // stops propagation still counts; passive, because nothing here prevents a
  // default.
  useEffect(() => {
    const poke = () => idle.poke()
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const
    for (const type of events) {
      window.addEventListener(type, poke, { passive: true, capture: true })
    }
    const unsubscribe = subscribeCursorHint((hint) => {
      hovering.current = hint === 'pointer'
    })
    return () => {
      for (const type of events) {
        window.removeEventListener(type, poke, { capture: true })
      }
      unsubscribe()
    }
  }, [idle])

  useFrame((_, delta) => {
    // HIDDEN while Earth is showing, not frozen: leaving the flag painted would
    // strand the sentence over the globe.
    const experience = experienceRef.current
    if (!active || !experience || !experience.isNavigating) {
      paint(el.current, painted, false)
      return
    }

    if (hovering.current) idle.poke()

    // Asked EVERY frame, including while the hint is up: the answer is a state
    // and not an edge, so the frame the grace runs out turns this false and the
    // sentence fades.
    const show = idle.tick(clampFrameDelta(delta))
    paint(el.current, painted, attention.hintAllowed && show)
  })

  return null
}

/** One attribute, written only when it changes; the frame loop runs sixty times a second. */
function paint(el: HTMLElement | null, painted: { current: boolean }, next: boolean): void {
  if (!el || painted.current === next) return
  painted.current = next
  if (next) el.dataset.visible = ''
  else delete el.dataset.visible
}
