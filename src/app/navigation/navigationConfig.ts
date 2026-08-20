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
   * streams and a finger on the rail deliver wildly different numbers of events
   * for the same physical gesture, so counting events makes the feature feel
   * different on every device — which is exactly what `DECISIONS.md` §15 named
   * when it called wheel and trackpad "incomparable event streams".
   *
   * 900 is roughly seven mouse notches, or a firm trackpad sweep, or most of the
   * height of a phone screen on the rail. STARTING POINT, not judged: it is the
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
   * unit. Fast enough to read as "it let go", slow enough to be a retreat rather
   * than a disappearance — the indicator is the only feedback the gesture has.
   */
  decaySeconds: number
  /**
   * Ceiling on what one event may contribute, in normalised pixels.
   *
   * Mirrors the wheel clamp so the rail cannot bypass it: a pointer that jumps
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
  decaySeconds: 0.22,
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
