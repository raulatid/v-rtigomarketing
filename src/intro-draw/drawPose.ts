// What the drawing looks like at one playhead position, with no DOM in it.
//
// Moved out of introDraw.ts's `apply()` so the SVG drawing and the worker's
// canvas (ADR 016 item 3) draw the same choreography from one table instead of
// two copies of it. Each renderer turns this into its own writes.

import { CENTER, FIRST_VERTEX, ARC_START, DEPTH_VERTICES } from './isotype'
import { DRAW_SHAPE, type DrawConfig } from './drawConfig'
import type { StageLayout } from './stageLayout'

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v)

// GSAP names on the left, since these ratios were tuned there: power1 is
// quadratic, power2 is cubic.
const quadOut = (t: number) => 1 - (1 - t) * (1 - t)
const quadInOut = (t: number) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2)
const cubicOut = (t: number) => 1 - Math.pow(1 - t, 3)
const cubicInOut = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2

// Local progress for item `index` inside a staggered group, given the group's
// own 0..1 progress.
function staggered(t: number, index: number, count: number, stagger: number, dur: number) {
  const span = dur + (count - 1) * stagger
  const start = (index * stagger) / span
  return clamp01((t - start) / (dur / span))
}

/** The two traced paths, as whatever sampler the renderer can build. */
export interface MarkPaths {
  v: { at(t: number): { x: number; y: number } }
  arc: { at(t: number): { x: number; y: number } }
}

/** Every stroke as the drawn fraction of its length, 0..1. */
export interface MarkPose {
  dot: { x: number; y: number; r: number; alpha: number }
  v: number
  arc: number
  /** The offset back outlines: V, then arc. */
  back: [number, number]
  /** One per DEPTH_VERTICES entry. */
  edges: number[]
  /** The front outlines fade as the fill arrives. */
  outlineOpacity: number
  /** The isometric construction: its opacity, and its collapse back to frontal. */
  iso: { opacity: number; x: number; y: number }
  fill: number
}

export function markPose(p: number, cfg: DrawConfig, layout: StageLayout, paths: MarkPaths): MarkPose {
  const local = (name: string) => {
    const s = layout.stages[name]
    return clamp01((p - s.start) / (s.end - s.start))
  }

  let dx = CENTER.x
  let dy = CENTER.y

  // STAGE 1 — the dot appears at centre.
  const tDot = cubicOut(local('dot'))
  const dotScale = DRAW_SHAPE.dotScaleFrom + (1 - DRAW_SHAPE.dotScaleFrom) * tDot

  // STAGE 2 — it travels to the V's first vertex.
  const tMove = cubicInOut(local('dotMove'))
  dx = CENTER.x + (FIRST_VERTEX[0] - CENTER.x) * tMove
  dy = CENTER.y + (FIRST_VERTEX[1] - CENTER.y) * tMove

  // STAGE 3 — the V is traced, the dot riding the stroke tip.
  const tV = quadInOut(local('drawV'))
  if (p > layout.stages.drawV.start) {
    const pt = paths.v.at(tV)
    dx = pt.x
    dy = pt.y
  }

  // STAGE 3b — hop to the arc, then trace it.
  const tHop = cubicInOut(local('arcHop'))
  if (p > layout.stages.arcHop.start) {
    const from = paths.v.at(1)
    dx = from.x + (ARC_START[0] - from.x) * tHop
    dy = from.y + (ARC_START[1] - from.y) * tHop
  }
  const tArc = quadInOut(local('drawArc'))
  if (p > layout.stages.drawArc.start) {
    const pt = paths.arc.at(tArc)
    dx = pt.x
    dy = pt.y
  }

  // STAGE 4 — the fake isometric construction.
  const tBack = local('isoBack')
  const back = [0, 1].map((i) =>
    quadInOut(staggered(tBack, i, 2, DRAW_SHAPE.isoStagger, cfg.isoDrawDuration)),
  ) as [number, number]

  const tDepth = local('depth')
  const edges = DEPTH_VERTICES.map((_, i) =>
    quadOut(staggered(tDepth, i, DEPTH_VERTICES.length, DRAW_SHAPE.depthStagger, cfg.depthDuration)),
  )

  // STAGE 5 — collapse back to the frontal view.
  const tCollapse = cubicInOut(local('collapse'))

  // STAGE 6 — the fill.
  //
  // INVARIANT (plan 007 Phase 10): the outline communicates ongoing work;
  // the fill communicates that the application is ready to transition.
  // Nothing but readiness may activate it — not elapsed time, not the
  // autonomous curve, not a timeout. The playhead cannot reach here without
  // readiness because Zone C is gated in playhead.ts.
  const tFill = cubicInOut(clamp01((p - layout.ceiling) / (1 - layout.ceiling)))

  return {
    dot: { x: dx, y: dy, r: 4 * dotScale, alpha: tDot * (1 - Math.min(tFill * 3, 1)) },
    v: tV,
    arc: tArc,
    back,
    edges,
    outlineOpacity: 1 - tFill,
    iso: {
      opacity: 1 - tCollapse,
      x: -cfg.isoOffset * tCollapse,
      y: cfg.isoOffset * DRAW_SHAPE.collapseYRatio * tCollapse,
    },
    fill: tFill,
  }
}

/** Where the back outlines sit relative to the front ones, before any collapse. */
export function isoOffset(cfg: DrawConfig): { x: number; y: number } {
  return { x: cfg.isoOffset, y: -cfg.isoOffset * DRAW_SHAPE.collapseYRatio }
}

/** Every depth edge is the same diagonal, so one length covers all nine. */
export function edgeLength(cfg: DrawConfig): number {
  return Math.hypot(cfg.isoOffset, cfg.isoOffset * DRAW_SHAPE.collapseYRatio)
}
