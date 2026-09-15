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
   * Earth zooming IN, Murcia zooming OUT. Together with
   * `NavigationGestureLimits.commitDistancePx` this is the whole journey from a
   * resting world to a commit, and the split between the two is the thing to
   * move if the gesture feels wrong: more here makes the zoom itself longer,
   * more there makes the final push against the limit longer.
   *
   * 600 is two thirds of the 900 that used to be the entire gesture, chosen so
   * the TOTAL is unchanged at 900 — roughly seven mouse notches, a firm trackpad
   * sweep, or most of the height of a phone screen. Keeping the total fixed is
   * what lets every number tuned against it (the pinch's `commitFraction`, the
   * e2e wheel distances) stay true across the change. STARTING POINT, not
   * judged: nobody has driven a build with a persistent zoom yet.
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
   * Mirrors the accumulator's clamp of the same name, for the same reason and
   * against the same wheel normalisation.
   */
  maxEventTravelPx: number
}

export const NAVIGATION_ZOOM: ZoomBandLimits = {
  // 1200 each way, doubled from 600 with the ascent (camera-navigation, sandbox
  // commit eb1ba9f). The whole journey is 1200 + 600 = 1800px, about 15 wheel
  // notches, and the 2:1 ratio between the band and the commit is what the
  // doubling preserves — the band has to be long enough that the vacuum has
  // somewhere to build before the commit is even reachable.
  towardTravelPx: 1200,
  awayTravelPx: 1200,
  maxEventTravelPx: MAX_WHEEL_DELTA_PX,
}

