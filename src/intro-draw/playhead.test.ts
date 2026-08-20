import { describe, it, expect } from 'vitest'
import { createPlayhead, type PlayheadLimits, type Readiness } from './playhead'
import { layoutStages } from './stageLayout'
import { DEFAULT_DRAW_CONFIG, DRAW_TIMING } from './drawConfig'

// Ported from scripts/simulate-intro.mjs, which existed only because there was
// no test runner: it read playhead.ts off disk, ran it through esbuild.transform
// and imported the result through a base64 data URL. With Vitest that is a plain
// import of the real module — still the real module, never a copy of the maths.
//
// All eight cases are preserved, and Case 1 is first for the reason the script
// gave: the previous round of verification fed the playhead five synthetic
// curves that ALL rose from the first frame, and so never tried the one input
// that actually occurs in production — loadProgress pinned at 0 while the app
// chunk downloads.

// The REAL boundaries and the REAL limits, not a copy of either.
//
// This file used to mirror both: eight stage weights, the fill duration, the
// depth overlap and all six governance limits, hardcoded, with a comment saying
// the real numbers needed a DOM because they came from `createIntroDraw`. They
// never did — every one of them is pure arithmetic over `drawConfig.ts`, and it
// has now been lifted into `stageLayout.ts` so both this file and the animation
// read the same function.
//
// The mirror was not merely redundant. `depth: 0.82` silently encoded
// `DEPTH_VERTICES.length === 9`; adding a tenth depth edge would have moved the
// real layout and left this test passing against the old one. That is the exact
// failure the testing plan forbids — a guard that tests a reimplementation
// guards nothing.
const {
  zoneAEnd: ZONE_A_END,
  preReadyLimit: PRE_READY_LIMIT,
  ceiling,
} = layoutStages(DEFAULT_DRAW_CONFIG)

const LIMITS: PlayheadLimits = {
  minimumDuration: DRAW_TIMING.minimumDuration,
  preReadyLimit: PRE_READY_LIMIT,
  reserve: DRAW_TIMING.reserve,
  driftDuration: DRAW_TIMING.driftDuration,
  catchUp: DRAW_TIMING.catchUp,
  smoothRate: DRAW_TIMING.smoothRate,
  maxDt: DRAW_TIMING.maxDt,
  stallEpsilon: DRAW_TIMING.stallEpsilon,
}

const DT = 1 / 60

interface RunOptions {
  load?: (t: number) => number
  ready?: (t: number) => boolean
  duration?: number
  stalls?: Array<{ at: number; dur: number }>
  /** Steady frame interval. The default is a healthy 60fps. */
  dt?: number
  /**
   * Windows during which the tab is backgrounded. The playhead is stepped with
   * a zero delta across these, which is what introDraw does — the minimum
   * duration is measured in VISIBLE time, not in wall clock.
   */
  hidden?: Array<{ at: number; dur: number }>
}

function run({
  load = () => 0,
  ready = () => false,
  duration = 20,
  stalls = [],
  dt: frame = DT,
  hidden = [],
}: RunOptions) {
  const p = createPlayhead(LIMITS)
  let t = 0
  let firstVisibleAt: number | null = null
  let zoneADoneAt: number | null = null
  let maxDelta = 0
  let reversals = 0
  let prev = 0
  let doneAt: number | null = null
  let last: ReturnType<typeof p.step> | null = null

  while (t < duration) {
    const stall = stalls.find((s) => t >= s.at && t < s.at + s.dur)
    const dt = stall ? stall.dur : frame
    const offscreen = hidden.some((h) => t >= h.at && t < h.at + h.dur)
    const readiness: Readiness = ready(t) ? 'ready' : load(t) > 0 ? 'loading' : 'starting'
    const f = p.step(offscreen ? 0 : dt, load(t), readiness)
    last = f
    // Timestamps are recorded at the END of the frame that produced them — `t`
    // is the frame's start, so reporting it would understate every duration by
    // one frame and make a 3.00s completion look like 2.98s.
    const at = t + dt
    if (firstVisibleAt === null && f.visual > 0.005) firstVisibleAt = at
    if (zoneADoneAt === null && f.visual >= ZONE_A_END) zoneADoneAt = at
    if (f.visual < prev - 1e-9) reversals += 1
    maxDelta = Math.max(maxDelta, f.visual - prev)
    prev = f.visual
    if (f.done && doneAt === null) doneAt = at
    t += dt
  }
  return { firstVisibleAt, zoneADoneAt, maxDelta, reversals, doneAt, final: last! }
}

