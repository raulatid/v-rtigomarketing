interface Props {
  /** Request the return. The control knows nothing about how it happens. */
  onActivate: () => void
  /** True while a transition is already playing. */
  busy?: boolean
}

/**
 * PLACEHOLDER — the way out of the Murcia experience.
 *
 * This is deliberately the whole feature, in one file, behind a one-function
 * interface. It is expected to be replaced by something better: a 3D object in
 * the city, an edge-of-map trigger, a gesture, a zoom-out past a threshold.
 *
 * THE SEAM IS `onActivate`. Anything that can decide "the viewer wants to leave"
 * can drive the transition by calling it — the replacement does not need to be
 * a button, a DOM element, or even React. App only knows that something asked
 * to go back; nothing about the transition, the render pipeline or Murcia's
 * internals is reachable from here.
 *
 * So replacing this means:
 *   1. Build the new trigger.
 *   2. Have it call the same callback App passes here.
 *   3. Delete this file.
 *
 * Nothing else in the application should need to change. Keep it that way — if
 * a future version of this needs to reach into Murcia's camera, bounds or
 * scene, that is a signal the trigger belongs inside MurciaExperience with a
 * high-level event coming out, not more surface area coming in.
 *
 * Rendered only while Murcia is showing (App gates it), so it needs no
 * visibility logic of its own.
 */
export function ReturnToEarthControl({ onActivate, busy = false }: Props) {
  return (
    <button
      type="button"
      className="experience-switch experience-switch--back"
      onClick={onActivate}
      disabled={busy}
    >
      ← Volver a la Tierra
    </button>
  )
}
