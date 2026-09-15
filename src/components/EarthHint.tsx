/**
 * The Earth's way out, in plain text.
 *
 * Replaces the particle figure (DECISIONS §41, reversed by §43): a glyph over a
 * sentence, as DOM. Murcia's glass hint plate, which this sat beside, was
 * removed on 2026-09-15.
 *
 * ## It renders once and is never re-rendered
 *
 * There is deliberately no `visible` prop. `HintLayer` — which lives inside the
 * Canvas, because the permission it reads is a field on a mutable object and the
 * satellite hover is written per frame — finds this element and paints
 * `data-visible` on it, exactly the way `createNavigationInput` paints Murcia's
 * plate. CSS owns both fades, the float and every loop from there.
 *
 * A `useState` in `App` for a boolean that flips on every `pointerdown` would
 * re-render both canvases and every overlay, which is the reason its neighbour
 * the application-owned hint permission is not React state either.
 *
 * ## Both glyphs and both sentences are rendered, and the stylesheet picks
 *
 * The CSS can only choose between what was rendered, and a `matchMedia` read
 * here would have no later moment at which to matter. `(pointer: coarse)` picks the glyph AND the word,
 * from the same fact, so the two can never disagree.
 *
 * Desktop shows a forward wheel rotation; touch shows two fingers spreading.
 * Both gestures approach Earth and continue toward Murcia.
 */
export function EarthHint() {
  return (
    <div className="earth-hint" aria-hidden="true">
      {/* Keep the mouse upright, with upward chevrons above its body. The
          lower chevron leads the upper one to demonstrate forward rotation. */}
      <svg
        className="earth-hint__glyph earth-hint__glyph--mouse"
        viewBox="6 1 12 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <rect x="7" y="14" width="10" height="20" rx="5" />
        <path className="earth-hint__part earth-hint__part--wheel" d="M12 18v4" />
        {/* Two, not one, so they can chase: a single chevron can only blink,
            and a blink has no direction. */}
        <g className="earth-hint__chevrons">
          <path className="earth-hint__part earth-hint__part--chase" d="M8 12l4-4 4 4" />
          <path className="earth-hint__part earth-hint__part--chase" d="M8 6l4-4 4 4" />
        </g>
      </svg>
      {/* A phone, and a hand with two fingers on its screen. Explicit rather
          than detailed: the phone is a hairline rounded rectangle with a
          speaker line, and the hand is three FAT round-capped strokes — a palm
          pill low on the screen, and index and thumb rising from it in a V,
          their caps the fingertips. The weight difference is the drawing: the
          phone is context, the hand is the subject. Two hairline fingers with
          dots for tips read as a needle, and two fat fingers with no palm read
          as a pair of slashes; the V from one palm is what reads as a hand.

          Each finger is ONE path and the spread is a ROTATION about its base
          (styles.css sets the origin at the palm end), so the fingertips part
          while the hand stays one piece — transform only, no path morphing. */}
      <svg
        className="earth-hint__glyph earth-hint__glyph--pinch"
        viewBox="0 0 48 48"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        <rect x="9" y="2" width="26" height="44" rx="4" strokeWidth="1.6" />
        <path d="M20 6h8" strokeWidth="1.6" />
        <path d="M24 41h8" strokeWidth="8" />
        <path className="earth-hint__part earth-hint__part--finger-a" d="M15 13L27 38" strokeWidth="5" />
        <path className="earth-hint__part earth-hint__part--finger-b" d="M34 19L30 38" strokeWidth="5" />
      </svg>
      {/* Both input variants describe zoom; CSS pairs each with its glyph. */}
      <span className="earth-hint__sentence" data-input="fine">
        Zoom para viajar a Murcia
      </span>
      <span className="earth-hint__sentence" data-input="coarse">
        Zoom para viajar a Murcia
      </span>
    </div>
  )
}
