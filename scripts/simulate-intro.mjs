// Deterministic tests for the loading intro's playhead (plan 007 Phase 12).
//
// These exist because the previous round of verification fed the playhead five
// synthetic progress curves that ALL rose from the first frame, and so never
// tried the one input that actually occurs in production: loadProgress pinned
// at 0 while the app chunk downloads. That is Case 1, and it is first.
//
// Runs the real src/intro-draw/playhead.ts — transpiled with esbuild (already a
// Vite dependency), never reimplemented here. A copy of the maths would test
// itself rather than the shipped code.
//
//   node scripts/simulate-intro.mjs

import { readFileSync } from 'node:fs'
import { transform } from 'esbuild'

// esbuild's JS API rather than its CLI: spawning `npx.cmd` fails with EINVAL
// on Windows, and a data: URL import needs no temp file or cleanup.
const source = readFileSync('src/intro-draw/playhead.ts', 'utf8')
const { code } = await transform(source, { loader: 'ts', format: 'esm' })
const { createPlayhead } = await import(
  `data:text/javascript;base64,${Buffer.from(code).toString('base64')}`
)

// Mirrors the derived boundaries in introDraw.ts for the shipped stage weights.
const W = { dot: 0.45, dotMove: 0.7, drawV: 1.6, arcHop: 0.25, drawArc: 0.9, isoBack: 1.0, depth: 0.82, collapse: 0.55 }
const FILL = 0.7
let cursor = 0
const bounds = {}
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

const LIMITS = {
  minimumDuration: 3.0,
  preReadyLimit: PRE_READY_LIMIT,
  autonomousTau: 2.5,
  smoothRate: 3.0,
  maxDt: 0.05,
  stallEpsilon: 1e-5,
}

const DT = 1 / 60

// Drives the playhead and records everything the assertions need.
function run({ load = () => 0, ready = () => false, duration = 20, stalls = [] }) {
  const p = createPlayhead(LIMITS)
  let t = 0
  let firstVisibleAt = null
  let zoneADoneAt = null
  let maxDelta = 0
  let reversals = 0
  let prev = 0
  let doneAt = null
  let last = null

  while (t < duration) {
    const stall = stalls.find((s) => t >= s.at && t < s.at + s.dur)
    const dt = stall ? stall.dur : DT
    const readiness = ready(t) ? 'ready' : load(t) > 0 ? 'loading' : 'starting'
    const f = p.step(dt, load(t), readiness)
    last = f
    // Timestamps are recorded at the END of the frame that produced them —
    // `t` is the time at the frame's start, so reporting it would understate
    // every duration by one frame and make a 3.00s completion look like 2.98s.
    const at = t + dt
    if (firstVisibleAt === null && f.visual > 0.005) firstVisibleAt = at
    if (zoneADoneAt === null && f.visual >= ZONE_A_END) zoneADoneAt = at
    if (f.visual < prev - 1e-9) reversals++
    maxDelta = Math.max(maxDelta, f.visual - prev)
    prev = f.visual
    if (f.done && doneAt === null) doneAt = at
    t += dt
  }
  return { firstVisibleAt, zoneADoneAt, maxDelta, reversals, doneAt, final: last }
}

let failures = 0
function check(label, condition, detail) {
  const ok = !!condition
  if (!ok) failures++
  console.log(`   ${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`)
}
const f3 = (v) => (v === null ? 'never' : v.toFixed(2))

console.log(`derived: ZONE_A_END ${ZONE_A_END.toFixed(4)}  PRE_READY_LIMIT ${PRE_READY_LIMIT.toFixed(4)}  ceiling ${ceiling.toFixed(4)}`)

// ── Case 1 — no progress signal at all, for 15s. THE regression test. ──
console.log('\nCase 1 — no progress signal (loadProgress 0, never ready, 15s)')
{
  const r = run({ duration: 15 })
  console.log(`   first visible ${f3(r.firstVisibleAt)}s · zone A done ${f3(r.zoneADoneAt)}s · final visual ${r.final.visual.toFixed(4)}`)
  check('intro becomes visible', r.firstVisibleAt !== null && r.firstVisibleAt < 0.4, `${f3(r.firstVisibleAt)}s`)
  check('opening movement executes', r.zoneADoneAt !== null && r.zoneADoneAt < 1.5, `${f3(r.zoneADoneAt)}s`)
  check('advances only to the pre-ready ceiling', r.final.visual <= PRE_READY_LIMIT + 1e-6)
  check('fill never activates', r.final.visual < ceiling)
  check('exit transition never runs', r.doneAt === null)
  check('reports holding', r.final.holding)
}

