import type { NavigationSpringLimits } from './navigationConfig'

// The accumulator's progress -> the progress the indicator paints.
//
// The accumulator is deliberately blunt: travel lands the instant an event does,
// and decay is a plain exponential. Painted directly it reads as mechanical —
// the fill teleports after each notch, holds, then drains. This module sits
// between the two numbers and gives the painted one inertia: a damped spring
// chases the accumulator, so input surges land with a slight elastic overshoot
// and a release settles instead of fading.
//
// It NEVER decides where progress goes. Commits, decay and clamping all belong
// to `navigationGesture`; feed this module a target and it only answers "where
// is the indicator on its way there". Purity and shape match the neighbours:
// no DOM, no clock of its own, a factory closing over private state.
//
// ── Why it terminates ──
//
// A spring converges asymptotically, and `--nav-progress` is polled to be a
// LITERAL 0 by the e2e flick test — an asymptote would also keep the frame loop
// alive forever, and an idle Earth is supposed to cost no frames. So inside the
// settle window (position and velocity both negligible) the spring snaps to the
// target and reports `settled`, which is the caller's cue to let the loop stop.

export interface ProgressSpring {
  /** Advances toward `target` by `deltaSeconds` and returns the new position. */
  step(target: number, deltaSeconds: number): number
  /** Snaps to `value` (default 0) with no residual motion. Commit, scene swap. */
  reset(value?: number): void
  /** True when stepping toward `target` would change nothing visible. */
  settled(target: number): boolean
}

/** Position this close to the target, with velocity to match, is "there". */
const SETTLE_EPSILON = 0.001

/**
 * Integration substep, seconds. Semi-implicit Euler is stable here for any
 * frame the loop can produce (omega * h stays far below 1), and slicing a
 * stalled frame into substeps keeps the dynamics real-time instead of slowing
 * the spring down when the main thread was busy.
 */
const SUBSTEP_SECONDS = 1 / 120

/** Substeps per call are capped; a multi-second stall lands settled anyway. */
const MAX_SUBSTEPS = 90

export function createProgressSpring(
  limits: Pick<NavigationSpringLimits, 'omegaRadPerSec' | 'damping'>,
): ProgressSpring {
  const omega = limits.omegaRadPerSec
  const zeta = limits.damping

  let position = 0
  let velocity = 0

  function settled(target: number): boolean {
    return (
      Math.abs(position - target) < SETTLE_EPSILON &&
      Math.abs(velocity) < SETTLE_EPSILON * omega
    )
  }

  function step(target: number, deltaSeconds: number): number {
    if (!Number.isFinite(target) || !Number.isFinite(deltaSeconds)) return position

    if (settled(target)) {
      // Snap, so the painted number is the accumulator's number — a literal 0
      // at rest, a literal 1 at commit — never 0.9993 forever.
      position = target
      velocity = 0
      return position
    }

    const dt = Math.max(0, deltaSeconds)
    const steps = Math.min(MAX_SUBSTEPS, Math.max(1, Math.ceil(dt / SUBSTEP_SECONDS)))
    const h = Math.min(dt / steps, SUBSTEP_SECONDS)
    for (let i = 0; i < steps; i += 1) {
      velocity += (omega * omega * (target - position) - 2 * zeta * omega * velocity) * h
      position += velocity * h
    }

    if (settled(target)) {
      position = target
      velocity = 0
    }
    return position
  }

  return {
    step,
    reset(value = 0) {
      position = Number.isFinite(value) ? value : 0
      velocity = 0
    },
    settled,
  }
}
