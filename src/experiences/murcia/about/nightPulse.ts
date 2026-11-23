import { isotypeGlowAt, PULSE_REACH, pulseAt } from '../sky/skyPulse';

/**
 * The pulse that brings the city's night (plan 029b §3 E): the sky stop's
 * ring, laid on the ground. It leaves the tower and runs out across the city,
 * with the night inside it and the day outside, and the rooftop isotype
 * flashes as it leaves, settling to the ember it keeps through the night.
 *
 * The same clock and curve as the sky's (`sky/skyPulse.ts`), so the two stops
 * speak one language; only the measure changes, from radians to a share of
 * the reach along the ground — from the tower to past the farthest corner of
 * the city stop's frame, as the sky's runs past the farthest corner of its
 * own. Pure, like the sky's: every value is a function of the seconds since
 * the ring left.
 */

/**
 * Seconds before the flight to the city lands that the ring leaves: 0.8 s
 * into the 1.4 s flight, with the camera most of its way back and the city in
 * frame, and 0.2 s before the pen of the isotype starts (`DRAW_LEAD`), so the
 * night comes first and the V is drawn into it. A reduced-motion cut lands at
 * once, and the ring leaves with it.
 */
export const NIGHT_PULSE_LEAD = 0.6;

/** The front's soft edge, as a share of the reach: the night comes in over it. */
export const NIGHT_EDGE = 0.04;

export interface NightPulseFrame {
  /** The share of the reach the front has crossed, 0..1; negative before it leaves. */
  readonly front: number;
  /** The ring's light, 0..1, as the sky's. */
  readonly glow: number;
  /** `front`, from 0: what lays the night on the fog, the horizon and the river. */
  readonly coverage: number;
  /** The front has run out: the whole city is in the night. */
  readonly done: boolean;
  /** The rooftop isotype's `emissiveIntensity`: the flash as the ring leaves, then the ember. */
  readonly isotypeGlow: number;
}

/** The ring `seconds` after it left; negative seconds are before. */
export function nightPulseAt(seconds: number): NightPulseFrame {
  const sky = pulseAt(seconds);
  const front = seconds < 0 ? -1 : sky.done ? 1 : sky.front / PULSE_REACH;
  return {
    front,
    glow: sky.glow,
    coverage: Math.max(0, front),
    done: sky.done,
    isotypeGlow: isotypeGlowAt(seconds),
  };
}

/** How far into the night a point at `share` of the reach from the tower is, 0..1: the shader's reveal. */
export function nightRevealedAt(pulse: NightPulseFrame, share: number): number {
  if (pulse.done) return 1;
  const t = Math.min(1, Math.max(0, (pulse.front - share) / NIGHT_EDGE));
  return t * t * (3 - 2 * t);
}
