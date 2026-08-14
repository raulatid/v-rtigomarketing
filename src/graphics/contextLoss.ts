/**
 * WebGL context loss, observed rather than ignored.
 *
 * Until 2026-08-14 nothing in this repository listened for `webglcontextlost`,
 * and the consequence was the worst shape a failure can take: a silent one.
 * A lost context is a DOM event, not a thrown error — three's renderer sets
 * `_isContextLost` and every subsequent `render()` becomes a no-op, React never
 * re-renders, no promise rejects, and `SceneErrorBoundary` never sees anything.
 * The visitor gets a black rectangle, forever, with nothing to explain it and
 * no prompt to reload. The 2026-08-07 readiness audit recorded the gap under
 * `P0-2` and the remediation closed only the *availability* probe; this closes
 * the other half.
 *
 * WHY THIS MATTERS DISPROPORTIONATELY ON iOS. Safari drops contexts under
 * memory pressure, on backgrounding, and when another tab wants the GPU — and
 * this application holds roughly 280 MB of GPU memory for the whole session by
 * design (ADR 001/003 keep both worlds resident). So context loss here is not
 * the rare driver accident it is on a desktop; it is the expected end of a long
 * mobile session. See `audits/ios-safari-2026-08-14.md`, I1 and I2.
 *
 * WHAT `preventDefault()` DOES, AND WHY IT IS CALLED ANYWAY. It is the only way
 * to tell the browser we would like the context back — without it, restoration
 * is never even attempted and `webglcontextrestored` can never fire. Calling it
 * costs nothing and keeps the door open.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO. It does not restore anything. Real
 * recovery means re-uploading every texture and recompiling every program, all
 * of which currently happens once, inside effects keyed on load — so a restored
 * context would come back to an empty GPU and a scene that believes it is
 * already uploaded. Building that is a project of its own. PRINCIPLES §37/§38
 * are explicit that a fallback state must only exist if it is actually
 * implemented, so this module reports the truth and lets the application say
 * so. Turning a silent permanent blank into a stated failure is the whole win,
 * and it is a large one.
 *
 * This module holds no policy on purpose. It knows about the browser event;
 * what to *tell the visitor* is an application decision, and the pipeline
 * forwards it rather than deciding (the same split as `FrameSettings`).
 */

export interface ContextLossHandlers {
  /** The context is gone. Nothing will draw again until it is restored. */
  onLost: (reason: string) => void
  /**
   * The browser gave the context back. Fires only because `onLost` called
   * `preventDefault()`; with no listener at all it can never happen.
   */
  onRestored?: () => void
}

/**
 * Attach to the drawing surface. Returns the detach function — the caller owns
 * the subscription, as it owns every other listener it installs (§9).
 */
export function observeContextLoss(
  canvas: HTMLCanvasElement,
  handlers: ContextLossHandlers,
): () => void {
  const onLost = (event: Event) => {
    // Before the callback, not after: the browser reads this synchronously
    // during dispatch, so anything that throws downstream must not be able to
    // cost us the restoration request.
    event.preventDefault()
    handlers.onLost('the browser released the WebGL context')
  }

  const onRestored = () => {
    handlers.onRestored?.()
  }

  canvas.addEventListener('webglcontextlost', onLost)
  canvas.addEventListener('webglcontextrestored', onRestored)

  return () => {
    canvas.removeEventListener('webglcontextlost', onLost)
    canvas.removeEventListener('webglcontextrestored', onRestored)
  }
}
