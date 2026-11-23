/**
 * The brand satellites of the Conócenos sky stop: one satellite per brand,
 * crossing the free sky along a few fixed lanes, so two or three brands are
 * always in view (plan 029b §2.4).
 *
 * The ambient passes (`skyPasses.ts`) are random laps of the whole sky, and a
 * panel that waited for one to cross the stop's free sky found it a third of
 * the time at best (simulated on 2026-11-17: a logo on screen 35 % of the time
 * on a desktop, 27 % on a phone). Here the lanes are drawn in the stop's own
 * frame, edge to edge of the sky the plate leaves free, and the crossings are
 * a timetable, so where every brand is at every second is known.
 *
 * Pure and stateless, like the passes: no `three`, directions are unit vectors
 * in the world's frame, +Y up, and a crossing is a function of time.
 *
 * ## The timetable
 *
 * Crossing `k` carries brand `k mod brands` along lane `k mod lanes`, starting
 * at `k · interval` and taking `CROSS_SECONDS`. The interval spreads
 * `AT_ONCE` crossings over one, so two or three are under way at any time,
 * and the brands take strict turns. With fewer brands than that, the interval
 * stretches so a brand is never asked to be in two places at once.
 *
 * ## A lane is a great circle
 *
 * Between two directions, the shorter arc of their great circle: on screen, a
 * straight line, the look of the ambient passes. Its two ends sit just outside
 * the free sky; the crossing fades in and out over its first and last tenth,
 * and like a pass it shows only where the sky is dark (`VISIBLE_FROM`).
 */

import { VISIBLE_FROM, VISIBLE_FULL, type Direction, type SkyPass } from './skyPasses';

/** Seconds for one crossing of a lane: slow, like the passes, and long enough to read a name. */
export const CROSS_SECONDS = 11;
/** Crossings under way at once, on average: two or three brands in view. */
export const AT_ONCE = 2.5;
/** Share of a crossing at each end over which it fades in and out. */
export const CROSS_FADE = 0.1;

export interface BrandLane {
  readonly from: Direction;
  readonly to: Direction;
}

export interface BrandCrossings {
  /** One per brand, in the brands' order: where its satellite is, and how visible. */
  readonly passes: readonly SkyPass[];
  /** Seconds between two crossings' starts. */
  readonly interval: number;
}

const smoothstep = (from: number, to: number, x: number): number => {
  const t = Math.min(1, Math.max(0, (x - from) / (to - from)));
  return t * t * (3 - 2 * t);
};

/** Where along `lane` a crossing is at `s` (0..1): the arc's interpolation, as a unit vector. */
export function alongLane(lane: BrandLane, s: number): Direction {
  const [ax, ay, az] = lane.from;
  const [bx, by, bz] = lane.to;
  const omega = Math.acos(Math.min(1, Math.max(-1, ax * bx + ay * by + az * bz)));
  if (omega < 1e-6) return lane.from;
  const k = Math.sin(omega);
  const wa = Math.sin((1 - s) * omega) / k;
  const wb = Math.sin(s * omega) / k;
  const x = ax * wa + bx * wb;
  const y = ay * wa + by * wb;
  const z = az * wa + bz * wb;
  const length = Math.hypot(x, y, z);
  return [x / length, y / length, z / length];
}

export function createBrandCrossings(lanes: readonly BrandLane[], brands: number): BrandCrossings {
  const interval = CROSS_SECONDS / Math.min(AT_ONCE, Math.max(1, brands));
  const period = brands * interval;

  const passes = Array.from({ length: brands }, (_, brand): SkyPass => {
    /** The crossing this brand is on at `t`, and how far along it; null between two of its crossings. */
    const crossingAt = (t: number): { lane: BrandLane; s: number } | null => {
      if (lanes.length === 0) return null;
      const turn = Math.floor((t - brand * interval) / period);
      const k = brand + turn * brands;
      const s = (t - k * interval) / CROSS_SECONDS;
      if (s < 0 || s > 1) return null;
      return { lane: lanes[((k % lanes.length) + lanes.length) % lanes.length]!, s };
    };

    const direction = (t: number): Direction => {
      const crossing = crossingAt(t);
      // Off its lane, under the horizon: never drawn, never seen.
      return crossing ? alongLane(crossing.lane, crossing.s) : [0, -1, 0];
    };

    return {
      direction,
      alpha(t) {
        const crossing = crossingAt(t);
        if (!crossing) return 0;
        const { s } = crossing;
        const ends = smoothstep(0, CROSS_FADE, s) * (1 - smoothstep(1 - CROSS_FADE, 1, s));
        return ends * smoothstep(VISIBLE_FROM, VISIBLE_FULL, alongLane(crossing.lane, s)[1]);
      },
    };
  });

  return { passes, interval };
}
