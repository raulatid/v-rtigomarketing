import { MAX_WHEEL_DELTA_PX } from '../../utils/wheelDelta'

// Every tuning constant for Earth <-> Murcia gesture navigation, in one place.
//
// House rule, and it is the reason this file exists rather than the numbers
// living beside their use: a number here is either MEASURED (cite the harness
// that measures it) or JUDGED (cite the date and the person). None of these has
// been driven by a person yet — they are stated starting points with their
// reasoning, and the ones that need a human to sit in front of the build are
// marked. Do not treat an unjudged default as a settled value.

/**
 * The zoom band: how much travel it costs to cross the camera's own range.
 *
 * Added by `adr/014`, which reversed `adr/009`'s removal of zoom on a product
 * decision. The two halves are separate numbers because they are not the same
 * question — one of them ends at a threshold that navigates and the other ends
 * at a wall — and because a scene may want them to cost differently.
 */
export interface ZoomBandLimits {
  /**
   * Travel from rest to the limit that faces the other world, in CSS pixels.
   *
   * Earth zooming in, Murcia zooming out. Reaching the end commits for wheel
   * input. Touch requires a new pinch that starts at the end of the band.
   */
  towardTravelPx: number
  /**
   * Travel from rest to the far limit, in CSS pixels.
   *
   * Earth zooming OUT, Murcia zooming IN. A dead end: there is no world out
   * there, so no amount of pushing past it does anything.
   *
   * Equal to `towardTravelPx` deliberately. The two directions of one zoom
   * control should cost the same per pixel of finger travel or the control
   * reads as sticky one way round, and the ranges either side of rest are
   * roughly comparable in both worlds.
   */
  awayTravelPx: number
  /**
   * Ceiling on what one event may contribute, in normalised pixels.
   *
   * Applied before moving the band, against the shared wheel normalisation.
   */
  maxEventTravelPx: number
}

export const NAVIGATION_ZOOM: ZoomBandLimits = {
  // Shared threshold, judged with the user on 2026-09-22. At least ten
  // capped wheel events from rest; no additional push after the zoom ends.
  towardTravelPx: 1200,
  awayTravelPx: 1200,
  maxEventTravelPx: MAX_WHEEL_DELTA_PX,
}

/**
 * What separates a deliberate pinch from two fingers resting on the glass.
 *
 * EVERY NUMBER HERE IS PROVISIONAL, and more so than the rest of this file:
 * they exist to make a prototype drivable on a phone, and the prototype exists
 * because the question they answer — how much spread reads as "bring it closer"
 * — cannot be answered from a repository.
 *
 * ── Separation GROWTH, not a scale ratio. Judged on a phone, 2026-08-26 ──
 *
 * The first version of this measured `ln(distance / startDistance)`, on the
 * reasoning that a ratio is free of screen size, DPR and grip, and that it makes
 * the world's apparent scale track the fingers about 1:1. Both of those are
 * true, and the whole thing was still wrong, because the quantity a ratio does
 * NOT hold constant is the one the hand actually feels: how far the fingers have
 * to travel.
 *
 * Under a x1.6 commit, the growth required scales with the grip you happened to
 * start from:
 *
 *   start 40px  ->  commit after  24px of growth  (12px per finger)
 *   start 60px  ->  commit after  36px            (18px per finger)
 *   start 150px ->  commit after  90px            (45px per finger)
 *   start 250px ->  commit after 150px            (75px per finger)
 *
 * Spreading to zoom in starts with the fingers CLOSE — that is what the gesture
 * is — so real use lands at the top of that table, where a commit costs about a
 * centimetre of thumb. Reported from the device as "too quick, a small pinch
 * triggered the transition", and the harness never saw it because its fixture
 * grip was 150px.
 *
 * Raising the ratio would only rescale that table, not flatten it. So the signal
 * is now the CHANGE IN SEPARATION in CSS pixels, normalised against the
 * viewport — which keeps the device-independence the ratio was chosen for while
 * making the effort the same wherever your fingers begin.
 *
 * What is given up is the near-1:1 correspondence between finger spread and the
 * Earth's apparent scale. That was elegant on paper and it is not what anyone
 * reported missing; effort is felt, ratios are not.
 *
 * Symmetry and reversal survive unchanged: a delta in pixels is already additive
 * and already signed, which is all the zoom band needs.
 */