describe('Case 1 — no progress signal (loadProgress 0, never ready, 15s)', () => {
  // THE regression test. The drawing must still play, must stop at the
  // pre-ready ceiling, and must never claim to have finished.
  const r = run({ duration: 15 })

  it('becomes visible within hundreds of milliseconds', () => {
    expect(r.firstVisibleAt).not.toBeNull()
    expect(r.firstVisibleAt!).toBeLessThan(0.4)
  })

  it('executes the opening movement', () => {
    expect(r.zoneADoneAt).not.toBeNull()
    expect(r.zoneADoneAt!).toBeLessThan(1.5)
  })

  it('advances only to the pre-ready ceiling', () => {
    expect(r.final.visual).toBeLessThanOrEqual(PRE_READY_LIMIT + 1e-6)
  })

  it('never activates the fill', () => {
    expect(r.final.visual).toBeLessThan(ceiling)
  })

  it('never runs the exit transition', () => {
    expect(r.doneAt).toBeNull()
  })

  it('reports that it is holding', () => {
    expect(r.final.holding).toBe(true)
  })
})

describe('Case 2 — readiness at 500ms', () => {
  const r = run({ load: () => 1, ready: (t) => t >= 0.5 })

  it('respects the 3s minimum', () => {
    expect(r.doneAt).not.toBeNull()
    expect(r.doneAt!).toBeGreaterThanOrEqual(3.0 - 1e-6)
  })

  it('does not overshoot the minimum', () => {
    expect(r.doneAt!).toBeLessThan(3.2)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
  })
})

describe('Case 3 — readiness at 6s, progress ramping to 1', () => {
  const r = run({ load: (t) => Math.min(t / 6, 1), ready: (t) => t >= 6 })

  it('is visible immediately', () => {
    expect(r.firstVisibleAt!).toBeLessThan(0.4)
  })

  it('stays below the ready-only region until readiness', () => {
    expect(r.doneAt!).toBeGreaterThan(6)
  })

  it('completes smoothly after readiness', () => {
    expect(r.doneAt).not.toBeNull()
    expect(r.doneAt!).toBeLessThan(8)
  })

  it('does not jump at the handover', () => {
    expect(r.maxDelta).toBeLessThan(0.02)
  })
})

describe('Case 4 — optional reporter missing (progress caps at 0.85)', () => {
  const r = run({ load: () => 0.85, ready: (t) => t >= 2 })

  it('does not deadlock on the optional gap', () => {
    expect(r.doneAt).not.toBeNull()
  })

  it('still respects the 3s minimum', () => {
    expect(r.doneAt!).toBeGreaterThanOrEqual(3.0 - 1e-6)
  })
})

describe('Case 5 — scene chunk delayed to 14s', () => {
  const r = run({ load: (t) => (t < 14 ? 0.2 : 1), ready: (t) => t >= 14, duration: 20 })

  it('does not complete before readiness', () => {
    expect(r.doneAt!).toBeGreaterThan(14)
  })

  it('never completes on a timer', () => {
    expect(r.doneAt).not.toBeNull()
    expect(r.doneAt!).toBeLessThan(16)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
  })
})

describe('Case 6 — required asset fails at 2s (fatal)', () => {
  const p = createPlayhead(LIMITS)
  let t = 0
  let f: ReturnType<typeof p.step> | null = null
  while (t < 12) {
    f = p.step(DT, 0.3, t < 2 ? 'loading' : 'fatal')
    t += DT
  }

  it('never completes', () => {
    expect(f!.done).toBe(false)
  })

  it('holds below the fill', () => {
    expect(f!.visual).toBeLessThan(ceiling)
  })
})

describe('Case 7 — warm cache (ready almost immediately)', () => {
  const r = run({ load: () => 1, ready: (t) => t >= 0.05 })

  it('lands on exactly the 3s minimum', () => {
    expect(r.doneAt!).toBeGreaterThanOrEqual(2.98)
    expect(r.doneAt!).toBeLessThanOrEqual(3.05)
  })
})

describe('Case 8 — Slow 4G empty cache (zero progress for 12s)', () => {
  const r = run({ load: (t) => (t < 12 ? 0 : 1), ready: (t) => t >= 12.5, duration: 20 })

  it('shows first content within hundreds of milliseconds', () => {
    expect(r.firstVisibleAt!).toBeLessThan(0.4)
  })

  it('never leaves a multi-second blank state', () => {
    expect(r.firstVisibleAt!).toBeLessThan(0.4)
  })

  it('does not make the timeout the success path', () => {
    expect(r.doneAt!).toBeGreaterThan(12.5)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
  })
})

