/** Shared pointer handling for a sheet with compact and expanded stops.
 * Hosts own sizing and state; the scrollable body keeps native touch scrolling.
 * Drag surfaces must use touch-action: none. */
export function attachSheetDrag(options: {
  grip: HTMLElement
  surfaces?: readonly HTMLElement[]
  enabled(): boolean
  expanded(): boolean
  setExpanded(expanded: boolean): void
  position(): number
  limit(): number
  render(position: number | null): void
}) {
  const surfaces = [...new Set([options.grip, ...(options.surfaces ?? [])])]
  let suppressClick = false
  let drag: {
    id: number; x: number; y: number; start: number; current: number
    moved: boolean; surface: HTMLElement
  } | null = null

  const cancel = () => {
    const previous = drag
    drag = null
    options.render(null)
    if (previous?.surface.hasPointerCapture(previous.id)) {
      previous.surface.releasePointerCapture(previous.id)
    }
  }
  const down = (event: PointerEvent) => {
    if (!options.enabled() || !event.isPrimary || event.button !== 0 || drag) return
    const target = event.target
    // Closing a panel or following a link must never start a sheet drag.
    if (target instanceof Element) {
      const control = target.closest('button, a, input, textarea, select, [contenteditable]')
      if (control && control !== options.grip) return
    }
    suppressClick = false
    const surface = event.currentTarget as HTMLElement
    const start = options.position()
    drag = { id: event.pointerId, x: event.clientX, y: event.clientY, start, current: start, moved: false, surface }
    options.render(start)
    surface.setPointerCapture(event.pointerId)
  }
  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    if (!options.enabled()) { cancel(); return }
    const dy = event.clientY - drag.y
    const dx = event.clientX - drag.x
    if (!drag.moved && Math.abs(dx) > 6 && Math.abs(dx) > Math.abs(dy)) { cancel(); return }
    drag.moved ||= Math.abs(dy) > 6
    drag.current = Math.max(0, Math.min(options.limit(), drag.start + dy))
    options.render(drag.current)
  }
  const up = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.id) return
    if (drag.moved && options.enabled()) {
      const dy = event.clientY - drag.y
      const expanded = Math.abs(dy) >= 40 ? dy < 0 : drag.current < options.limit() / 2
      suppressClick = true
      options.setExpanded(expanded)
    }
    cancel()
  }
  const cancelled = (event: PointerEvent) => {
    if (drag?.id === event.pointerId) cancel()
  }
  const click = (event: MouseEvent) => {
    if (!options.enabled()) return
    // A synthetic click after dragging must not toggle back. Keyboard clicks
    // have detail 0 and still work if a touch drag emitted no click at all.
    if (suppressClick && event.detail > 0) { suppressClick = false; return }
    suppressClick = false
    options.setExpanded(!options.expanded())
  }
  for (const surface of surfaces) {
    surface.addEventListener('pointerdown', down)
    surface.addEventListener('pointermove', move)
    surface.addEventListener('pointerup', up)
    surface.addEventListener('pointercancel', cancelled)
    surface.addEventListener('lostpointercapture', cancelled)
  }
  options.grip.addEventListener('click', click)
  window.addEventListener('resize', cancel)
  return {
    reset() { cancel(); suppressClick = false },
    dispose() {
      cancel()
      for (const surface of surfaces) {
        surface.removeEventListener('pointerdown', down)
        surface.removeEventListener('pointermove', move)
        surface.removeEventListener('pointerup', up)
        surface.removeEventListener('pointercancel', cancelled)
        surface.removeEventListener('lostpointercapture', cancelled)
      }
      options.grip.removeEventListener('click', click)
      window.removeEventListener('resize', cancel)
    },
  }
}
