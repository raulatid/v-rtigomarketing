/**
 * The fake canvas element the pointer-driven harnesses drive.
 *
 * `DragPanController` and `DistrictInteraction` take an `HTMLElement` and read
 * exactly four things off it: the listener registry, pointer capture, an inline
 * style (for the cursor) and a bounding rect. Node has none of them, and
 * bringing in jsdom to supply four methods would put a DOM implementation
 * inside a bundle whose whole point is that it contains real Three.js and
 * nothing else.
 *
 * This was duplicated near-identically in navigation-feel.ts and
 * district-flight.ts, ~50 lines each. Shared because it is genuinely the same
 * responsibility — a stand-in for the canvas — and because a divergence between
 * the two copies would show up as a behavioural difference between two harnesses
 * driving the same controller, which is the most confusing failure available.
 *
 * The rect is 1920x1080 at the origin. Harnesses that need a different viewport
 * pass one; `district-flight.ts` needs an OFFSET canvas to prove framing is
 * measured relative to the canvas rather than the viewport.
 */

export interface StubRect {
  left: number;
  top: number;
  width: number;
  height: number;
}

export interface StubElement {
  /** The element, typed as the DOM one the controllers expect. */
  element: HTMLElement;
  /** Dispatch to every listener registered for `type`, in registration order. */
  fire: (type: string, event: Record<string, unknown>) => void;
  /** How many listeners are currently registered for a type. */
  listenerCount: (type: string) => number;
  /** Whatever the controllers have written to `element.style`. */
  style: Record<string, string>;
}

export function createStubElement(rect: StubRect = { left: 0, top: 0, width: 1920, height: 1080 }): StubElement {
  const listeners = new Map<string, Array<(e: unknown) => void>>();
  const style = {} as Record<string, string>;

  const element = {
    style,
    addEventListener(type: string, fn: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      list.push(fn);
      listeners.set(type, list);
    },
    removeEventListener(type: string, fn: (e: unknown) => void) {
      const list = listeners.get(type) ?? [];
      listeners.set(
        type,
        list.filter((f) => f !== fn),
      );
    },
    setPointerCapture() {},
    releasePointerCapture() {},
    hasPointerCapture() {
      return true;
    },
    getBoundingClientRect() {
      return {
        left: rect.left,
        top: rect.top,
        width: rect.width,
        height: rect.height,
        right: rect.left + rect.width,
        bottom: rect.top + rect.height,
      };
    },
  } as unknown as HTMLElement;

  return {
    element,
    // Copied before iterating: a capture-phase handler that removes itself —
    // which is exactly how flight cancellation works — would otherwise mutate
    // the array mid-dispatch and skip the next listener.
    fire: (type, event) => {
      for (const fn of [...(listeners.get(type) ?? [])]) fn(event);
    },
    listenerCount: (type) => (listeners.get(type) ?? []).length,
    style,
  };
}

/**
 * A pointer event body. Only the fields the controllers read.
 *
 * `pointerType` decides which gesture path is taken — touch selects the
 * two-finger rules and the larger tap tolerance — so it is spelled out at every
 * call site rather than defaulted, because a silently-mouse event in a touch
 * test is a test that passes while testing the wrong thing.
 */
export function pointerEvent(fields: Record<string, unknown>): Record<string, unknown> {
  return { preventDefault() {}, ...fields };
}
