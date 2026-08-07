// Shared cursor arbitration.
//
// earth-connections has two independent hover systems (satellite badges and geo
// markers) both writing domElement.style.cursor, and avoids thrash only by
// writing on change. That is not actually correct — whichever writes last wins,
// so the two can flip-flop when their hover regions overlap.
//
// Here each source registers a request under its own key and the highest
// priority active request wins. One writer, deterministic outcome.

import { CursorHint, publishCursorHint } from './cursorSignal'

type Cursor = CursorHint

// Higher wins. Dragging beats everything: while the pointer is captured, what
// is underneath it is irrelevant.
const PRIORITY: Record<string, number> = {
  drag: 30,
  satellite: 20,
  district: 20,
  marker: 10,
}

// A key may be namespaced as "source:instance" so several instances of one
// source can hold independent requests — each district owns its own hover and
// must not be able to clear another's. Priority is read from the source half.
function priorityOf(key: string): number {
  const separator = key.indexOf(':')
  return PRIORITY[separator === -1 ? key : key.slice(0, separator)] ?? 0
}

export function createCursorManager(element: HTMLElement) {
  const requests = new Map<string, Cursor>()
  let applied: Cursor | null = null

  function resolve(): Cursor {
    let best: Cursor = ''
    let bestPriority = -1
    for (const [key, cursor] of requests) {
      if (!cursor) continue
      const p = priorityOf(key)
      if (p > bestPriority) {
        bestPriority = p
        best = cursor
      }
    }
    return best
  }

  function request(key: string, cursor: Cursor) {
    const previous = requests.get(key) ?? ''
    if (previous === cursor) return
    if (cursor) requests.set(key, cursor)
    else requests.delete(key)

    const next = resolve()
    if (next === applied) return
    applied = next
    // The native write stays as the fallback for when the custom cursor isn't
    // mounted (coarse pointers); with it mounted, `cursor: none` hides this and
    // the published hint drives the visible feedback instead.
    element.style.cursor = next
    publishCursorHint(next)
  }

  // Drops every request at once. An experience going inactive stops running the
  // per-frame work that would normally retract its hover, so whatever it held at
  // that moment would otherwise stay published for as long as the other
  // experience is showing.
  function clear() {
    requests.clear()
    element.style.cursor = ''
    applied = ''
    publishCursorHint('')
  }

  function dispose() {
    clear()
    applied = null
  }

  return { request, clear, dispose }
}

export type CursorManager = ReturnType<typeof createCursorManager>