export interface NavigationGestureLimits {
  /**
   * Travel required to commit ONCE THE ZOOM IS AT ITS LIMIT, in CSS pixels.
   *
   * A PHYSICAL distance, never an event count. Mouse notches, precision-trackpad
   * streams and two fingers on the glass deliver wildly different numbers of events
   * for the same physical gesture, so counting events makes the feature feel
   * different on every device — which is exactly what `DECISIONS.md` §15 named
   * when it called wheel and trackpad "incomparable event streams".
   *
   * This was the whole gesture at 900 until `adr/014`. It is now only the last
   * stage of it: the zoom band absorbs the first 600 and this is what the viewer
   * spends pushing against a camera that has stopped moving. Making it the
   * smaller share is deliberate — the deliberateness `adr/009` needed is already
   * paid by crossing the band, and this stage has nothing to show for itself,
   * so a long one would read as the site having stopped responding.
   *
   * 300 is a firm extra shove: two and a half mouse notches past the wall, or a
   * third of the pinch. STARTING POINT, not judged.
   */
  commitDistancePx: number
  /**
   * Silence after which accumulated travel starts to decay, in seconds.
   *
   * MEASURED, and it is the one number here that is not a matter of taste. It has
   * to be longer than the worst gap that can occur INSIDE one continuous gesture,
   * or a gesture fights its own decay and can never be completed.
   *
   * A healthy machine delivers wheel events every 10-30ms, which suggested a value
   * around 0.18. That is wrong, and driving the real build is what showed it: on a
   * software-rendered build the 3D scene saturates the main thread and starves the
   * input and timer queues, and wheel events measured **415ms apart** while the
   * renderer still reported 33fps. At 0.18 the accumulator reached an equilibrium
   * around 0.6 and simply stopped: every event added travel and the decay between
   * events took it straight back.
   *
   * That is not an artifact of a test rig. `audits/mobile-responsiveness` records a
   * real build running at 7fps, and the whole point of the gesture is that it works
   * on the phone in someone's hand. 0.5 clears the measured 415ms with room, and
   * costs only that a released gesture waits half a second before retreating.
   *
   * Note which way the failure goes on a slow device: the gesture becomes easier to
   * COMPLETE, never easier to trigger by accident. The full commit distance still
   * has to be travelled deliberately.
   */
  idleGapSeconds: number
  /**
   * Time constant of that decay, in seconds. ~63% of the remaining travel per
   * unit.
   *
   * Was 0.22 while the only thing that decayed was a progress bar, where a slow
   * retreat read as the indicator letting go. It went to 0.08 when it drove a
   * CAMERA, because a camera drifting home for a second and a half reads as the
   * site being slow — reported as "way too long a pause, it feels laggy" on
   * 2026-08-25.
   *
   * It drives no camera again since `adr/014`: what retreats is the push against
   * a zoom that is already at its limit and stays there, so nothing visibly
   * moves while this runs. The value is kept anyway, because what it now decides
   * is how long a viewer who thought better of it stays primed to navigate on
   * the next nudge — and a quarter of a second is the right answer to that too.
   */
  decaySeconds: number
  /**
   * Where the decay gives up and snaps to zero, as a fraction of
   * `commitDistancePx`.
   *
   * Relative, and that is the point. This was an absolute 1px, which over the
   * 900px commit distance of the day was 6.8 time constants — so the floor, not
   * the time constant, was most of the 1.05s a single wheel notch took to clear.
   * An absolute floor also means the same constant behaves differently at every
   * commit distance, which makes `commitDistancePx` unsafe to tune — and
   * `adr/014` tuned it, from 900 to 300, on exactly that promise.
   */
  snapFraction: number
  /**
   * Ceiling on what one event may contribute, in normalised pixels.
   *
   * Mirrors the wheel clamp so no other input can bypass it: a pointer that jumps
   * 800px in one move (a dropped frame, a pen, a synthetic event) must not be
   * worth more than a flick.
   */
  maxEventTravelPx: number
  /**
   * Ceiling on one FRAME's advance, as a multiple of the nominal per-frame rate.
   *
   * Borrowed in shape from `intro-draw/playhead.ts`, which learned it the hard
   * way: a long main-thread block delivers every queued event at once, and
   * without a per-frame ration that arrives as one enormous step. The playhead's
   * failure was a drawing that jumped; here it would be a navigation nobody
   * asked for.
   */
  catchUp: number
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
 * and already signed, which is all `navigationGesture` ever needed.
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
   * What is left is a noise floor on one DISCRETE, IRREVERSIBLE action: closing
   * a focused display. Feeding the zoom band needs no floor, because a pixel of
   * growth moves the band by a pixel and the viewer can take it straight back;
   * dismissing what someone is reading cannot be taken back, so two settling
   * fingertips must not do it. Above the few px of drift both worlds already
   * treat as a tap's worth of wander, and far below a commit.
   */
  releaseGrowthPx: number
  /**
   * Growth that equals a full commit, as a fraction of the viewport's SHORTER
   * side.
   *
   * The shorter side is the one that constrains how far two fingers can travel
   * apart, whichever way the phone is held, so it is the honest denominator.
   * Same idea as the retired swipe's `touchCommitFraction`, which normalised a
   * thumb stroke against viewport height.
   *
   * 0.42 of a 393px-wide phone is 165px of growth — from a close grip, an
   * unmistakably deliberate opening of the hand. THE number to move if the
   * device says the gesture is still too easy (raise it) or now too demanding
   * (lower it); nothing else in this block should need touching for that.
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
  commitFraction: 0.42,
  minStartDistancePx: 24,
}

/**
 * The whole journey from a resting world to a commit, in CSS pixels.
 *
 * DERIVED, never written down. Since `adr/014` that journey is two stages in
 * series — across the zoom band, then against its limit — and every input that
 * has to be scaled against "how much is a full gesture" means this sum rather
 * than either half of it.
 */
export function commitTravelPx(
  zoom: ZoomBandLimits = NAVIGATION_ZOOM,
  gesture: NavigationGestureLimits = NAVIGATION_GESTURE,
): number {
  return zoom.towardTravelPx + gesture.commitDistancePx
}

/**
 * Separation growth in CSS pixels -> travel, in the units both stages use.
 *
 * Takes the TOTAL rather than either stage's own limit, and that is the whole
 * care in it: a pinch is scaled so that `commitFraction` of the viewport is one
 * complete navigation, and after `adr/014` a complete navigation is the band
 * plus the push against it. Scaling against the accumulator alone would make a
 * full-viewport pinch deliver a third of the journey.
 *
 * Sampled per gesture rather than once at startup, so an orientation change is
 * picked up at the next pinch instead of mid-gesture.
 */
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

export const NAVIGATION_GESTURE: NavigationGestureLimits = {
  commitDistancePx: 600,
  idleGapSeconds: 0.5,
  decaySeconds: 0.08,
  snapFraction: 0.01,
  maxEventTravelPx: MAX_WHEEL_DELTA_PX,
  catchUp: 3,
}

export interface NavigationSpringLimits {
  /**
   * Natural frequency of the indicator's spring, radians per second.
   *
   * The painted progress chases the accumulator through a damped spring (see
   * progressSpring.ts) instead of being written raw; this is how fast it
   * chases. 16 puts the response around a tenth of a second — behind the
   * finger enough to read as weight, never enough to read as lag. JUDGED
   * 2026-08-19, from screenshots and a driven build, not yet by feel on real
   * hardware.
   */
  omegaRadPerSec: number
  /**
   * Damping ratio. Below 1 the indicator overshoots what the finger did and
   * settles back — the elasticity the product asked for. 0.7 is a ~5%
   * overshoot: visible in motion, invisible in a screenshot. JUDGED
   * 2026-08-19, same caveat.
   */
  damping: number
  /**
   * Damping under prefers-reduced-motion: critically damped, so the same
   * spring produces no overshoot and no oscillation at all. The elasticity is
   * decoration; the setting says decoration in motion is unwelcome.
   */
  reducedMotionDamping: number
}

export const NAVIGATION_SPRING: NavigationSpringLimits = {
  omegaRadPerSec: 16,
  damping: 0.7,
  reducedMotionDamping: 1,
}

export const NAVIGATION_COOLDOWN: NavigationCooldownLimits = {
  // The warp is 1.6s and the lock covers all of it, so this is what follows the
  // arrival — long enough that the tail of the gesture that caused it has died,
  // short enough that a viewer who meant to turn straight round is not refused.
  minSeconds: 0.35,
  // A macOS flick's tail is typically under a second; this outlasts it while
  // staying well inside the patience of someone scrolling deliberately.
  maxSeconds: 1.2,
  quietGapSeconds: 0.12,
}
