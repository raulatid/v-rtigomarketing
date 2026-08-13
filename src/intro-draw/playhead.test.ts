import { describe, it, expect } from 'vitest'
import { createPlayhead, type PlayheadLimits, type Readiness } from './playhead'

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

// Mirrors the derived boundaries in introDraw.ts for the shipped stage weights.
// A mirror rather than an import: the real numbers come from `createIntroDraw`,
// which builds an SVG and therefore wants a DOM. If the stage weights there ever
// change, these move with them — the drift shows up as Case 1 failing.
const W = {
  dot: 0.45,
  dotMove: 0.7,
  drawV: 1.6,
  arcHop: 0.25,
  drawArc: 0.9,
  isoBack: 1.0,
  depth: 0.82,
  collapse: 0.55,
}
const FILL = 0.7
let cursor = 0
const bounds: Record<string, { start: number; end: number }> = {}
for (const [k, w] of Object.entries(W)) {
  const start = Math.max(cursor - (k === 'depth' ? 0.15 : 0), 0)
  bounds[k] = { start, end: start + w }
  cursor = start + w
}
const span = cursor
const ceiling = span / (span + FILL)
const scale = ceiling / span
const ZONE_A_END = bounds.dotMove.end * scale
const PRE_READY_LIMIT = bounds.collapse.start * scale

const LIMITS: PlayheadLimits = {
  minimumDuration: 3.0,
  preReadyLimit: PRE_READY_LIMIT,
  autonomousTau: 2.5,
  smoothRate: 3.0,
  maxDt: 0.05,
  stallEpsilon: 1e-5,
}

const DT = 1 / 60

interface RunOptions {
  load?: (t: number) => number
  ready?: (t: number) => boolean
  duration?: number
  stalls?: Array<{ at: number; dur: number }>
}

function run({ load = () => 0, ready = () => false, duration = 20, stalls = [] }: RunOptions) {
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
    const dt = stall ? stall.dur : DT
    const readiness: Readiness = ready(t) ? 'ready' : load(t) > 0 ? 'loading' : 'starting'
    const f = p.step(dt, load(t), readiness)
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
    // maxDt clamps the frame delta, so a backgrounded tab resumes rather than
    // teleporting the drawing forward.
    expect(r.maxDelta).toBeLessThan(0.02)
  })

  it('never runs backwards', () => {
    expect(r.reversals).toBe(0)
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
