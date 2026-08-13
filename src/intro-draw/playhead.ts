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

export type Readiness = 'starting' | 'loading' | 'ready' | 'fatal'

export interface PlayheadLimits {
  /** The drawing never completes faster than this, however fast loading is. */
  minimumDuration: number
  /**
   * The playhead may not pass this without readiness. Derive it from a stage
   * boundary — see introDraw.ts — never hardcode it: at a hand-picked 0.82 it
   * lands 4% into the collapse and freezes the isometric scaffolding mid-fade.
   */
  preReadyLimit: number
  /**
   * Time constant of the autonomous curve. This is what makes the drawing
   * advance with NO progress signal at all, which is the entire fix.
   */
  autonomousTau: number
  /** Exponential smoothing on the measured signal, which arrives in steps. */
  smoothRate: number
  /** Frame-drop guard: an unclamped dt turns a stall into a visible jump. */
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

  // Forced by the minimum duration: to land on exactly 3.0s from a standing
  // start, the playhead must be allowed 1/3 per second. That in turn sets how
  // fast the readiness gesture (collapse + fill) can play on a warm cache —
  // about 0.55s. Slower would overshoot the 3s contract.
  const completionRate = () => 1 / limits.minimumDuration

  function step(rawDt: number, loadProgress: number, readiness: Readiness): PlayheadFrame {
    const dt = Math.min(Math.max(rawDt, 0), limits.maxDt)
    if (done) return { visual, elapsed, stalled: false, done: true, holding: false }

    // Accumulates the CLAMPED dt: a long stall must not silently eat into the
    // minimum duration.
    elapsed += dt
    smoothed += (clamp01(loadProgress) - smoothed) * (1 - Math.exp(-limits.smoothRate * dt))

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
      const cap = minimumDurationProgress < 1 ? minimumDurationProgress : 1
      visual = Math.max(visual, Math.min(cap, visual + completionRate() * dt))
      if (visual >= 1 - 1e-6) {
        visual = 1
        done = true
      }
    } else {
      // Zones A and B. `autonomous` is the floor that guarantees movement with
      // no signal; `smoothed` pulls ahead of it when real progress exists;
      // `preReadyLimit` is the hard ceiling that reserves the ending for
      // readiness.
      const autonomous = 1 - Math.exp(-elapsed / limits.autonomousTau)
      const hybrid = Math.min(Math.max(autonomous, smoothed), 1)
      const target = Math.min(hybrid * limits.preReadyLimit, minimumDurationProgress)
      visual = Math.max(visual, target)
      // Tolerance, not equality: the autonomous curve approaches the limit
      // asymptotically and never actually arrives, so an exact test would
      // report "not holding" forever while the outline sits visibly complete.
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
