import { SceneHint } from './SceneHint'

/**
 * The Earth's way out: forward wheel, spreading pinch, toward Murcia.
 *
 * "Scroll" on a fine pointer since 2026-09-22 (user direction): the word names
 * the gesture a mouse actually makes, where "Zoom" named its effect. A finger
 * still pinches, and "Zoom" is what a pinch is called.
 *
 * Everything else — the once-only render, the two gestures in the markup, the
 * layer that paints `data-visible` — is `SceneHint`.
 */
export function EarthHint() {
  return (
    <SceneHint
      world="earth"
      gesture="in"
      fine="Scroll para viajar a Murcia"
      coarse="Zoom para viajar a Murcia"
    />
  )
}