describe('Stall robustness — two 250ms main-thread stalls', () => {
  const r = run({
    load: (t) => Math.min(t / 4, 1),
    ready: (t) => t >= 4,
    stalls: [
      { at: 1, dur: 0.25 },
      { at: 2, dur: 0.25 },
    ],
  })

  it('does not jump across a stall', () => {
    // Was 0.02, which measured the old dt clamp rather than the property. That
    // clamp bought its small step by discarding the time: 250ms of real waiting
    // counted as 50ms, so each stall silently added 200ms to a drawing that is
    // supposed to last three seconds, and a device stalling continuously ran to
    // 8.57s. The advance is rationed now instead of the clock, so a stall is
    // repaid over the following frames — 0.051 on the frame that resumes.
    //
    // The backgrounded tab this once cited is no longer this bound's business:
    // introDraw stops feeding the playhead while `document.hidden`, so a hidden
    // tab produces no delta to jump across. See the hidden-time case below.
    expect(r.maxDelta).toBeLessThan(0.06)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
  })
})

// ── The four cases the suite above structurally could not reach ──
//
// Every case above steps at DT — a healthy 60fps, far under the old `maxDt` of
// 50ms — and its only stalls are two 250ms blips. So the suite never ran the
// playhead at a SUSTAINED frame interval above the clamp, which is precisely
// the condition the intro boots into: three.js evaluating, 2.43MB of JPEG
// decoding and the GPU warmup all land inside the drawing's window, and a real
// build was measured running the whole intro at 7fps.
//
// Measured before the fix, against this same module: 8.57s at 7fps, 12.00s at
// 5fps, and a pace with no progress signal that decayed 3000x from 0.326/s to
// 0.0001/s. Both are the reported bug, and both passed every test above.

describe('Frame rate independence — the 3s contract is in seconds, not frames', () => {
  // THE regression test for the clamped-dt clock. `minimumDuration` used to be
  // spent in units of min(dt, maxDt), so any frame longer than 50ms stretched
  // the whole drawing by dt/maxDt — the intro's duration was a function of the
  // viewer's hardware, and the jank causing it is the intro's own boot work.
  const RATES = [60, 30, 20, 15, 10, 7, 5, 3]

  it.each(RATES)('lands on the 3s minimum at %ifps', (fps) => {
    const r = run({ dt: 1 / fps, load: () => 1, ready: (t) => t >= 0.5, duration: 60 })
    expect(r.doneAt).not.toBeNull()
    // One frame of tolerance: the playhead can only finish on a frame boundary,
    // so at 3fps the last step necessarily overshoots by up to 333ms.
    expect(r.doneAt!).toBeGreaterThanOrEqual(3.0 - 1e-6)
    expect(r.doneAt!).toBeLessThan(3.0 + 1 / fps + 1e-6)
  })

  it('never runs backwards at a low frame rate', () => {
    expect(run({ dt: 1 / 7, load: () => 1, ready: (t) => t >= 0.5 }).reversals).toBe(0)
  })
})

describe('No asymptote — with no signal the pace stays visible', () => {
  // The old autonomous curve was 1 - exp(-elapsed/tau): its rate collapsed from
  // 0.326/s to 0.0001/s and it never reached the ceiling at all. The drawing
  // sprinted through most of the isotype in under 3s and then appeared to
  // freeze — which is exactly what a visitor on a cold cache saw, because
  // measured progress is pinned at 0 until the app chunk lands.
  const p = createPlayhead(LIMITS)
  const at: number[] = []
  let t = 0
  while (t < 12) {
    const f = p.step(DT, 0, 'starting')
    t += DT
    at.push(f.visual)
  }
  const sample = (s: number) => at[Math.min(Math.round(s / DT) - 1, at.length - 1)]

  it('reaches the pre-ready ceiling in bounded time', () => {
    expect(sample(11)).toBeGreaterThanOrEqual(PRE_READY_LIMIT - 1e-6)
  })

  it('keeps moving in every second up to that point', () => {
    // A floor on the rate, not a shape: what must never return is a curve whose
    // advance rounds to nothing while the visitor is still waiting.
    for (let s = 1; s < 10; s += 1) {
      const advance = sample(s + 1) - sample(s)
      expect(
        advance,
        `second ${s}->${s + 1} advanced ${advance.toFixed(5)}, which reads as frozen`,
      ).toBeGreaterThan(0.004)
    }
  })

  it('spends its opening at a steady pace rather than front-loading it', () => {
    // The first three seconds must be one uniform movement. The old curve put
    // 64% of the outline in the first 2.6s and the remaining 36% in 20s.
    const first = sample(1) - sample(0.5)
    const third = sample(2.5) - sample(2)
    expect(third).toBeGreaterThan(first * 0.8)
  })
})

