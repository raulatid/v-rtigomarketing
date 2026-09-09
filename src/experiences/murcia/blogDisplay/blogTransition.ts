/**
 * The approach: its shape, its timings, and the curves that read them.
 *
 * Ported from `vertigo-lab`'s `blog-transition` (plan 022), where it had been
 * trimmed out of that lab's warp. This repo's own warp — `src/app/warpTransition.ts`
 * — is its cousin rather than its parent, and the two are deliberately not shared.
 *
 * ## One leg, not two, which is why sharing the warp's module would not work
 *
 * `warpTransition`'s envelope runs 0 -> 1 -> 0: a departure and an arrival, with a
 * hard cut at the midpoint where Earth is exchanged for Murcia and a black flash
 * over the seam. That shape is actively wrong here. This transition has one
 * destination, so the travel curve is monotone, the cut sits at the END, and there
 * is no flash — see `BLOG_TRANSITION.handoffStart` for what covers the cut instead.
 *
 */

export interface BlogTransitionLimits {
  /** Seconds from the click to the route change. */
  duration: number;
  /**
   * Where the travel curve's acceleration sits. 1 is linear; higher is slower off
   * the mark and faster through the middle.
   */
  accelerationPower: number;
  /**
   * Progress at which the handoff image starts fading in.
   *
   * THIS IS WHERE THE BLACK FLASH WOULD HAVE GONE. The site's warp covers its cut
   * with an opaque overlay peaking exactly at the swap, because it is exchanging two
   * visibly different worlds and a partial cover would show the seam. Here the two
   * sides of the swap are the same page, so there is nothing to hide — and a black
   * blink in the middle of a continuous move would be the one thing a visitor
   * definitely notices.
   *
   * So the cover is the page itself: at this point a full-screen element carrying
   * the very image the panel is wearing fades in over `handoffFade`, the route
   * changes behind it, and it stays up until the blog has painted. `handoffImage`
   * owns it, and `blogApproach` owns when it goes.
   */
  handoffStart: number;
  /**
   * How long that fade lasts, in PROGRESS, not seconds.
   *
   * Spent as `smootherstep(handoffStart, handoffStart + handoffFade, p)` where p is
   * the clock's 0..1, so it is a fraction of the run and not a duration. Naming it
   * in seconds is the mistake that bites the first person to change `duration` and
   * expect the cover to keep its timing. The end is clamped to 1 at the call site,
   * because both numbers together can otherwise land past the cut and leave the
   * ramp still climbing when the route changes.
   *
   * ## Why ONE value here, where the lab had two
   *
   * The lab shipped a table — 0.06 for its deterministic raster, 0.3 for a build
   * screenshot — because one of its two routes was EXACT. That raster was built
   * from the same strings its /blog injected, and it diffed against the real
   * document at zero differing pixels, so a two-frame ramp was a token rather than
   * a cover.
   *
   * Neither route here is exact and neither ever can be. The screenshot is one
   * fixed capture per shape, cover-fitted to whatever window the visitor has, so it
   * is cropped rather than wrong. The plate is a neutral page that carries no blog
   * content at all, deliberately, so that it can never go stale. A single honest
   * fade covers both, and a second value would be a knob with no measurement behind
   * it.
   *
   * What is NOT being covered is tone mapping. `blogDisplay`'s panel sets
   * `toneMapped: false`, so the face's round trip is byte-exact and the crossing is
   * a crop, not a colour shift. Its docblock carries the numbers.
   */
  handoffFade: number;
  /**
   * Progress at which the panel starts shedding its screen-ness.
   *
   * The face carries a gloss lobe and a graduated luminance wash — the things that
   * make it read as a lit display rather than a poster. Neither exists on `/blog`,
   * and the gloss in particular is ADDITIVE and composited last, so it sits in front
   * of the copy. Ramping both to zero across the tail of the approach means the
   * object stops being a screen exactly as it becomes a page.
   */
  screenFadeStart: number;
  /**
   * How much closer than exact fill the camera ends, as a fraction.
   *
   * Below 1 so the readable core OVER-fills the frame. At exactly 1.0 the core's
   * edge lands on the viewport's edge, and a rounded corner or a half-pixel of the
   * antialiased fringe would show at the very moment nothing may.
   */
  fillOvershoot: number;
  /**
   * Seconds for the RETURN — the flight back out of the display to where the
   * visitor was standing when they clicked it.
   *
   * Shorter than `duration`, and not for symmetry with anything. The approach is a
   * commitment being made: it has to feel deliberate, and the slow start is what
   * sells the idea that the display is being entered. Coming back out is a
   * commitment being released, and the visitor has already seen this scene — the
   * same three seconds spent re-showing them something they know reads as the
   * software being slow rather than the move being considered.
   *
   * The curve is shared. `cinematicTravel` is odd-symmetric (see its docblock), so
   * the return is the exact time-reversal of the approach and only its length
   * differs.
   */
  returnDuration: number;
}

