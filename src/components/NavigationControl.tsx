import { forwardRef } from 'react'

/**
 * The keyboard and assistive-technology path between the two worlds.
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
 * `data-state`, `data-direction` and the `aria-label` straight
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
        No hint frame since 2026-09-15: the client removed Murcia's glass
        "Scroll" / "Zoom" plate, the only place it still showed. Earth's
        hint is `EarthHint`, and it never read this one.
      */}
      </div>
    )
  },
)
