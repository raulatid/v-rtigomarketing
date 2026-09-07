// The invitation — one satellite breathing brighter and slightly larger so the
// overview says "these are clickable" — as pure functions.
//
// ONE PULSE, THREE SURFACES. The field's halo and emitter line, the projection
// cone and the satellite's own scale all take the same value each frame. The
// breath used to live inside the field's shader, computed from its clock; the
// moment a second surface needed it, keeping two copies of the formula in step
// was the fragile part, so the clock is read once here and the shaders only
// receive the result. Extracted for the reason panelExpansion.ts is: it is
// reachable in Node without a WebGL context.

import { ORBIT_CONFIG } from './orbitConfig'

/** Angular rate of the breath, shared with the emitter line's own shimmer. */
const BREATH_RATE = 1.4

/**
 * How strongly the invitation shows this frame, in [0, 1].
 *
 * `invite` is the eased on/off from createHoloPanel; `time` the panel's clock;
 * `breathing` false under reduced motion, where the pulse holds at its top
 * rather than oscillating. The floor of 0.6 keeps the invited satellite above
 * resting brightness at the bottom of every breath, so it never momentarily
 * looks like the other five.
 */
export function invitationPulse(invite: number, time: number, breathing: boolean): number {
  const level = clamp01(invite)
  if (level === 0) return 0
  if (!Number.isFinite(time)) return 0
  const breath = breathing ? 0.5 + 0.5 * Math.sin(time * BREATH_RATE) : 1
  return level * (0.6 + 0.4 * breath)
}

/**
 * The scale of the satellite's inner group this frame.
 *
 * `highlight` is the hover/selection STRENGTH, 0..1 — eased by the satellite
 * from the boolean the focus layer flips (see createSatellite.setHighlight).
 * At 1 the bump wins outright: it is the answer while the cursor is on the
 * satellite, and a bump that kept breathing underneath would wobble. Between,
 * the scale travels from wherever the breath has it to the bump, so a hover
 * arriving mid-breath grows from that size rather than snapping.
 *
 * It was a boolean until 2026-09-07, and the step it produced is what made a
 * synthetic hover impossible: the tutorial that auto-plays this state would
 * have popped. Widening it here is what lets the pointer and the tutorial share
 * ONE visual response.
 *
 * `bumpScale` is where the bump lands — `satellite.highlightScale` for a real
 * hover, `satellite.demoScale` while the tutorial is the one holding it. The
 * two curves are otherwise identical: the demonstration is the same response
 * carried further, which is what the client asked for, not a second animation.
 */
export function invitationScale(
  pulse: number,
  highlight: number,
  bumpScale?: number,
  cfg = ORBIT_CONFIG.satellite,
): number {
  const bump = Number.isFinite(bumpScale) ? (bumpScale as number) : cfg.highlightScale
  const rest = 1 + (cfg.inviteScale - 1) * clamp01(pulse)
  return rest + (bump - rest) * clamp01(highlight)
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0
  return value < 0 ? 0 : value > 1 ? 1 : value
}
