/**
 * Where the display's controls are, and what they say.
 *
 * ONE owner for these rectangles. Both the shader that draws a control and the
 * pointer code that tests for a hit read from here, because two copies of the
 * same coordinates is how a control ends up rendered in one place and clickable
 * in another — a bug that looks like a broken button and reads like a broken
 * raycast (plan 003 §15).
 *
 * These are display LAYOUT constants. Service copy lives in `districtConfig`.
 */

/**
 * Rectangles are in core-UV space: 0..1 across the readable core, NOT across the
 * plane. The core is what the text is laid out against and what the shader's
 * `uCoreInset` defines, so a control placed here stays put when the plane grows
 * or the inset is retuned.
 */
export interface DisplayRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export function rectContains(rect: DisplayRect, x: number, y: number): boolean {
  return x >= rect.x && x <= rect.x + rect.width && y >= rect.y && y <= rect.y + rect.height;
}

/**
 * Hit rectangles, deliberately larger than the graphics drawn inside them.
 *
 * Plan 003 §4: mobile usability beats microscopic sci-fi controls. The arrows in
 * particular draw as small glyphs but claim a tall band down each side, so a
 * thumb finds them without aiming.
 */
/**
 * VOLVER, top-left. The panel's header control.
 *
 * ONE button in both modes, and it always means "back one level": out of the
 * detail in detail mode, out of the district in summary mode. `CLOSE_RECT` used
 * to sit on top of `DETAIL_RECT` and carry a second word for the same idea; it is
 * gone, and so is "cerrar".
 */
export const BACK_RECT: DisplayRect = { x: 0.03, y: 0.035, width: 0.26, height: 0.085 };

/**
 * The footer control bar: `‹  SABER MÁS  ›`.
 *
 * The arrows used to be tall bands down the left and right edges, which put
 * pagination as far as possible from the control that goes deeper. One row keeps
 * every forward move together, and the two arrows stay far enough apart that a
 * thumb cannot confuse them.
 */
export const PREVIOUS_RECT: DisplayRect = { x: 0.05, y: 0.845, width: 0.16, height: 0.095 };
export const DETAIL_RECT: DisplayRect = { x: 0.32, y: 0.845, width: 0.36, height: 0.095 };
export const NEXT_RECT: DisplayRect = { x: 0.79, y: 0.845, width: 0.16, height: 0.095 };

/**
 * The readable area in detail mode, and the single owner of FOUR things: what the
 * wheel and a drag scroll, where the scrollbar sits, and where the copy folds away
 * at BOTH its top and its bottom.
 *
 * The top is 0.17 rather than something lower because a drag beginning on the
 * detail title has to scroll the copy. A title outside this rect resolves to
 * `null` in `controlAt`, the gesture is never claimed, and it orbits the camera
 * instead — which reads as the panel ignoring the drag.
 *
 * The bottom runs to 0.93 because nothing sits at the foot of the panel in detail
 * mode: the arrows and SABER MÁS are not drawn there.
 */
export const DETAIL_VIEWPORT_RECT: DisplayRect = { x: 0.06, y: 0.17, width: 0.84, height: 0.76 };

/**
 * Which rect each label is drawn into.
 *
 * One owner, because the label atlas has to pre-distort each row by the aspect of
 * the rect it will be stretched across, and a mapping implied by matching array
 * order in two files is a mapping that silently rotates the labels the first time
 * one of them is reordered.
 */
export const CONTROL_RECTS: Readonly<Record<'previous' | 'next' | 'detail' | 'back', DisplayRect>> =
  {
    previous: PREVIOUS_RECT,
    next: NEXT_RECT,
    detail: DETAIL_RECT,
    back: BACK_RECT,
  };

export type DisplayControl = 'previous' | 'next' | 'detail' | 'close' | 'back' | 'detail-viewport';

/**
 * What sits under a point, for the current mode.
 *
 * Branches on the mode FIRST, because the top-left rect is the same pixels in both
 * and only the mode says what it means. Inside the detail that is the only control
 * there is; the arrows and SABER MÁS are neither drawn nor hittable, which is what
 * makes the reading state single-purpose.
 */
export function controlAt(x: number, y: number, detailOpen: boolean): DisplayControl | null {
  if (detailOpen) {
    // Same button, one level up: back to the summary rather than out of the
    // district. Checked before the viewport, which is large enough to swallow it.
    if (rectContains(BACK_RECT, x, y)) return 'close';
    if (rectContains(DETAIL_VIEWPORT_RECT, x, y)) return 'detail-viewport';
    return null;
  }

  if (rectContains(BACK_RECT, x, y)) return 'back';
  if (rectContains(DETAIL_RECT, x, y)) return 'detail';
  // Previous and next exist only in summary mode: plan 003 §11 takes pagination
  // away while the visitor is reading one service.
  if (rectContains(PREVIOUS_RECT, x, y)) return 'previous';
  if (rectContains(NEXT_RECT, x, y)) return 'next';
  return null;
}

/**
 * Control labels by language, following the pattern the exit segment proved
 * before it was retired: data, not literals in a shader, so the word can change
 * with the site's language.
 */
export const CONTROL_LABELS: Readonly<Record<string, Readonly<Record<string, string>>>> = {
  es: { detail: 'saber más', back: 'volver' },
  en: { detail: 'learn more', back: 'back' },
};

export const DEFAULT_LOCALE = 'es';

export function controlLabel(locale: string, key: 'detail' | 'back'): string {
  const table = CONTROL_LABELS[locale] ?? CONTROL_LABELS[DEFAULT_LOCALE]!;
  return table[key] ?? key;
}
