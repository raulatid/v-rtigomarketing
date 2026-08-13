import { describe, it, expect } from 'vitest'
import { layoutStages } from './stageLayout'
import { DEFAULT_DRAW_CONFIG, DRAW_SHAPE } from './drawConfig'
import { DEPTH_VERTICES } from './isotype'

// The stage table was arithmetic trapped inside createIntroDraw, which builds an
// SVG — so it could only be reached by running the animation, and playhead.test
// asserted against a hand-copied version of it instead. These are the properties
// that copy could not check, because it WAS the thing being checked.

const ORDER = ['dot', 'dotMove', 'drawV', 'arcHop', 'drawArc', 'isoBack', 'depth', 'collapse']

describe('layoutStages', () => {
  const layout = layoutStages(DEFAULT_DRAW_CONFIG)

  it('lays every stage out in authoring order', () => {
    expect(Object.keys(layout.stages)).toEqual(ORDER)
  })

  it('leaves no gap between consecutive stages', () => {
    for (let i = 1; i < ORDER.length; i++) {
      const prev = layout.stages[ORDER[i - 1]]
      const next = layout.stages[ORDER[i]]
      // Equal, or earlier where an overlap was asked for. A gap would be a
      // frozen drawing: the playhead advances through a stretch that no stage
      // is responsible for rendering.
      expect(next.start).toBeLessThanOrEqual(prev.end + 1e-12)
    }
  })

  it('gives every stage a positive extent', () => {
    // `local()` divides by (end - start); a zero-width stage is a division by
    // zero that surfaces as NaN transforms rather than as an error.
    for (const name of ORDER) {
      const s = layout.stages[name]
      expect(s.end).toBeGreaterThan(s.start)
    }
  })

  it('starts at zero and stops short of 1, leaving the fill its share', () => {
    expect(layout.stages.dot.start).toBe(0)
    expect(layout.stages.collapse.end).toBeCloseTo(layout.ceiling, 12)
    expect(layout.ceiling).toBeLessThan(1)
    expect(layout.ceiling).toBeGreaterThan(0)
  })

  it('derives the zone boundaries from the stages that define them', () => {
    expect(layout.zoneAEnd).toBe(layout.stages.dotMove.end)
    expect(layout.preReadyLimit).toBe(layout.stages.collapse.start)
    expect(layout.zoneAEnd).toBeLessThan(layout.preReadyLimit)
  })

  it('starts the depth edges before the back outlines finish', () => {
    // GSAP '-=0.15'. The only overlap in the table, and the reason `start` is
    // Math.max(cursor - overlap, 0) rather than just `cursor`.
    expect(DRAW_SHAPE.depthOverlap).toBeGreaterThan(0)
    expect(layout.stages.depth.start).toBeLessThan(layout.stages.isoBack.end)
  })

  it('scales the depth stage with the number of depth edges', () => {
    // This is what the old hardcoded 0.82 silently encoded. Adding a tenth
    // depth vertex must move the layout — and now it does so visibly.
    const wider = layoutStages(DEFAULT_DRAW_CONFIG)
    const staggerSpan = DRAW_SHAPE.depthStagger * (DEPTH_VERTICES.length - 1)
    const authored = DEFAULT_DRAW_CONFIG.depthDuration + staggerSpan
    expect(wider.stages.depth.weight).toBeCloseTo(authored, 12)
  })

  it('is a pure function of the config, not of call order', () => {
    const a = layoutStages(DEFAULT_DRAW_CONFIG)
    const b = layoutStages(DEFAULT_DRAW_CONFIG)
    expect(b).toEqual(a)
  })

  it('moves the ceiling when the fill duration changes, and only then', () => {
    const longerFill = layoutStages({ ...DEFAULT_DRAW_CONFIG, fillDuration: 2 })
    expect(longerFill.ceiling).toBeLessThan(layout.ceiling)
    // Weights are relative, so a longer fill compresses the outline rather
    // than lengthening the whole — that is the property the ratios encode.
    expect(longerFill.stages.dot.weight).toBe(layout.stages.dot.weight)
    expect(longerFill.stages.collapse.end).toBeCloseTo(longerFill.ceiling, 12)
  })
})
