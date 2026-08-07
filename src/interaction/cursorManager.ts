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
  marker: 10,
}

export function createCursorManager(element: HTMLElement) {
  const requests = new Map<string, Cursor>()
  let applied: Cursor | null = null

  function resolve(): Cursor {
    let best: Cursor = ''
    let bestPriority = -1
    for (const [key, cursor] of requests) {
      if (!cursor) continue
      const p = PRIORITY[key] ?? 0
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

  function dispose() {
    requests.clear()
    element.style.cursor = ''
    applied = null
    publishCursorHint('')
  }

  return { request, dispose }
}

export type CursorManager = ReturnType<typeof createCursorManager>
