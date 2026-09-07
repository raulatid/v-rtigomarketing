// The hover tutorial's sequence, as a pure state machine.
//
// One satellite auto-plays the REAL hover state twice, each pulse announced by
// particles converging on it, and then never again. This module decides only
// WHEN: the output is a boolean the focus layer turns into the same highlight
// the pointer sets, plus a 0..1 progress for the particle cue. Nothing visual
// lives here — extracted for the reason invitation.ts and panelExpansion.ts
// are, so the whole lifecycle can be exercised in Node without a WebGL context.
//
//   waiting ──(settled ∧ visible)──▶ arming(armDelay) ──▶ pulse × N ──▶ done
//
//   one pulse, local time t:
//     cue      t ∈ [0, cueDuration)            particles travel, 0..1
//     hover    t ∈ [cueLead, cueLead + hold)   the target is on
//     gap      until cueLead + hold + gap       rest
//
// `done` is terminal. A retire — the viewer hovered or selected something for
// themselves — lands there too, and so does losing the target off screen
// mid-pulse: a demonstration aimed at nothing teaches nothing, and the viewer
// who dragged the globe away is already exploring.

import { ORBIT_CONFIG } from './orbitConfig'

export type HoverTutorialConfig = typeof ORBIT_CONFIG.tutorial

export type TutorialPhase = 'waiting' | 'arming' | 'pulse' | 'done'

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
  /** Ends the tutorial for good. Idempotent. */
  retire(): void
  readonly phase: TutorialPhase
  /** Pulses completed so far — for tests and the debug readout. */
  readonly pulsesPlayed: number
}

const AT_REST: TutorialFrame = { hover: false, cue: null }

export interface HoverTutorialOptions {
  /** No particles, one longer pulse; the hover ease itself is kept. */
  reducedMotion?: boolean
  /** Debug only (`?tutorial=1`): pulse forever and ignore retirement, for tuning. */
  loop?: boolean
}

export function createHoverTutorial(
  cfg: HoverTutorialConfig = ORBIT_CONFIG.tutorial,
  { reducedMotion = false, loop = false }: HoverTutorialOptions = {},
): HoverTutorial {
  const pulses = loop ? Number.POSITIVE_INFINITY : reducedMotion ? 1 : cfg.pulses
  const hold = reducedMotion ? cfg.hold * cfg.reducedMotionHoldScale : cfg.hold
  const hoverOn = cfg.cueLead
  const hoverOff = hoverOn + hold
  const pulseEnd = hoverOff + cfg.gap

  let phase: TutorialPhase = 'waiting'
  let t = 0
  let waited = 0
  let played = 0

  function finish(): TutorialFrame {
    phase = 'done'
    return AT_REST
  }

  function tick(rawDelta: number, input: TutorialInput): TutorialFrame {
    // A frame that lies about time — NaN from a stalled clock, a negative
    // delta from a clamp — advances nothing rather than jumping the sequence.
    const delta = Number.isFinite(rawDelta) && rawDelta > 0 ? rawDelta : 0

    if (phase === 'done') return AT_REST

    if (phase === 'waiting') {
      if (!input.settled) return AT_REST
      if (!input.visible) {
        // Counted only while settled: the wait is for the target to come round
        // into view, not for the intro.
        waited += delta
        if (waited >= cfg.maxWaitSeconds) return finish()
        return AT_REST
      }
      phase = 'arming'
      t = 0
      return AT_REST
    }

    if (phase === 'arming') {
      // The beat must be a still one. Losing the target during it starts the
      // wait over rather than counting time it was not there.
      if (!input.visible) {
        phase = 'waiting'
        return AT_REST
      }
      t += delta
      if (t < cfg.armDelay) return AT_REST
      phase = 'pulse'
      t = 0
    }

    // phase === 'pulse'
    if (!input.visible && !loop) return finish()
    t += delta
    if (t >= pulseEnd) {
      played += 1
      if (played >= pulses) return finish()
      t -= pulseEnd
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

  return {
    tick,
    retire,
    get phase() {
      return phase
    },
    get pulsesPlayed() {
      return played
    },
  }
}
