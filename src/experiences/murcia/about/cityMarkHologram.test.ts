import { describe, expect, it } from 'vitest'
import { buildWalls, penOnOutline, pointAlong, SPIN_APPROACH, SPIN_RAMP, spinAngle, type Contour } from './cityMarkHologram'
import { MARK_DRAW_SECONDS, MARK_STAGES, markDrawingAt, markPlanePoint } from './createCityMark'

// The hologram's look is judged by eye; its geometry and the pen's path by this.

const square: Contour = [
  [0, 0],
  [1, 0],
  [1, 1],
  [0, 1],
]

describe("the city mark's hologram", () => {
  it('joins the back outline to the front one with a wall under every segment', () => {
    const geometry = buildWalls([square, square])
    expect(geometry.getAttribute('position').count).toBe(2 * 4 * 6)
    const depths = new Set(Array.from(geometry.getAttribute('position').array).filter((_, i) => i % 3 === 2))
    expect(depths).toEqual(new Set([0, 1]))
    const along = Array.from(geometry.getAttribute('aAlong').array)
    expect(Math.min(...along)).toBe(0)
    expect(Math.max(...along)).toBe(1)
    expect(new Set(geometry.getAttribute('aPath').array)).toEqual(new Set([0, 1]))
  })

  it('measures the pen along an outline by length, closing it', () => {
    expect(pointAlong(square, 0).toArray()).toEqual([0, 0])
    expect(pointAlong(square, 0.375).toArray()).toEqual([1, 0.5])
    expect(pointAlong(square, 1).toArray()).toEqual([0, 0])
  })

  it('rides the V, hops, then rides the arc, in the intro order', () => {
    const arc: Contour = square.map(([x, y]) => [x + 5, y])
    expect(penOnOutline(markDrawingAt(0), square, arc)).toBeNull()
    expect(penOnOutline(markDrawingAt(MARK_STAGES.v[0]), square, arc)?.toArray()).toEqual([0, 0])
    const hop = penOnOutline(markDrawingAt((MARK_STAGES.hop[0] + MARK_STAGES.hop[1]) / 2), square, arc)!
    expect(hop.x).toBeGreaterThan(0)
    expect(hop.x).toBeLessThan(5)
    expect(penOnOutline(markDrawingAt(MARK_DRAW_SECONDS), square, arc)?.toArray()).toEqual([5, 0])
  })

  it('lays the isotype in the plane the ground shader reads, top to the back', () => {
    const [u0, v0] = markPlanePoint(0, 0)
    const [u1, v1] = markPlanePoint(400, 400)
    expect(u0).toBeCloseTo(-0.5 + 24 / 1024)
    expect(u1).toBeCloseTo(0.5 - 24 / 1024)
    expect(v0).toBeGreaterThan(v1)
  })
})

describe("the hologram's turn", () => {
  it('faces the eye as the drawing ends, and keeps turning one way', () => {
    expect(spinAngle(MARK_DRAW_SECONDS, 0.6)).toBe(0)
    expect(spinAngle(0, 0.6)).toBeLessThan(0)
    expect(spinAngle(MARK_DRAW_SECONDS + 1, 0.6)).toBeGreaterThan(0)
  })

  it('stays three-quarters on or nearer while the pen draws, so every stroke is read', () => {
    for (let t = -1; t <= MARK_DRAW_SECONDS; t += 0.05) {
      const angle = spinAngle(t, 0.6)
      expect(angle).toBeGreaterThanOrEqual(-SPIN_APPROACH)
      expect(angle).toBeLessThanOrEqual(0)
    }
  })

  it('gathers speed from rest with no jump, then turns at its speed', () => {
    const step = 1e-3
    const speedAt = (t: number) => (spinAngle(t + step, 0.6) - spinAngle(t - step, 0.6)) / (2 * step)
    expect(Math.abs(speedAt(MARK_DRAW_SECONDS))).toBeLessThan(0.01)
    expect(speedAt(MARK_DRAW_SECONDS + SPIN_RAMP)).toBeCloseTo(0.6, 2)
    expect(speedAt(MARK_DRAW_SECONDS + 5)).toBeCloseTo(0.6, 5)
  })

  it('holds still with no speed, as under reduced motion', () => {
    expect(spinAngle(0, 0)).toBe(0)
    expect(spinAngle(MARK_DRAW_SECONDS + 10, 0)).toBe(0)
  })
})
