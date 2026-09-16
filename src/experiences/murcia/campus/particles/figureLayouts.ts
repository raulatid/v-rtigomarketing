import type { FigureKind } from '../content/servicesContent';
import { placeOnPlane, type PlaneFrame, type TargetLayout } from './layouts';
import type { MaskSample } from './maskSampling';

/** Conceptual diagrams, without axes or numerical claims. Each particle keeps
 * three seeded random coordinates across frames, so fine lines do not flicker. */
export interface FigureMotion { speed: number; amplitude: number }
type Point = readonly [number, number];
type Shape = (order: number, a: number, b: number, c: number, t: number, m: FigureMotion) => Point;
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const travel = (t: number, rate: number, m: FigureMotion): number => t * rate * m.speed * m.amplitude;
const line = (from: Point, to: Point, s: number): Point =>
  [from[0] + (to[0] - from[0]) * s, from[1] + (to[1] - from[1]) * s];
const ring = (x: number, y: number, rx: number, ry: number, angle: number): Point =>
  [x + Math.cos(angle) * rx, y + Math.sin(angle) * ry];

// SEO: layered growth trajectories with a cross-linked technical foundation.
const compound: Shape = (order, a, b, c, t, m) => {
  const layer = Math.floor(a * 5);
  const depth = layer * 0.028;
  const s = fract(order + travel(t, 0.025, m));
  const curve = (x: number): Point => [-0.42 + x * 0.76 + depth, -0.34 + 0.59 * x * x + depth];
  if (c < 0.65) {
    const [x, y] = curve(s);
    return [x, y + (b - 0.5) * 0.008];
  }
  const step = Math.floor(order * 13) / 12;
  const top = curve(step);
  if (c < 0.86) return line([top[0], -0.36 + depth], top, b);
  return line(curve(step), [top[0] + 0.112 - depth, top[1] + 0.112 - depth], b);
};

// Paid campaigns: six wireframe columns, stacked allocations and a response curve.
const HEIGHTS = [0.25, 0.42, 0.31, 0.58, 0.46, 0.68];
const segments: Shape = (order, a, b, c, t, m) => {
  const i = Math.min(5, Math.floor(order * 6));
  const x = -0.43 + i * 0.145;
  const h = HEIGHTS[i]! * (1 + 0.025 * m.amplitude * Math.sin(t * m.speed * 0.5 + i));
  const w = 0.075, dx = 0.035, dy = 0.035, floor = -0.34;
  if (c < 0.48) {
    const corner = Math.floor(a * 4);
    return [x + (corner % 2) * w + (corner >= 2 ? dx : 0), floor + b * h + (corner >= 2 ? dy : 0)];
  }
  if (c < 0.85) {
    const y = floor + Math.floor(a * 4) / 3 * h;
    const edge = Math.floor(b * 4);
    const corners: Point[] = [[x,y],[x+w,y],[x+w+dx,y+dy],[x+dx,y+dy]];
    return line(corners[edge]!, corners[(edge+1)%4]!, fract(b*4));
  }
  const s = fract(order + travel(t, 0.04, m));
  return [-0.43 + s * 0.8, -0.08 + 0.46 * s + 0.045 * Math.sin(s * TAU) + (a-0.5)*0.009];
};

// Analytics: five elliptical funnel stages, meridians and a branching exit stream.
const funnel: Shape = (order, a, b, c, t, m) => {
  const stage = Math.min(4, Math.floor(a * 5));
  const radius = (s: number): number => 0.39 * (1 - s * 0.73);
  if (c < 0.52) {
    const s = stage / 4;
    return ring(0, 0.30 - s * 0.65, radius(s), radius(s)*0.26, order*TAU);
  }
  const s = fract(order + travel(t, 0.045, m));
  if (c < 0.88) {
    const angle = Math.floor(a * 18) / 18 * TAU;
    return ring(0, 0.30 - s*0.65, radius(s), radius(s)*0.26, angle + (b-0.5)*0.018);
  }
  return [0.23 + s*0.20, -0.015 - s*s*0.32 + (b-0.5)*0.012];
};

// Content: interconnected topic clusters feeding a shared editorial destination.
const NODES: readonly Point[] = [[-0.38,0.22],[-0.38,-0.2],[-0.15,0.36],[-0.13,0.03],[-0.13,-0.34],[0.14,0.23],[0.14,-0.16],[0.39,0.04]];
const EDGES = [[0,2],[0,3],[1,3],[1,4],[2,5],[3,5],[3,6],[4,6],[5,7],[6,7],[2,3],[3,4]] as const;
const path: Shape = (order, a, b, c, t, m) => {
  if (c < 0.4) {
    const i = Math.min(NODES.length-1, Math.floor(a*NODES.length));
    const node = NODES[i]!;
    const r = (i === 7 ? 0.067 : 0.032) + (b-0.5)*0.006;
    return ring(node[0],node[1],r,r,order*TAU);
  }
  const edge = EDGES[Math.min(EDGES.length-1,Math.floor(a*EDGES.length))]!;
  const s = fract(order + travel(t, 0.055, m));
  const [x,y] = line(NODES[edge[0]]!,NODES[edge[1]]!,s);
  return [x, y + Math.sin(s*Math.PI)*0.032 + (b-0.5)*0.006];
};

// Brand: a central mark with six consistent satellites and a woven identity lattice.
function repeatLayout(symbol: readonly MaskSample[], frame: PlaneFrame, time: number, motion: FigureMotion): TargetLayout {
  const phase = travel(time, 0.035, motion);
  return (index, count, random, out, order) => {
    const sample = symbol[index];
    if (!sample || symbol.length < count) throw new Error('[service-campus] too few samples for the field');
    const a = random(), b = random(), c = random();
    let u: number, v: number;
    if (c < 0.50) {
      const central = c < 0.2;
      const angle = Math.floor(a*6)/6*TAU;
      const scale = central ? 0.34 : 0.13;
      u = (central ? 0 : Math.cos(angle)*0.33) + sample[0]*scale;
      v = (central ? 0 : Math.sin(angle)*0.33) + sample[1]*scale;
    } else {
      const angle = order*TAU + phase;
      const radius = c < 0.78 ? 0.23 + Math.floor(a*3)*0.018 : 0.37 + 0.045*Math.cos(angle*6);
      u = Math.cos(angle)*radius;
      v = Math.sin(angle)*radius + (b-0.5)*0.005;
    }
    placeOnPlane(frame,u,v,out);
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
