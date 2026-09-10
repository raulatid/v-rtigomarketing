import type { CameraRig } from '../camera/CameraRig'

/**
 * One pointer, dragging Murcia's camera.
 *
 * ## Why this is here and the wheel is not
 *
 * `checks/architecture.ts` section 2 forbids anything under `src/experiences/`
 * from importing `src/app/navigation/`, because navigating BETWEEN the worlds is
 * the one thing that knows both of them exist. That rule decides the split:
 *
 *   - the wheel, the pinch and the keyboard are scene navigation. They live in
 *     `app/navigation/createNavigationInput`, listen on `window`, and never
 *     touch a camera. One of them is a global authority — there is exactly one
 *     `wheel` listener in the application, which is what makes trackpad momentum
 *     tractable at all.
 *   - the one-pointer drag steers ONE world's camera and has no meaning in the
 *     other. It belongs to the experience, and it is this file.
 *
 * The sandbox this was ported from merged both into a single module, because a
 * lab with one world and one canvas has no boundary to respect.
 *
 * ## Two modules on the same pointer stream
 *
 * Both listen, and each derives its own mode from its own map of contacts. No
 * cross-layer call is needed for "the pinch took the gesture": a second
 * `pointerdown` ends the drag here by itself, and the app's pinch separately
 * dispatches a `pointercancel` per contact when it arms — which arrives at this
 * module as an ordinary cancel and needs no special case.
 *
 * ## What it does NOT do
 *
 * No gesture classification. Both axes are live on every move: horizontal yaws,
 * vertical travels, and a diagonal does both at once. There is deliberately no
 * `if (|dx| > |dy|)` branch and no forward vector captured at pointerdown — the
 * rig re-derives the heading from the yaw it has just written, which is what
 * makes a diagonal drag trace a curve rather than a straight line at an angle.
 */

export interface CameraInputEvents {
  /** Fired when a drag begins and when it ends, including ends that are a handover. */
  onDragStateChanged?: (dragging: boolean) => void
}

export interface CameraInputOptions {
  readonly element: HTMLElement
  readonly rig: CameraRig
  readonly events?: CameraInputEvents
  /** CSS pixels. Kept current by `setViewport`. */
  readonly width: number
  readonly height: number
}

export interface CameraInput {
  readonly isDragging: boolean
  readonly isPointerActive: boolean
  setViewport(width: number, height: number): void
  dispose(): void
}

interface PointerSample {
  x: number
  y: number
}

