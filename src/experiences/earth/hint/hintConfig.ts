// The Earth hint, as numbers and as words.
//
// Everything a person would want to retune while looking at the thing is here,
// the way `orbitConfig.ts` collects the tutorial's timings. These are a STARTING
// POINT derived by arithmetic, and not one of them has been judged on real
// hardware. `?hint=1` is how they get judged.
//
// ## The number that governs all the others
//
// Legibility is decided by DOT SPACING AGAINST DOT SIZE, and not by dots per
// letter — which is the intuitive measure and the wrong one. A sentence's ink
// skeleton is about `1.7 x fontSize x letters` long, so the spacing that a given
// budget buys is that length divided by the budget. Dots ~2px across need ~3px
// of spacing to read AS dots; closer than that they touch and the sentence
// renders as solid strokes, which is glowing text and not a particle figure.
//
// Worked, for the 27 letters below at the shipped caption size:
//
//   1400 points -> 1.11px spacing   the dots merge; it is no longer particles
//    800 points -> 2.09px spacing   still tight
//    600 points -> 2.96px spacing   reads as dots            <- shipped
//
// A bigger budget is not wrong, it is a bigger FIGURE: 1400 points at 3px
// spacing needs the sentence about 1380px wide, which is a headline across the
// viewport rather than a hint. That was offered and declined.

/**
 * The sentence, per pointer type. Spanish, per DECISIONS §11.
 *
 * In code and not in the CMS, deliberately: DECISIONS §28 lists this hint's copy
 * among the strings that stay in the source, because a field per input variant
 * is several strings for one sentence.
 *
 * The two differ by ONE WORD, and the difference is not cosmetic. On touch,
 * `createNavigationInput` returns early below two contacts — a one-finger swipe
 * does not navigate at all — so the gesture is a two-finger spread, and telling
 * a phone to scroll would teach it something that does nothing. "Zoom" is the
 * word the HTML chip already used on coarse pointers, so this is the same
 * vocabulary rather than a new one.
 *
 * Naming Murcia rather than "the other scene" also puts the sentence in step
 * with the accessible button, whose `aria-label` is already "Ir a Murcia".
 */
export const HINT_SENTENCE = {
  fine: 'Haz scroll si quieres ir a Murcia',
  coarse: 'Haz zoom si quieres ir a Murcia',
} as const

/**
 * The family to rasterize in — and it is `system-ui`, NOT Inter, which is worth
 * knowing before someone "corrects" it.
 *
 * `styles.css` asks for `'Inter', system-ui, sans-serif`, and the marketing
 * route resolves to `system-ui` because no face called Inter is ever registered
 * on it. The Inter woff2 files in `public/fonts` are registered by `blog.css`
 * under the private family `'Vertigo Blog Inter'`, and its header says why:
 * registering a real "Inter" there would restyle the entire 3D site the moment
 * a reader came back from an article.
 *
 * So this stack is what the site actually draws with, and matching it is the
 * point. Two consequences: every extent must be MEASURED rather than assumed,
 * because the resolved face differs per platform; and an image baseline of the
 * sentence would be platform-bound, which is why the e2e check asserts that
 * something rasterized rather than that it matches a picture.
 */
export const HINT_FONT_FAMILY = 'system-ui, sans-serif'

/**
 * The two chevrons, in their own 24 x 48 viewBox.
 *
 * Copied path-for-path from `NavigationControl.tsx`'s travel glyph rather than
 * redrawn, so the particle figure and the chip Murcia still shows are the same
 * drawing. The client's call to drop the mouse outline is what lets one glyph
 * serve both inputs: a chevron means "this way" to a thumb as readily as to a
 * cursor, where a mouse body does not.
 */
export const HINT_CHEVRONS = {
  /** The ink's own box inside the 24x48 viewBox, so the crop carries no margin. */
  box: { x: 8, y: 36, width: 8, height: 10 },
  paths: ['M8 36l4 4 4-4', 'M8 42l4 4 4-4'],
  /** Matches the SVG's own stroke, so the particle glyph has the same weight. */
  strokeWidth: 1.6,
} as const

export const HINT_CONFIG = {
  presence: {
    /** Scatter to figure. Long enough to read as gathering, not as a fade. */
    formSeconds: 2.0,
    /** Figure to scatter. Shorter than the arrival: leaving is not an event. */
    exitSeconds: 0.9,
  },

  figure: {
    /**
     * Points on the sentence. 540 x ~3px of spacing covers the ~1620px of ink
     * skeleton that 27 letters have at the size below. See the header.
     */
    textCount: 540,
    /**
     * Points on the chevrons. Small because the glyph IS small — 158px of
     * skeleton at ~2.6px spacing. Sampled as its own region rather than taken
     * out of a shared budget, so a longer sentence can never starve it.
     */
    glyphCount: 60,

    /**
     * Design sizes in CSS px at full fit. The figure is laid out once at this
     * size and scaled by one uniform on narrow viewports, rather than being
     * re-rasterized — a canvas raster on a resize handler is the wrong shape.
     */
    fontPx: 35,
    /** 600, not 400: heavier stems hold a wider dot spacing at the same size. */
    fontWeight: 600,
    chevronWidthPx: 56,
    gapPx: 16,

    /**
     * Mask resolution per design pixel. Fidelity of WHERE the dots may sit;
     * `sampleInk` derives its own cell size from the ink, so this does not
     * change the spacing, only how precisely each dot lands on the letterform.
     */
    rasterScale: 3,
  },

  render: {
    /** How far in front of the eye the figure hangs, in world units. */
    distance: 6,
    /** Below centre, in CSS px at full fit — roughly where the chip sat. */
    offsetPx: 250,
    /** Side margin kept clear when the figure is scaled down to fit. */
    marginPx: 24,

    /**
     * Point diameter in CSS px, before the device pixel ratio.
     *
     * 2.2 was the arithmetic's answer and it was too dim to read: the shared
     * sprite falloff SQUARES, so at 2.2px only the centre pixel is near full
     * alpha and each dot lands as one faint pixel. Raised until the sentence
     * reads against black. Judged on screen, which is the only way this one can
     * be settled.
     */
    sizePx: 3.2,

    /**
     * UNDER THE BLOOM KNEE, and that is the whole reason for the value.
     * `UnrealBloomPass` thresholds at 0.62 LINEAR over the entire Earth frame
     * and there is no selective bloom; PROJECT_MEMORY §11.58 records that alpha
     * does not get you under it, the colour must. rgb(200,200,200) is ~0.58
     * linear. Text that blooms is text that cannot be read.
     *
     * NOT dimmed further the way `createHoverCue` dims its colour: that one is
     * pulling a saturated brand blue under the knee for an ADDITIVE cue. This
     * material blends normally, so the brightest pixel it can make is this
     * colour, and taking it lower only makes small neutral text muddy.
     */
    color: 0xc8c8c8,
    /**
     * The star field reads faintly through, so the figure is light in space
     * rather than a decal. Free against bloom — alpha does not lower the
     * sampled luminance (§11.58), which is the mistake that note exists to stop.
     */
    opacity: 1,

    /** Where the points come in from and go out to, in CSS px. */
    scatterPx: 900,
    dispersePx: 260,
  },
} as const
