import { IntroConfig, Phase, PHASE_ORDER } from './introConfig'
import { SequenceState } from './sequenceState'

// Compare phases by position rather than listing them. Listing was fine with
// five phases, but adding 'orbits' silently broke earthVisible's hardcoded set —
// ordering comparisons keep working when a phase is inserted.
export function atOrAfter(phase: Phase, mark: Phase): boolean {
  return PHASE_ORDER.indexOf(phase) >= PHASE_ORDER.indexOf(mark)
}

// The cut keys off RAW warp progress, not the eased travel curve — it is a
// timeline event, not a camera-path event (extraction 002 §4). The overlay
// flash in CameraController keys off the same raw value, so the two stay locked
// together even if the position easing is retuned.

export function earthVisible(state: SequenceState, config: IntroConfig): boolean {
  if (state.phase === 'warp') return state.warpProgress >= config.sceneSwapProgress
  return atOrAfter(state.phase, 'swap')
}

export function starsVisible(state: SequenceState, config: IntroConfig): boolean {
  if (state.phase === 'shrink') return true
  if (state.phase === 'warp') return state.warpProgress < config.sceneSwapProgress
  return false
}

// The persistent backdrop appears in the SAME frame the Earth does, under the
// overlay flash and peak motion blur that already conceal that substitution.
// That is the project's "nothing ever cross-fades" principle applied to one more
// element rather than a new mechanism — so it shares earthVisible's predicate by
// delegation, not by a copied condition that could drift out of step.
//
// It is deliberately absent during P0/P1/warp-leg-1: the drawing phase is meant
// to be black, and a far, near-static field during leg 1 would sit still while
// the tunnel rushes past, undercutting the speed cue.
export function backdropVisible(state: SequenceState, config: IntroConfig): boolean {
  return earthVisible(state, config)
}

// Orbits reveal only once the corner logo has departed centre, so attention
// hands off rather than competes — DECISIONS.md 26.16. The trigger is a
// timeline event, so it
// is a flag set by the timeline rather than something derived from a progress
// value.
export function orbitsVisible(state: SequenceState): boolean {
  return state.orbitsStarted && atOrAfter(state.phase, 'orbits')
}

// The particle hint is offered by the navigation layer, which already knows
// every rule about when a hint may exist — so this asks it, and adds only the
// one thing the navigation layer cannot know: that the intro has actually
// handed the world over. `reset()` fires `offerHint` on the phase edge, so the
// two agree; the guard is here in case a future caller offers one earlier.
export function hintVisible(state: SequenceState): boolean {
  return state.hintShown && atOrAfter(state.phase, 'site')
}
