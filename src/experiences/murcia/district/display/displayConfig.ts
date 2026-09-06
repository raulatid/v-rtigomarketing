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
 * The header control, top-left. ONE rect, TWO glyphs.
 *
 * It has always meant "back one level" — out of the detail in detail mode, out
 * of the district in summary mode — and it used to say VOLVER in both, which
 * made the two levels indistinguishable at the moment a visitor most needs to
 * tell them apart. It now draws an X in the summary and a left arrow in the
 * detail, from two rows of the label atlas pointed at this same rectangle.
 * `controlAt` and the dispatch in `DistrictInteraction` are unchanged; only the
 * glyph differs, which is what keeps the split a rendering decision.
 *
 * SQUARE, and it had to become square. The row is stretched to fill the rect
 * with no aspect correction, so the rect IS the glyph's on-screen shape — a
 * 0.26 x 0.085 band sized for a six-letter word would have handed an X a 3:1 box.
 *
 * 0.08 is about 3.2 core units, or roughly 34 screen pixels at the district
 * camera. THIS IS THE FLOOR while the rect is both the drawing box and the hit
 * box. Plan 003 §4 is explicit that hit areas may be larger than the visible
 * graphic and that mobile usability beats microscopic sci-fi controls; one
 * rectangle serving both purposes is what makes that impossible to honour here.
 * Going smaller means splitting them — a second rect per control, hit-tested and
 * never drawn — not editing this number.
 */
export const BACK_RECT: DisplayRect = { x: 0.053, y: 0.058, width: 0.08, height: 0.08 };

/**
 * The footer control bar: `‹  SABER MÁS  ›`.
 *
 * The arrows used to be tall bands down the left and right edges, which put
 * pagination as far as possible from the control that goes deeper. One row keeps
 * every forward move together, and the two arrows stay far enough apart that a
 * thumb cannot confuse them.
 */
// All three are near-square now, because SABER MÁS became [+] and a word's
// letterbox is the wrong container for a symbol. The rect IS the glyph's
// on-screen size — the atlas row is stretched to fill it — so these numbers are
// the layout AND the type scale at once, which is why they are what gets turned
// when the controls look wrong rather than anything in `paintLabels`.
//
// The band's top moved with each size revision (0.845 -> 0.855 -> 0.861) to hold
// the gap BELOW the controls constant, so the footer does not drift up the panel
// as the buttons shrink. Anchoring the top instead and letting the bottom rise is
// the obvious way to write this and it is wrong: the eye reads the distance to
// the panel's edge, not the distance to the copy.
//
// Centres are preserved across every revision — 0.13, 0.50, 0.87 — so the
// footer's rhythm survives the retuning and only the targets change size.
export const PREVIOUS_RECT: DisplayRect = { x: 0.094, y: 0.861, width: 0.072, height: 0.076 };
export const DETAIL_RECT: DisplayRect = { x: 0.448, y: 0.861, width: 0.104, height: 0.076 };
export const NEXT_RECT: DisplayRect = { x: 0.834, y: 0.861, width: 0.072, height: 0.076 };

/**
 * The summary copy's floor, and the ONE owner of it.
 *
 * `servicesDisplay` used to carry its own 0.845 literal in the overflow warning,
 * which is the same number as the footer's top written down twice. Moving the bar
 * up left the warning describing the old layout, silently, in the one place whose
 * whole job is to notice that the copy has reached the controls.
 */
export const FOOTER_TOP = PREVIOUS_RECT.y;

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
/**
 * A row of the label atlas. NOT a control: `exit` and `return` are two glyphs
 * for the one rect `DisplayControl` calls `back`, which is what lets the header
 * say which level it leaves without the hit test knowing anything about it.
 */
export type LabelRow = 'previous' | 'next' | 'detail' | 'exit' | 'return';

export const CONTROL_RECTS: Readonly<Record<LabelRow, DisplayRect>> = {
  previous: PREVIOUS_RECT,
  next: NEXT_RECT,
  detail: DETAIL_RECT,
  // Same rectangle, twice. The summary draws the X into it, the detail the arrow.
  exit: BACK_RECT,
  return: BACK_RECT,
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
 * Control labels by language.
 *
 * NO LONGER PAINTED. The panel's controls became stroked symbols in the
 * 2026-09-06 port — an X, a shafted arrow, two chevrons and `[+]` — so nothing
 * on the display renders these words any more.
 *
 * Kept because they are the only place the controls have NAMES, which is what a
 * translator edits and what an accessible label would be built from. Deleting
 * them would leave the district without a translation surface rather than
 * removing an unused one.
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
