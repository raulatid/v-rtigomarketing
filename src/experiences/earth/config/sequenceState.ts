import { Phase } from './introConfig'

// Continuous values shared between the GSAP master timeline and the R3F render
// loop. This object is mutated in place and never triggers a React render —
// plan 002 §1.2: useState is for discrete phase changes only, because at 60fps
// setState would re-render the SVG layer, both canvases and the debug panel.
export interface SequenceState {
  phase: Phase
  // 0..1 across P2. Read by CameraController through the easing curves.
  warpProgress: number
  // Two independent overlay contributors; they never overlap in time, but the
  // applied value is max() so neither can clobber the other at a boundary.
  warpOverlay: number
  swapOverlay: number
  // Third contributor: the Earth<->Murcia transition flash. Same max() rule.
  // Owned by the transition controller, not the intro timeline, and the only
  // one that can still be non-zero after the intro has landed.
  transitionOverlay: number
  // 0..1 across the Earth<->Murcia warp, the exact counterpart of warpProgress.
  // Read by both experiences' camera drivers and by RenderPipeline.
  //
  // > 0 means the warp is somewhere other than rest. It does NOT mean a
  // transition is playing: since navigation became a scrubbed gesture this is
  // also non-zero for a reversible drag that will usually be abandoned, and for
  // the whole of its decay tail. Ask `transitionCommitted` for ownership.
  transitionProgress: number
  // Whether the non-zero progress above belongs to a COMMITTED cinematic.
  //
  // The distinction is camera ownership, and it is the difference between two
  // behaviours that were conflated until a scrubbed gesture froze Earth's orbit
  // for the length of its decay: a cinematic OWNS the camera and every other
  // writer stands down for its duration; a gesture MODIFIES whatever pose the
  // viewer is currently dragging, and must never take the controls away.
  transitionCommitted: boolean
  // Where the viewer has zoomed the world they are in, -1..+1 (`adr/014`).
  //
  // -1 is furthest from the transition, +1 is against the limit that leads to
  // the other world — INWARD on Earth, outward and higher in Murcia, because the
  // band's positive direction always faces the other world and each experience
  // maps it through its own `camera/zoomPose`.
  //
  // Here for the same reason `transitionProgress` is, and it is the reason this
  // object exists: a wheel produces well over a hundred events a second and a
  // React state mirror would be a render of two canvases and all the overlay
  // chrome per event.
  //
  // PERSISTENT, unlike everything else on this object. Nothing decays it, no
  // timeline pins it, and it survives a tab hide — a viewer coming back to the
  // tab has not asked for their camera to move. The one thing that clears it is
  // the warp's cut, where the world under it is replaced anyway.
  zoomDepth: number
  /**
   * How far through the WHOLE journey to the other world the viewer has pushed,
   * 0..1: the zoom band, then the commit accumulator against its limit.
   *
   * RAW, never spring-painted, and the distinction is load-bearing. The painted
   * progress that drives `--nav-progress` is deliberately lagged, because an
   * indicator that lags reads as receiving your input. This one drives a
   * screen-space effect on the whole frame, and a screen-space effect that lags
   * reads as the renderer struggling. Wiring this to `onProgress` instead of
   * `onApproach` is the mistake to look for.
   *
   * Distinct from `transitionProgress`, which is the committed cinematic. This
   * is what the viewer is doing BEFORE they commit, and it is reversible.
   */
  approach: number
  motionBlur: number
  // Flipped by the timeline when the corner logo departs centre — the moment
  // the orbit reveal is allowed to begin.
  orbitsStarted: boolean
  // Whether the Earth hint MAY be offered — the viewer is on Earth and nothing
  // else has their attention. Not whether it is on screen: that is decided in
  // the scene, by how long they have been still (`hint/hintIdle.ts`).
  //
  // Written by App, read per frame by `HintLayer`. Here rather than in React
  // state for the reason the zoom is: a `useState` would re-render both canvases
  // and all the overlay chrome for a flag that has a zero-cost channel already
  // threaded into every layer.
  //
  // It carries the refusals only. The phase is deliberately NOT folded in — App
  // would have to read it at render time, where it is stale — so
  // `sceneVisibility.hintAllowed` asks for that per frame instead.
  hintAllowed: boolean
}

// Removed here because nothing ever read them, only wrote them: `swapProgress`,
// `modelReady`, `earthReady`, `orbitsReady`, and `assetsFailed` (never even
// written). Two carried doc comments describing guarantees that were never
// implemented — `earthReady` claimed the warp's cut was gated on it to avoid
// revealing an unshaded sphere, but sceneVisibility.earthVisible() never
// consulted it. A flag that documents a safeguard it does not provide is worse
// than no flag. The live equivalents: readiness lives in bootState.ts, and the
// timeline asks the corner logo directly via cornerLogo.isReady().

export function createSequenceState(): SequenceState {
  return {
    phase: 'draw',
    warpProgress: 0,
    warpOverlay: 0,
    swapOverlay: 0,
    transitionOverlay: 0,
    transitionProgress: 0,
    transitionCommitted: false,
    zoomDepth: 0,
    approach: 0,
    motionBlur: 0,
    orbitsStarted: false,
    hintAllowed: false,
  }
}
