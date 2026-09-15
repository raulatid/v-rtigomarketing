/**
 * JavaScript motion policy: one snapshot per document, shared by late mounts.
 * Boot hands its snapshot across the window contract without a runtime import.
 * A cold blog captures its own value. OS changes apply after a document reload;
 * CSS media queries remain live. Never switch a running camera's motion branch.
 */
let snapshot: boolean | undefined

export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false
  return snapshot ??= window.__vertigoIntro?.reducedMotion ?? (
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}
