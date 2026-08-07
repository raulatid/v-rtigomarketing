import { Phase } from './introConfig'

// Continuous values shared between the GSAP master timeline and the R3F render
// loop. This object is mutated in place and never triggers a React render —
// plan 002 §1.2: useState is for discrete phase changes only, because at 60fps
// setState would re-render the SVG layer, both canvases and the debug panel.
export interface SequenceState {
  phase: Phase
  // 0..1 across P2. Read by CameraController through the easing curves.
  warpProgress: number
  // 0..1 across P3.
  swapProgress: number
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
  // Set true once the GLB has assembled. The P3 substitution is gated on this,
  // because a scale-through-zero crossover hides nothing if the model is absent.
  modelReady: boolean
  // Set true once the Earth textures have decoded. Gated because the warp's cut
  // would otherwise reveal an unshaded black sphere.
  earthReady: boolean
  // Set when an asset hard-failed; the sequence then keeps the 2D mark instead
  // of collapsing it into an empty frame.
  //
  // NOT set by a timeout. A timeout means "this is slow", never "this failed"
  // and never "this is ready" — the intro now holds rather than releasing into
  // an unready scene (plan 007 Phase 4). Readiness lives in bootState.
  assetsFailed: boolean
  // True once the orbit system has been built and added to the scene.
  orbitsReady: boolean
  // Flipped by the timeline when the corner logo departs centre — the moment
  // the orbit reveal is allowed to begin.
  orbitsStarted: boolean
}

export function createSequenceState(): SequenceState {
  return {
    phase: 'draw',
    warpProgress: 0,
    swapProgress: 0,
    warpOverlay: 0,
    swapOverlay: 0,
    transitionOverlay: 0,
    transitionProgress: 0,
    motionBlur: 0,
    modelReady: false,
    earthReady: false,
    assetsFailed: false,
    orbitsReady: false,
    orbitsStarted: false,
  }
}