export function createCameraInput(options: CameraInputOptions): CameraInput {
  const { element, rig, events } = options

  const pointers = new Map<number, PointerSample>()
  let viewportWidth = Math.max(1, options.width)
  let viewportHeight = Math.max(1, options.height)
  let dragging = false

  const setDragging = (next: boolean): void => {
    if (next === dragging) return
    dragging = next
    events?.onDragStateChanged?.(next)
  }

  /**
   * Hover, -1..1 on each axis, for the rig's lean.
   *
   * Sent home (0, 0) whenever the pointer is not hovering: during a drag, on
   * leaving the canvas, and on window blur. Touch never reaches it, because a
   * finger that is not down is not hovering.
   */
  const sendCursor = (hx: number, hy: number): void => {
    rig.setCursor(hx, hy)
  }

  const endPointer = (pointerId: number): void => {
    try {
      element.releasePointerCapture(pointerId)
    } catch {
      // Capture may already have been lost — a cancel, or the element going
      // away. Releasing a capture nobody holds throws and means nothing.
    }
    pointers.delete(pointerId)
    if (pointers.size === 0) setDragging(false)
  }

  const onPointerDown = (event: PointerEvent): void => {
    // Primary button only. A right-drag used to rotate; it does not any more,
    // and letting it drag would make the context menu gesture move the world.
    if (event.pointerType === 'mouse' && event.button !== 0) return
    // Not while something else owns the camera: Earth while it is showing, a
    // district flight, the blog approach. This listens on the SHARED canvas, so
    // without it every press on the globe would capture the pointer and write
    // Murcia's drag cursor over Earth's. The map-pan controller refused presses
    // under external control the same way.
    if (rig.isExternallyControlled) return

    // Pointer capture so a drag survives leaving the canvas. Without it the
    // gesture dies at the window edge, which on a laptop trackpad is most
    // gestures.
    try {
      element.setPointerCapture(event.pointerId)
    } catch {
      // Not fatal: the drag still works, it just ends at the element's edge.
    }

    pointers.set(event.pointerId, { x: event.clientX, y: event.clientY })
    // A pointer that is down is not hovering.
    sendCursor(0, 0)
    if (pointers.size === 1) {
      setDragging(true)
    } else {
      // A second contact is a pinch, and the pinch belongs to the app layer.
      // Stop dragging rather than trying to arbitrate; there is nothing to
      // arbitrate, because two fingers now mean exactly one thing.
      setDragging(false)
    }
  }

  const onPointerMove = (event: PointerEvent): void => {
    const previous = pointers.get(event.pointerId)

    if (!previous) {
      // Not a tracked contact. The only thing left to read is a hover, and only
      // from a device that has one.
      if (
        pointers.size === 0 &&
        (event.pointerType === 'mouse' || event.pointerType === 'pen')
      ) {
        sendCursor(
          (event.clientX / viewportWidth) * 2 - 1,
          (event.clientY / viewportHeight) * 2 - 1,
        )
      }
      return
    }

    // A mouse that reports no buttons has been released somewhere this element
    // never heard about — outside the window, or over a native menu.
    if (event.pointerType === 'mouse' && (event.buttons & 1) === 0) {
      endPointer(event.pointerId)
      return
    }

    const dx = event.clientX - previous.x
    const dy = event.clientY - previous.y
    previous.x = event.clientX
    previous.y = event.clientY

    // One pointer only. With two or more the app's pinch owns the gesture.
    if (pointers.size !== 1) return
    // Something else is flying the camera. Reading the drag anyway would leave
    // the targets somewhere the viewer never put them.
    if (rig.isExternallyControlled) return
    if (dx === 0 && dy === 0) return

    rig.drag(dx / viewportWidth, dy / viewportHeight)
  }

  const onPointerUp = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) return
    endPointer(event.pointerId)
  }

  const onLostPointerCapture = (event: PointerEvent): void => {
    if (!pointers.has(event.pointerId)) return
    pointers.delete(event.pointerId)
    if (pointers.size === 0) setDragging(false)
  }

  const onPointerLeave = (event: PointerEvent): void => {
    // Only when nothing is down: a captured drag reports leave events constantly
    // and must not send the lean home mid-gesture.
    if (pointers.has(event.pointerId)) return
    sendCursor(0, 0)
  }

  const onWindowBlur = (): void => {
    sendCursor(0, 0)
  }

  const onContextMenu = (event: MouseEvent): void => {
    event.preventDefault()
  }

  // `touch-action: none` is what stops the browser scrolling the page instead of
  // handing us the move. Saved and restored, because this element is the shared
  // canvas and Murcia is not the only thing that ever lives on it.
  const previousTouchAction = element.style.touchAction
  const previousUserSelect = element.style.userSelect
  const previousWebkitUserSelect = element.style.getPropertyValue('-webkit-user-select')
  element.style.touchAction = 'none'
  element.style.userSelect = 'none'
  element.style.setProperty('-webkit-user-select', 'none')

  /**
   * The window the element actually lives in, not the global.
   *
   * Taken from the element so the harnesses can drive this module in Node with a
   * stub canvas — the repository's rule is that a check drives the REAL code, and
   * a bare `window` reference would have forced a reimplementation instead. It
   * also happens to be correct inside an iframe, where the global is the wrong
   * window.
   */
  const view: (Window & typeof globalThis) | null =
    element.ownerDocument?.defaultView ?? null

  element.addEventListener('pointerdown', onPointerDown)
  element.addEventListener('pointermove', onPointerMove)
  element.addEventListener('pointerup', onPointerUp)
  element.addEventListener('pointercancel', onPointerUp)
  element.addEventListener('lostpointercapture', onLostPointerCapture)
  element.addEventListener('pointerleave', onPointerLeave)
  element.addEventListener('contextmenu', onContextMenu)
  view?.addEventListener('blur', onWindowBlur)

  return {
    get isDragging() {
      return dragging
    },
    get isPointerActive() {
      return pointers.size > 0
    },

    setViewport(width, height) {
      viewportWidth = Math.max(1, width)
      viewportHeight = Math.max(1, height)
    },

    dispose() {
      element.removeEventListener('pointerdown', onPointerDown)
      element.removeEventListener('pointermove', onPointerMove)
      element.removeEventListener('pointerup', onPointerUp)
      element.removeEventListener('pointercancel', onPointerUp)
      element.removeEventListener('lostpointercapture', onLostPointerCapture)
      element.removeEventListener('pointerleave', onPointerLeave)
      element.removeEventListener('contextmenu', onContextMenu)
      view?.removeEventListener('blur', onWindowBlur)

      for (const pointerId of pointers.keys()) {
        try {
          element.releasePointerCapture(pointerId)
        } catch {
          // As in endPointer: releasing a capture nobody holds is not an error.
        }
      }
      pointers.clear()
      dragging = false

      element.style.touchAction = previousTouchAction
      element.style.userSelect = previousUserSelect
      if (previousWebkitUserSelect) {
        element.style.setProperty('-webkit-user-select', previousWebkitUserSelect)
      } else {
        element.style.removeProperty('-webkit-user-select')
      }
    },
  }
}
