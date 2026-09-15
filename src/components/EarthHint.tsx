/**
 * The Earth's way out, in plain text.
 *
 * Replaces the particle figure (DECISIONS §41, reversed by §43): a glyph over a
 * sentence, as DOM. Murcia's glass plate is untouched and still hidden on Earth
 * by `.nav[data-direction='down'] .nav-hint`.
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
 * The same arrangement `NavigationControl` uses — the CSS can only choose
 * between what was rendered, and a `matchMedia` read here would have no later
 * moment at which to matter. `(pointer: coarse)` picks the glyph AND the word,
 * from the same fact, so the two can never disagree.
 *
 * ## Two glyphs since §46, and the fine one is the plate's mouse
 *
 * §43 had cropped the mark to the two chevrons alone. The client asked for the
 * mouse back on Earth — the same body, notch and chasing chevrons Murcia's plate
 * draws — and, for touch, something more literal than two dots: a phone with a
 * hand spreading two fingers on it. Leaving Earth is an approach (ADR 006), so
 * the fingers open.
 *
 * The mouse is a COPY of the plate's path data, not a shared component, and a
 * test pins the literals so the two cannot drift. A shared component would have
 * to carry the plate's `.nav[data-direction]` selection of the up-group for a
 * scene that only ever goes down.
 */
export function EarthHint() {
  return (
    <div className="earth-hint" aria-hidden="true">
      {/* The plate's mouse, cropped to what Earth draws: the body (y 14–34) and
          the DOWN chevrons (y 36–46), so the viewBox is that band plus a
          half-stroke spill on every side — a round cap sliced square is just a
          blunt tip (§43). No up-group and therefore no recentring transform:
          nothing is drawn above the body.

          Stroke 1.4 against the plate's 1.6. Weight is a ratio to what it sits
          beside (§43): at 16px type the plate's ratio reads as a slab. */}
      <svg
        className="earth-hint__glyph earth-hint__glyph--mouse"
        viewBox="6 13 12 34"
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
          <path className="earth-hint__part earth-hint__part--chase" d="M8 36l4 4 4-4" />
          <path className="earth-hint__part earth-hint__part--chase" d="M8 42l4 4 4-4" />
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
