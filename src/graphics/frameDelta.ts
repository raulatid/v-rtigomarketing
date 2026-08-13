/**
 * The ceiling on a single frame's delta, in seconds.
 *
 * A backgrounded tab stops issuing animation frames. When it comes back, the
 * first delta is however long the user was away — seconds, or minutes — and
 * every integrator that multiplies by it takes one enormous step: the camera
 * teleports, an eased value snaps to its target, an accumulator jumps a whole
 * cycle. Clamping means a returning tab resumes rather than fast-forwards.
 *
 * 0.1s is two frames at 20fps: high enough that a genuinely slow frame still
 * advances by its real duration, low enough that no visible motion can cross
 * a meaningful distance in one step.
 *
 * This value was written as a bare `0.1` in seven places and as a named
 * constant in two more. It is a policy, not an arithmetic detail — the reason
 * it exists is not visible from the literal, which is precisely why it kept
 * being copied without it.
 */
export const MAX_FRAME_DELTA = 0.1

/**
 * A frame delta, clamped to something an integrator can safely multiply by.
 *
 * Also clamps below at zero. A negative delta should be impossible from any
 * clock in this application, but the two call sites that already spelled this
 * out by hand (`CameraFlight`, `DragPanController`) both guarded for it, and a
 * negative step run backwards through an easing curve is a far stranger failure
 * to debug than a dropped frame.
 */
export function clampFrameDelta(delta: number): number {
  return Math.min(Math.max(delta, 0), MAX_FRAME_DELTA)
}