/**
 * The shipped numbers, frozen.
 *
 * The lab handed these out through a `createDefaultTransitionLimits()` that returned
 * a fresh mutable copy, because a lil-gui folder wrote into it live. Nothing writes
 * into it here, and a factory that exists so a caller can mutate the result is worse
 * than a constant once the caller is gone: it invites exactly the divergent-copy
 * problem the type was shaped to prevent.
 *
 * The rule the curves keep either way: none of them reads this. Every one takes its
 * limits as a required parameter with no default, so a call site holding a stale
 * struct fails to compile rather than quietly animating to last week's numbers.
 */
export const BLOG_TRANSITION: Readonly<BlogTransitionLimits> = {
  duration: 3,
  accelerationPower: 1.7,
  handoffStart: 0.88,
  handoffFade: 0.3,
  screenFadeStart: 0.55,
  fillOvershoot: 0.94,
  returnDuration: 2.2,
};

/**
 * Internal, and there is no `lerp` beside it: the two things this transition
 * interpolates are a `Vector3` and a `Quaternion`, and three's own `lerpVectors` and
 * `slerpQuaternions` do that better than a scalar helper could.
 */
function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}

/** Symmetric ease with zero velocity at both ends, and no overshoot. */
export function smootherstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / (edge1 - edge0 || 1e-6));
  return t * t * t * (t * (t * 6 - 15) + 10);
}

/**
 * The camera's POSITION along the approach. Slow off the mark, quick through the
 * middle, soft into the end.
 *
 * Not `smootherstep`: the power term makes the middle sharper, so more of the
 * distance is covered early and the last stretch reads as a settle.
 *
 * ## It IS symmetric, and the return depends on that
 *
 * An earlier version of this comment claimed the curve was deliberately asymmetric,
 * unlike `smootherstep`. That is wrong, and it is worth being exact because the
 * return journey rests on it. For x < 0.5:
 *
 *     f(1-x) = 1 - 0.5*(2*(1-(1-x)))^p = 1 - 0.5*(2x)^p = 1 - f(x)
 *
 * So f(1-x) = 1 - f(x) identically: the curve is ODD-SYMMETRIC about (0.5, 0.5),
 * exactly as `smootherstep` is. Both ease in and out with zero velocity at each end
 * for p > 1; the real difference is how sharp the middle is, not symmetry.
 *
 * The consequence: flying `to -> from` with f(p) is the EXACT time-reversal of
 * flying `from -> to` with f(p). The return needs no second curve and no inverted
 * easing — the same function, with the endpoints swapped.
 */
export function cinematicTravel(t: number, power: number): number {
  const x = clamp01(t);
  return x < 0.5 ? 0.5 * Math.pow(x * 2, power) : 1 - 0.5 * Math.pow((1 - x) * 2, power);
}

/**
 * Read ONCE, at construction — never per frame.
 *
 * A preference, not a live signal. Re-reading it mid-transition could change which
 * branch a running approach is in and leave the camera parked wherever the last
 * motion frame put it.
 *
 * Note what reduced motion does NOT switch off: the navigation still happens, and
 * the handoff image still covers it. Concealing a document swap is not a motion
 * effect, and without the cover the page would visibly pop.
 */
export function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}
