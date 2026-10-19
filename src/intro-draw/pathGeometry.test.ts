import { describe, expect, it } from 'vitest'
import { flattenPath, samplePathData } from './pathGeometry'
import { ARC_D, ARC_START, FIRST_VERTEX, V_D } from './isotype'

describe('samplePathData', () => {
  it('measures and walks a polyline by length, closepath included', () => {
    // A 10 x 10 square: four sides, the last one drawn by Z.
    const square = samplePathData('M 0 0 L 10 0 10 10 0 10 Z')
    expect(square.length).toBeCloseTo(40, 9)
    expect(square.at(0)).toEqual({ x: 0, y: 0 })
    expect(square.at(0.125).x).toBeCloseTo(5, 9)
    expect(square.at(0.5).x).toBeCloseTo(10, 9)
    expect(square.at(0.5).y).toBeCloseTo(10, 9)
    expect(square.at(0.875).y).toBeCloseTo(5, 9)
    expect(square.at(1).x).toBeCloseTo(0, 9)
    expect(square.at(1).y).toBeCloseTo(0, 9)
  })

  it('follows a cubic by arc length, not by its parameter', () => {
    // Control points bunched at one end: equal steps in t are very unequal in
    // length, so a parameter walk would put the midpoint far from x = 50.
    const line = samplePathData('M 0 0 C 90 0 95 0 100 0')
    expect(line.length).toBeCloseTo(100, 6)
    expect(line.at(0.5).x).toBeCloseTo(50, 1)
  })

  it('clamps outside 0..1', () => {
    const line = samplePathData('M 0 0 L 10 0')
    expect(line.at(-1)).toEqual(line.at(0))
    expect(line.at(2)).toEqual(line.at(1))
  })

  it('refuses a command it does not read rather than drawing a wrong mark', () => {
    expect(() => flattenPath('M 0 0 Q 5 5 10 0')).toThrow(/unsupported/)
    expect(() => flattenPath('M 0 0 l 5 5')).toThrow(/unsupported/)
  })

  it('reads the isotype: each path starts where the choreography expects and closes on itself', () => {
    const v = samplePathData(V_D)
    const arc = samplePathData(ARC_D)
    expect(v.at(0)).toEqual({ x: FIRST_VERTEX[0], y: FIRST_VERTEX[1] })
    expect(arc.at(0)).toEqual({ x: ARC_START[0], y: ARC_START[1] })
    expect(v.at(1).x).toBeCloseTo(FIRST_VERTEX[0], 6)
    expect(arc.at(1).y).toBeCloseTo(ARC_START[1], 6)
    // Plausible against the 400-unit viewBox the paths were traced into: the V's
    // outline runs well over twice its height.
    expect(v.length).toBeGreaterThan(800)
    expect(arc.length).toBeGreaterThan(700)
  })
})
