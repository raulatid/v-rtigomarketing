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
        The hint frame: one glass plate, bottom-centre, in both worlds. Since
        2026-09-05 it carries TWO blocks — the city's controls (drag, rotate,
        select), shown only in Murcia, over the gesture that leaves the world
        the viewer is in. They used to be two elements owned by two modules
        (Murcia's `#controls-hint` plate under this hint), and stacked at the
        bottom of a bright city they read as two unrelated things, the sentence
        floating unreadable over the roofs. One frame, one owner: everything
        here is painted by createNavigationInput, and it has one closing rule —
        three seconds after the viewer first touches the scene (section 29).

        The gesture block is the answer to "nothing on screen says a gesture
        exists" (DECISIONS §15's objection, and §29's once-per-visit rule,
        amended to an arrival beat and a silence clock). The glyphs are
        unchanged by `adr/014` because the MOTION is unchanged — the same scroll
        and the same pinch, which now zoom before they travel — and the sentence
        under them (plan 012, phase 4) says what the gesture DOES, because a
        mouse with two chevrons was read as decoration. The touch copy says
        "zoom" rather than "pinch": the outcome is the promise, not the
        choreography.

        A SIBLING of the control, not a child: the control is clipped to a
        pixel for assistive technology and a child would be clipped with it.

        EVERY VARIANT IS RENDERED and the stylesheet picks: input by
        `(pointer: coarse)`, direction by the `data-direction` the input layer
        paints on `.nav`. This element renders once and never re-renders, so
        there is no later moment for a `matchMedia` read to matter — and it
        means the words and the picture can never disagree, since the same two
        facts choose both. Teaching the wrong device's input is worse than
        teaching none: it says the site was not built for the thing in your
        hand. That is why the rotate and select cells carry a mouse AND a hand.

        The glyphs move. Each has one part the stylesheet loops slowly — the
        wheel scrolls, the fingers pinch, the hand slides, the pair turns, the
        ring spreads from the tap — so the picture shows the motion rather than
        naming it. All of it is `transform`/`opacity`, and reduced motion stops
        it.

        'Acercar' is not among the controls. It taught the wheel and the pinch,
        and neither moves the camera any more (`adr/009`): the wheel and pinch
        navigate between worlds, which the gesture block teaches, and getting
        closer is what selecting a district does. Pan leads the three because it
        needs no teaching — people try it first — and the two that are NOT
        discoverable follow it; rotation in particular has no affordance now
        that it lives on the right button.

        aria-hidden: the button above already teaches assistive technology, and
        a pinch is not something it could act on anyway. This is sighted-only.
      */}
        <span className="nav-hint" aria-hidden="true">
          <span className="nav-hint__controls">
            <span className="nav-hint__cells">
              <span className="nav-hint__cell" data-gesture="drag">
                <svg className="nav-hint__icon nav-hint__icon--drag" {...GLYPH}>
                  <path d="M9 24H3" />
                  <path d="M6 21l-3 3 3 3" />
                  <path d="M39 24h6" />
                  <path d="M42 21l3 3-3 3" />
                  <g className="nav-hint__part nav-hint__part--slide">
                    <circle cx="24" cy="24" r="5" />
                    <path d="M24 29v8" />
                  </g>
                </svg>
                <span className="nav-hint__label">Arrastra</span>
                <span className="nav-hint__caption">mover</span>
              </span>
              <span className="nav-hint__cell" data-gesture="rotate">
                <svg className="nav-hint__icon nav-hint__icon--rotate-mouse" {...GLYPH}>
                  <rect x="17" y="10" width="14" height="26" rx="7" />
                  <path d="M24 10v10" />
                  <path
                    className="nav-hint__part nav-hint__part--blink"
                    d="M24 10a7 7 0 0 1 7 7v3h-7z"
                    fill="currentColor"
                  />
                  <path d="M36 16a12 12 0 0 1 0 16" />
                  <path d="M33 29l3 3 3-3" />
                </svg>
                <svg className="nav-hint__icon nav-hint__icon--rotate-touch" {...GLYPH}>
                  <path d="M10 15a16 16 0 0 1 28 0" />
                  <path d="M35 10l3 5-5 3" />
                  <g className="nav-hint__part nav-hint__part--turn">
                    <circle cx="16" cy="28" r="5" />
                    <circle cx="32" cy="28" r="5" />
                  </g>
                </svg>
                <span className="nav-hint__label" data-input="fine">
                  Botón derecho
                </span>
                <span className="nav-hint__label" data-input="coarse">
                  Dos dedos
                </span>
                <span className="nav-hint__caption">girar</span>
              </span>
              <span className="nav-hint__cell" data-gesture="select">
                <svg className="nav-hint__icon nav-hint__icon--click" {...GLYPH}>
                  <rect x="17" y="12" width="14" height="26" rx="7" />
                  <path d="M24 12v10" />
                  <path
                    className="nav-hint__part nav-hint__part--blink"
                    d="M24 12a7 7 0 0 0-7 7v3h7z"
                    fill="currentColor"
                  />
                  <circle className="nav-hint__part nav-hint__part--ring" cx="24" cy="25" r="16" />
                </svg>
                <svg className="nav-hint__icon nav-hint__icon--tap" {...GLYPH}>
                  <circle cx="24" cy="24" r="5" />
                  <path d="M24 29v9" />
                  <circle className="nav-hint__part nav-hint__part--ring" cx="24" cy="24" r="14" />
                </svg>
                <span className="nav-hint__label" data-input="fine">
                  Clic
                </span>
                <span className="nav-hint__label" data-input="coarse">
                  Toca
                </span>
                <span className="nav-hint__caption">un distrito iluminado</span>
              </span>
            </span>
          </span>
          <span className="nav-hint__gesture">
            {/* One child, so the block can collapse as a grid row (styles.css). */}
            <span className="nav-hint__row">
              <svg
                className="nav-hint__icon nav-hint__icon--mouse"
                viewBox="0 0 24 48"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M8 8l4-4 4 4" />
                <rect x="7" y="14" width="10" height="20" rx="5" />
                <path className="nav-hint__part nav-hint__part--wheel" d="M12 18v4" />
                <path d="M8 40l4 4 4-4" />
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
              {/* The eyebrow names the gesture, the sentence says what it does
              (plan 020 §8). Only the descent carries one: on the way back the
              plate already has the city's three controls above it, and a
              second micro-label there would be the HUD again. The words are
              the ones the sentence already uses, so nothing new is claimed. */}
              <span className="nav-hint__eyebrow" data-input="fine">
                Scroll
              </span>
              <span className="nav-hint__eyebrow" data-input="coarse">
                Zoom
              </span>
              <span className="nav-hint__text" data-input="fine" data-direction="down">
                Haz scroll para bajar a Murcia
              </span>
              <span className="nav-hint__text" data-input="fine" data-direction="up">
                Haz scroll para volver a la Tierra
              </span>
              <span className="nav-hint__text" data-input="coarse" data-direction="down">
                Haz zoom para bajar a Murcia
              </span>
              <span className="nav-hint__text" data-input="coarse" data-direction="up">
                Haz zoom para volver a la Tierra
              </span>
            </span>
          </span>
        </span>
      </div>
    )
  },
)
