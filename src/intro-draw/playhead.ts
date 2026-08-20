// The loading intro's policy, with no DOM in it.
//
// Split out of introDraw.ts deliberately: the previous version buried this
// arithmetic inside the render loop, so the only way to test it was to run the
// animation — and the one input that actually occurs in production
// (loadProgress stuck at 0) was never tried. This module is pure and
// deterministic; playhead.test.ts drives it through plan 007 §12.
//
// ── The three values (plan 007 Phase 1) ──
//
//   visualProgress   how far the drawing has advanced        (this module's output)
//   loadProgress     how much of the work has measurably     (input, 0..1)
//                    completed
//   readiness        whether the app can actually be shown   (input, a state)
//
// Collapsing these into one number was the original bug: the drawing could not
// advance until progress existed, and progress could not exist until the code
// that reports it had loaded. Readiness is NEVER derived from visual progress.
//
// ── The pace, and the two things that used to set it wrongly ──
//
// The contract is three seconds: a warm cache still gets the whole animation,
// and a load that outlasts it paces the drawing instead. Both halves were being
// broken by implementation detail rather than by design.
//
//   1. `elapsed` accumulated min(dt, maxDt), so the three seconds were spent in
//      frames rather than in seconds and any device below 20fps stretched the
//      drawing in proportion — measured at 8.57s on a real build running 7fps.
//      It is now real time, and one frame's ADVANCE is what gets rationed.
//   2. The no-signal floor was an exponential approach, which front-loads its
//      movement and then decays to nothing. It is now a uniform ramp with a
//      slow constant tail.
//
// Both are covered by named cases in playhead.test.ts, which now varies the
// frame interval — the previous suite stepped everything at a healthy 60fps and
// so could not reach either failure.

export type Readiness = 'starting' | 'loading' | 'ready' | 'fatal'

export interface PlayheadLimits {
  /**
   * The drawing never completes faster than this, however fast loading is —
   * and never slower either, which is the part that was broken. Seconds of
   * VISIBLE time; the caller is responsible for not counting time the tab spent
   * hidden. See drawConfig.ts for what this used to cost.
   */
  minimumDuration: number
  /**
   * The playhead may not pass this without readiness. Derive it from a stage
   * boundary — see introDraw.ts — never hardcode it: at a hand-picked 0.82 it
   * lands 4% into the collapse and freezes the isometric scaffolding mid-fade.
   */
  preReadyLimit: number
  /**
   * Share of the outline withheld from the uniform ramp and spent slowly
   * afterwards, so a load that outlasts `minimumDuration` still has visible
   * movement left. This is what makes the drawing advance with NO progress
   * signal at all without ever appearing to stop.
   */
  reserve: number
  /** Seconds the reserve is spread over, at a constant rate. */
  driftDuration: number
  /** Ceiling on one frame's advance, as a multiple of the nominal rate. */
  catchUp: number
  /** Exponential smoothing on the measured signal, which arrives in steps. */
  smoothRate: number
  /** Frame-drop guard for the smoothing filter only. Never for `elapsed`. */
  maxDt: number
  /** Playhead movement below this counts as stalled, for the dot's pulse. */
  stallEpsilon: number
}

export interface PlayheadFrame {
  visual: number
  elapsed: number
  /** The playhead did not move this frame — the dot should show it is alive. */
  stalled: boolean
  /** Visual progress reached 1. Only reachable through readiness. */
  done: boolean
  /** True while held at preReadyLimit waiting on readiness. Diagnostics. */
  holding: boolean
}

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// How close to the pre-ready limit counts as "holding", for diagnostics.
// Roughly one percent of the full playhead.
const HOLD_TOLERANCE = 0.01

