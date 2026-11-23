/**
 * Keeps the keyboard's place while a section's controls fade between stops
 * (accessibility audit 2026-11-18, M3).
 *
 * Servicios and Conócenos hide their plate and its arrows for every flight and
 * show them again on landing. Hidden or disabled, a focused button drops the
 * focus to <body>, and a keyboard user had to tab in again from the header
 * after every step. So a layer that is hidden WHILE HOLDING THE FOCUS is
 * "parked" instead: it fades out but stays focusable, its buttons say
 * `aria-disabled` and take no pointer, and whoever shows the next copy picks
 * the focus up from there — the same layer, or the next one (the screen stop's
 * arrows hand over to the plate). If the focus leaves a parked layer, the hide
 * completes.
 */

export const PARKED_ATTRIBUTE = 'data-focus-parked';

export type PagingDirection = 'previous' | 'next';

/** Is the focus nowhere useful: on <body>, or on a control parked in a faded layer. */
export function focusIsAdrift(): boolean {
  const active = document.activeElement;
  return !active || active === document.body || active.closest(`[${PARKED_ATTRIBUTE}]`) !== null;
}

/** The paging arrow the focus is on, by the classes both arrow rows share. */
export function pagingDirectionOf(element: Element | null): PagingDirection | null {
  if (!element) return null;
  if (element.classList.contains('campus-overlay__page--next')) return 'next';
  if (element.classList.contains('campus-overlay__page--previous')) return 'previous';
  return null;
}

export interface FocusParking {
  /** True while the layer is faded out but holding the focus. */
  readonly parked: boolean;
  /**
   * Called by the layer's `hide()`. Parks and returns true when the layer holds
   * the focus; otherwise does nothing and returns false, and the caller hides
   * as it always has.
   */
  park(): boolean;
  /** Called by the layer's `show()`, before it sets its buttons for the new copy. */
  unpark(): void;
  dispose(): void;
}

/**
 * @param complete finishes the hide the parking held back: called when the
 * focus leaves the parked layer.
 */
export function createFocusParking(layer: HTMLElement, complete: () => void): FocusParking {
  let parked = false;
  const pointer = new Map<HTMLElement, string>();

  const release = (): void => {
    parked = false;
    layer.removeAttribute(PARKED_ATTRIBUTE);
    for (const [button, value] of pointer) {
      button.removeAttribute('aria-disabled');
      button.style.pointerEvents = value;
    }
    pointer.clear();
  };

  const onFocusOut = (event: FocusEvent): void => {
    if (!parked) return;
    const next = event.relatedTarget;
    if (next instanceof Node && layer.contains(next)) return;
    // The window losing focus (alt-tab, a click into the browser's own UI)
    // fires this too, with the focus still here for when it comes back.
    if (next === null && !document.hasFocus()) return;
    release();
    complete();
  };
  layer.addEventListener('focusout', onFocusOut);

  return {
    get parked() {
      return parked;
    },
    park() {
      if (parked) return true;
      if (!layer.contains(document.activeElement)) return false;
      parked = true;
      layer.setAttribute(PARKED_ATTRIBUTE, '');
      for (const button of layer.querySelectorAll<HTMLElement>('button')) {
        pointer.set(button, button.style.pointerEvents);
        button.setAttribute('aria-disabled', 'true');
        button.style.pointerEvents = 'none';
      }
      return true;
    },
    unpark() {
      if (parked) release();
    },
    dispose() {
      layer.removeEventListener('focusout', onFocusOut);
    },
  };
}
