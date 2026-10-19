// The drawing's per-frame policy, with no DOM in it.
//
// Moved out of introDraw.ts's frame loops so the SVG drawing and the worker's
// canvas (ADR 016 item 3) run one policy. The playhead's arithmetic stays in
// playhead.ts; this is everything around it: the quiet wait, the stalled dot's
// pulse, the timeout notice, the caption and the reduced-motion floor. The
// caller supplies visible time and renders what comes back.

import { DRAW_TIMING } from './drawConfig'
import { createPlayhead, type PlayheadLimits, type Readiness } from './playhead'

export type CaptionKey = 'loading' | 'preparing' | 'almost' | 'slow' | 'failed'

export interface DrawTick {
  visual: number
  holding: boolean
  /** Breath factor for the stalled dot, or null while it is not pulsing. */
  pulse: number | null
  /** The caption to show, or null to leave the current one alone. */
  caption: CaptionKey | null
  /** The quiet wait ended this frame with the mark shown. */
  revealed: boolean
  /** The notice threshold was crossed this frame. Diagnostics only. */
  notice: boolean
  /** The fill finished, or a quiet wait reached readiness. */
  done: boolean
  /** [elapsed, raw dt, load, visual] for the §7 CSV dump; null on frames it skips. */
  trace: [number, number, number, number] | null
}

export interface DrawLoopOptions {
  limits: PlayheadLimits
  quiet: boolean
  reducedMotion: boolean
  dotIdle: boolean
}

export function createDrawLoop(options: DrawLoopOptions) {
  let limits = options.limits
  const playhead = createPlayhead(limits)
  /** Still waiting unseen. Cleared for good the first time the mark is shown. */
  let quiet = options.quiet
  let reducedMotion = options.reducedMotion
  let stalledFor = 0
  let noticed = false

  function tick(raw: number, load: number, readiness: Readiness): DrawTick {
    // Reduced motion: no stroke-by-stroke build — but the fill invariant still
    // holds. The completed outline shows from the start and readiness brings
    // the fill, still respecting the minimum duration (plan 007 §12 case 9).
    const f = playhead.step(raw, reducedMotion ? 1 : load, readiness)
    const out: DrawTick = {
      visual: reducedMotion ? Math.max(limits.preReadyLimit, f.visual) : f.visual,
      holding: reducedMotion ? false : f.holding,
      pulse: null,
      caption: null,
      revealed: false,
      notice: false,
      done: false,
      trace: null,
    }

    // Unseen, so nothing below — the pulse, the notice, the caption — has
    // anything to say yet. The playhead keeps running underneath, which is what
    // lets a drawing that does appear start where the load really is.
    if (quiet) {
      if (readiness === 'ready') {
        out.done = true
        return out
      }
      // Out of patience, or something to say: the drawing takes over from here.
      if (readiness === 'fatal' || f.elapsed > DRAW_TIMING.quietGrace) {
        quiet = false
        out.revealed = true
      }
      if (quiet) return out
    }

    if (reducedMotion) {
      out.done = f.done
      return out
    }

    // ── Anti-dead-frame (plan 007 Phase 2) ──
    // Deliberately NOT gated on the dot's alpha: that was false at exactly the
    // state where the page looked broken. The renderer applies a floor alpha,
    // so the pulse works from the first frame, whatever the playhead is doing.
    stalledFor = f.stalled ? stalledFor + Math.min(raw, DRAW_TIMING.maxDt) : 0
    if (options.dotIdle && stalledFor > DRAW_TIMING.stallAfter) {
      out.pulse = 0.72 + 0.28 * Math.cos(f.elapsed * 4.2)
    }

    // ── Timeout: diagnostics ONLY (plan 007 Phase 4) ──
    // It does not complete the drawing, does not set readiness, and does not
    // release the sequence into an unready scene. The intro keeps waiting.
    if (!noticed && f.elapsed > DRAW_TIMING.timeoutNotice && readiness !== 'ready') {
      noticed = true
      out.notice = true
    }

    // ── Caption ──
    // Derived from the same real state the drawing is, never from a timer: the
    // whole point of the progress playhead is that what the viewer sees is what
    // is actually happening (ARCHITECTURE 20). "Casi listo" therefore means the
    // drawing is genuinely holding at the pre-ready limit waiting on required
    // assets, not that some clock elapsed.
    // Driven by MEASURED load and readiness — never by the drawing's own
    // playhead.
    //
    // Those are different numbers and conflating them is the bug this whole
    // module was rebuilt to avoid (plan 007). With no measured progress the
    // autonomous curve still carries the outline up to the pre-ready limit and
    // holds it there, so the drawing can look nearly finished while nothing has
    // actually downloaded. A caption reading the playhead would announce
    // "Casi listo" over an empty cache — reassuring, and false.
    //
    // So "Casi listo" is spent only on genuine readiness, and the middle state
    // on real bytes.
    out.caption =
      readiness === 'fatal'
        ? 'failed'
        : noticed
          ? 'slow'
          : readiness === 'ready'
            ? 'almost'
            : load >= 0.5
              ? 'preparing'
              : 'loading'

    out.trace = [f.elapsed, raw, load, out.visual]
    out.done = f.done
    return out
  }

  return {
    tick,
    /**
     * A replay is asked for by someone who wants to SEE it: quiet ends, and the
     * build plays stroke by stroke whatever the motion preference, as it always
     * has.
     */
    reset() {
      playhead.reset()
      quiet = false
      reducedMotion = false
      stalledFor = 0
      noticed = false
    },
    /** Anyone showing the mark by hand has ended the quiet wait's claim on it. */
    unquiet() {
      quiet = false
    },
    /**
     * Updated in place, never rebuilt: a rebuild would reset `elapsed` and
     * restart the minimum duration on every edit.
     */
    setLimits(next: PlayheadLimits) {
      limits = next
      playhead.setLimits(next)
    },
  }
}

/** The playhead's limits for a given pre-ready boundary. */
export function playheadLimits(preReadyLimit: number): PlayheadLimits {
  return {
    minimumDuration: DRAW_TIMING.minimumDuration,
    preReadyLimit,
    reserve: DRAW_TIMING.reserve,
    driftDuration: DRAW_TIMING.driftDuration,
    catchUp: DRAW_TIMING.catchUp,
    smoothRate: DRAW_TIMING.smoothRate,
    maxDt: DRAW_TIMING.maxDt,
    stallEpsilon: DRAW_TIMING.stallEpsilon,
  }
}