describe('Stall recovery — a stall costs frames, never seconds', () => {
  // The old clamp made a stall eat the contract: 900ms of real time counted as
  // 50ms, so the drawing silently owed itself 850ms and ran long. Real time is
  // now kept, and the ADVANCE is what gets rationed, so the playhead catches up
  // over the next few frames instead of teleporting or falling behind.
  const r = run({
    load: () => 1,
    ready: (t) => t >= 0.5,
    stalls: [{ at: 1.2, dur: 0.9 }],
  })

  it('still lands on the 3s minimum', () => {
    expect(r.doneAt).not.toBeNull()
    expect(r.doneAt!).toBeGreaterThanOrEqual(3.0 - 1e-6)
    expect(r.doneAt!).toBeLessThan(3.1)
  })

  it('does not teleport across the stall', () => {
    expect(r.maxDelta).toBeLessThan(0.1)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
  })
})

describe('The readiness gesture keeps its own duration', () => {
  // Caught by tracing a real build, not by reasoning: readiness landed at
  // 4538ms and the drawing reported complete at 4540ms — the collapse and the
  // fill, the two beats that MEAN "ready", played in a single frame.
  //
  // The cause is that Zone C's ceiling is the minimum-duration ramp, and once
  // the wait outlasts `minimumDuration` that ramp is saturated at 1, so it
  // stops pacing anything. Whatever the drawing was waiting for, the ending is
  // a gesture with a length; it is timed from the moment readiness ARRIVES, not
  // from page load.
  const LATE = 8

  it('plays the ending over its own duration when readiness is late', () => {
    const r = run({ load: () => 0.4, ready: (t) => t >= LATE, duration: 20 })
    expect(r.doneAt).not.toBeNull()
    // Long enough to read as a movement rather than a cut.
    expect(r.doneAt! - LATE).toBeGreaterThan(0.35)
    expect(r.doneAt! - LATE).toBeLessThan(1.0)
  })

  it('plays it at the same length whatever the frame rate', () => {
    const fast = run({ load: () => 0.4, ready: (t) => t >= LATE, duration: 20 })
    const slow = run({ dt: 1 / 7, load: () => 0.4, ready: (t) => t >= LATE, duration: 20 })
    expect(Math.abs((slow.doneAt! - LATE) - (fast.doneAt! - LATE))).toBeLessThan(0.3)
  })

  it('does not extend the 3s minimum when readiness is early', () => {
    // The gesture is not additional time — on a warm cache it is the last
    // stretch of the same three seconds.
    const r = run({ load: () => 1, ready: (t) => t >= 0.5 })
    expect(r.doneAt!).toBeLessThan(3.1)
  })
})

describe('Hidden time — the minimum duration is measured in visible time', () => {
  // The hazard that arrives with a wall clock: a backgrounded tab would
  // otherwise spend the drawing's 3 seconds while nothing is on screen, and the
  // viewer would return to an intro that had already happened. introDraw feeds
  // zero deltas while `document.hidden`; this is that contract.
  const r = run({
    load: () => 1,
    ready: (t) => t >= 0.5,
    hidden: [{ at: 1.5, dur: 3 }],
    duration: 30,
  })

  it('does not spend the intro off screen', () => {
    expect(r.doneAt).not.toBeNull()
    // 3s of drawing plus the 3s it was not being watched.
    expect(r.doneAt!).toBeGreaterThanOrEqual(6.0 - 1e-6)
    expect(r.doneAt!).toBeLessThan(6.1)
  })

  it('does not jump on return', () => {
    expect(r.maxDelta).toBeLessThan(0.02)
  })
})

describe('the derived boundaries themselves', () => {
  it('leaves room between the pre-ready ceiling and the fill', () => {
    // If these collapsed, Case 1 would pass vacuously: holding at the ceiling
    // and completing would be the same position.
    expect(PRE_READY_LIMIT).toBeGreaterThan(ZONE_A_END)
    expect(PRE_READY_LIMIT).toBeLessThan(ceiling)
    expect(ceiling).toBeLessThan(1)
  })
})
