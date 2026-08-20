import { forwardRef } from 'react'

interface Props {
  /** Spanish, like every visitor-facing string (DECISIONS §11). */
  label: string
}

/**
 * The navigation indicator, and the touch target that drives it.
 *
 * Two fixed points with a fill travelling between them — a travel rail, not a
 * loading bar. `docs/plans/002` §2 asked for "a very minimal vertical indicator on
 * the RIGHT side", and this is deliberately the whole of it.
 *
 * ## It renders once and is never re-rendered
 *
 * There is no progress prop. `createNavigationInput` writes `--nav-progress` and
 * the `data-state` / `data-direction` attributes straight onto this element
 * through the ref. A wheel produces well over a hundred events a second, and a
 * prop would make every one of them a render of the whole application tree — two
 * canvases and all the overlay chrome included. The reveal and fill read the
 * custom property in transforms, so an update costs compositor properties and
 * no layout.
 *
 * ## It is also the affordance
 *
 * The indicator and the touch target are the same object on purpose. The page is
 * `overflow: hidden` behind a full-viewport canvas, so nothing else signals that a
 * gesture exists — DECISIONS §15 raised exactly that as an argument against scroll
 * navigation, and the answer is to draw the thing it said would have to be drawn.
 * Its width is a 44px-minimum touch target (the mobile audit's rule), which is why
 * the visible line is much narrower than the element that carries it.
 *
 * ## It is focusable, and that is not a second control
 *
 * `tabIndex` and the arrow keys in `createNavigationInput` are the primary control
 * made operable, not the return button coming back. Without them there is no
 * keyboard or assistive-technology path between the two worlds at all.
 */
export const NavigationRail = forwardRef<HTMLDivElement, Props>(function NavigationRail(
  { label },
  ref,
) {
  return (
    <div
      ref={ref}
      className="nav-rail"
      // A slider rather than a button: it carries a continuous value the viewer
      // drives, and `aria-valuenow` is deliberately absent — it would have to be
      // written on every frame, which is the render this component exists to
      // avoid. The label says what the control does; the value is the animation.
      role="slider"
      aria-label={label}
      aria-valuemin={0}
      aria-valuemax={1}
      tabIndex={0}
      // A placeholder for the first paint only: createNavigationInput derives
      // the real state from the navigation context the moment it wires up, and
      // re-derives on every semantic change. Suppressed — i.e. hidden — is the
      // honest default, because the rail mounts during the intro, long before
      // navigation is possible.
      data-state="suppressed"
      data-direction="down"
    >
      <span className="nav-rail__dot nav-rail__dot--start" aria-hidden="true" />
      <span className="nav-rail__track" aria-hidden="true">
        {/* Nested, not flat: the reveal is a clipping window that slides along
            the track while the fill counter-slides the gradient back into
            place, keeping the gradient pinned to the track (see styles.css). */}
        <span className="nav-rail__reveal">
          <span className="nav-rail__fill" />
        </span>
      </span>
      <span className="nav-rail__dot nav-rail__dot--end" aria-hidden="true" />
      {/* The gesture hint: the answer to "nothing signals a gesture exists"
          (DECISIONS §15's objection), shown once per visit and dismissed by
          createNavigationInput the first frame a gesture is in flight. Two
          icons because teaching the wrong device's input is worse than
          teaching none (the Murcia controls hint records why); CSS picks one
          on (pointer: coarse). aria-hidden: the slider role and label above
          already teach assistive technology — this is sighted-only. */}
      <span className="nav-rail__hint" aria-hidden="true">
        <svg
          className="nav-rail__hint-icon nav-rail__hint-icon--mouse"
          viewBox="0 0 24 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 8l4-4 4 4" />
          <rect x="7" y="14" width="10" height="20" rx="5" />
          <path d="M12 19v4" />
          <path d="M8 40l4 4 4-4" />
        </svg>
        <svg
          className="nav-rail__hint-icon nav-rail__hint-icon--touch"
          viewBox="0 0 24 48"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M8 8l4-4 4 4" />
          <circle cx="12" cy="21" r="4" />
          <path d="M12 25v9" />
          <path d="M8 40l4 4 4-4" />
        </svg>
      </span>
    </div>
  )
})
