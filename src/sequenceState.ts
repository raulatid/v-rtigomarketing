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
  // Read by both experiences' camera drivers and by RenderPipeline; > 0 means a
  // transition is playing and the focus rig must stand down.
  transitionProgress: number
  motionBlur: number
  // Flipped by the timeline when the corner logo departs centre — the moment
  // the orbit reveal is allowed to begin.
  orbitsStarted: boolean
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
    motionBlur: 0,
    orbitsStarted: false,
  }
}
