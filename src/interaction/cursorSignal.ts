// Bridge between cursor-state producers and the DOM custom cursor.
//
// The cursor manager (3D scene hovers) lives inside InteractionLayer while the
// custom cursor mounts at the app root — threading a ref through five
// components for one string would be pure ceremony. A module-level signal
// keeps the two decoupled: producers publish, the cursor subscribes.

export type CursorHint = 'pointer' | 'grabbing' | ''

type Listener = (hint: CursorHint) => void

let current: CursorHint = ''
const listeners = new Set<Listener>()

export function publishCursorHint(hint: CursorHint) {
  if (hint === current) return
  current = hint
  for (const listener of listeners) listener(hint)
}

// Calls back immediately with the current value so a late-mounting subscriber
// (the cursor mounts after the interaction layer) doesn't miss state.
export function subscribeCursorHint(listener: Listener): () => void {
  listeners.add(listener)
  listener(current)
  return () => {
    listeners.delete(listener)
  }
}