export function createPlayhead(initialLimits: PlayheadLimits) {
  let limits = initialLimits
  let elapsed = 0
  let smoothed = 0
  let visual = 0
  let done = false
  // Rolling estimate of the frame interval, in seconds. 0 until the first
  // frame has been seen.
  let cadence = 0
  // Where the playhead stood when readiness first arrived, and how long it has
  // been running the ending since. -1 means readiness has not arrived, which is
  // distinguishable from a legitimate 0 — the gesture can begin at the very
  // start of the drawing on a cache warm enough to be ready on frame one.
  let gestureFrom = -1
  let gestureElapsed = 0

  // Forced by the minimum duration: to land on exactly 3.0s from a standing
  // start, the playhead must be allowed 1/3 per second. That in turn sets how
  // fast the readiness gesture (collapse + fill) can play on a warm cache —
  // about 0.55s. Slower would overshoot the 3s contract.
  const completionRate = () => 1 / limits.minimumDuration

  function step(rawDt: number, loadProgress: number, readiness: Readiness): PlayheadFrame {
    const dt = Math.max(rawDt, 0)
    if (done) return { visual, elapsed, stalled: false, done: true, holding: false }

    // REAL time, unclamped. The clamp that used to live here is the bug: it
    // could only ever lengthen the drawing, so a device that dropped frames
    // paid for every one of them in seconds of extra intro.
    elapsed += dt
    const filterDt = Math.min(dt, limits.maxDt)
    smoothed += (clamp01(loadProgress) - smoothed) * (1 - Math.exp(-limits.smoothRate * filterDt))

    // How far the playhead may move THIS frame. Read from the cadence as it
    // stood BEFORE this frame, which is the whole subtlety: measuring it after
    // would let a stall widen the very limit meant to contain it, and a 900ms
    // block would jump the drawing 0.30 in one step.
    //
    // Adaptive rather than a constant, because a steady 7fps is not a stall —
    // it is simply a slow device, and it must still finish in three seconds.
    // Only an interval far outside the recent cadence is treated as a gap.
    const previousCadence = cadence === 0 ? dt : cadence
    const advanceDt = Math.min(dt, previousCadence * limits.catchUp)
    const budget = completionRate() * limits.catchUp * advanceDt
    // Tracks the CLAMPED interval, so a stall cannot drag the estimate up after
    // itself either. `smoothRate` is borrowed here rather than given a constant
    // of its own: both are "how fast a per-frame estimate should chase reality",
    // and a second knob would be two numbers nobody could tell apart.
    cadence =
      cadence === 0
        ? dt
        : cadence + (advanceDt - cadence) * Math.min(limits.smoothRate * filterDt, 1)

    // The 3s minimum is a CAP on pace. It is not, and must never become, a
    // gate on movement — that conflation is what produced the blank screen.
    const minimumDurationProgress = clamp01(elapsed / limits.minimumDuration)
    const before = visual
    let holding = false

    if (readiness === 'fatal') {
      // Hold exactly where we are. No completion, no pulse of false progress.
      return { visual, elapsed, stalled: true, done: false, holding: false }
    }

    if (readiness === 'ready') {
      // Zone C. Bounded ramp, never a jump: readiness arriving at 2.9s would
      // otherwise snap the playhead from ~0.56 to ~0.97 in a single frame.
      //
      // Paced from the moment readiness ARRIVED, not from page load. The
      // minimum-duration ramp alone is not enough: it saturates at 1 as soon as
      // the wait outlasts `minimumDuration`, and then it caps nothing. Observed
      // on a real build — readiness at 4538ms, complete at 4540ms, the collapse
      // and the fill both gone inside one frame. Those two beats are what say
      // "ready"; spending a long wait and then cutting them is the one outcome
      // worse than the wait.
      //
      // The remaining distance is covered at the same nominal rate the rest of
      // the drawing uses, so on a warm cache the ending is simply the last
      // stretch of the same three seconds, and after a long wait it is its own
      // ~0.55s gesture.
      if (gestureFrom < 0) {
        gestureFrom = visual
        gestureElapsed = 0
      }
      gestureElapsed += dt
      const gesture = gestureFrom + gestureElapsed / limits.minimumDuration
      const cap = Math.min(minimumDurationProgress < 1 ? minimumDurationProgress : 1, gesture)
      visual = Math.max(visual, Math.min(cap, visual + budget))
      if (visual >= 1 - 1e-6) {
        visual = 1
        done = true
      }
    } else {
      // Zones A and B. `autonomous` is the floor that guarantees movement with
      // no signal; `smoothed` pulls ahead of it when real progress exists;
      // `preReadyLimit` is the hard ceiling that reserves the ending for
      // readiness.
      //
      // The floor is a straight line, not a curve. It covers all but `reserve`
      // of the band in `minimumDuration` at ONE uniform rate, and then spends
      // the reserve at a slow constant rate over `driftDuration`. Both halves
      // terminate; neither decays. See drawConfig.ts for the exponential this
      // replaced and what it looked like on screen.
      const ramp = Math.min(elapsed / limits.minimumDuration, 1) * (1 - limits.reserve)
      const drift =
        elapsed > limits.minimumDuration
          ? Math.min((elapsed - limits.minimumDuration) / limits.driftDuration, 1) * limits.reserve
          : 0
      const autonomous = Math.min(ramp + drift, 1)
      const hybrid = Math.min(Math.max(autonomous, smoothed), 1)
      const target = Math.min(hybrid * limits.preReadyLimit, minimumDurationProgress)
      // Rationed like Zone C's, and for the same reason: measured progress
      // arrives in steps, and a resource completing can move `smoothed` far
      // enough in one frame to be seen as a jump rather than a draw.
      visual = Math.max(visual, Math.min(target, visual + budget))
      // Tolerance, not equality: the drift arrives on a frame boundary, so an
      // exact test would flicker at the moment the outline visibly completes.
      holding = visual >= limits.preReadyLimit - HOLD_TOLERANCE
    }

    return {
      visual,
      elapsed,
      stalled: visual - before < limits.stallEpsilon,
      done,
      holding,
    }
  }

  function reset() {
    elapsed = 0
    smoothed = 0
    visual = 0
    done = false
    cadence = 0
    gestureFrom = -1
    gestureElapsed = 0
  }

  return {
    step,
    reset,
    /**
     * Retune the zone boundaries without disturbing the run. The debug panel
     * edits stage weights live, which moves preReadyLimit — rebuilding the
     * playhead there would reset `elapsed` and restart the minimum duration
     * on every slider move.
     */
    setLimits(next: PlayheadLimits) {
      limits = next
    },
    /** Diagnostics only. */
    state: () => ({ elapsed, smoothed, visual, done }),
  }
}