export interface PinchLimits {
  /**
   * Outward growth that means "let go", in CSS pixels.
   *
   * NOT AN ARBITRATION, and the distinction is the whole of this number's
   * history. It used to be `claimGrowthPx`: the growth at which a pinch proved
   * it was a pinch and not the two-finger turn it competed with. There is no
   * turn any more — two fingers mean one thing — so nothing has to be proved and
   * navigation is driven from the very first sample.
   *
   * The noise floor protects closing a focused display and confirming a
   * transition. Feeding the zoom band needs no floor, because a pixel of
   * growth moves the band by a pixel and the viewer can take it straight back;
   * dismissing what someone is reading cannot be taken back, so two settling
   * fingertips must not do it. Above the few px of drift both worlds already
   * treat as a tap's worth of wander, and far below a commit.
   */
  releaseGrowthPx: number
  /**
   * Growth that fills the zoom band from rest, as a fraction of the viewport's
   * shorter side.
   *
   * The shorter side is the one that constrains how far two fingers can travel
   * apart, whichever way the phone is held, so it is the honest denominator.
   * Same idea as the retired swipe's `touchCommitFraction`, which normalised a
   * thumb stroke against viewport height.
   *
   * 0.28 preserves the previous zoom rate: 0.42 * 1200 / 1800. A 393px
   * viewport takes about 110px to fill the band. Judged 2026-09-22.
   */
  commitFraction: number
  /**
   * Separation below which two contacts are not a pinch, in CSS px.
   *
   * Small, and smaller than it was. Under the old ratio signal this was load
   * bearing — a ratio is unstable near zero, so a tight grip could produce
   * nonsense — and it sat at 40px, which is close to the width of two adjacent
   * fingertips and risked refusing exactly the tight spread people actually
   * make. Growth in pixels has no such instability, so this is now only what it
   * says: a floor that rejects two contacts too close together to be two fingers.
   */
  minStartDistancePx: number
}

export const NAVIGATION_PINCH: PinchLimits = {
  releaseGrowthPx: 16,
  commitFraction: 0.28,
  minStartDistancePx: 24,
}

/** Separation growth in CSS pixels -> zoom-band travel. */
export function pinchGain(
  totalTravelPx: number,
  viewportShorterSidePx: number,
  pinch: PinchLimits = NAVIGATION_PINCH,
): number {
  const commitGrowthPx = Math.max(1, viewportShorterSidePx * pinch.commitFraction)
  return totalTravelPx / commitGrowthPx
}

export interface NavigationCooldownLimits {
  /**
   * Silence required to release a deadline latch, seconds. The measured 415 ms
   * gap between wheel events on a starved main thread must not count as a new
   * gesture. The machine's shorter quiet gap is not a substitute.
   */
  latchGapSeconds: number
  /**
   * Floor on how long input stays refused after a transition settles, seconds.
   *
   * Not the whole answer — a momentum tail has no fixed length, which is why
   * quiescence exists — but a floor is what stops a fast tail sneaking through
   * between the transition ending and the first quiet sample.
   */
  minSeconds: number
  /**
   * Ceiling on the same, seconds.
   *
   * THIS IS THE ANTI-DEADLOCK. Quiescence alone never exits for a viewer who
   * keeps scrolling — and that is the common case, not a pathological one: the
   * committing gesture ends in a fast stream and "keep scrolling to see whether
   * it worked" refills it. Free-spinning wheels sustain events indefinitely.
   */
  maxSeconds: number
  /**
   * Silence that counts as the input stream having stopped, seconds.
   *
   * Measured from `event.timeStamp`, never from wall clock or accumulated frame
   * delta: a hidden tab stops the frame loop while the clock keeps running, so a
   * wall-clock gap would report minutes of quiet and release the lock on the
   * first frame back.
   */
  quietGapSeconds: number
}

export const NAVIGATION_COOLDOWN: NavigationCooldownLimits = {
  latchGapSeconds: 0.5,
  // The warp is 1.6s and the lock covers all of it, so this is what follows the
  // arrival — long enough that the tail of the gesture that caused it has died,
  // short enough that a viewer who meant to turn straight round is not refused.
  minSeconds: 0.35,
  // A macOS flick's tail is typically under a second; this outlasts it while
  // staying well inside the patience of someone scrolling deliberately.
  maxSeconds: 1.2,
  quietGapSeconds: 0.12,
}
