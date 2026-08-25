// The holo panel's isotype→logo unfold, as a pure function.
//
// Extracted from createHoloPanel so it can be tested in Node without a WebGL
// context, the same way closeUpFraming.ts and sequenceState.ts are — the
// interesting behaviour here is a state machine, and it would otherwise only be
// reachable through a ShaderMaterial.
//
// PROGRESS IS A VALUE, NOT A START TIMESTAMP. That is the whole design. A
// timestamp-based tween has to decide what to do when the target flips
// mid-flight, and every cheap answer is wrong: restarting from 0 makes a
// half-open panel snap shut, and easing from the start time makes it jump to
// fully open before closing. Storing the position instead means a reversal is
// simply a sign change on the step — a panel caught 60% open closes from 0.60.
// Selecting satellite B while A is still unfolding is the case that exercises
// it, and it is a single click apart in the real scene.

/**
 * `current` advanced one frame toward `target`, clamped to [0, 1].
 *
 * `duration` is the time for a FULL 0→1 traversal, so a partial move takes
 * proportionally less — which is what makes open and close symmetric without
 * either side knowing about the other.
 *
 * A non-finite or non-positive `duration` snaps to the target rather than
 * dividing by zero: a zero-duration expansion is a legitimate way to ask for no
 * animation, and NaN leaking into a uniform is invisible until the panel
 * disappears.
 */
const SNAP_EPSILON = 1e-6

export function advanceExpansion(
  current: number,
  target: number,
  delta: number,
  duration: number,
): number {
  if (!(duration > 0) || !Number.isFinite(duration)) return clamp01(target)

  const to = clamp01(target)
  const from = clamp01(current)
  const step = delta / duration

  // Overshoot is clamped against the TARGET, not against [0,1] — a large delta
  // (a backgrounded tab resuming) must land exactly on the target rather than
  // sailing past it and easing back next frame.
  //
  // The epsilon snap is what makes the resting state EXACT. Stepping by
  // delta/duration accumulates float error, so a panel that has travelled back
  // to "closed" can sit at 2.8e-17 forever: invisible on screen, but it makes
  // `progress === target` — the cheapest possible idle check — permanently
  // false. 1e-6 is far below anything the eye or the uniform can resolve, and
  // far above the noise.
  const next = to > from ? Math.min(from + step, to) : Math.max(from - step, to)
  return Math.abs(next - to) < SNAP_EPSILON ? to : next
}

/**
 * Smoothstep. Symmetric about 0.5, so a reversal decelerates on the way back the
 * same way it accelerated on the way out — an asymmetric ease (easeOutCubic,
 * which the entrance animation uses) reads as a stumble when it is reversed
 * halfway.
 */
export function easeExpansion(progress: number): number {
  const t = clamp01(progress)
  return t * t * (3 - 2 * t)
}

function clamp01(value: number): number {
  // Number.isFinite first: NaN fails every comparison, so a bare
  // Math.min/Math.max pair would propagate it straight into the uniform.
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}
