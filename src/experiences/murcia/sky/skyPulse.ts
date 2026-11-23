/**
 * The pulse that reveals the Conócenos sky stop (plan 029b §2.3): a ring that
 * leaves the rooftop isotype and crosses the sky, with the night inside it and
 * the sky of always outside (decision R7, 2026-11-22), and the isotype lit as
 * it leaves, settling to an ember.
 *
 * Pure: every value is a function of the seconds since the ring left, so the
 * veil, the satellites, the panels and the isotype read one clock and agree.
 * Angles are radians from the direction of the isotype, as the eye sees it.
 */

/** Seconds the front takes to cross the sky. Under one second it read as a glow in a corner, not as a ring. */
export const PULSE_SECONDS = 1.6;
/**
 * Radians the front runs out to: past the farthest corner of the sky stop's
 * frame, seen from the isotype, on every layout (`skyPulse.test.ts`), so
 * nothing is left behind the veil when it goes.
 */
export const PULSE_REACH = 1.3;
/** The front's curve: fast out of the isotype, braking as it reaches the edges. */
const FRONT_POWER = 1.7;
/** Radians behind the front over which a point of light or a panel comes in. */
export const REVEAL_EDGE = 0.1;
/**
 * Seconds before the flight lands that the ring leaves: 0.7 s into the 1.0 s
 * city→sky flight, with the camera at 99 % of its way (plan 029b §2.2). A
 * reduced-motion cut lands at once, so the ring leaves with it.
 */
export const PULSE_LEAD = 0.3;

/** The isotype's light, as `emissiveIntensity`: the flash as the ring leaves, and the ember it settles to. */
export const ISOTYPE_GLOW = { flash: 1.6, ember: 0.35 } as const;
/** Seconds the flash takes to fall, and the ember to come up under it. */
const FLASH_FALL = 0.9;
const EMBER_RISE = 0.4;

export interface PulseFrame {
  /** Radians from the isotype that the front has reached; negative before it leaves. */
  readonly front: number;
  /** The ring's light, 0..1: up as it leaves, gone as it reaches the edges. */
  readonly glow: number;
  /** The front has run out: everything is revealed, and the veil can go. */
  readonly done: boolean;
}

const clamp01 = (v: number): number => (v < 0 ? 0 : v > 1 ? 1 : v);
const smoothstep = (a: number, b: number, x: number): number => {
  const t = clamp01((x - a) / (b - a));
  return t * t * (3 - 2 * t);
};

/** The ring `seconds` after it left; negative seconds are before. */
export function pulseAt(seconds: number): PulseFrame {
  if (seconds < 0) return { front: -1, glow: 0, done: false };
  const u = clamp01(seconds / PULSE_SECONDS);
  return {
    front: PULSE_REACH * (1 - Math.pow(1 - u, FRONT_POWER)),
    glow: (1 - smoothstep(0.7, 1, u)) * smoothstep(0, 0.06, u),
    done: u >= 1,
  };
}

/** How revealed a direction `angle` radians from the isotype is, 0..1. */
export function revealedAt(pulse: PulseFrame, angle: number): number {
  return pulse.done ? 1 : smoothstep(0, REVEAL_EDGE, pulse.front - angle);
}

/** The isotype's `emissiveIntensity` `seconds` after the ring left. */
export function isotypeGlowAt(seconds: number): number {
  if (seconds < 0) return 0;
  return Math.max(
    ISOTYPE_GLOW.flash * (1 - smoothstep(0, FLASH_FALL, seconds)),
    ISOTYPE_GLOW.ember * smoothstep(0, EMBER_RISE, seconds),
  );
}
