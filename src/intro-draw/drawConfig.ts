// P0's own configuration. Moved out of introConfig.ts so the draw module owns
// everything it needs — introConfig re-exports these, so the debug overlay and
// every existing consumer are unaffected.

// ── Stage weights ──
//
// RELATIVE, not seconds. The draw's duration is set by load progress (plan 006
// §2), so these only decide how the total is divided between stages. The
// numbers are the original authored durations, kept as-is because their RATIOS
// are what was tuned — but raising one now shortens every other stage rather
// than lengthening the draw. Only `fillDuration` is still real seconds.
export interface DrawConfig {
  // On-screen size of the mark, in vmin.
  introSize: number
  dotDuration: number
  dotMoveDuration: number
  drawDuration: number
  arcDrawDuration: number
  isoOffset: number
  isoDrawDuration: number
  depthDuration: number
  collapseDuration: number
  // The one time-governed stage: it plays at this literal duration, on ready.
  fillDuration: number
}

export const DEFAULT_DRAW_CONFIG: DrawConfig = {
  introSize: 32,
  dotDuration: 0.45,
  dotMoveDuration: 0.7,
  drawDuration: 1.6,
  arcDrawDuration: 0.9,
  isoOffset: 26,
  isoDrawDuration: 0.9,
  depthDuration: 0.5,
  collapseDuration: 0.55,
  fillDuration: 0.7,
}

// ── Fixed stage detail, not exposed to the debug panel ──
// Ratios inherited from the original GSAP build. Kept out of DrawConfig because
// nothing ever tuned them and they would only clutter the overlay.
export const DRAW_SHAPE = {
  // Dot's hop from the end of the V to the start of the arc.
  arcHopWeight: 0.25,
  // GSAP stagger between the two offset back outlines.
  isoStagger: 0.1,
  // GSAP stagger across the nine depth edges.
  depthStagger: 0.04,
  // Depth edges start before the back outlines finish (GSAP '-=0.15').
  depthOverlap: 0.15,
  // Dot scale at the start of its entrance.
  dotScaleFrom: 0.6,
  // Isometric collapse target, as a multiple of isoOffset.
  collapseYRatio: 0.72,
} as const

// ── Playhead governance (plan 007 Phase 1) ──
//
// Named and documented rather than inlined, because these encode the loading
// contract and not merely a feel.
export const DRAW_TIMING = {
  // The drawing never completes faster than this, however fast loading is.
  // A CAP ON PACE — never a gate on movement. Conflating the two is what made
  // the screen blank whenever loadProgress sat at 0.
  //
  // THREE SECONDS OF VISIBLE TIME, and both of those words are load-bearing.
  // This used to be spent in units of min(dt, maxDt), which made it three
  // seconds of frames shorter than 50ms — so every frame longer than that
  // stretched the whole drawing by dt/maxDt. Measured on a real build: 4.00s at
  // 15fps, 8.57s at 7fps, 12.00s at 5fps, against an intro that boots at 7fps
  // because three.js evaluating and 2.43MB of JPEG decoding are what it is
  // waiting for. "Visible" is the other half: introDraw feeds zero deltas while
  // the tab is hidden, so a backgrounded tab cannot spend the drawing's three
  // seconds with nobody watching.
  minimumDuration: 3.0,

  // The share of the outline held back from the minimum-duration ramp, for the
  // case where loading outlasts it.
  //
  // The autonomous advance used to be 1 - exp(-elapsed/tau), and an exponential
  // has no end: its rate fell from 0.326/s to 0.0001/s over one run and it
  // never reached the ceiling at all. That is what produced the two complaints
  // that sound contradictory but are the same curve — the drawing sprinted
  // through most of the isotype in under three seconds, then appeared to
  // freeze. It is also the common case rather than the edge case, because
  // measured progress is pinned at 0 until the app chunk lands.
  //
  // So the ramp is uniform and covers 1 - reserve of the band in
  // `minimumDuration`, and the remaining 15% is spent at a slow CONSTANT rate
  // over `driftDuration`. Constant-slow reads as working; asymptotic reads as
  // crashed. After that the outline is complete and the drawing holds, which is
  // the honest state — the dot's pulse is what says it is still alive.
  reserve: 0.15,
  driftDuration: 7.0,

  // Ceiling on how fast the playhead may advance in one frame, as a multiple of
  // its nominal rate — the rationing that replaces the old dt clamp.
  //
  // The clamp was reaching for the right thing and grabbed the wrong lever: it
  // limited the jump by falsifying the CLOCK, so the drawing paid for a stall
  // by running long, permanently. Rationing the ADVANCE instead keeps real time
  // and pays the stall back over the next few frames.
  //
  // 3 rather than 4 deliberately: it holds the handover step at ~0.017, inside
  // the maxDelta bound the smoothness cases have always asserted. Raising it
  // makes recovery snappier and those steps more visible.
  catchUp: 3,

  // Exponential smoothing on the MEASURED signal only. The uniform ramp and the
  // minimum-duration cap are already smooth; smoothing them too would add lag
  // and overshoot the 3s contract.
  smoothRate: 3.0,

  // Frame-drop guard for the SMOOTHING FILTER, which is the one place a clamp
  // was ever right: frame-rate-independent smoothing is precisely what turns a
  // dropped frame into a visible jump, since after a 250ms texture upload an
  // unclamped dt would consume ~53% of the remaining gap in a single frame.
  // It no longer touches `elapsed` — see minimumDuration.
  maxDt: 0.05,

  // Playhead movement below this in one frame counts as stalled.
  stallEpsilon: 1e-5,

  // How long the playhead must sit still before the dot starts pulsing.
  stallAfter: 0.35,

  // Diagnostics only. Reaching it does NOT complete the drawing and does NOT
  // mean ready — it logs, marks the boot debug object, and the intro keeps
  // waiting. See plan 007 Phase 4: a timeout is not a readiness signal.
  timeoutNotice: 15.0,

  // The backstop. Reaching this DOES end the wait, as a failure (ADR 007).
  //
  // "A timeout is not a readiness signal" is still true and still the rule —
  // this never reports ready, only fatal. What it answers is a different
  // question: what happens when a required resource neither completes nor
  // fails. Three of the five could do exactly that, and the symptom was a
  // visitor held on "Esto está tardando más de lo habitual" forever. Those
  // three are fixed at the source; this is what catches the fourth.
  //
  // 45s is deliberately far past timeoutNotice at 15s. A slow connection must
  // reach the notice and then still be given three times as long again before
  // anything gives up — this is a last resort, not a patience limit.
  hardDeadline: 45.0,

  // Floor on the dot's alpha while pulsing, so the "still alive" signal works
  // from the very first frame rather than depending on the playhead having
  // already advanced far enough to make the dot visible.
  pulseMinAlpha: 0.35,
} as const
