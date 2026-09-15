import type { FigureKind } from '../content/servicesContent';
import { placeOnPlane, type PlaneFrame, type TargetLayout } from './layouts';
import type { MaskSample } from './maskSampling';

/**
 * A service's figure, alive: what its symbol turns into and holds.
 *
 * Each draws the one mechanism its service's copy argues in words, and the
 * plate names it underneath (`Service.figureCaption`):
 *
 *   compound  SEO           paid traffic stops with the spend; organic keeps accruing
 *   segments  paid          the segments that do not convert are cut, the rest grow
 *   funnel    analytics     every step loses people, and one loses most
 *   path      content       a few pieces, linked, leading somewhere
 *   repeat    brand         the symbol ten times, identical, moving as one
 *
 * Schematic, never data. No figure has a scale, a value or an axis to read one
 * from: there is no measured result behind the site yet (PRODUCT.md), and a
 * chart that looks like one would be a claim the client has to retract.
 *
 * Parametric rather than rasterised, so it can move. Each shape places a
 * particle from its `order` (which part of the figure it belongs to, so the
 * reveal still draws left to right) and from exactly THREE draws of `random`
 * (where inside that part). The random stream restarts on every fill, so
 * with the same number of draws per particle those three values are the
 * same every frame: a particle keeps its place in its bar while the bar
 * rises and falls. `repeat` takes its places from the symbol's samples instead,
 * and draws nothing.
 *
 * `motion.amplitude` 0 is the still figure. Every excursion scales with it, and
 * so does every flow along a path, so reduced motion keeps each shape and loses
 * only the movement.
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

type Shape = (order: number, a: number, b: number, c: number, t: number, m: FigureMotion) => [number, number];

const TAU = Math.PI * 2;

const BASELINE_V = -0.32;
const LEFT = -0.4;
const SPAN = 0.8;

const fract = (x: number): number => x - Math.floor(x);

/** How far something travelling along a path has gone. None when still. */
const travel = (t: number, rate: number, m: FigureMotion): number => t * rate * m.speed * m.amplitude;

/** A thin static baseline under the figure, drawn from the left. */
const baseline = (order: number, b: number): [number, number] => [
  LEFT + order * SPAN,
  BASELINE_V - 0.008 + b * 0.016,
];

/** A small disc of radius `r` round (x, y), filled evenly. */
function dot(x: number, y: number, r: number, a: number, b: number): [number, number] {
  const rr = r * Math.sqrt(a);
  return [x + Math.cos(b * TAU) * rr, y + Math.sin(b * TAU) * rr];
}

const cumulate = (weights: readonly number[]): number[] => {
  let sum = 0;
  return weights.map((weight) => (sum += weight));
};

/**
 * Which part `order` falls in, and where inside it (0..1), for parts sized by
 * `cumulative` weights. Weighting by size is what keeps a tall bar as dense as
 * a short one.
 */
function pick(order: number, cumulative: readonly number[]): [index: number, local: number] {
  const x = order * cumulative[cumulative.length - 1]!;
  let i = 0;
  while (i < cumulative.length - 1 && x >= cumulative[i]!) i += 1;
  const start = i === 0 ? 0 : cumulative[i - 1]!;
  return [i, Math.min(1, (x - start) / (cumulative[i]! - start))];
}

// ---- compound: SEO ----------------------------------------------------------

/** Where the paid spend stops, along the time axis 0..1. */
const SPEND_STOPS = 0.48;
const PAID_BEADS = 34;

/** Paid traffic: up while the spend runs, gone soon after it stops. */
function paidHeight(s: number): number {
  if (s <= SPEND_STOPS) {
    const rise = Math.min(1, s / 0.14);
    return 0.3 * (1 - (1 - rise) * (1 - rise));
  }
  return 0.02 + 0.28 * Math.exp(-(s - SPEND_STOPS) * 9);
}

/** Organic traffic: slow to start, and still climbing at the end. */
const organicHeight = (s: number): number => 0.03 + 0.6 * Math.pow(s, 2.1);

function compound(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  if (c < 0.05) return baseline(order, b);
  if (c < 0.09) {
    // The moment the spend stops: a dotted tick up from the baseline.
    const bead = Math.floor(a * 9);
    return dot(LEFT + SPEND_STOPS * SPAN, BASELINE_V + 0.03 + bead * 0.04, 0.008, b, (c - 0.05) / 0.04);
  }
  if (c < 0.36) {
    // Paid: a dotted line, still — it is what stops.
    const s = (Math.floor(order * PAID_BEADS) + 0.5) / PAID_BEADS;
    return dot(LEFT + s * SPAN, BASELINE_V + paidHeight(s), 0.009, a, b);
  }
  // Organic: a solid line whose particles keep travelling forward in time.
  const s = fract(order + travel(t, 0.035, m));
  return [LEFT + s * SPAN, BASELINE_V + organicHeight(s) + (a - 0.5) * 0.028];
}

