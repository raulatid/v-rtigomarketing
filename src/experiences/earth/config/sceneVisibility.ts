import { Phase, PHASE_ORDER } from './introConfig'
import { SequenceState } from './sequenceState'
import { WARP_LIMITS } from '../../../utils/warpTransition'

// Compare phases by position rather than listing them. Listing was fine with
// five phases, but adding 'orbits' silently broke earthVisible's hardcoded set —
// ordering comparisons keep working when a phase is inserted.
export function atOrAfter(phase: Phase, mark: Phase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(mark)
}

// The cut keys off RAW warp progress, not the eased travel curve — it is a
// timeline event, not a camera-path event (extraction 002 §4). It is the
// Earth <-> Murcia warp's cut, whose flash CameraController writes from the
// same raw value, so the two stay locked together even if the easing is retuned.
//
// Before the cut the canvas has nothing on it: the mark launching at the camera
// is DOM. The stars that used to fly past there went with the 2026-11-23 warp.

export function earthVisible(state: SequenceState): boolean {
  if (state.phase === 'warp') return state.warpProgress >= WARP_LIMITS.cut
  return atOrAfter(state.phase, 'swap')
}

// The persistent backdrop appears in the SAME frame the Earth does, under the
// overlay flash and peak motion blur that already conceal that substitution.
// That is the project's "nothing ever cross-fades" principle applied to one more
// element rather than a new mechanism — so it shares earthVisible's predicate by
// delegation, not by a copied condition that could drift out of step.
//
// It is deliberately absent during P0/P1/warp-leg-1: the drawing phase is meant
// to be black, and a far, near-static field during leg 1 would sit still while
// the mark rushes at the camera, undercutting the speed cue.
export function backdropVisible(state: SequenceState): boolean {
  return earthVisible(state)
}

// Orbits reveal only once the corner logo has departed centre, so attention
// hands off rather than competes — DECISIONS.md 26.16. The trigger is a
// timeline event, so it
// is a flag set by the timeline rather than something derived from a progress
// value.
export function orbitsVisible(state: SequenceState): boolean {
  return state.orbitsStarted && atOrAfter(state.phase, 'orbits')
}

// Whether the Earth hint may be offered. NOT whether it is on screen — that is
// this plus a couple of seconds of stillness, and the stillness is counted in
// the scene (`hint/hintIdle.ts`) because it is a property of the viewer rather
// than of the sequence.
//
// The phase term lives here rather than in the flag App writes, because App
// would have to read it at render time and the phase moves between renders.
export function hintAllowed(state: SequenceState, permitted: boolean): boolean {
  return permitted && atOrAfter(state.phase, 'site')
}
