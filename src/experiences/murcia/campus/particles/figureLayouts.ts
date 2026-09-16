import type { FigureKind } from '../content/servicesContent';
import { placeInVolume, type PlaneFrame, type TargetLayout } from './layouts';
import type { MaskSample } from './maskSampling';

/** Open three-dimensional diagrams, sampled along structural edges and shells.
 * Three seeded random draws per particle keep membership stable across frames.
 * The shared 4,000-point field supplies every figure; no interior fill is needed. */
export interface FigureMotion { speed: number; amplitude: number }
type Point = readonly [number, number, number];
type Shape = (order: number, a: number, b: number, c: number, t: number, m: FigureMotion) => Point;
const TAU = Math.PI * 2;
const fract = (x: number): number => x - Math.floor(x);
const travel = (t: number, rate: number, m: FigureMotion): number => t * rate * m.speed * m.amplitude;
const line = (from: Point, to: Point, s: number): Point => [
  from[0] + (to[0] - from[0]) * s,
  from[1] + (to[1] - from[1]) * s,
  from[2] + (to[2] - from[2]) * s,
];

// SEO: five rising ribs at different depths, joined by transverse supports.
const compound: Shape = (order, a, b, c, t, m) => {
  const layer = Math.floor(a * 5);
  const depth = -0.20 + layer * 0.10;
  const curve = (s: number, z: number): Point =>
    [-0.39 + s * 0.78, -0.33 + 0.62 * s * s + z * 0.12, z];
  if (c < 0.58) {
    const s = fract(order + travel(t, 0.025, m));
    const [x, y, z] = curve(s, depth);
    return [x, y + (b - 0.5) * 0.008, z];
  }
  const step = Math.floor(order * 11) / 10;
  const top = curve(step, depth);
  if (c < 0.80) return line([top[0], -0.35, depth], top, b);
  return line(curve(step, -0.20), curve(step, 0.20), b);
};

// Paid campaigns: two rows of three open prisms with allocation bands.
const HEIGHTS = [0.25, 0.42, 0.31, 0.58, 0.46, 0.68];
const segments: Shape = (order, a, b, c, t, m) => {
  const i = Math.min(5, Math.floor(order * 6));
  const x = -0.34 + (i % 3) * 0.26;
  const z = -0.23 + Math.floor(i / 3) * 0.32;
  const h = HEIGHTS[i]! * (1 + 0.025 * m.amplitude * Math.sin(t * m.speed * 0.5 + i));
  const w = 0.13, d = 0.14, floor = -0.34;
  if (c < 0.48) {
    const corner = Math.floor(a * 4);
    return [x + (corner % 2) * w, floor + b * h, z + Math.floor(corner / 2) * d];
  }
  if (c < 0.85) {
    const y = floor + Math.floor(a * 4) / 3 * h;
    const edge = Math.floor(b * 4);
    const corners: Point[] = [[x,y,z],[x+w,y,z],[x+w,y,z+d],[x,y,z+d]];
    return line(corners[edge]!, corners[(edge+1)%4]!, fract(b*4));
  }
  const s = fract(order + travel(t, 0.04, m));
  const row = Math.floor(a * 2);
  return [-0.34 + s * 0.65, -0.06 + 0.43 * s + 0.035 * Math.sin(s * TAU), -0.16 + row * 0.32 + (b-0.5)*0.008];
};

// Analytics: circular funnel stages with meridians and a radial exit stream.
const funnel: Shape = (order, a, b, c, t, m) => {
  const radius = (s: number): number => 0.38 * (1 - s * 0.73);
  const shell = (s: number, angle: number): Point =>
    [Math.cos(angle) * radius(s), 0.30 - s * 0.65, Math.sin(angle) * radius(s)];
  if (c < 0.52) return shell(Math.floor(a * 5) / 4, order * TAU);
  const s = fract(order + travel(t, 0.045, m));
  if (c < 0.88) return shell(s, Math.floor(a * 16) / 16 * TAU + (b-0.5)*0.018);
  const angle = -0.4 + a * 0.8;
  const r = 0.24 + s * 0.20;
  return [Math.cos(angle)*r, -0.015 - s*s*0.32 + (b-0.5)*0.008, Math.sin(angle)*r];
};

