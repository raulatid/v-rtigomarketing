import type { FigureKind } from '../content/servicesContent';
import { placeOnPlane, type PlaneFrame, type TargetLayout } from './layouts';
import type { MaskSample } from './maskSampling';

/**
 * A service's figure, alive: the graph its symbol turns into and back from,
 * evaluated for a moment in time.
 *
 * Parametric rather than rasterised, so it can move. Each figure places a
 * particle from its `order` (which part of the figure it belongs to, so the
 * reveal still draws left to right) and from exactly THREE draws of `random`
 * (where inside that part). The random stream restarts on every fill, so
 * with the same number of draws per particle those three values are the
 * same every frame: a particle keeps its place in its bar while the bar
 * rises and falls.
 *
 * Everything is in the unit square, u and v in -0.5..0.5, then `frame` maps
 * it to the world like the masks.
 */

export interface FigureMotion {
  /** Multiplies every rate. 1 is the design speed. */
  speed: number;
  /** Multiplies every excursion. 1 is the design amplitude. */
  amplitude: number;
}

const TAU = Math.PI * 2;

const BASELINE_V = -0.32;

// ---- bars -------------------------------------------------------------------

const BAR_HEIGHTS = [0.24, 0.36, 0.3, 0.54, 0.7];
const BAR_SWING = [0.06, 0.08, 0.07, 0.1, 0.12];
const BAR_PHASE = [0, 1.7, 3.1, 4.4, 5.6];
const BAR_WIDTH = 0.12;
const BAR_GAP = 0.04;

function bars(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  // A thin static baseline under the bars.
  if (c < 0.05) return [-0.4 + a * 0.8, BASELINE_V - 0.008 + b * 0.016];
  const bar = Math.min(BAR_HEIGHTS.length - 1, Math.floor(order * BAR_HEIGHTS.length));
  const left = -0.4 + bar * (BAR_WIDTH + BAR_GAP);
  const height =
    BAR_HEIGHTS[bar]! + BAR_SWING[bar]! * m.amplitude * Math.sin(t * 0.45 * m.speed + BAR_PHASE[bar]!);
  return [left + a * BAR_WIDTH, BASELINE_V + b * height];
}

// ---- ring -------------------------------------------------------------------

const RING_INNER = 0.24;
const RING_BAND = 0.12;
const RING_GAPS = 3;

function ring(order: number, a: number, _b: number, _c: number, t: number, m: FigureMotion): [number, number] {
  let angle = order * TAU + t * 0.2 * m.speed;
  // Three gaps that widen and narrow. A particle inside one is pushed to the
  // nearer edge, so the segments stay separate while the ring turns.
  for (let k = 0; k < RING_GAPS; k += 1) {
    const centre = (k * TAU) / RING_GAPS;
    const half = 0.11 + 0.05 * m.amplitude * Math.sin(t * 0.3 * m.speed + k * 2.1);
    const d = ((angle - centre + Math.PI) % TAU + TAU) % TAU - Math.PI;
    if (Math.abs(d) < half) angle += Math.sign(d || 1) * (half - Math.abs(d));
  }
  const radius = RING_INNER + a * RING_BAND;
  return [Math.cos(angle) * radius, Math.sin(angle) * radius];
}

// ---- pins -------------------------------------------------------------------

const PIN_HOMES: readonly [number, number][] = [
  [-0.36, -0.12], [-0.26, 0.14], [-0.17, -0.2], [-0.08, 0.02], [0, 0.24],
  [0.08, -0.08], [0.16, 0.1], [0.24, -0.2], [0.32, 0.18], [0.38, -0.02],
];

function livePin(i: number, t: number, m: FigureMotion): [number, number] {
  const home = PIN_HOMES[i]!;
  return [
    home[0] + 0.03 * m.amplitude * Math.sin(t * 0.37 * m.speed + i * 1.3),
    home[1] + 0.025 * m.amplitude * Math.cos(t * 0.29 * m.speed + i * 2.1),
  ];
}

function pins(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  const n = PIN_HOMES.length;
  if (c < 0.35) {
    // A dot: a small disc round the live pin.
    const i = Math.min(n - 1, Math.floor(order * n));
    const [x, y] = livePin(i, t, m);
    const r = 0.03 * Math.sqrt(a);
    return [x + Math.cos(b * TAU) * r, y + Math.sin(b * TAU) * r];
  }
  // A link: a stable fraction of the way between two consecutive live pins.
  const link = Math.min(n - 2, Math.floor(order * (n - 1)));
  const [x0, y0] = livePin(link, t, m);
  const [x1, y1] = livePin(link + 1, t, m);
  return [x0 + (x1 - x0) * a, y0 + (y1 - y0) * a + (b - 0.5) * 0.008];
}

// ---- line -------------------------------------------------------------------

function line(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  if (c < 0.06) return [-0.4 + a * 0.8, BASELINE_V - 0.008 + b * 0.016];
  // The curve slides left, like live data, over a rising trend.
  const x = order + t * 0.12 * m.speed;
  const wobble =
    (0.06 * Math.sin(x * 7.3) + 0.09 * Math.sin(x * 3.1 + 1) + 0.05 * Math.sin(x * 13.7 + 2)) * m.amplitude;
  const u = -0.4 + order * 0.8;
  const v = -0.18 + order * 0.34 + wobble;
  // Thickness, and a few particles pushed out to bead the line.
  const thick = b < 0.1 ? 0.05 : 0.03;
  return [u, v + (a - 0.5) * thick];
}

const FIGURES: Record<
  FigureKind,
  (order: number, a: number, b: number, c: number, t: number, m: FigureMotion) => [number, number]
> = { bars, ring, pins, line };

/**
 * A service's symbol, alive: the sampled mask on `frame`, breathing and
 * floating as a whole while each particle drifts a little round its sample.
 * Particle `index` takes sample `index`, so `samples` must hold at least
 * `count` entries; the caller sampled with the field's count.
 * Small on purpose — it is the same symbol, not a figure. `motion` scales it
 * like the figures, so an amplitude of 0 is the still mask.
 */
export function iconMotionLayout(
  samples: readonly MaskSample[],
  frame: PlaneFrame,
  time: number,
  motion: FigureMotion,
): TargetLayout {
  const t = time * motion.speed;
  const amp = motion.amplitude;
  const breathe = 1 + 0.03 * amp * Math.sin(t * 0.6);
  const float = 0.02 * amp * Math.sin(t * 0.4);
  return (index, count, _random, out) => {
    const sample = samples[index];
    if (!sample || samples.length < count) throw new Error('[service-campus] too few samples for the field');
    const drift = 0.006 * amp;
    const u = sample[0] * breathe + drift * Math.sin(t * 1.1 + index * 0.73);
    const v = sample[1] * breathe + float + drift * Math.cos(t * 0.9 + index * 1.37);
    placeOnPlane(frame, u, v, out);
  };
}

/** The figure `kind` on `frame` at `time` seconds. */
export function figureLayout(
  kind: FigureKind,
  frame: PlaneFrame,
  time: number,
  motion: FigureMotion,
): TargetLayout {
  const shape = FIGURES[kind];
  return (_index, _count, random, out, order) => {
    const a = random();
    const b = random();
    const c = random();
    const [u, v] = shape(order, a, b, c, time, motion);
    placeOnPlane(frame, u, v, out);
  };
}
