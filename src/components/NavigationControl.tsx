import { forwardRef } from 'react'

/** The one stroke every glyph shares, so the eight of them read as one hand. */
const GLYPH = {
  viewBox: '0 0 48 48',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const

/**
 * The keyboard and assistive-technology path between the two worlds, plus the
 * hint that teaches the gesture.
 *
 * ## What replaced the rail, and why the rail went
 *
 * This was `NavigationRail`: a visible vertical indicator on the right edge that
 * was ALSO the touch target, because `adr/009` had concluded the canvas had no
 * free channel for a gesture. Two fingers turned out to be exactly that channel,
 * so touch navigates by pinching the scene itself and the rail lost both of its
 * jobs at once — the indicator, because the scene is now the indicator (the
 * world moves under your fingers), and the target, because there is nothing left
 * to drag.
 *
 * What did NOT go with it is the reason it was focusable. A pinch is not a
 * universal input: it is unavailable to keyboard users, to switch access, to
 * anyone who cannot make a two-finger gesture, and to a screen reader. Removing
 * the rail without leaving this behind would have removed the only way some
 * people could reach Murcia at all.
 *
 * ## The gesture became two stages, and this control did not
 *
 * `adr/014` split the wheel and the pinch in two: the first 600px zoom the world
 * the viewer is standing in, and only what spills past the far end of that zoom
 * accumulates toward a commit. That is a longer, more deliberate journey, and it
 * is deliberate on purpose.
 *
 * This button is unchanged by it, and that is the accessibility decision rather
 * than an omission. It commits OUTRIGHT — one activation, from whatever zoom the
 * viewer happens to be at, with no equivalent of "keep pushing" — because a
 * two-stage motion is exactly the kind of thing that is easy with a trackpad and
 * impossible with a switch. The label names the destination for the same reason
 * it always did: "Ir a Murcia" is operable information, and it stays true
 * whatever the camera is currently doing.
 *
 * ## Screen-reader-only, and visible when focused
 *
 * A transparent 44px target floating over the canvas would swallow taps meant
 * for the world, so this is clipped to a pixel — and unclipped again on
 * `:focus-visible`, so a sighted keyboard user can see what they have landed on.
 * The skip-link pattern, for the same reason skip links use it.
 *
 * ## It renders once and is never re-rendered
 *
 * There is no progress prop and no label prop. `createNavigationInput` writes
 * `--nav-progress`, `data-state`, `data-direction` and the `aria-label` straight
 * onto these elements through the ref. A wheel produces well over a hundred
 * events a second and a pinch is worse, and a prop would make every one of them
 * a render of the whole application tree — two canvases and all the overlay
 * chrome included.
 *
 * The two labels live here rather than there because they are visitor-facing
 * Spanish (DECISIONS §11) and strings belong with the markup; which of them is
 * current is a navigation question, so the input layer picks.
 */
export const NavigationControl = forwardRef<HTMLDivElement>(
  function NavigationControl(_props, ref) {
    return (
      <div ref={ref} className="nav" data-state="suppressed" data-direction="down">
        {/*
        A button rather than the slider this used to be. The slider role
        described a continuous value the viewer dragged; there is no drag any
        more, and what is left is one thing you can activate. `aria-label` is
        written by createNavigationInput and names the DESTINATION — "go to
        Murcia" is operable information in a way that "navigate between" is not.
      */}
        <button
          type="button"
          className="nav-control"
          data-label-earth="Ir a Murcia"
          data-label-murcia="Volver a la Tierra"
          // A placeholder for the first paint only, replaced the moment
          // createNavigationInput wires up and derives the real context.
          aria-label="Ir a Murcia"
        />
        {/*
        The hint frame: one glass plate, bottom-centre, shown only in Murcia
        (Earth's hint is `.earth-hint`). It teaches the one gesture that leaves
        the city. It used to carry the city's controls as well — Mover, Girar,
        Abrir — and those were removed on 2026-09-10.
        Everything here is painted by createNavigationInput, and it has one
        closing rule — three seconds after the viewer first touches the scene
        (section 29).

        A glyph over ONE word, and the word names the gesture rather than its
        result: no result word short enough survives ("Murcia"/"Tierra" was
        rejected as a label).

        A SIBLING of the control, not a child: the control is clipped to a
        pixel for assistive technology and a child would be clipped with it.

        EVERY VARIANT IS RENDERED and the stylesheet picks: input by
        `(pointer: coarse)`, direction by the `data-direction` the input layer
        paints on `.nav`. This element renders once and never re-renders, so
        there is no later moment for a `matchMedia` read to matter — and it
        means the word and the picture can never disagree, since the same two
        facts choose both. Teaching the wrong device's input is worse than
        teaching none: it says the site was not built for the thing in your
        hand.

        The glyph moves, and the motion is the whole explanation. Each
        travelling part goes ONE way, fading in where it starts and out where
        it ends, because a tween that alternates returns to where it began and
        reads as a wobble with no direction. The mouse carries two chevron
        groups, above and below; only the travel side shows, and its two
        chevrons light in sequence so the wheel appears to hand off to them.
        All of it is transform and opacity, and reduced motion stops it — which
        is why the resting state has to be the READABLE one (styles.css).

        aria-hidden: the button above already teaches assistive technology, and
        a pinch is not something it could act on anyway. This is sighted-only.
      */}
        <span className="nav-hint" aria-hidden="true">
          <span className="nav-hint__gesture nav-hint__cell" data-gesture="travel">
            {/* The chevrons are two GROUPS, above and below, and the stylesheet
                shows only the one the viewer is travelling toward. Two of them
                per side, not one, so they can chase in sequence: a single
                chevron can only blink, and a blink has no direction. */}
            <svg
              className="nav-hint__icon nav-hint__icon--mouse"
              viewBox="0 0 24 48"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.6"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <g className="nav-hint__chevrons" data-direction="up">
                <path className="nav-hint__part nav-hint__part--chase" d="M8 12l4-4 4 4" />
                <path className="nav-hint__part nav-hint__part--chase" d="M8 6l4-4 4 4" />
              </g>
              <rect x="7" y="14" width="10" height="20" rx="5" />
              <path className="nav-hint__part nav-hint__part--wheel" d="M12 18v4" />
              <g className="nav-hint__chevrons" data-direction="down">
                <path className="nav-hint__part nav-hint__part--chase" d="M8 36l4 4 4-4" />
                <path className="nav-hint__part nav-hint__part--chase" d="M8 42l4 4 4-4" />
              </g>
            </svg>
            {/* Two fingers opening: leaving Earth is an approach, so the world is
                pulled toward you. */}
            <svg className="nav-hint__icon nav-hint__icon--spread" {...GLYPH}>
              <path d="M9 24H3" />
              <path d="M6 21l-3 3 3 3" />
              <path d="M39 24h6" />
              <path d="M42 21l3 3-3 3" />
              <circle className="nav-hint__part nav-hint__part--spread-l" cx="16" cy="24" r="5" />
              <circle className="nav-hint__part nav-hint__part--spread-r" cx="32" cy="24" r="5" />
            </svg>
            {/* Two fingers closing: leaving Murcia is an ascent (ADR 006), so the
                world is pushed away. */}
            <svg className="nav-hint__icon nav-hint__icon--close" {...GLYPH}>
              <path d="M3 24h6" />
              <path d="M6 27l3-3-3-3" />
              <path d="M45 24h-6" />
              <path d="M42 27l-3-3 3-3" />
              <circle className="nav-hint__part nav-hint__part--close-l" cx="16" cy="24" r="5" />
              <circle className="nav-hint__part nav-hint__part--close-r" cx="32" cy="24" r="5" />
            </svg>
            {/* The one word left on the plate. It names the gesture the visitor
                has to make, in BOTH directions now: the sentence that used to
                distinguish "bajar" from "volver" is gone, and the glyph's
                chevrons say which way. */}
            <span className="nav-hint__label" data-input="fine">
              Scroll
            </span>
            <span className="nav-hint__label" data-input="coarse">
              Zoom
            </span>
          </span>
        </span>
      </div>
    )
  },
)