// Content: spherical topic nodes linked across alternating depth layers.
const NODES: readonly Point[] = [
  [-0.33,0.22,-0.17],[-0.33,-0.2,0.17],[-0.13,0.34,0.20],[-0.11,0.03,-0.22],
  [-0.13,-0.32,-0.08],[0.14,0.23,-0.14],[0.14,-0.16,0.22],[0.35,0.04,0],
];
const EDGES = [[0,2],[0,3],[1,3],[1,4],[2,5],[3,5],[3,6],[4,6],[5,7],[6,7],[2,3],[3,4]] as const;
const path: Shape = (order, a, b, c, t, m) => {
  if (c < 0.4) {
    const i = Math.min(NODES.length-1, Math.floor(a*NODES.length));
    const node = NODES[i]!;
    const r = i === 7 ? 0.065 : 0.036;
    const vertical = 2*b-1;
    const horizontal = Math.sqrt(1-vertical*vertical);
    return [node[0]+Math.cos(order*TAU)*horizontal*r, node[1]+vertical*r, node[2]+Math.sin(order*TAU)*horizontal*r];
  }
  const edge = EDGES[Math.min(EDGES.length-1,Math.floor(a*EDGES.length))]!;
  const s = fract(order + travel(t, 0.055, m));
  const [x,y,z] = line(NODES[edge[0]]!,NODES[edge[1]]!,s);
  return [x, y + Math.sin(s*Math.PI)*0.032, z + (b-0.5)*0.006];
};

// Brand: a thick central mark, six satellite marks and three inclined orbits.
function repeatLayout(symbol: readonly MaskSample[], frame: PlaneFrame, time: number, motion: FigureMotion): TargetLayout {
  const phase = travel(time, 0.035, motion);
  return (index, count, random, out, order) => {
    const sample = symbol[index];
    if (!sample || symbol.length < count) throw new Error('[service-campus] too few samples for the field');
    const a = random(), b = random(), c = random();
    let u: number, v: number, depth: number;
    if (c < 0.55) {
      const central = c < 0.24;
      const satellite = Math.floor(a*6);
      const angle = satellite/6*TAU;
      const scale = central ? 0.34 : 0.13;
      u = (central ? 0 : Math.cos(angle)*0.30) + sample[0]*scale;
      v = (central ? 0 : Math.sin(angle)*0.30) + sample[1]*scale;
      depth = (central ? 0 : (satellite%2 === 0 ? -0.17 : 0.17)) + (b-0.5)*(central ? 0.12 : 0.05);
    } else {
      const angle = order*TAU + phase;
      const orbit = Math.floor(a*3);
      const tilt = [-0.9, 0, 0.9][orbit]!;
      const radius = 0.39 + (b-0.5)*0.008;
      u = Math.cos(angle)*radius;
      v = Math.sin(angle)*radius*Math.cos(tilt);
      depth = Math.sin(angle)*radius*Math.sin(tilt);
    }
    placeInVolume(frame,u,v,depth,out);
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
  return (index, count, random, out) => {
    const sample = samples[index];
    if (!sample || samples.length < count) throw new Error('[service-campus] too few samples for the field');
    const drift = 0.006 * amp;
    const u = sample[0] * breathe + drift * Math.sin(t * 1.1 + index * 0.73);
    const v = sample[1] * breathe + float + drift * Math.cos(t * 0.9 + index * 1.37);
    placeInVolume(frame, u, v, (random() - 0.5) * 0.07, out);
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
    const [u, v, depth] = shape(order, a, b, c, time, motion);
    placeInVolume(frame, u, v, depth, out);
  };
}
