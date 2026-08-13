import { DRAW_SHAPE, type DrawConfig } from './drawConfig'
import { DEPTH_VERTICES } from './isotype'

// Where the drawing's stages sit on the playhead, as pure arithmetic.
//
// Lifted out of createIntroDraw for the same reason playhead.ts was lifted out
// before it: it was arithmetic buried inside a 469-line closure that builds an
// SVG, so the only way to reach it was to run the animation, and the only way
// to assert on it was to copy the numbers.
//
// playhead.test.ts DID copy them — the stage weights, the fill duration, the
// depth overlap and all six governance limits, with a comment explaining that
// the real values needed a DOM. They never did: every input here comes from
// drawConfig.ts, which is pure. One of the copies encoded
// `DEPTH_VERTICES.length === 9` as the literal 0.82, so adding a tenth depth
// edge would have left the test passing against a layout the app no longer had.
//
// Stays inside src/intro-draw/ because that directory is a separate Rollup entry
// under a zero-import assertion (vite.config.ts). A sibling module is free; an
// import from src/utils would not be.

export interface Stage {
  name: string
  /** Authored duration, relative. See DrawConfig — these are ratios, not seconds. */
  weight: number
  /** How far this stage starts BEFORE the previous one ends. */
  overlap: number
  /** Normalised playhead position, already scaled by the ceiling. */
  start: number
  end: number
}

export interface StageLayout {
  stages: Record<string, Stage>
  /**
   * Where the outline ends and the fill begins: the outline's share of the
   * authored time, against the fill's literal duration.
   */
  ceiling: number
  /** Zone A ends when the dot reaches the first vertex. */
  zoneAEnd: number
  /** Zone C begins where the collapse does — the pre-ready hold. */
  preReadyLimit: number
}

/**
 * The stage table for a given config.
 *
 * Weights are RELATIVE. The draw's real duration is set by load progress (plan
 * 006 §2), so these only decide how the total is divided — which is why every
 * position below is normalised by the span rather than used as seconds.
 */
export function layoutStages(cfg: DrawConfig): StageLayout {
  const defs: Array<[string, number, number]> = [
    ['dot', cfg.dotDuration, 0],
    ['dotMove', cfg.dotMoveDuration, 0],
    ['drawV', cfg.drawDuration, 0],
    ['arcHop', DRAW_SHAPE.arcHopWeight, 0],
    ['drawArc', cfg.arcDrawDuration, 0],
    ['isoBack', cfg.isoDrawDuration + DRAW_SHAPE.isoStagger, 0],
    [
      'depth',
      cfg.depthDuration + DRAW_SHAPE.depthStagger * (DEPTH_VERTICES.length - 1),
      DRAW_SHAPE.depthOverlap,
    ],
    ['collapse', cfg.collapseDuration, 0],
  ]

  let cursor = 0
  const raw: Stage[] = defs.map(([name, weight, overlap]) => {
    const start = Math.max(cursor - overlap, 0)
    const end = start + weight
    cursor = end
    return { name, weight, overlap, start, end }
  })

  const span = cursor || 1
  // The outline owns `span` of authored time and the fill owns fillDuration;
  // the ceiling is the former's share of the two.
  const ceiling = span / (span + cfg.fillDuration)

  const stages: Record<string, Stage> = {}
  for (const s of raw) {
    stages[s.name] = {
      ...s,
      start: (s.start / span) * ceiling,
      end: (s.end / span) * ceiling,
    }
  }

  // Returned rather than assigned into a `let` the rest of the module reads:
  // the previous shape left `stages` possibly-unassigned, and `local()` would
  // have thrown if the call order had ever changed.
  return {
    stages,
    ceiling,
    zoneAEnd: stages.dotMove.end,
    preReadyLimit: stages.collapse.start,
  }
}
