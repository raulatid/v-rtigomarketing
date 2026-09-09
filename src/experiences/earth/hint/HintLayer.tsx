import { RefObject, useEffect, useMemo, useRef } from 'react'
import { useFrame } from '@react-three/fiber'
import { clampFrameDelta } from '../../../graphics/frameDelta'
import { hintAllowed } from '../config/sceneVisibility'
import { PROTO_HINT } from '../../../app/protoHint'
import type { SequenceState } from '../config/sequenceState'
import { createIdleWatch } from './hintIdle'
import { HINT_CONFIG } from './hintConfig'

// WHEN the Earth's hint is offered. What it looks like is `EarthHint.tsx` and
// `.earth-hint` in `styles.css`; this file decides nothing about that.
//
// It drew the hint itself until 2026-09-09, as a figure of ~770 points gathered
// out of the star field. The client rejected the particles and the sentence is
// plain white DOM text now (DECISIONS §43) — same chevrons, same words. What
// survived that change unaltered is everything below, because none of it was
// ever about particles.
//
// ## It is offered on STILLNESS, not on arrival
//
// Client direction. The hint appears once the viewer has done nothing for a
// couple of seconds and steps aside as soon as they act — so it reads as
// something the scene offers while they are looking, rather than as a card
// pushed at them every time a world lands.
//
// That is a different rule from Murcia's glass chip, which is still offered a
// beat after each arrival and does not return until the next one. The two were
// wired together while they shared a rule and are deliberately not any more:
// `createNavigationInput` is untouched and owns the chip, and this owns the
// sentence. What arrives from the app is only PERMISSION — `state.hintAllowed`,
// meaning the viewer is on Earth and nothing else has their attention.
//
// The stillness itself is counted here rather than in the app because it is a
// property of the viewer, not of the sequence, and because the frame loop is
// already the thing that knows how much time has passed.
//
// ## The element is FOUND, not threaded
//
// One `data-visible` attribute crosses from the scene to the page, and the same
// arrangement `createNavigationInput` already uses for Murcia's plate carries
// it: that module does `root.querySelector('.nav-hint')` and paints
// `dataset.visible`, and CSS owns every pixel after that. Same node type, same
// attribute, same reason — so this queries `.earth-hint` rather than inventing a
// second mechanism beside it.
//
// A `RefObject` threaded down instead would put a DOM ref through `SceneCanvas`
// and `EarthExperience`, neither of which would use it. That file stopped
// knowing Earth's internal composition on purpose (DECISIONS §26/§33), and one
// prop for one layer's overlay would teach it a piece of that back.
//
// Visibility never becomes React state, for the reason `App.tsx` gives about its
// neighbour: a `useState` for a boolean that flips on every `pointerdown` would
// re-render both canvases and every overlay.
export function HintLayer({
  state,
  active,
  satelliteHoverRef,
}: {
  state: SequenceState
  active: boolean
  /**
   * Written every frame by InteractionLayer, which owns the pick. Read rather
   * than computed, because the raycast that answers it already happens once a
   * frame and a second one here would be the same question asked twice.
   */
  satelliteHoverRef: RefObject<boolean>
}) {
  const idle = useMemo(
    () => createIdleWatch({ idleSeconds: HINT_CONFIG.presence.idleSeconds }),
    [],
  )
  /** The node `App` renders. Null wherever nothing rendered it — the harnesses. */
  const el = useRef<HTMLElement | null>(null)
  /** What is currently painted, so a frame that changes nothing writes nothing. */
  const painted = useRef(false)

  useEffect(() => {
    // React has committed App's whole tree before any effect runs, so the node
    // is in the document by now.
    el.current = document.querySelector<HTMLElement>('.earth-hint')
    return () => {
      // A layer that goes away must not leave a sentence on the screen.
      paint(el.current, painted, false)
      el.current = null
    }
  }, [])

  // What counts as the viewer doing something.
  //
  // A COMMITTED act, not attention. A press, a scroll, a key — someone doing any
  // of those has already decided where they are going, whether that is a drag
  // towards a satellite or a button, and the hint steps aside for it.
  //
  // A bare `pointermove` is deliberately NOT on this list, and was: it dismissed
  // the hint on the smallest twitch of the mouse, which is the one thing a
  // viewer does while reading it. A hand resting on a mouse that moves is still
  // a viewer who has not chosen, so the offer stands until they act.
  //
  // Still wider than `createNavigationInput`'s idea of an interaction, which
  // only counts gestures that navigate: a key or a press anywhere on the page
  // dismisses this, including one that lands on a panel over the scene.
  //
  // On `window` and in the capture phase, so a panel that stops propagation
  // still counts; passive, because none of this ever prevents a default.
  useEffect(() => {
    const poke = () => idle.poke()
    const events = ['pointerdown', 'wheel', 'keydown', 'touchstart'] as const
    for (const type of events) {
      window.addEventListener(type, poke, { passive: true, capture: true })
    }
    return () => {
      for (const type of events) {
        window.removeEventListener(type, poke, { capture: true })
      }
    }
  }, [idle])

  useFrame((_, delta) => {
    // HIDDEN while Murcia is showing, not frozen — and that is a real change
    // from the particle figure, which could be left mid-flight because it lived
    // in a scene that went away with it. A DOM node does not: leaving the flag
    // painted would strand the sentence over the city.
    if (!active) {
      paint(el.current, painted, false)
      return
    }

    const dt = clampFrameDelta(delta)

    // A pointer resting on a satellite counts as acting, even though no event
    // fired. It is the one hover the scene answers back — the badge bumps, the
    // cursor turns — so the viewer has already found a target and a hint
    // pointing at another one is in the way. Held down rather than poked once,
    // so the wait only restarts when the pointer leaves.
    //
    // The value is the previous frame's pick, which is why it is polled rather
    // than subscribed to: a frame of lag against a two-second rule is not a lag,
    // and reading a ref cannot go stale the way a callback that stops firing on
    // the way out of the scene can.
    if (satelliteHoverRef.current) idle.poke()

    // Idle is asked EVERY frame, including while the hint is up: the answer is a
    // state and not an edge, so the first act after it appears turns this false
    // and the sentence fades.
    const still = idle.tick(dt)

    // `?hint=1` holds it up so the type can be judged; the stillness this waits
    // for is otherwise broken by the very act of looking. DEBUG only.
    paint(el.current, painted, PROTO_HINT.hold || (hintAllowed(state) && still))
  })

  return null
}

/**
 * One attribute, written only when it changes.
 *
 * The frame loop runs sixty times a second and the answer changes a handful of
 * times a session, so the guard is what keeps this off the DOM. Everything the
 * viewer actually sees — the two fades and the float — is CSS reacting to this
 * one flag.
 */
function paint(
  el: HTMLElement | null,
  painted: { current: boolean },
  next: boolean,
): void {
  if (!el || painted.current === next) return
  painted.current = next
  if (next) el.dataset.visible = ''
  else delete el.dataset.visible
}
