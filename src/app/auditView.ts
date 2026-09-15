import type { AuditComposition } from '../interaction/auditComposition'

// Shared mutable state for the audit section's scene recomposition, following
// the SequenceState pattern (plan 002 §1.2): the DOM UI writes it, the render
// loop reads it per frame, and no React render ever happens because of it.
//
// `open` is the desired composition — true means "centre the subject in the
// viewport area right of the audit panel" — not the animation progress.
// AuditCameraShift owns the easing toward it.
export const auditView: AuditComposition = {
  open: false,
  // Uses the shared document motion snapshot when the panel opens, so the camera
  // shift can snap instead of travel (plan 005 §12).
  reducedMotion: false,
}

// The section's four-state machine. It lives here rather than in the component
// because `shiftsFor` below is the one place allowed to decide `auditView.open`,
// and that decision is a function of the phase.
export type AuditPhase = 'closed' | 'entering' | 'open' | 'leaving'

/**
 * Whether the scene should be recomposed for the panel, given the section's
 * phase and whether the viewport is wide enough to leave a strip.
 *
 * THE SINGLE OWNER OF `auditView.open`. It was previously written from three
 * places — a one-shot breakpoint read in open(), a clear in close(), and a
 * matchMedia effect keyed on the phase — and they did not agree on what the
 * flag meant. close() cleared it and the effect, re-running on the very
 * `open -> leaving` change close() had just made, immediately wrote it back to
 * true; nothing wrote false again once the phase reached 'closed'. The camera's
 * view offset was then held for the rest of the session and satellite selection
 * (InteractionLayer, same flag) stayed dead with it.
 *
 * 'leaving' is false on purpose: the shift retracts in step with the curtain's
 * exit, which is what close() intended all along.
 */
export function shiftsFor(phase: AuditPhase, wide: boolean): boolean {
  return wide && (phase === 'entering' || phase === 'open')
}
