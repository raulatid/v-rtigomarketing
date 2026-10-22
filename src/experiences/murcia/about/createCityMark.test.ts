import { describe, expect, it } from 'vitest'
import { MARK_DRAW_SECONDS, MARK_STAGES, markDrawingAt } from './createCityMark'

// The drawing's choreography is the intro's order, as a function of time: the
// canvas and the shader are judged by eye, the order by this.

describe('the isotype drawn over the city', () => {
  it('starts from an empty page and ends as the fill alone', () => {
    expect(markDrawingAt(0)).toEqual({ dot: 0, move: 0, v: 0, hop: 0, arc: 0, fill: 0 })
    expect(markDrawingAt(MARK_DRAW_SECONDS)).toEqual({ dot: 1, move: 1, v: 1, hop: 1, arc: 1, fill: 1 })
  })

  it('traces the V before the arc, and fills only once both are drawn', () => {
    const halfwayV = markDrawingAt((MARK_STAGES.v[0] + MARK_STAGES.v[1]) / 2)
    expect(halfwayV.v).toBeGreaterThan(0)
    expect(halfwayV.v).toBeLessThan(1)
    expect(halfwayV.arc).toBe(0)
    const halfwayArc = markDrawingAt((MARK_STAGES.arc[0] + MARK_STAGES.arc[1]) / 2)
    expect(halfwayArc.v).toBe(1)
    expect(halfwayArc.arc).toBeGreaterThan(0)
    expect(halfwayArc.fill).toBe(0)
  })

  it('holds still before the pen starts and after it lifts', () => {
    expect(markDrawingAt(-1)).toEqual(markDrawingAt(0))
    expect(markDrawingAt(MARK_DRAW_SECONDS + 5)).toEqual(markDrawingAt(MARK_DRAW_SECONDS))
  })
})
