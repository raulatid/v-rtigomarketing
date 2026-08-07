// Shared mutable state for the audit section's scene recomposition, following
// the SequenceState pattern (plan 002 §1.2): the DOM UI writes it, the render
// loop reads it per frame, and no React render ever happens because of it.
//
// `open` is the desired composition — true means "centre the subject in the
// viewport area right of the audit panel" — not the animation progress.
// AuditCameraShift owns the easing toward it.
export const auditView = {
  open: false,
  // Sampled from prefers-reduced-motion when the panel opens, so the camera
  // shift can snap instead of travel (plan 005 §12).
  reducedMotion: false,
}
