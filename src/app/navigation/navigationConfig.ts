import { MAX_WHEEL_DELTA_PX } from '../../utils/wheelDelta'

// Every tuning constant for Earth <-> Murcia gesture navigation, in one place.
//
// House rule, and it is the reason this file exists rather than the numbers
// living beside their use: a number here is either MEASURED (cite the harness
// that measures it) or JUDGED (cite the date and the person). None of these has
// been driven by a person yet — they are stated starting points with their
// reasoning, and the ones that need a human to sit in front of the build are
// marked. Do not treat an unjudged default as a settled value.

export interface NavigationGestureLimits {
  /**
   * Travel required to commit, in CSS pixels.
   *
   * A PHYSICAL distance, never an event count. Mouse notches, precision-trackpad
   * streams and two fingers on the glass deliver wildly different numbers of events
   * for the same physical gesture, so counting events makes the feature feel
   * different on every device — which is exactly what `DECISIONS.md` §15 named
   * when it called wheel and trackpad "incomparable event streams".
   *
   * 900 is roughly seven mouse notches, or a firm trackpad sweep, or most of the
   * height of a phone screen. STARTING POINT, not judged: it is the
   * number most likely to be wrong until someone drives the build, and it is the
   * one that decides whether navigation feels deliberate or laborious.
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
   * retreat read as the indicator letting go. It drives a CAMERA now, and a
   * camera drifting home for a second and a half reads as the site being slow —
   * reported as "way too long a pause, it feels laggy" on 2026-08-25.
   *
   * 0.08 puts the accumulator's own return under a quarter second, which hands
   * the FEEL of the retreat to `progressSpring` (~0.36s to settle) instead. That
   * is the right owner: the spring is what makes a release read as elastic
   * rather than as a snap, and it was already in the path.
   */
  decaySeconds: number
  /**
   * Where the decay gives up and snaps to zero, as a fraction of
   * `commitDistancePx`.
   *
   * Relative, and that is the point. This was an absolute 1px, which over a
   * 900px commit distance is 6.8 time constants — so the floor, not the time
   * constant, was most of the 1.05s a single wheel notch took to clear. An
   * absolute floor also means the same constant behaves differently at every
   * commit distance, which makes `commitDistancePx` unsafe to tune.
   *
   * 1% is below what the scrub can draw: at 9px of 900 the dolly amount is
   * 0.007, which moves Earth's camera by half a percent of its radius.
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
   * Growth in separation that claims the gesture, in CSS pixels.
   *
   * Absolute, so it means the same thing at every grip. Above the few pixels two
   * settling fingers drift — both worlds treat 12px as a tap's worth of wander —
   * and well below the commit, so the world answers early rather than only after
   * the viewer has already committed to the gesture.
   */
  claimGrowthPx: number
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
  /**
   * Movement of a RIVAL two-finger gesture that hands this one back, in CSS px.
   *
   * Earth has no rival — a second contact there does nothing at all — so this is
   * measured only where one exists. In Murcia two fingers already mean centroid
   * rotation, and the two signals are algebraically orthogonal (`|a - b|` against
   * `(a + b) / 2`) but a real hand produces both: thumbs are not symmetric, so
   * every pinch drifts the centroid a little and every turn changes the
   * separation a little.
   *
   * 8 is not an independent judgement. It is Murcia's own
   * `rotation.twoPointerThresholdPx`, deliberately: that is the travel at which
   * the city starts to turn, so declining at exactly that point means whichever
   * gesture proves itself first wins, and the loser has not moved anything yet.
   * A larger value here would let the city turn before this had made up its
   * mind; a smaller one would hand back gestures that were never rivals.
   *
   * The coupling is real and undeclared in code — the two constants live in
   * different config files because `app/` may not read `experiences/`. If one
   * moves, move the other.
   */
  declineRivalPx: number
}

export const NAVIGATION_PINCH: PinchLimits = {
  claimGrowthPx: 16,
  commitFraction: 0.42,
  minStartDistancePx: 24,
  declineRivalPx: 8,
}

/**
 * Separation growth in CSS pixels -> the accumulator's travel.
 *
 * DERIVED, never written down: `commitDistancePx` has exactly one home and a
 * second copy here would drift from it. Sampled per gesture rather than once at
 * startup, so an orientation change is picked up at the next pinch instead of
 * mid-gesture.
 */
export function pinchGain(
  gesture: NavigationGestureLimits,
  viewportShorterSidePx: number,
  pinch: PinchLimits = NAVIGATION_PINCH,
): number {
  const commitGrowthPx = Math.max(1, viewportShorterSidePx * pinch.commitFraction)
  return gesture.commitDistancePx / commitGrowthPx
}

/**
 * Silence after which the gesture hint offers itself, in milliseconds.
 *
 * Measured from the last NAVIGATION input, not from the last input of any kind:
 * a viewer turning the city has not demonstrated anything about travelling
 * between worlds, and must still be taught. JUDGED — long enough that anyone
 * getting on with it is never interrupted, short enough that someone who has
 * run out of ideas is not left there.
 */
export const HINT_DELAY_MS = 5000

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
  commitDistancePx: 900,
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
