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
// budget buys is that length divided by the budget.
//
// That gives two coherent regimes, and they are a real choice rather than a
// tuning range:
//
//   spacing > dot   separate dots, with sky between them.
//   spacing < dot   the dots overlap and the strokes close up. Legible, but it
//                   reads as text with a rough edge rather than as a figure
//                   made of particles.
//
// BOTH were shipped and rejected in turn, which is the useful part of this note.
// 398 points at a 3.1px dot was the first regime and read ragged — too few
// samples across an x-height for a letterform to resolve. 600 at the same dot
// was the second, and closed up too far to read.
//
// The resolution was NOT a point count. It was making the DOT smaller while
// adding points — 700 at 1.8px — so the sentence has more samples AND visible
// sky between them. The two moves pull opposite ways on spacing and have to be
// made together; see `sizePx` and `dotCore`, which is what pays for a dot that
// small still being visible.
//
// So the budget is a CONSEQUENCE of the type size, and the two may never be
// tuned apart. For the 27 letters below, at the shipped ~1.7px spacing:
//
//   font 26px -> skeleton 1193px -> 700 points   <- shipped
//   font 30px -> skeleton 1377px -> 810 points
//   font 35px -> skeleton 1607px -> 945 points
//
// The trap is reading that the other way: shrinking the type WITHOUT dropping
// the count closes the spacing further and the letters fill in, counters first.
// Change the two together.
//
// A much bigger budget is not a denser figure, it is a BIGGER one — 1400 points
// at 3px spacing wants the sentence about 1380px wide, a headline across the
// viewport rather than a hint. That was offered and declined.
//
// Judged 2026-09-08 at 1440x900 and 390x844, and at device pixel ratio 1 AND 2,
// in four passes: too large and too high (type 35, anchored to the viewport
// centre); right size and place but ragged; legible but closed up; this.
//
// Pixel ratio matters more than usual at this dot size, and it is worth
// capturing both. At ratio 1 a 1.8px dot is barely more than a pixel and the
// sentence is noticeably fainter; at 2 it is 3.6 device pixels and the dots read
// as dots. Most viewers are on the second.

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
    /**
     * Stillness before the hint is offered.
     *
     * This is an IDLE affordance and not an arrival one — client direction. It
     * appears when someone has stopped doing anything and steps aside the moment
     * they move, rather than being pushed at them a beat after every arrival and
     * then never returning. Murcia's glass chip keeps the arrival rule; the two
     * are no longer wired together because they no longer answer the same
     * question.
     *
     * Long enough not to compete with someone who is still looking around, short
     * enough to read as a response to stillness rather than as a timeout.
     */
    idleSeconds: 2,
  },

  figure: {
    /**
     * Points on the sentence. 700 x ~1.7px of spacing covers the ~1193px of ink
     * skeleton that 27 letters have at `fontPx` below — CHANGE THE TWO TOGETHER,
     * or the spacing closes and the letters fill in. See the header's table.
     *
     * Raising this ALONE makes the sentence less readable rather than more, which
     * is the counter-intuitive part: more points at the same dot size is a denser
     * blob. It only helped here because `sizePx` came down with it.
     */
    textCount: 700,
    /**
     * Points on the chevrons — ~124px of skeleton at ~1.8px spacing, matched to
     * the sentence's DENSITY rather than to its count. At 48 the glyph stayed
     * sparse while the sentence went dense, and the two halves of one figure
     * visibly disagreed about what they were made of.
     *
     * Sampled as its own region rather than taken out of a shared budget, so a
     * longer sentence can never starve it.
     */
    glyphCount: 70,

    /**
     * Design sizes in CSS px at full fit. The figure is laid out once at this
     * size and scaled by one uniform on narrow viewports, rather than being
     * re-rasterized — a canvas raster on a resize handler is the wrong shape.
     */
    fontPx: 26,
    /** 600, not 400: heavier stems hold a wider dot spacing at the same size. */
    fontWeight: 600,
    chevronWidthPx: 44,
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
    /**
     * Gap from the BOTTOM of the viewport to the bottom of the figure, in CSS px.
     *
     * Anchored to the bottom edge and not to the centre, which is the only way
     * this reads the same on every device. It was a fixed drop from the centre
     * until 2026-09-08, and measured that is not a position at all — the gap to
     * the bottom edge is then a function of viewport HEIGHT:
     *
     *   1440x900   68px above the bottom
     *    390x844   50px
     *   1920x1080  158px
     *   1024x1366  301px
     *    844x390  -187px   entirely off the screen, in phone landscape
     *
     * The figure's own height is subtracted on the CPU (it is only known once the
     * sample has landed), so this is the gap under the SENTENCE, the way
     * `bottom:` behaves for a DOM element rather than the way a transform does.
     *
     * THE VALUE IS A FLOOR, NOT A PREFERENCE, and `.site-footer` sets it.
     * That mark is fixed at `bottom: max(14px, inset)` and is ~12px tall, so it
     * owns roughly the bottom 26px of every viewport. `styles.css` records the
     * same constraint for the glass chip this replaces — "the mark is
     * right-aligned and this is centred, so they miss on a wide viewport; a
     * phone closes that gap, which is why the clearance is vertical" — and the
     * chip answered it with `max(28px, inset + 20px)`.
     *
     * Measured 2026-09-08: at 12 the sentence runs straight through "© 2026
     * Vértigo" on a 390px phone, where a nearly full-width sentence cannot miss
     * a right-aligned mark horizontally. 24 puts the lowest dot at ~28px, which
     * is the chip's own clearance. Lower than this needs the footer to move, not
     * a smaller number here.
     *
     * The safe-area term is added in `HintLayer`, so a home indicator does not
     * sit on top of the sentence either.
     */
    bottomPx: 24,
    /** Side margin kept clear when the figure is scaled down to fit. */
    marginPx: 24,

    /**
     * Point diameter in CSS px, before the device pixel ratio.
     *
     * THE SEPARATION KNOB, and it moves against `textCount`. Dot centres sit
     * ~1.7px apart at the shipped budget, so a 3.1px dot overlapped its
     * neighbours by more than a third of its width and the strokes filled in.
     * That is what came down from 3.1: at 1.8 the solid cores (1.40px, see
     * `dotCore`) clear each other and only the shoulders meet, which is what puts
     * sky back between the dots.
     *
     * It cannot go much below this at device pixel ratio 1 — the solid core is
     * already about one pixel, and past that a dot stops shrinking and simply
     * dims. On a ratio-2 screen there is room.
     */
    sizePx: 1.8,

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
    /**
     * How much of each dot's radius is SOLID before it falls off, 0..1.
     *
     * The readability knob, and the one that matters more than the point count.
     * The shared star falloff this replaces is down to 0.25 alpha at half its
     * radius, so a 3px sprite carried ~1.5px of readable core and the sentence
     * read soft no matter how many dots were in it. 0.55 delivers ~3.5x the ink
     * per dot at the same diameter and the same count.
     *
     * Toward 0 is the old soft blob; toward 1 is a hard-edged disc that aliases,
     * since points get no per-sample coverage through the post chain.
     *
     * 0.55 -> 0.78 when the dot shrank to 1.8px. A smaller sprite spends more of
     * itself on the shoulder, so holding the core fraction constant would have
     * thrown away most of what the smaller dot had left. Worth 1.3x the ink per
     * dot, at the cost of a slightly firmer edge.
     */
    dotCore: 0.78,

    /**
     * Idle float, in CSS px: how far the WHOLE figure rises and falls while it
     * is held. Peak to peak is twice this.
     *
     * Rigid, one phase for every dot — chevrons and sentence together, as one
     * thing suspended in space. A per-particle version was built first and it
     * shimmers instead of floating; it also moves the dots relative to each
     * other, which softens the baseline and gives back the readability the
     * previous pass bought. That constraint is what limited the amplitude to
     * under half the dot spacing; rigid motion has no such limit, because it
     * cannot blur a letterform.
     *
     * The remaining bound is the composition: the figure sits ~24px above the
     * bottom and the site footer owns the strip below it, so the DOWN half of
     * the swing has to stay clear of it.
     *
     * Zero under reduced motion. This is exactly the kind of decorative loop the
     * HTML hint's own media query kills while keeping its fades, and the figure
     * is fully legible standing still.
     */
    driftPx: 5,
    /**
     * Seconds for one full rise and fall. Slow enough to read as floating rather
     * than as a bob — at this amplitude the motion is only a few pixels per
     * second, which is the point: it should be noticed as life in the figure and
     * not as an animation playing.
     */
    driftSeconds: 6,

    /** Where the points come in from and go out to, in CSS px. */
    scatterPx: 900,
    dispersePx: 260,
  },
} as const