// ---- segments: paid campaigns -----------------------------------------------

const SEGMENT_HEIGHTS = [0.5, 0.36, 0.62, 0.44, 0.36, 0.7];
/** The segments that did not convert. Their heights are where they stood. */
const SEGMENT_CUT = [false, true, false, false, true, false];
const SEGMENT_PHASE = [0, 0, 1.9, 3.3, 0, 4.8];
const SEGMENT_WIDTH = 0.1;
const SEGMENT_GAP = 0.035;
const SEGMENT_LEFT = -(SEGMENT_HEIGHTS.length * SEGMENT_WIDTH + (SEGMENT_HEIGHTS.length - 1) * SEGMENT_GAP) / 2;
const SEGMENT_STUB = 0.035;
const SEGMENT_OUTLINE_BEADS = 18;
/** A cut segment needs few particles: a stub and a dotted outline. */
const SEGMENT_WEIGHTS = cumulate(SEGMENT_HEIGHTS.map((height, i) => (SEGMENT_CUT[i] ? 0.16 : height)));

function segments(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  if (c < 0.05) return baseline(order, b);
  const [i, local] = pick(order, SEGMENT_WEIGHTS);
  const left = SEGMENT_LEFT + i * (SEGMENT_WIDTH + SEGMENT_GAP);
  const height = SEGMENT_HEIGHTS[i]!;
  if (!SEGMENT_CUT[i]) {
    // The ones that convert, breathing with the budget they now carry.
    const grown = height * (1 + 0.04 * m.amplitude * Math.sin(t * 0.45 * m.speed + SEGMENT_PHASE[i]!));
    return [left + a * SEGMENT_WIDTH, BASELINE_V + b * grown];
  }
  // Cut: a stub where it stands now, and dots round where it stood.
  if (c < 0.3) return [left + a * SEGMENT_WIDTH, BASELINE_V + b * SEGMENT_STUB];
  const rise = height - SEGMENT_STUB;
  const perimeter = 2 * rise + SEGMENT_WIDTH;
  const along = ((Math.floor(local * SEGMENT_OUTLINE_BEADS) + 0.5) / SEGMENT_OUTLINE_BEADS) * perimeter;
  const bottom = BASELINE_V + SEGMENT_STUB;
  let x: number;
  let y: number;
  if (along < rise) {
    x = left;
    y = bottom + along;
  } else if (along < rise + SEGMENT_WIDTH) {
    x = left + (along - rise);
    y = bottom + rise;
  } else {
    x = left + SEGMENT_WIDTH;
    y = bottom + rise - (along - rise - SEGMENT_WIDTH);
  }
  return dot(x, y, 0.007, a, b);
}

// ---- funnel: web analytics --------------------------------------------------

const STEP_HEIGHTS = [0.6, 0.48, 0.41, 0.17, 0.13];
/** The step after which most people leave. */
const LEAK_STEP = 2;
const STEP_WIDTH = 0.12;
const STEP_GAP = 0.045;
const STEP_LEFT = -(STEP_HEIGHTS.length * STEP_WIDTH + (STEP_HEIGHTS.length - 1) * STEP_GAP) / 2;
const STEP_WEIGHTS = cumulate(STEP_HEIGHTS);
/** Below the baseline, where the leaving stream runs out. */
const LEAK_FLOOR = -0.47;

function funnel(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  if (c < 0.05) return baseline(order, b);
  if (c < 0.17) {
    // Leaving: a stream falling through the gap after the step that loses most,
    // from that step's height to below the baseline.
    const x = STEP_LEFT + LEAK_STEP * (STEP_WIDTH + STEP_GAP) + STEP_WIDTH + STEP_GAP / 2;
    const top = BASELINE_V + STEP_HEIGHTS[LEAK_STEP]!;
    const p = fract((c - 0.05) / 0.12 + travel(t, 0.3, m));
    return [x + (a - 0.5) * 0.014, top - p * (top - LEAK_FLOOR)];
  }
  const [i] = pick(order, STEP_WEIGHTS);
  const left = STEP_LEFT + i * (STEP_WIDTH + STEP_GAP);
  const height = STEP_HEIGHTS[i]! * (1 + 0.02 * m.amplitude * Math.sin(t * 0.4 * m.speed + i * 1.3));
  return [left + a * STEP_WIDTH, BASELINE_V + b * height];
}

// ---- path: content strategy -------------------------------------------------