// ── Case 2 — immediate readiness ──
console.log('\nCase 2 — readiness at 500ms')
{
  const r = run({ load: () => 1, ready: (t) => t >= 0.5 })
  console.log(`   completes ${f3(r.doneAt)}s`)
  check('respects the 3s minimum', r.doneAt >= 3.0 - 1e-6, `${f3(r.doneAt)}s`)
  check('does not overshoot the minimum', r.doneAt < 3.2, `${f3(r.doneAt)}s`)
  check('no reversals', r.reversals === 0)
}

// ── Case 3 — readiness at 6s ──
console.log('\nCase 3 — readiness at 6s, progress ramping to 1')
{
  const r = run({ load: (t) => Math.min(t / 6, 1), ready: (t) => t >= 6 })
  console.log(`   first visible ${f3(r.firstVisibleAt)}s · completes ${f3(r.doneAt)}s · max frame delta ${r.maxDelta.toFixed(4)}`)
  check('visible immediately', r.firstVisibleAt < 0.4)
  check('stays below the ready-only region until readiness', r.doneAt > 6)
  check('completes smoothly after readiness', r.doneAt !== null && r.doneAt < 8)
  check('no jump at handover', r.maxDelta < 0.02, `max ${r.maxDelta.toFixed(4)}`)
}

// ── Case 4 — an optional reporter never registers ──
console.log('\nCase 4 — optional reporter missing (progress caps at 0.85, required all done)')
{
  const r = run({ load: () => 0.85, ready: (t) => t >= 2 })
  check('optional gap does not deadlock', r.doneAt !== null, `completes ${f3(r.doneAt)}s`)
  check('still respects the 3s minimum', r.doneAt >= 3.0 - 1e-6, `${f3(r.doneAt)}s`)
}

// ── Case 5 — scene chunk delayed well past the old 10s timeout ──
console.log('\nCase 5 — scene chunk delayed to 14s')
{
  const r = run({ load: (t) => (t < 14 ? 0.2 : 1), ready: (t) => t >= 14, duration: 20 })
  console.log(`   completes ${f3(r.doneAt)}s`)
  check('no completion before readiness', r.doneAt > 14)
  check('never completed on a timer', r.doneAt !== null && r.doneAt < 16)
  check('no reversals', r.reversals === 0)
}

// ── Case 6 — fatal ──
console.log('\nCase 6 — required asset fails at 2s (fatal)')
{
  const p = createPlayhead(LIMITS)
  let t = 0
  let f = null
  while (t < 12) {
    f = p.step(DT, 0.3, t < 2 ? 'loading' : 'fatal')
    t += DT
  }
  check('never completes', !f.done)
  check('holds below the fill', f.visual < ceiling)
}

// ── Case 7 — warm cache ──
console.log('\nCase 7 — warm cache (ready almost immediately)')
{
  const r = run({ load: () => 1, ready: (t) => t >= 0.05 })
  console.log(`   completes ${f3(r.doneAt)}s`)
  check('exactly the 3s minimum', r.doneAt >= 2.98 && r.doneAt <= 3.05, `${f3(r.doneAt)}s`)
}

// ── Case 8 — Slow 4G, empty cache: nothing reports for 12s, then it all lands ──
console.log('\nCase 8 — Slow 4G empty cache (zero progress for 12s)')
{
  const r = run({ load: (t) => (t < 12 ? 0 : 1), ready: (t) => t >= 12.5, duration: 20 })
  console.log(`   first visible ${f3(r.firstVisibleAt)}s · completes ${f3(r.doneAt)}s`)
  check('first content within hundreds of ms', r.firstVisibleAt < 0.4, `${f3(r.firstVisibleAt)}s`)
  check('no multi-second blank state', r.firstVisibleAt < 0.4)
  check('timeout is not the success path', r.doneAt > 12.5)
  check('no reversals', r.reversals === 0)
}

// ── Frame-drop robustness: 250ms stalls must not become jumps ──
console.log('\nStall robustness — two 250ms main-thread stalls')
{
  const r = run({ load: (t) => Math.min(t / 4, 1), ready: (t) => t >= 4, stalls: [{ at: 1, dur: 0.25 }, { at: 2, dur: 0.25 }] })
  check('no jump across stalls', r.maxDelta < 0.02, `max frame delta ${r.maxDelta.toFixed(4)}`)
  check('no reversals', r.reversals === 0)
}


console.log(failures === 0 ? '\nAll cases passed.' : `\n${failures} check(s) FAILED.`)
process.exit(failures === 0 ? 0 : 1)
