/**
 * A world's way out, in plain text: a glyph over a sentence, as DOM.
 *
 * Earth's hint since DECISIONS §43, and Murcia's since 2026-09-22 — the same
 * drawing turned round. `EarthHint` teaches the way IN (a forward wheel, a
 * spreading pinch) and `MurciaHint` the way OUT (a backward wheel, a closing
 * pinch); the stylesheet keys every loop on `data-gesture`.
 *
 * ## It renders once and is never re-rendered
 *
 * There is deliberately no `visible` prop. A layer inside the Canvas —
 * `earth/hint/HintLayer` and `murcia/hint/MurciaHintLayer`, which live there
 * because the permission they read is a field on a mutable object and the
 * hover they stand down for is written per frame — finds this element and
 * paints `data-visible` on it. CSS owns both fades, the float and every loop
 * from there.
 *
 * A `useState` in `App` for a boolean that flips on every `pointerdown` would
 * re-render both canvases and every overlay, which is the reason its neighbour
 * the application-owned hint permission is not React state either.
 *
 * ## Both glyphs and both sentences are rendered, and the stylesheet picks
 *
 * The CSS can only choose between what was rendered, and a `matchMedia` read
 * here would have no later moment at which to matter. `(pointer: coarse)` picks
 * the glyph AND the word, from the same fact, so the two can never disagree.
 */

export type HintGesture = 'in' | 'out'

interface Props {
  /** The identity class the layer queries and the e2e locates: `earth-hint`, `murcia-hint`. */
  world: 'earth' | 'murcia'
  gesture: HintGesture
  /** The sentence for a fine pointer (a wheel), and the one for a coarse pointer (a pinch). */
  fine: string
  coarse: string
}

export function SceneHint({ world, gesture, fine, coarse }: Props) {
  const out = gesture === 'out'
  return (
    <div className={`scene-hint ${world}-hint`} data-gesture={gesture} aria-hidden="true">
      {/* An upright mouse with two chevrons that chase each other along the
          wheel's direction: above the body and pointing up for a forward
          rotation, below it and pointing down for a backward one. Two, not
          one, so they can chase: a single chevron can only blink, and a blink
          has no direction. The first child leads the second (styles.css), so
          the way in lists the lower chevron first and the way out the upper. */}
      <svg
        className="scene-hint__glyph scene-hint__glyph--mouse"
        viewBox="6 1 12 34"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
        focusable="false"
      >
        {out ? (
          <>
            <rect x="7" y="2" width="10" height="20" rx="5" />
            <path className="scene-hint__part scene-hint__part--wheel" d="M12 6v4" />
            <g className="scene-hint__chevrons">
              <path className="scene-hint__part scene-hint__part--chase" d="M8 24l4 4 4-4" />
              <path className="scene-hint__part scene-hint__part--chase" d="M8 30l4 4 4-4" />
            </g>
          </>
        ) : (
          <>
            <rect x="7" y="14" width="10" height="20" rx="5" />
            <path className="scene-hint__part scene-hint__part--wheel" d="M12 18v4" />
            <g className="scene-hint__chevrons">
              <path className="scene-hint__part scene-hint__part--chase" d="M8 12l4-4 4 4" />
              <path className="scene-hint__part scene-hint__part--chase" d="M8 6l4-4 4 4" />
            </g>
          </>
        )}
      </svg>
      {/* A phone, and a hand with two fingers on its screen. Explicit rather
          than detailed: the phone is a hairline rounded rectangle with a
          speaker line, and the hand is three FAT round-capped strokes — a palm
          pill low on the screen, and index and thumb rising from it in a V,
          their caps the fingertips. The weight difference is the drawing: the
          phone is context, the hand is the subject. Two hairline fingers with
          dots for tips read as a needle, and two fat fingers with no palm read
          as a pair of slashes; the V from one palm is what reads as a hand.

          Each finger is ONE path and the spread — or, on the way out, the
          close — is a ROTATION about its base (styles.css sets the origin at
          the palm end), so the fingertips move while the hand stays one piece:
          transform only, no path morphing. The same drawing serves both
          gestures; only the keyframes differ. */}
      <svg
        className="scene-hint__glyph scene-hint__glyph--pinch"
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
        <path className="scene-hint__part scene-hint__part--finger-a" d="M15 13L27 38" strokeWidth="5" />
        <path className="scene-hint__part scene-hint__part--finger-b" d="M34 19L30 38" strokeWidth="5" />
      </svg>
      {/* Both input variants are rendered; CSS pairs each with its glyph. */}
      <span className="scene-hint__sentence" data-input="fine">
        {fine}
      </span>
      <span className="scene-hint__sentence" data-input="coarse">
        {coarse}
      </span>
    </div>
  )
}