/** Few pieces, each in its place, climbing toward the goal. */
const PIECES: readonly (readonly [number, number])[] = [
  [-0.36, -0.26],
  [-0.18, -0.08],
  [0, -0.15],
  [0.17, 0.06],
];
const GOAL: readonly [number, number] = [0.34, 0.24];
const GOAL_RADIUS = 0.07;
/** Where the route meets the goal's ring, rather than its centre. */
const GOAL_ENTRY: readonly [number, number] = (() => {
  const [px, py] = PIECES[PIECES.length - 1]!;
  const dx = GOAL[0] - px;
  const dy = GOAL[1] - py;
  const length = Math.hypot(dx, dy);
  return [GOAL[0] - (dx / length) * GOAL_RADIUS, GOAL[1] - (dy / length) * GOAL_RADIUS];
})();
const ROUTE = [...PIECES, GOAL_ENTRY];
const ROUTE_LENGTHS = cumulate(
  ROUTE.slice(1).map((point, i) => Math.hypot(point[0] - ROUTE[i]![0], point[1] - ROUTE[i]![1])),
);

function alongRoute(s: number): [number, number] {
  const [i, local] = pick(s, ROUTE_LENGTHS);
  const from = ROUTE[i]!;
  const to = ROUTE[i + 1]!;
  return [from[0] + (to[0] - from[0]) * local, from[1] + (to[1] - from[1]) * local];
}

function path(order: number, a: number, b: number, c: number, t: number, m: FigureMotion): [number, number] {
  if (c < 0.32) {
    const i = Math.min(PIECES.length - 1, Math.floor(order * PIECES.length));
    const [x, y] = PIECES[i]!;
    const r = 0.038 * (1 + 0.06 * m.amplitude * Math.sin(t * 0.6 * m.speed + i * 1.7));
    return dot(x, y, r, a, b);
  }
  if (c < 0.48) {
    // Where it leads: a ring.
    const angle = order * TAU;
    const r = GOAL_RADIUS + (a - 0.5) * 0.02;
    return [GOAL[0] + Math.cos(angle) * r, GOAL[1] + Math.sin(angle) * r];
  }
  // The links, travelling from piece to piece toward the goal.
  const [x, y] = alongRoute(fract(order + travel(t, 0.05, m)));
  return [x + (a - 0.5) * 0.012, y + (b - 0.5) * 0.012];
}

// ---- repeat: brand identity -------------------------------------------------

const COPIES_PER_ROW = 5;
const COPY_ROWS = [0.11, -0.15];
const COPY_STEP = 0.16;
/** Of the symbol's own square. At 0.15 a full-bleed symbol still clears its neighbour. */
const COPY_SCALE = 0.15;

/**
 * The symbol ten times, first to tenth in reading order, and all ten moving as
 * one: consistency is the claim, so they breathe and float in unison.
 * Particle `index` takes sample `index`, like the symbol it came from, and its
 * `order` picks the copy, so the copies form one after another.
 */
function repeatLayout(
  symbol: readonly MaskSample[],
  frame: PlaneFrame,
  time: number,
  motion: FigureMotion,
): TargetLayout {
  const t = time * motion.speed;
  const breathe = 1 + 0.05 * motion.amplitude * Math.sin(t * 0.6);
  const float = 0.012 * motion.amplitude * Math.sin(t * 0.4);
  const copies = COPIES_PER_ROW * COPY_ROWS.length;
  return (index, count, _random, out, order) => {
    const sample = symbol[index];
    if (!sample || symbol.length < count) throw new Error('[service-campus] too few samples for the field');
    const copy = Math.min(copies - 1, Math.floor(order * copies));
    const column = copy % COPIES_PER_ROW;
    const row = Math.floor(copy / COPIES_PER_ROW);
    const u = (column - (COPIES_PER_ROW - 1) / 2) * COPY_STEP + sample[0] * COPY_SCALE * breathe;
    const v = COPY_ROWS[row]! + float + sample[1] * COPY_SCALE * breathe;
    placeOnPlane(frame, u, v, out);
  };
}

const FIGURES: Record<Exclude<FigureKind, 'repeat'>, Shape> = { compound, segments, funnel, path };

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

/**
 * The figure `kind` on `frame`, `time` seconds after it began forming. `symbol`
 * is the service's sampled symbol, which `repeat` is made of and the others
 * ignore.
 */
export function figureLayout(
  kind: FigureKind,
  frame: PlaneFrame,
  time: number,
  motion: FigureMotion,
  symbol?: readonly MaskSample[],
): TargetLayout {
  if (kind === 'repeat') {
    if (!symbol) throw new Error('[service-campus] the repeat figure is made of its symbol, and got none');
    return repeatLayout(symbol, frame, time, motion);
  }
  const shape = FIGURES[kind];
  return (_index, _count, random, out, order) => {
    const a = random();
    const b = random();
    const c = random();
    const [u, v] = shape(order, a, b, c, time, motion);
    placeOnPlane(frame, u, v, out);
  };
}
