// The hover tutorial's sequence, as a pure state machine.
//
// One satellite auto-plays the REAL hover state in rounds of two pulses, each
// pulse announced by particles converging on it, and it keeps offering until
// the viewer interacts with a satellite. This module decides only WHEN: the
// output is a boolean the focus layer turns into the same highlight the
// pointer sets, plus a 0..1 progress for the particle cue. Nothing visual
// lives here — extracted for the reason invitation.ts and panelExpansion.ts
// are, so the whole lifecycle can be exercised in Node without a WebGL context.
//
//   waiting ─(settled ∧ visible)─▶ arming(armDelay) ─▶ pulse × N ─▶ rest(roundGap) ─┐
//      ▲                                                                            │
//      └──────────────── target off screen, or suspended ───────┘   └───────────────┘
//
//   one pulse, local time t:
//     cue      t ∈ [0, cueDuration)            particles travel, 0..1
//     hover    t ∈ [cueLead, cueLead + hold)   the target is on
//     gap      until cueLead + hold + gap       rest
//
// ONLY `retire()` REACHES `done`, and only the viewer causes it — a real
// hover, a tap, a selection. There is no timer that ends the lesson: a hint
// that gave up while the viewer was still puzzled would have been a hint that
// failed. `roundGap` is what keeps repeating from nagging.
//
// Losing the target off screen is not an ending either. It orbits out of the
// margin and back, so the sequence returns to `waiting` and offers again when
// it can be seen. Leaving the scene entirely — Murcia, the audit panel — is
// `suspend()`: the same pause, because a trip is not an interaction.

import { ORBIT_CONFIG } from './orbitConfig'

export type HoverTutorialConfig = typeof ORBIT_CONFIG.tutorial

export type TutorialPhase = 'waiting' | 'arming' | 'pulse' | 'rest' | 'done'

export interface TutorialInput {
  /** The target's entrance is over and it is idling (`isSatelliteActive`). */
  settled: boolean
  /** The target is inside the frame, with a margin, and not behind the Earth. */
  visible: boolean
}

export interface TutorialFrame {
  /** Whether the target should carry the hover state this frame. */
  hover: boolean
  /** Particle cue progress, 0..1, or null while there is no cue to draw. */
  cue: number | null
}

export interface HoverTutorial {
  tick(delta: number, input: TutorialInput): TutorialFrame
  /** Ends the tutorial for good — the viewer interacted. Idempotent. */
  retire(): void
  /**
   * Pauses it: back to waiting, with nothing held. For leaving the scene,
   * which is not an interaction and must not end the lesson.
   */
  suspend(): void
  readonly phase: TutorialPhase
  /** Pulses completed so far, across every round — for tests and the debug readout. */
  readonly pulsesPlayed: number
  /** Rounds of `pulses` completed so far. */
  readonly roundsPlayed: number
}

const AT_REST: TutorialFrame = { hover: false, cue: null }

export interface HoverTutorialOptions {
  /** No particles, one pulse per round with a longer hold; the hover ease is kept. */
  reducedMotion?: boolean
  /** Debug only (`?tutorial=1`): ignore retirement, so it can be watched while tuning. */
  loop?: boolean
}

export function createHoverTutorial(
  cfg: HoverTutorialConfig = ORBIT_CONFIG.tutorial,
  { reducedMotion = false, loop = false }: HoverTutorialOptions = {},
): HoverTutorial {
  const pulsesPerRound = reducedMotion ? 1 : cfg.pulses
  const hold = reducedMotion ? cfg.hold * cfg.reducedMotionHoldScale : cfg.hold
  const hoverOn = cfg.cueLead
  const hoverOff = hoverOn + hold
  const pulseEnd = hoverOff + cfg.gap

  let phase: TutorialPhase = 'waiting'
  let t = 0
  let played = 0
  let rounds = 0
  let inRound = 0

  function tick(rawDelta: number, input: TutorialInput): TutorialFrame {
    // A frame that lies about time — NaN from a stalled clock, a negative
    // delta from a clamp — advances nothing rather than jumping the sequence.
    const delta = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 0

    if (phase === 'done') return AT_REST

    if (phase === 'waiting') {
      if (!input.settled || !input.visible) return AT_REST
      phase = 'arming'
      t = 0
      return AT_REST
    }

    // From here the target has to stay in view. Losing it returns to waiting
    // rather than ending anything: it orbits out of the margin and back, and
    // the offer is made again when it can be seen.
    if (!input.visible) {
      phase = 'waiting'
      t = 0
      inRound = 0
      return AT_REST
    }

    if (phase === 'arming') {
      t += delta
      if (t < cfg.armDelay) return AT_REST
      phase = 'pulse'
      inRound = 0
      t = 0
    }

    if (phase === 'rest') {
      t += delta
      if (t < cfg.roundGap) return AT_REST
      phase = 'pulse'
      inRound = 0
      t -= cfg.roundGap
    }

    // phase === 'pulse'
    t += delta
    if (t >= pulseEnd) {
      played += 1
      inRound += 1
      t -= pulseEnd
      if (inRound >= pulsesPerRound) {
        rounds += 1
        phase = 'rest'
        // The round's rest begins where the last pulse ended, carrying any
        // overshoot, so a slow frame cannot lengthen the pause.
        return t < cfg.roundGap ? AT_REST : tick(0, input)
      }
    }
    return {
      hover: t >= hoverOn && t < hoverOff,
      cue: reducedMotion || t >= cfg.cueDuration ? null : t / cfg.cueDuration,
    }
  }

  function retire() {
    if (loop) return
    phase = 'done'
  }

  function suspend() {
    if (phase === 'done') return
    phase = 'waiting'
    t = 0
    inRound = 0
  }

  return {
    tick,
    retire,
    suspend,
    get phase() {
      return phase
    },
    get pulsesPlayed() {
      return played
    },
    get roundsPlayed() {
      return rounds
    },
  }
}
