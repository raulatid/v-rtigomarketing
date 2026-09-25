import { SceneHint } from './SceneHint'

/**
 * The Earth's way out: forward wheel, spreading pinch, toward Murcia.
 *
 * "Scroll" on a fine pointer since 2026-09-22 (user direction): the word names
 * the gesture a mouse actually makes, where "Zoom" named its effect. A finger
 * still pinches, and "Zoom" is what a pinch is called.
 *
 * "o desliza" since 2026-09-25 (user direction): a fine pointer is often a
 * touchpad, where the same wheel stream comes from a two-finger swipe. A
 * touchpad pinch is ctrl+wheel and deliberately does not navigate
 * (`createNavigationInput.ts`), so "Zoom" would be wrong there. No direction is
 * named: natural scrolling flips which way the fingers move.
 *
 * Everything else — the once-only render, the two gestures in the markup, the
 * layer that paints `data-visible` — is `SceneHint`.
 */
export function EarthHint() {
  return (
    <SceneHint
      world="earth"
      gesture="in"
      fine="Scroll o desliza para viajar a Murcia"
      coarse="Zoom para viajar a Murcia"
    />
  )
}
