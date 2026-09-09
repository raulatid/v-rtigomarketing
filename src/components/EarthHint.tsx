/**
 * The Earth's way out, in plain text.
 *
 * Replaces the particle figure (DECISIONS §41, reversed by §43): the same two
 * chevrons over the same sentence, as DOM. Murcia's glass plate is untouched and
 * still hidden on Earth by `.nav[data-direction='down'] .nav-hint`.
 *
 * ## It renders once and is never re-rendered
 *
 * There is deliberately no `visible` prop. `HintLayer` — which lives inside the
 * Canvas, because the permission it reads is a field on a mutable object and the
 * satellite hover is written per frame — finds this element and paints
 * `data-visible` on it, exactly the way `createNavigationInput` paints Murcia's
 * plate. CSS owns both fades and the float from there.
 *
 * A `useState` in `App` for a boolean that flips on every `pointerdown` would
 * re-render both canvases and every overlay, which is the reason its neighbour
 * `state.hintAllowed` is not React state either.
 *
 * ## Both sentences are rendered, and the stylesheet picks
 *
 * The same arrangement `NavigationControl` uses for its one-word labels — the
 * CSS can only choose between what was rendered, and a `matchMedia` read here
 * would have no later moment at which to matter. The particle figure had to
 * re-rasterize itself when the pointer class changed; this does not.
 */
export function EarthHint() {
  return (
    <div className="earth-hint" aria-hidden="true">
      {/* The travel glyph's own chevrons, at the same path data
          `NavigationControl` draws — one drawing, not two that can drift.

          THE STROKE IS 1.0, NOT THE FIGURE'S 1.6, and the viewBox is half a unit
          looser than `HINT_CHEVRONS.box` on every side. Both follow from the type
          coming down to 16px (§43).

          The particle figure rendered this 44px wide, where 1.6 units across an
          8-unit box — a fifth of the mark's width — read as deliberate weight. At
          27px the same ratio is a 5.4px slab over letter stems half that thick,
          and the mark stops reading as a companion to the sentence and starts
          reading as a button. Weight is a ratio to what it sits beside, not a
          constant.

          The box was the ink crop because a canvas bitmap exactly that size
          clipped the caps flat, and matching that was right while the sentence
          was made of sampled dots. A thin round cap that is sliced square is just
          a blunt tip, so the viewBox now carries the half-stroke spill and the
          chevrons close properly. */}
      <svg
        className="earth-hint__chevrons"
        viewBox="7.4 35.4 9.2 11.2"
        fill="none"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <path d="M8 36l4 4 4-4" />
        <path d="M8 42l4 4 4-4" />
      </svg>
      {/* Spanish, and in the source rather than the CMS (DECISIONS §28): a field
          per input variant is several strings for one sentence.

          The two differ by ONE WORD because the gesture differs. Below two
          contacts `createNavigationInput` returns early — a one-finger swipe does
          not navigate at all — so on touch the gesture is a two-finger spread,
          and telling a phone to scroll would teach it something that does
          nothing. "Zoom" is the word the plate already uses on coarse pointers. */}
      <span className="earth-hint__sentence" data-input="fine">
        Scroll para viajar a Murcia
      </span>
      <span className="earth-hint__sentence" data-input="coarse">
        Zoom para viajar a Murcia
      </span>
    </div>
  )
}
